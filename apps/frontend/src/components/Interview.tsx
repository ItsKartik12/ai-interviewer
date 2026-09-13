import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router";
import {
  Activity,
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mic,
  PhoneOff,
  RefreshCw,
  Send,
  Sparkles,
  User,
} from "lucide-react";
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
  questionType?: string;
  skillAssessed?: string;
};

type DiagnosticState = {
  micPermission: "granted" | "denied" | "prompt" | "unknown";
  micDeviceDetected: boolean;
  micDeviceLabel: string;
  audioTrackStatus: "live" | "ended" | "muted" | "none";
  recorderStatus: "recording" | "paused" | "inactive" | "error";
  recorderMimeType: string;
  deepgramStatus: "connecting" | "connected" | "disconnected" | "error";
  chunksSent: number;
  lastChunkTime: string | null;
  transcriptStatus: "waiting" | "receiving" | "received";
  lastError: string | null;
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
    "audio/mp4",
  ];
  if (typeof MediaRecorder === "undefined") {
    throw new Error(
      "This browser does not support MediaRecorder audio recording.",
    );
  }
  const supported = candidates.find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
  if (!supported) {
    throw new Error(
      "This browser does not support a compatible microphone audio format.",
    );
  }
  return supported;
}

function getPipelineAssessment(diag: DiagnosticState): {
  stage: string;
  advice: string;
  tone: "healthy" | "warning" | "error";
} {
  if (diag.micPermission === "denied") {
    return {
      stage: "Microphone permission blocked",
      advice:
        "Chrome has blocked microphone access. Click the site settings icon (lock/tune) in the Chrome URL bar and allow Microphone.",
      tone: "error",
    };
  }
  if (!diag.micDeviceDetected) {
    return {
      stage: "No microphone detected",
      advice:
        "No audio input hardware was found. Check that a microphone is connected and enabled in Windows Sound settings.",
      tone: "error",
    };
  }
  if (diag.audioTrackStatus !== "live") {
    return {
      stage: "Audio track unavailable",
      advice:
        "The microphone track is not live. Another app may be holding your microphone exclusively, or it is muted in Windows.",
      tone: "error",
    };
  }
  if (
    diag.deepgramStatus === "error" ||
    diag.deepgramStatus === "disconnected"
  ) {
    return {
      stage: "Deepgram disconnected",
      advice:
        "The speech transcription WebSocket disconnected. Automatic reconnection will retry, or click 'Reconnect Voice'.",
      tone: "error",
    };
  }
  if (diag.recorderStatus === "error") {
    return {
      stage: "MediaRecorder error",
      advice: "The browser's audio encoder failed. Try restarting Chrome.",
      tone: "error",
    };
  }
  if (diag.chunksSent === 0) {
    return {
      stage: "Audio not yet generated",
      advice:
        "Microphone is ready and waiting for your voice. Speak clearly into the microphone to generate audio data.",
      tone: "warning",
    };
  }
  if (diag.chunksSent > 0 && diag.transcriptStatus === "waiting") {
    return {
      stage: "Audio transmitted; waiting for recognized words",
      advice: `${diag.chunksSent} audio chunks sent to Deepgram. If you have spoken, Deepgram is processing or your input volume may be quiet.`,
      tone: "warning",
    };
  }
  return {
    stage: "Microphone pipeline healthy",
    advice:
      "Audio chunks are streaming and speech transcripts are being received in real time.",
    tone: "healthy",
  };
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
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [questionNumber, setQuestionNumber] = useState(1);

  const [diagnostics, setDiagnostics] = useState<DiagnosticState>({
    micPermission: "unknown",
    micDeviceDetected: false,
    micDeviceLabel: "",
    audioTrackStatus: "none",
    recorderStatus: "inactive",
    recorderMimeType: "",
    deepgramStatus: "disconnected",
    chunksSent: 0,
    lastChunkTime: null,
    transcriptStatus: "waiting",
    lastError: null,
  });

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
  const isUnmountingRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const isReconnectingRef = useRef(false);
  const statusRef = useRef<Status>("requesting-microphone");
  const userEditedRef = useRef(false);
  const tokenExpiryTimerRef = useRef<number | null>(null);

  const updateStatus = (nextStatus: Status) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  };

  // Sync draft state and ref
  const updateDraft = (newText: string) => {
    draftRef.current = newText;
    setDraft(newText);
  };

  function setRecorderListening(listening: boolean) {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    if (listening && recorder.state === "paused") {
      recorder.resume();
      console.info("[voice] microphone listening resumed");
      setDiagnostics((prev) => ({ ...prev, recorderStatus: "recording" }));
    }
    if (!listening && recorder.state === "recording") {
      recorder.pause();
      console.info("[voice] microphone transmission paused");
      setDiagnostics((prev) => ({ ...prev, recorderStatus: "paused" }));
    }
  }

  function speakAI(text: string) {
    if (!text) return;
    aiSpeakingRef.current = true;
    updateStatus("ai-speaking");
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
      updateStatus(
        draftRef.current ? "transcript-ready" : "listening"
      );
    };
    utterance.onerror = () => {
      aiSpeakingRef.current = false;
      setRecorderListening(true);
      updateStatus("listening");
    };
    window.speechSynthesis.speak(utterance);
  }

  function scheduleTokenRenewal(sessionId: number) {
    if (tokenExpiryTimerRef.current) window.clearTimeout(tokenExpiryTimerRef.current);
    // Refresh at 500s (before Deepgram 600s TTL expires)
    tokenExpiryTimerRef.current = window.setTimeout(() => {
      if (!isUnmountingRef.current && sessionRef.current === sessionId && statusRef.current !== "ending") {
        console.info("[voice] Proactively refreshing Deepgram temporary token before 600s TTL expires...");
        void reconnectVoice();
      }
    }, 500000);
  }

  /**
   * Setup Deepgram WebSocket and MediaRecorder on top of a live MediaStream.
   * Returns a Promise that resolves when the socket is OPEN and recorder is running.
   */
  function setupDeepgramAndRecorder(
    token: string,
    mediaStream: MediaStream,
    sessionId: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (isUnmountingRef.current || sessionRef.current !== sessionId) {
        reject(new Error("Session cancelled"));
        return;
      }

      setDiagnostics((prev) => ({ ...prev, deepgramStatus: "connecting" }));

      const socket = new WebSocket(
        "wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US&smart_format=true&interim_results=true&endpointing=500",
        ["bearer", token],
      );
      socketRef.current = socket;

      let hasOpened = false;

      socket.onopen = () => {
        if (isUnmountingRef.current || sessionRef.current !== sessionId) {
          socket.close();
          return;
        }

        hasOpened = true;
        console.info("[voice] deepgram connected");
        setDiagnostics((prev) => ({
          ...prev,
          deepgramStatus: "connected",
        }));

        try {
          const mimeType = getRecorderMimeType();
          const recorder = new MediaRecorder(mediaStream, { mimeType });
          recorderRef.current = recorder;
          console.info("[voice] recorder created", { mimeType });

          let chunkCount = 0;

          recorder.ondataavailable = (event) => {
            if (
              event.data.size === 0 ||
              aiSpeakingRef.current ||
              socket.readyState !== WebSocket.OPEN
            ) {
              return;
            }

            void event.data.arrayBuffer().then((audio) => {
              if (
                isUnmountingRef.current ||
                sessionRef.current !== sessionId ||
                aiSpeakingRef.current ||
                socket.readyState !== WebSocket.OPEN
              ) {
                return;
              }

              socket.send(audio);
              chunkCount += 1;
              setAudioChunks((c) => c + 1);

              const timeString = new Date().toLocaleTimeString();
              setDiagnostics((prev) => ({
                ...prev,
                chunksSent: prev.chunksSent + 1,
                lastChunkTime: timeString,
              }));

              if (chunkCount === 1) {
                console.info("[voice] audio chunk #1 sent", {
                  bytes: audio.byteLength,
                  mimeType,
                });
              } else if (chunkCount % 10 === 0) {
                console.info(`[voice] audio chunk #${chunkCount} sent`, {
                  bytes: audio.byteLength,
                });
              }
            });
          };

          recorder.onerror = (event) => {
            console.error("[voice] recorder error", event);
            setDiagnostics((prev) => ({
              ...prev,
              recorderStatus: "error",
              lastError: "Microphone recorder error.",
            }));
            setError("The browser could not read microphone audio.");
            setStatus("error");
          };

          recorder.start(250);
          console.info("[voice] recorder started", {
            mimeType,
            state: recorder.state,
          });

          setDiagnostics((prev) => ({
            ...prev,
            recorderStatus: "recording",
            recorderMimeType: mimeType,
          }));

          // Keepalive to prevent Deepgram timeout during silence / AI speech
          if (keepAliveRef.current) window.clearInterval(keepAliveRef.current);
          keepAliveRef.current = window.setInterval(() => {
            if (socket.readyState === WebSocket.OPEN && aiSpeakingRef.current) {
              socket.send(JSON.stringify({ type: "KeepAlive" }));
            }
          }, 5000);

          resolve();
        } catch (recErr) {
          console.error("[voice] recorder start error:", recErr);
          reject(recErr);
        }
      };

      socket.onmessage = (event) => {
        if (
          isUnmountingRef.current ||
          sessionRef.current !== sessionId ||
          aiSpeakingRef.current ||
          processingRef.current
        ) {
          return;
        }

        try {
          const received = JSON.parse(event.data);

          if (received.type === "Metadata") {
            return;
          }

          const transcript =
            received.channel?.alternatives?.[0]?.transcript?.trim();
          if (!transcript) return;

          const speechFinal = received.speech_final === true;
          const isFinal = received.is_final === true;

          console.info("[voice] transcript received", {
            final: isFinal,
            speechFinal,
          });

          setDiagnostics((prev) => ({
            ...prev,
            transcriptStatus: isFinal ? "received" : "receiving",
          }));

          if (!isFinal) {
            if (!userEditedRef.current) {
              setInterimTranscript(transcript);
            }
            updateStatus("transcribing");
            return;
          }

          if (transcript === lastFinalSegmentRef.current) return;
          lastFinalSegmentRef.current = transcript;

          const currentText = draftRef.current.trim();
          const nextDraft = currentText
            ? `${currentText} ${transcript}`
            : transcript;

          updateDraft(nextDraft);
          setInterimTranscript("");
          updateStatus(speechFinal ? "transcript-ready" : "transcribing");
          if (speechFinal) lastFinalSegmentRef.current = "";
        } catch (transcriptError) {
          console.error("Transcript processing error:", transcriptError);
        }
      };

      socket.onerror = (event) => {
        console.error("[voice] deepgram websocket error", event);
        if (!hasOpened) {
          reject(new Error("Failed to connect to Deepgram WebSocket."));
          return;
        }
        handleSocketDrop("error");
      };

      socket.onclose = (event) => {
        console.info("[voice] deepgram websocket closed", {
          code: event.code,
          reason: event.reason || "no reason specified",
          wasClean: event.wasClean,
        });
        if (!hasOpened) {
          reject(new Error("Deepgram WebSocket closed before opening."));
          return;
        }
        handleSocketDrop("closed");
      };
    });
  }

  function handleSocketDrop(reason: string) {
    if (
      isUnmountingRef.current ||
      isReconnectingRef.current ||
      statusRef.current === "ending"
    ) {
      return;
    }

    console.warn(`[voice] Deepgram connection dropped (${reason})`);
    setDiagnostics((prev) => ({
      ...prev,
      deepgramStatus: "disconnected",
      lastError: `Voice connection dropped (${reason}).`,
    }));

    // Attempt automatic reconnect if under limit
    if (reconnectAttemptsRef.current < 3) {
      reconnectAttemptsRef.current += 1;
      const delay = reconnectAttemptsRef.current * 1200;
      console.info(
        `[voice] Auto-reconnecting attempt ${reconnectAttemptsRef.current}/3 in ${delay}ms...`,
      );
      setTimeout(() => {
        if (!isUnmountingRef.current && statusRef.current !== "ending") {
          void reconnectVoice();
        }
      }, delay);
    } else {
      setError(
        "Speech recognition disconnected. Your draft is saved. Click 'Reconnect Voice' to resume.",
      );
      updateStatus("error");
    }
  }

  /**
   * Reconnect Voice: Fetches fresh token, creates clean WebSocket, restarts recorder, preserves draft.
   */
  async function reconnectVoice() {
    if (isReconnectingRef.current || isUnmountingRef.current || statusRef.current === "ending") {
      return;
    }

    isReconnectingRef.current = true;
    setIsReconnecting(true);
    setError("");
    updateStatus("connecting-deepgram");
    setDiagnostics((prev) => ({
      ...prev,
      deepgramStatus: "connecting",
      lastError: "Reconnecting voice pipeline...",
    }));

    try {
      // 1. Clean up old recorder and socket
      if (keepAliveRef.current) {
        window.clearInterval(keepAliveRef.current);
        keepAliveRef.current = null;
      }
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {}
      }
      recorderRef.current = null;

      if (socketRef.current) {
        socketRef.current.onopen = null;
        socketRef.current.onclose = null;
        socketRef.current.onerror = null;
        socketRef.current.onmessage = null;
        try {
          socketRef.current.close();
        } catch {}
        socketRef.current = null;
      }

      // 2. Ensure microphone stream is live
      let stream = userStreamRef.current;
      const isStreamLive =
        stream &&
        stream
          .getAudioTracks()
          .some((t) => t.readyState === "live" && t.enabled);

      if (!isStreamLive) {
        console.info("[voice] Audio track inactive, requesting fresh stream");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        userStreamRef.current = stream;
        setDiagnostics((prev) => ({
          ...prev,
          micPermission: "granted",
          micDeviceDetected: true,
          audioTrackStatus: "live",
        }));
      }

      // 3. Request fresh Deepgram temporary token (TTL: 600s)
      const tokenResponse = await axios.post(
        `${BACKEND_URL}/api/v1/deepgram-token`,
      );
      const deepgramToken = tokenResponse.data?.token;
      if (!deepgramToken)
        throw new Error("Could not retrieve fresh Deepgram token");

      if (!stream) {
        throw new Error("Microphone stream is not available");
      }

      // 4. Setup Deepgram and Recorder with the fresh token
      await setupDeepgramAndRecorder(
        deepgramToken,
        stream,
        sessionRef.current,
      );

      scheduleTokenRenewal(sessionRef.current);
      reconnectAttemptsRef.current = 0;
      console.info("[voice] Voice pipeline reconnected successfully");

      updateStatus(draftRef.current ? "transcript-ready" : "listening");
      setDiagnostics((prev) => ({
        ...prev,
        deepgramStatus: "connected",
        lastError: null,
      }));
    } catch (err: any) {
      console.error("[voice] Reconnection failed:", err);
      const msg = err?.message || "Failed to reconnect speech recognition";
      setDiagnostics((prev) => ({
        ...prev,
        deepgramStatus: "error",
        lastError: msg,
      }));
      setError(`${msg}. Click 'Reconnect Voice' to try again.`);
      setStatus("error");
    } finally {
      isReconnectingRef.current = false;
      setIsReconnecting(false);
    }
  }

  useEffect(() => {
    isUnmountingRef.current = false;
    const sessionId = sessionRef.current + 1;
    sessionRef.current = sessionId;
    let cancelled = false;
    const isCurrentSession = () =>
      !cancelled && sessionRef.current === sessionId && !isUnmountingRef.current;

    async function startInterview() {
      try {
        if (!interviewId) throw new Error("Interview ID is missing");
        setStatus("requesting-microphone");

        // 1. Check browser mediaDevices
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("This browser does not support microphone capture.");
        }

        // 2. Enumerate audio devices
        let preDevices: MediaDeviceInfo[] = [];
        try {
          preDevices = await navigator.mediaDevices.enumerateDevices();
        } catch {}
        const initialAudioInputs = preDevices.filter(
          (d) => d.kind === "audioinput",
        );
        if (preDevices.length > 0 && initialAudioInputs.length === 0) {
          setDiagnostics((prev) => ({
            ...prev,
            micDeviceDetected: false,
            lastError: "No microphone detected",
          }));
          throw new Error(
            "No microphone was detected. Connect or enable a microphone and try again.",
          );
        }

        // 3. Check permission status
        try {
          if (navigator.permissions && navigator.permissions.query) {
            const perm = await navigator.permissions.query({
              name: "microphone" as PermissionName,
            });
            setDiagnostics((prev) => ({
              ...prev,
              micPermission: perm.state,
            }));
            perm.onchange = () => {
              setDiagnostics((prev) => ({
                ...prev,
                micPermission: perm.state,
              }));
            };
          }
        } catch {}

        console.info("[voice] requesting microphone");

        // 4. AudioContext for volume visualizer
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        if (audioCtx.state === "suspended") {
          audioCtx.resume().catch(() => {});
        }

        // 5. Request real microphone with explicit speech audio constraints
        let mediaStream: MediaStream;
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } catch (mediaError) {
          if (
            mediaError instanceof DOMException &&
            (mediaError.name === "NotAllowedError" ||
              mediaError.name === "PermissionDeniedError")
          ) {
            setDiagnostics((prev) => ({ ...prev, micPermission: "denied" }));
            throw new Error(
              "Microphone permission is blocked. Allow microphone access for localhost in Chrome.",
            );
          }
          if (
            mediaError instanceof DOMException &&
            (mediaError.name === "NotFoundError" ||
              mediaError.name === "DevicesNotFoundError")
          ) {
            setDiagnostics((prev) => ({ ...prev, micDeviceDetected: false }));
            throw new Error(
              "No microphone was detected. Connect or enable a microphone and try again.",
            );
          }
          throw mediaError;
        }

        console.info("[voice] microphone permission granted");

        const audioTracks = mediaStream.getAudioTracks();
        const audioTrack = audioTracks[0];
        if (
          !audioTrack ||
          !audioTrack.enabled ||
          audioTrack.readyState !== "live"
        ) {
          mediaStream.getTracks().forEach((track) => track.stop());
          setDiagnostics((prev) => ({
            ...prev,
            audioTrackStatus: "none",
          }));
          throw new Error(
            "No enabled, live microphone audio track was returned.",
          );
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

        setDiagnostics((prev) => ({
          ...prev,
          micPermission: "granted",
          micDeviceDetected: true,
          micDeviceLabel: audioTrack.label || "Default audio input",
          audioTrackStatus: "live",
        }));

        // 6. Fetch Deepgram temporary token
        setStatus("connecting-deepgram");
        setDiagnostics((prev) => ({ ...prev, deepgramStatus: "connecting" }));

        const tokenResponse = await axios.post(
          `${BACKEND_URL}/api/v1/deepgram-token`,
        );
        if (!isCurrentSession()) return;
        const deepgramToken = tokenResponse.data.token;
        if (!deepgramToken) throw new Error("Deepgram token was not returned");

        // 7. Setup Deepgram and MediaRecorder
        await setupDeepgramAndRecorder(
          deepgramToken,
          mediaStream,
          sessionId,
        );

        // 8. Fetch initial interview question
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
        if (isCurrentSession() && !window.speechSynthesis.speaking) {
          setStatus("listening");
        }

        // Animation frame for visualizer
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
        if (!cancelled && !isUnmountingRef.current) {
          const message =
            startError instanceof Error
              ? startError.message
              : "Unable to prepare the microphone. Check that a microphone is connected and try again.";
          setError(message);
          setStatus("error");
          setDiagnostics((prev) => ({ ...prev, lastError: message }));
        }
      }
    }

    void startInterview();

    return () => {
      cancelled = true;
      isUnmountingRef.current = true;
      cleanup();
    };
  }, [interviewId]);

  async function submitAnswer() {
    const answer = draftRef.current.trim();
    if (!answer || !interviewId || processingRef.current || statusRef.current === "ending")
      return;
    processingRef.current = true;
    aiSpeakingRef.current = false;
    setRecorderListening(false);
    updateStatus("submitting");
    setSubmittedAnswer(answer);
    updateDraft("");
    setInterimTranscript("");
    userEditedRef.current = false;
    lastFinalSegmentRef.current = "";
    setDiagnostics((prev) => ({ ...prev, transcriptStatus: "waiting" }));

    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/v1/interview/respond/${interviewId}`,
        { message: answer },
      );

      if (response.data.finished === true) {
        updateStatus("ending");
        cleanup();
        navigate(`/result/${interviewId}`);
        return;
      }

      const nextQuestion = response.data.message as string;
      setQuestion(nextQuestion);
      setQuestionNumber((prev) => prev + 1);

      if (response.data.questionType || response.data.skillAssessed || response.data.difficulty) {
        setContext((prev) => ({
          ...prev,
          questionType: response.data.questionType,
          skillAssessed: response.data.skillAssessed,
          selfAssessedLevel: response.data.difficulty || prev.selfAssessedLevel,
        }));
      }

      if (nextQuestion) speakAI(nextQuestion);
    } catch (submitError) {
      console.error("Transcript processing error:", submitError);
      setError("Unable to submit this answer. Please try again.");
      updateStatus("error");
    } finally {
      processingRef.current = false;
    }
  }

  function cleanup() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (keepAliveRef.current) window.clearInterval(keepAliveRef.current);
    keepAliveRef.current = null;
    if (tokenExpiryTimerRef.current) window.clearTimeout(tokenExpiryTimerRef.current);
    tokenExpiryTimerRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {}
    }
    recorderRef.current = null;
    if (socketRef.current) {
      socketRef.current.onopen = null;
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      socketRef.current.onmessage = null;
      try {
        socketRef.current.close();
      } catch {}
      socketRef.current = null;
    }
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

  const voiceState = (() => {
    if (isReconnecting || status === "connecting-deepgram") {
      return {
        label: "RECONNECTING",
        desc: "Restoring audio pipeline",
        badge: "bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse",
        dot: "bg-amber-400 animate-ping",
      };
    }
    if (status === "error") {
      return {
        label: "ERROR",
        desc: "Microphone attention needed",
        badge: "bg-destructive/15 text-destructive border-destructive/30",
        dot: "bg-destructive",
      };
    }
    if (status === "submitting" || status === "ending") {
      return {
        label: "PROCESSING",
        desc: "Analyzing answer & formulating turn",
        badge: "bg-blue-500/15 text-blue-300 border-blue-500/30 animate-pulse",
        dot: "bg-blue-400 animate-pulse",
      };
    }
    if (aiSpeaking) {
      return {
        label: "AI SPEAKING",
        desc: "Interviewer speaking (mic muted)",
        badge: "bg-violet-500/15 text-violet-300 border-violet-500/30",
        dot: "bg-violet-400 animate-pulse",
      };
    }
    if (status === "transcribing") {
      return {
        label: "TRANSCRIBING",
        desc: "Converting speech to text in real time",
        badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30 animate-pulse",
        dot: "bg-cyan-400 animate-ping",
      };
    }
    if (status === "listening") {
      return {
        label: "LISTENING",
        desc: "Microphone active • Speak your answer",
        badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
        dot: "bg-emerald-400",
      };
    }
    return {
      label: "READY",
      desc: "Ready to review and submit",
      badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
      dot: "bg-emerald-400",
    };
  })();

  const editableStatuses: Status[] = [
    "listening",
    "transcribing",
    "transcript-ready",
  ];
  const hasConfiguration = context.targetSkill || context.targetRole;

  const assessment = getPipelineAssessment(diagnostics);

  return (
    <main className="flex min-h-screen flex-col px-5 py-5 sm:px-8">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between border-b border-border pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            AI interview
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasConfiguration
              ? `${context.targetRole || "Role"} • ${context.targetCompany || "Standard"}`
              : "Technical assessment"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Reconnect Voice manual button if disconnected */}
          {(diagnostics.deepgramStatus !== "connected" ||
            status === "error") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reconnectVoice()}
              disabled={isReconnecting}
              className="gap-1.5 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
            >
              {isReconnecting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              {isReconnecting ? "Reconnecting..." : "Reconnect Voice"}
            </Button>
          )}

          <div className="flex items-center gap-2 text-xs font-medium">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${voiceState.badge}`}
            >
              <span className={`size-2 rounded-full ${voiceState.dot}`} />
              {voiceState.label}
            </span>
          </div>
        </div>
      </header>

      {/* Real-time Hardware & Connection Pipeline Status Bar */}
      <div className="mx-auto mt-4 w-full max-w-5xl rounded-lg border border-border/80 bg-card/40 px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <span className="flex items-center gap-1.5">
              <span
                className={`size-2 rounded-full ${
                  diagnostics.micPermission === "granted" &&
                  diagnostics.micDeviceDetected
                    ? "bg-emerald-400"
                    : diagnostics.micPermission === "denied"
                      ? "bg-destructive"
                      : "bg-amber-400"
                }`}
              />
              <span className="text-muted-foreground">Microphone:</span>
              <span className="font-medium text-foreground">
                {diagnostics.micPermission === "granted"
                  ? "Ready"
                  : diagnostics.micPermission === "denied"
                    ? "Blocked"
                    : "Connecting…"}
              </span>
            </span>

            <span className="flex items-center gap-1.5">
              <span
                className={`size-2 rounded-full ${
                  diagnostics.deepgramStatus === "connected"
                    ? "bg-emerald-400"
                    : diagnostics.deepgramStatus === "error"
                      ? "bg-destructive"
                      : "bg-amber-400"
                }`}
              />
              <span className="text-muted-foreground">Voice Connection:</span>
              <span className="font-medium text-foreground capitalize">
                {diagnostics.deepgramStatus === "connected"
                  ? "Connected (Nova-3)"
                  : diagnostics.deepgramStatus}
              </span>
            </span>

            <span className="flex items-center gap-1.5">
              <span
                className={`size-2 rounded-full ${
                  diagnostics.chunksSent > 0
                    ? "bg-emerald-400"
                    : "bg-muted-foreground/40"
                }`}
              />
              <span className="text-muted-foreground">Audio:</span>
              <span className="font-medium text-foreground">
                {diagnostics.chunksSent > 0
                  ? `Active (${diagnostics.chunksSent} chunks)`
                  : "Waiting for speech…"}
              </span>
            </span>

            <span className="flex items-center gap-1.5">
              <span
                className={`size-2 rounded-full ${
                  diagnostics.transcriptStatus === "received"
                    ? "bg-emerald-400"
                    : diagnostics.transcriptStatus === "receiving"
                      ? "bg-cyan-400"
                      : "bg-muted-foreground/40"
                }`}
              />
              <span className="text-muted-foreground">Transcript:</span>
              <span className="font-medium text-foreground">
                {diagnostics.transcriptStatus === "received"
                  ? "Received"
                  : diagnostics.transcriptStatus === "receiving"
                    ? "Transcribing…"
                    : "Waiting…"}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowDiagnostics((prev) => !prev)}
              className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <Activity className="size-3 text-primary" />
              Diagnostics
              {showDiagnostics ? (
                <ChevronUp className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Diagnostics Details Panel */}
        {showDiagnostics && (
          <div className="mt-3 border-t border-border/60 pt-3">
            <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-md border border-border/50 bg-background/50 p-2.5">
                <span className="text-muted-foreground">Permission:</span>{" "}
                <span
                  className={`font-medium ${
                    diagnostics.micPermission === "granted"
                      ? "text-emerald-400"
                      : diagnostics.micPermission === "denied"
                        ? "text-destructive"
                        : "text-amber-400"
                  }`}
                >
                  {diagnostics.micPermission}
                </span>
              </div>
              <div className="rounded-md border border-border/50 bg-background/50 p-2.5">
                <span className="text-muted-foreground">Device:</span>{" "}
                <span className="font-medium text-foreground">
                  {diagnostics.micDeviceLabel ||
                    (diagnostics.micDeviceDetected
                      ? "Detected"
                      : "Not detected")}
                </span>
              </div>
              <div className="rounded-md border border-border/50 bg-background/50 p-2.5">
                <span className="text-muted-foreground">Audio Track:</span>{" "}
                <span
                  className={`font-medium ${
                    diagnostics.audioTrackStatus === "live"
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}
                >
                  {diagnostics.audioTrackStatus}
                </span>
              </div>
              <div className="rounded-md border border-border/50 bg-background/50 p-2.5">
                <span className="text-muted-foreground">Recorder:</span>{" "}
                <span className="font-medium text-foreground capitalize">
                  {diagnostics.recorderStatus}{" "}
                  {diagnostics.recorderMimeType &&
                    `(${diagnostics.recorderMimeType})`}
                </span>
              </div>
              <div className="rounded-md border border-border/50 bg-background/50 p-2.5">
                <span className="text-muted-foreground">Audio Chunks:</span>{" "}
                <span className="font-medium text-foreground">
                  {diagnostics.chunksSent} sent{" "}
                  {diagnostics.lastChunkTime &&
                    `(@ ${diagnostics.lastChunkTime})`}
                </span>
              </div>
              <div className="rounded-md border border-border/50 bg-background/50 p-2.5">
                <span className="text-muted-foreground">Deepgram:</span>{" "}
                <span
                  className={`font-medium ${
                    diagnostics.deepgramStatus === "connected"
                      ? "text-emerald-400"
                      : "text-destructive"
                  }`}
                >
                  {diagnostics.deepgramStatus}
                </span>
              </div>
            </div>

            <div
              className={`mt-2.5 rounded-md border px-3 py-2 text-xs flex items-start gap-2 ${
                assessment.tone === "healthy"
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
                  : assessment.tone === "warning"
                    ? "border-amber-500/30 bg-amber-500/5 text-amber-300"
                    : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}
            >
              {assessment.tone === "healthy" ? (
                <Check className="size-3.5 mt-0.5 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
              )}
              <div className="flex-1">
                <span className="font-semibold">{assessment.stage}:</span>{" "}
                {assessment.advice}
              </div>
              {diagnostics.deepgramStatus !== "connected" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void reconnectVoice()}
                  disabled={isReconnecting}
                  className="h-6 px-2 text-[11px] shrink-0"
                >
                  Reconnect
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto grid w-full max-w-5xl flex-1 gap-6 py-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <section className="order-2 flex flex-col gap-5 lg:order-1">
          <div className="rounded-2xl border border-border bg-card/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Question {questionNumber}
                </span>
                {context.selfAssessedLevel && (
                  <span className="rounded-md border border-border bg-background/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {context.selfAssessedLevel}
                  </span>
                )}
                {context.questionType && (
                  <span className="rounded-md border border-border bg-background/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground capitalize">
                    {context.questionType}
                  </span>
                )}
              </div>
              {context.skillAssessed && (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary border border-primary/20">
                  <Sparkles className="size-3" />
                  {context.skillAssessed}
                </span>
              )}
            </div>
            <p className="mt-3 text-lg leading-relaxed font-normal">
              {question || "Generating your first question…"}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Your Answer
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {aiSpeaking
                    ? "Microphone paused while the interviewer speaks."
                    : status === "submitting"
                      ? "Answer submitted. Analyzing and preparing the next question…"
                      : "Review and edit your transcript before submitting."}
                </p>
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {draft.length} chars
              </span>
            </div>

            <textarea
              value={draft}
              onChange={(event) => {
                userEditedRef.current = true;
                updateDraft(event.target.value);
                setInterimTranscript("");
              }}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  void submitAnswer();
                }
              }}
              disabled={!editableStatuses.includes(status) || aiSpeaking}
              placeholder="Your voice transcription will appear here in real time. You can edit this text anytime before submitting..."
              className="mt-4 min-h-32 w-full resize-y rounded-lg border border-input bg-background px-3.5 py-3 text-sm leading-relaxed outline-none transition focus:border-ring focus:ring-[3px] focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
            />

            {interimTranscript && (
              <div className="mt-2 flex items-center gap-2 rounded-md bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-300 border border-cyan-500/20">
                <span className="size-2 rounded-full bg-cyan-400 animate-ping" />
                <span className="font-medium">Live speech:</span>
                <span className="italic truncate">{interimTranscript}</span>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${voiceState.badge}`}>
                  <span className={`size-2 rounded-full ${voiceState.dot}`} />
                  {voiceState.label}
                </span>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {voiceState.desc}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {draft.trim() && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      userEditedRef.current = false;
                      updateDraft("");
                      setInterimTranscript("");
                    }}
                    disabled={!editableStatuses.includes(status) || aiSpeaking}
                    className="text-xs text-muted-foreground hover:text-foreground h-8"
                  >
                    Clear Text
                  </Button>
                )}
                <Button
                  onClick={() => void submitAnswer()}
                  disabled={
                    !draft.trim() ||
                    !editableStatuses.includes(status) ||
                    aiSpeaking
                  }
                  className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Send className="size-4" />
                  Submit Answer
                </Button>
              </div>
            </div>
          </div>

          {submittedAnswer && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-muted-foreground">
              <Check className="mt-0.5 size-4 text-emerald-400" />
              Previous answer submitted. The next response is being evaluated.
            </div>
          )}

          {error && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span>{error}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void reconnectVoice()}
                disabled={isReconnecting}
                className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 shrink-0"
              >
                Reconnect Voice
              </Button>
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
                ? `${audioChunks} audio chunks streamed to Deepgram`
                : "Speak naturally, then review and edit your transcript."}
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
