import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router";
import { Bot, Check, Loader2, Mic, PhoneOff, Send, User } from "lucide-react";
import { BACKEND_URL } from "@/lib/config";
import { Button } from "./ui/button";
import { VoiceOrb } from "./VoiceOrb";

type Status =
  | "requesting-microphone"
  | "connecting-deepgram"
  | "listening"
  | "transcribing"
  | "transcript-ready"
  | "submitting"
  | "ai-speaking"
  | "ending"
  | "error";

type InterviewContext = {
  targetSkill?: string;
  targetRole?: string;
  targetCompany?: string;
  selfAssessedLevel?: string;
};

function createLevelMeter(ctx: AudioContext, stream: MediaStream) {
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.8;
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);

  return () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let index = 0; index < data.length; index += 1) {
      const value = (data[index]! - 128) / 128;
      sum += value * value;
    }
    return Math.min(1, Math.sqrt(sum / data.length) * 3.2);
  };
}

function getRecorderMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  const supported = candidates.find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
  if (!supported) {
    throw new Error(
      "This browser does not support a compatible microphone recorder.",
    );
  }
  return supported;
}

export function Interview() {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("requesting-microphone");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [submittedAnswer, setSubmittedAnswer] = useState("");
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState<InterviewContext>({});
  const [aiLevel, setAiLevel] = useState(0);
  const [userLevel, setUserLevel] = useState(0);
  const [audioChunks, setAudioChunks] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const userStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const keepAliveRef = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const draftRef = useRef("");
  const lastFinalSegmentRef = useRef("");
  const processingRef = useRef(false);
  const aiSpeakingRef = useRef(false);

  useEffect(() => {
    const sessionId = sessionRef.current + 1;
    sessionRef.current = sessionId;
    let cancelled = false;
    const isCurrentSession = () =>
      !cancelled && sessionRef.current === sessionId;

    async function startInterview() {
      try {
        if (!interviewId) throw new Error("Interview ID is missing");
        setStatus("requesting-microphone");

        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        if (audioCtx.state === "suspended") await audioCtx.resume();

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        console.info("[voice] microphone ready");
        const audioTracks = mediaStream.getAudioTracks();
        const audioTrack = audioTracks[0];
        if (!audioTrack || !audioTrack.enabled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          throw new Error("No enabled microphone audio track was returned.");
        }
        console.info("[voice] audio track ready", {
          label: audioTrack.label,
          readyState: audioTrack.readyState,
          enabled: audioTrack.enabled,
        });
        if (!isCurrentSession()) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        userStreamRef.current = mediaStream;
        const userMeter = createLevelMeter(audioCtx, mediaStream);
        setStatus("connecting-deepgram");
        const tokenResponse = await axios.post(
          `${BACKEND_URL}/api/v1/deepgram-token`,
        );
        if (!isCurrentSession()) return;
        const deepgramToken = tokenResponse.data.token;
        if (!deepgramToken) throw new Error("Deepgram token was not returned");

        const socket = new WebSocket(
          "wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US&smart_format=true&interim_results=true&endpointing=500",
          ["bearer", deepgramToken],
        );
        socketRef.current = socket;

        socket.onopen = async () => {
          if (!isCurrentSession() || socket.readyState !== WebSocket.OPEN)
            return;
          console.info("[voice] deepgram connected");
          try {
            const mimeType = getRecorderMimeType();
            const recorder = new MediaRecorder(mediaStream, { mimeType });
            recorderRef.current = recorder;
            let chunkCount = 0;

            recorder.ondataavailable = (event) => {
              if (
                event.data.size === 0 ||
                aiSpeakingRef.current ||
                socket.readyState !== WebSocket.OPEN
              )
                return;
              void event.data.arrayBuffer().then((audio) => {
                if (
                  !isCurrentSession() ||
                  aiSpeakingRef.current ||
                  socket.readyState !== WebSocket.OPEN
                )
                  return;
                socket.send(audio);
                chunkCount += 1;
                setAudioChunks(chunkCount);
                if (chunkCount === 1 || chunkCount % 10 === 0) {
                  console.info("[voice] audio chunk sent", {
                    count: chunkCount,
                    bytes: audio.byteLength,
                    mimeType,
                  });
                }
              });
            };
            recorder.onerror = (event) => {
              console.error("[voice] recorder error", event.error);
              setError("The browser could not read microphone audio.");
              setStatus("error");
            };
            recorder.start(250);
            console.info("[voice] recorder started", {
              mimeType,
              state: recorder.state,
            });

            keepAliveRef.current = window.setInterval(() => {
              if (
                socket.readyState === WebSocket.OPEN &&
                aiSpeakingRef.current
              ) {
                socket.send(JSON.stringify({ type: "KeepAlive" }));
              }
            }, 5000);

            const response = await axios.post(
              `${BACKEND_URL}/api/v1/interview/start/${interviewId}`,
            );
            if (!isCurrentSession()) return;
            const data = response.data as {
              message?: string;
            } & InterviewContext;
            setQuestion(data.message ?? "");
            setContext(data);
            if (data.message) speakAI(data.message);
            if (isCurrentSession() && !window.speechSynthesis.speaking)
              setStatus("listening");
          } catch (startError) {
            console.error("Interview start error:", startError);
            setError(
              "Unable to generate the first question. Please try again.",
            );
            setStatus("error");
          }
        };

        socket.onmessage = (event) => {
          if (
            !isCurrentSession() ||
            aiSpeakingRef.current ||
            processingRef.current
          )
            return;
          try {
            const received = JSON.parse(event.data);
            const transcript =
              received.channel?.alternatives?.[0]?.transcript?.trim();
            if (!transcript) return;
            const speechFinal = received.speech_final === true;
            console.info("[voice] transcript received", {
              final: received.is_final === true,
              speechFinal,
            });
            if (received.is_final !== true) {
              setInterimTranscript(transcript);
              setStatus("transcribing");
              return;
            }
            if (transcript === lastFinalSegmentRef.current) return;
            lastFinalSegmentRef.current = transcript;
            const nextDraft = draftRef.current
              ? `${draftRef.current} ${transcript}`
              : transcript;
            draftRef.current = nextDraft;
            setDraft(nextDraft);
            setInterimTranscript("");
            setStatus(speechFinal ? "transcript-ready" : "transcribing");
            if (speechFinal) lastFinalSegmentRef.current = "";
          } catch (transcriptError) {
            console.error("Transcript processing error:", transcriptError);
          }
        };
        socket.onerror = () => {
          console.error("[voice] deepgram websocket error");
          setError("Speech recognition disconnected. Please try again.");
          setStatus("error");
        };
        socket.onclose = (event) => {
          console.info("[voice] deepgram websocket closed", {
            code: event.code,
            reason: event.reason,
          });
        };

        const tick = () => {
          if (!isCurrentSession()) return;
          setUserLevel(aiSpeakingRef.current ? 0 : userMeter());
          setAiLevel(
            window.speechSynthesis.speaking ? 0.15 + Math.random() * 0.35 : 0,
          );
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (startError) {
        console.error("Failed to start interview:", startError);
        if (!cancelled) {
          const message =
            startError instanceof DOMException &&
            startError.name === "NotAllowedError"
              ? "Microphone access was denied. Allow microphone access in Chrome and retry."
              : startError instanceof Error &&
                  startError.message.includes("recorder")
                ? startError.message
                : "Unable to prepare the microphone. Check that a microphone is connected and try again.";
          setError(message);
          setStatus("error");
        }
      }
    }

    void startInterview();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [interviewId]);

  function setRecorderListening(listening: boolean) {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    if (listening && recorder.state === "paused") {
      recorder.resume();
      console.info("[voice] microphone listening resumed");
    }
    if (!listening && recorder.state === "recording") {
      recorder.pause();
      console.info("[voice] microphone transmission paused");
    }
  }

  function speakAI(text: string) {
    if (!text) return;
    aiSpeakingRef.current = true;
    setStatus("ai-speaking");
    setRecorderListening(false);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.onstart = () => {
      aiSpeakingRef.current = true;
      setRecorderListening(false);
    };
    utterance.onend = () => {
      aiSpeakingRef.current = false;
      setRecorderListening(true);
      setStatus((current) =>
        current === "submitting"
          ? current
          : draftRef.current
            ? "transcript-ready"
            : "listening",
      );
    };
    utterance.onerror = () => {
      aiSpeakingRef.current = false;
      setRecorderListening(true);
      setStatus("listening");
    };
    window.speechSynthesis.speak(utterance);
  }

  async function submitAnswer() {
    const answer = draftRef.current.trim();
    if (!answer || !interviewId || processingRef.current || status === "ending")
      return;
    processingRef.current = true;
    aiSpeakingRef.current = false;
    setRecorderListening(false);
    setStatus("submitting");
    setSubmittedAnswer(answer);
    setDraft("");
    draftRef.current = "";
    setInterimTranscript("");
    lastFinalSegmentRef.current = "";
    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/v1/interview/respond/${interviewId}`,
        { message: answer },
      );
      const nextQuestion = response.data.message as string;
      setQuestion(nextQuestion);
      if (nextQuestion) speakAI(nextQuestion);
    } catch (submitError) {
      console.error("Transcript processing error:", submitError);
      setError("Unable to submit this answer. Please try again.");
      setStatus("error");
    } finally {
      processingRef.current = false;
    }
  }

  function cleanup() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (keepAliveRef.current) window.clearInterval(keepAliveRef.current);
    keepAliveRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== "inactive")
      recorderRef.current.stop();
    recorderRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    userStreamRef.current?.getTracks().forEach((track) => track.stop());
    userStreamRef.current = null;
    window.speechSynthesis.cancel();
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }

  function endInterview() {
    setStatus("ending");
    cleanup();
    navigate(`/result/${interviewId}`);
  }

  const aiSpeaking = status === "ai-speaking" || aiLevel > 0.06;
  const userSpeaking = userLevel > 0.06 && !aiSpeaking;
  const stateLabel =
    status === "requesting-microphone"
      ? "Requesting microphone"
      : status === "connecting-deepgram"
        ? "Connecting to Deepgram"
        : status === "transcribing"
          ? "Transcribing"
          : status === "transcript-ready"
            ? "Transcript ready"
            : status === "submitting"
              ? "Submitting answer"
              : status === "ending"
                ? "Wrapping up"
                : status === "error"
                  ? "Needs attention"
                  : aiSpeaking
                    ? "AI speaking"
                    : "Listening";
  const editableStatuses: Status[] = [
    "listening",
    "transcribing",
    "transcript-ready",
  ];
  const hasConfiguration = context.targetSkill || context.targetRole;
  const visibleDraft =
    draft +
    (interimTranscript ? `${draft ? " " : ""}${interimTranscript}` : "");

  return (
    <main className="flex min-h-screen flex-col px-5 py-5 sm:px-8">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between border-b border-border pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            AI interview
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasConfiguration
              ? `${context.targetSkill} • ${context.targetRole}`
              : "Technical assessment"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span
            className={`size-2 rounded-full ${status === "error" ? "bg-destructive" : status === "listening" || status === "transcript-ready" ? "bg-emerald-400" : "bg-amber-400"}`}
          />
          {stateLabel}
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-5xl flex-1 gap-6 py-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <section className="order-2 flex flex-col gap-5 lg:order-1">
          <div className="rounded-2xl border border-border bg-card/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Current question
            </p>
            <p className="mt-3 text-lg leading-relaxed">
              {question || "Generating your first question…"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card/60 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Your answer
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {aiSpeaking
                    ? "Microphone paused while the interviewer speaks."
                    : status === "submitting"
                      ? "Answer submitted. Preparing the next question…"
                      : draft
                        ? "Review or edit the transcript before submitting."
                        : "Speak when you are ready."}
                </p>
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {visibleDraft.length} chars
              </span>
            </div>
            <textarea
              value={visibleDraft}
              onChange={(event) => {
                draftRef.current = event.target.value;
                setDraft(event.target.value);
                setInterimTranscript("");
              }}
              disabled={!editableStatuses.includes(status) || aiSpeaking}
              placeholder="Your transcript will appear here…"
              className="mt-4 min-h-32 w-full resize-y rounded-lg border border-input bg-background px-3 py-3 text-sm leading-relaxed outline-none transition focus:border-ring focus:ring-[3px] focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Mic
                  className={`size-4 ${aiSpeaking ? "text-muted-foreground" : "text-emerald-400"}`}
                />
                {stateLabel}
              </div>
              <Button
                onClick={() => void submitAnswer()}
                disabled={
                  !draft.trim() ||
                  !editableStatuses.includes(status) ||
                  aiSpeaking
                }
                className="gap-2"
              >
                <Send className="size-4" />
                Submit answer
              </Button>
            </div>
          </div>
          {submittedAnswer && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-muted-foreground">
              <Check className="mt-0.5 size-4 text-emerald-400" />
              Previous answer submitted. The next response is being evaluated.
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </section>
        <section className="order-1 flex flex-col items-center gap-6 lg:order-2">
          <div className="flex w-full items-center justify-center gap-8 sm:gap-16">
            <VoiceOrb
              level={aiLevel}
              speaking={aiSpeaking}
              label="Interviewer"
              sublabel={aiSpeaking ? "Speaking" : "Ready"}
              icon={Bot}
              accent="violet"
            />
            <VoiceOrb
              level={userLevel}
              speaking={userSpeaking}
              label="You"
              sublabel={aiSpeaking ? "Mic paused" : "Listening"}
              icon={User}
              accent="emerald"
            />
          </div>
          {status === "requesting-microphone" ||
          status === "connecting-deepgram" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {status === "requesting-microphone"
                ? "Requesting microphone access…"
                : "Connecting to Deepgram…"}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {audioChunks > 0
                ? `${audioChunks} audio chunks sent`
                : "Speak naturally, then review your transcript."}
            </p>
          )}
        </section>
      </div>

      <footer className="mx-auto flex w-full max-w-5xl justify-end border-t border-border pt-4">
        <Button
          variant="destructive"
          onClick={endInterview}
          disabled={status === "ending"}
          className="gap-2"
        >
          {status === "ending" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <PhoneOff className="size-4" />
          )}
          End interview
        </Button>
      </footer>
    </main>
  );
}
