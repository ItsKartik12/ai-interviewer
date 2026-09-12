import { BACKEND_URL } from "@/lib/config";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Bot, Loader2, PhoneOff, User } from "lucide-react";
import { Button } from "./ui/button";
import { VoiceOrb } from "./VoiceOrb";

type Status = "connecting" | "live" | "ending";

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

    for (let i = 0; i < data.length; i++) {
      const v = (data[i]! - 128) / 128;
      sum += v * v;
    }

    const rms = Math.sqrt(sum / data.length);

    return Math.min(1, rms * 3.2);
  };
}

export function Interview() {
  const { interviewId } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState<Status>("connecting");

  const [aiLevel, setAiLevel] = useState(0);
  const [userLevel, setUserLevel] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const userStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  // Prevent sending the same final transcript multiple times
  const lastTranscriptRef = useRef("");

  // Prevent multiple requests at the same time
  const processingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function startInterview() {
      try {
        if (!interviewId) {
          throw new Error("Interview ID is missing");
        }

        // ------------------------------------------
        // AUDIO CONTEXT
        // ------------------------------------------

        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;

        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }

        // ------------------------------------------
        // MICROPHONE
        // ------------------------------------------

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());

          return;
        }

        userStreamRef.current = mediaStream;

        const userMeter = createLevelMeter(audioCtx, mediaStream);

        // ------------------------------------------
        // DEEPGRAM TOKEN
        // ------------------------------------------

        const tokenResponse = await axios.post(
          `${BACKEND_URL}/api/v1/deepgram-token`,
        );

        const deepgramToken = tokenResponse.data.token;

        if (!deepgramToken) {
          throw new Error("Deepgram token was not returned");
        }

        // ------------------------------------------
        // DEEPGRAM WEBSOCKET
        // ------------------------------------------

        const socket = new WebSocket(
          "wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US&smart_format=true&interim_results=true",
          ["bearer", deepgramToken],
        );

        socketRef.current = socket;

        socket.onopen = async () => {
          console.log("Deepgram connected");

          try {
            const recorder = new MediaRecorder(mediaStream, {
              mimeType: "audio/webm",
            });

            recorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
              if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
                socket.send(event.data);
              }
            };

            recorder.start(250);

            // --------------------------------------
            // START INTERVIEW
            // --------------------------------------

            const response = await axios.post(
              `${BACKEND_URL}/api/v1/interview/start/${interviewId}`,
            );

            const firstQuestion = response.data.message;

            if (firstQuestion) {
              speakAI(firstQuestion);
            }

            if (!cancelled) {
              setStatus("live");
            }
          } catch (error) {
            console.error("Interview start error:", error);

            throw error;
          }
        };

        // ------------------------------------------
        // DEEPGRAM TRANSCRIPT
        // ------------------------------------------

        socket.onmessage = async (event) => {
          try {
            const received = JSON.parse(event.data);

            const transcript = received.channel?.alternatives?.[0]?.transcript;

            if (!transcript) {
              return;
            }

            const isFinal = received.is_final === true;

            // We only send final transcripts.
            if (!isFinal) {
              return;
            }

            const cleanedTranscript = transcript.trim();

            if (!cleanedTranscript) {
              return;
            }

            // Avoid duplicate transcript
            if (cleanedTranscript === lastTranscriptRef.current) {
              return;
            }

            lastTranscriptRef.current = cleanedTranscript;

            // Don't send another answer while
            // previous answer is being processed.
            if (processingRef.current) {
              return;
            }

            processingRef.current = true;

            console.log("Candidate:", cleanedTranscript);

            // --------------------------------------
            // SEND TO OMNIROUTE BACKEND
            // --------------------------------------

            const response = await axios.post(
              `${BACKEND_URL}/api/v1/interview/respond/${interviewId}`,
              {
                message: cleanedTranscript,
              },
            );

            const aiResponse = response.data.message;

            if (aiResponse) {
              console.log("Interviewer:", aiResponse);

              speakAI(aiResponse);
            }
          } catch (error) {
            console.error("Transcript processing error:", error);
          } finally {
            processingRef.current = false;
          }
        };

        socket.onerror = (error) => {
          console.error("Deepgram WebSocket error:", error);
        };

        socket.onclose = () => {
          console.log("Deepgram WebSocket closed");
        };

        // ------------------------------------------
        // VOLUME METER
        // ------------------------------------------

        const tick = () => {
          if (cancelled) {
            return;
          }

          setUserLevel(userMeter());

          // Browser speech synthesis doesn't expose
          // audio volume, so use a small animation
          // while speech is active.
          if (window.speechSynthesis.speaking) {
            setAiLevel(0.15 + Math.random() * 0.35);
          } else {
            setAiLevel(0);
          }

          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch (error) {
        console.error("Failed to start interview:", error);

        if (!cancelled) {
          setStatus("connecting");
        }
      }
    }

    startInterview();

    return () => {
      cancelled = true;
      cleanup();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId]);

  // ----------------------------------------------
  // AI VOICE
  // ----------------------------------------------

  function speakAI(text: string) {
    if (!text) {
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => {
      console.log("AI speaking");
    };

    utterance.onend = () => {
      console.log("AI finished speaking");
    };

    utterance.onerror = (error) => {
      console.error("Speech synthesis error:", error);
    };

    window.speechSynthesis.speak(utterance);
  }

  // ----------------------------------------------
  // CLEANUP
  // ----------------------------------------------

  function cleanup() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);

      rafRef.current = null;
    }

    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }

    recorderRef.current = null;

    socketRef.current?.close();
    socketRef.current = null;

    userStreamRef.current?.getTracks().forEach((track) => track.stop());

    userStreamRef.current = null;

    window.speechSynthesis.cancel();

    audioCtxRef.current?.close().catch(() => {});

    audioCtxRef.current = null;
  }

  // ----------------------------------------------
  // END INTERVIEW
  // ----------------------------------------------

  function endInterview() {
    setStatus("ending");

    cleanup();

    navigate(`/result/${interviewId}`);
  }

  const aiSpeaking = aiLevel > 0.06 && aiLevel >= userLevel;

  const userSpeaking = userLevel > 0.06 && userLevel > aiLevel;

  // ----------------------------------------------
  // UI
  // ----------------------------------------------

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden">
      <header className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="relative flex size-2.5">
            <span
              className={
                status === "live"
                  ? "absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"
                  : "hidden"
              }
            />

            <span
              className={
                "relative inline-flex size-2.5 rounded-full " +
                (status === "live" ? "bg-emerald-400" : "bg-amber-400")
              }
            />
          </span>

          {status === "connecting"
            ? "Connecting…"
            : status === "ending"
              ? "Wrapping up…"
              : "Interview live"}
        </div>

        <span className="text-sm text-muted-foreground">AI Interview</span>
      </header>

      <div className="flex flex-1 items-center justify-center px-6">
        {status === "connecting" ? (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="size-7 animate-spin" />

            <p className="text-sm">Setting up your interview & microphone…</p>
          </div>
        ) : (
          <div className="flex w-full max-w-3xl items-center justify-center gap-12 sm:gap-24">
            <VoiceOrb
              level={aiLevel}
              speaking={aiSpeaking}
              label="Interviewer"
              sublabel="AI interviewer"
              icon={Bot}
              accent="violet"
            />

            <VoiceOrb
              level={userLevel}
              speaking={userSpeaking}
              label="You"
              sublabel="Mic on"
              icon={User}
              accent="emerald"
            />
          </div>
        )}
      </div>

      <footer className="flex justify-center px-6 py-8">
        <Button
          variant="destructive"
          size="lg"
          onClick={endInterview}
          disabled={status === "ending"}
          className="gap-2 rounded-full px-6"
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
