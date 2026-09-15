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

type ConversationTurn = {
  role: "ai" | "user";
  text: string;
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
  const [minQuestions, setMinQuestions] = useState<number | null>(null);
  const [maxQuestions, setMaxQuestions] = useState<number | null>(null);
  const [conversationLog, setConversationLog] = useState<ConversationTurn[]>([]);

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
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const utteranceWatchdogRef = useRef<number | null>(null);
  const userMeterRef = useRef<(() => number) | null>(null);

  const updateStatus = (nextStatus: Status) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  };

  // Sync draft state and ref
  const updateDraft = (newText: string) => {
    draftRef.current = newText;
    setDraft(newText);
  };

  function setMicrophoneMuted(muted: boolean) {
    if (userStreamRef.current) {
      userStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    setDiagnostics((prev) => ({
      ...prev,
      audioTrackStatus: muted ? "muted" : "live",
    }));
  }

  function clearUtteranceWatchdog() {
    if (utteranceWatchdogRef.current) {
      window.clearTimeout(utteranceWatchdogRef.current);
      utteranceWatchdogRef.current = null;
    }
  }

  function speakAI(text: string) {
    if (!text) return;
    clearUtteranceWatchdog();
    aiSpeakingRef.current = true;
    updateStatus("ai-speaking");
    setMicrophoneMuted(true);

    try {
      window.speechSynthesis.cancel();
    } catch {}

    const utterance = new SpeechSynthesisUtterance(text);
    activeUtteranceRef.current = utterance;
    utterance.rate = 0.95;

    const finishSpeaking = () => {
      clearUtteranceWatchdog();
      if (!isUnmountingRef.current && statusRef.current !== "ending") {
        aiSpeakingRef.current = false;
        activeUtteranceRef.current = null;
        setMicrophoneMuted(false);
        updateStatus(draftRef.current ? "transcript-ready" : "listening");
      }
    };

    utterance.onstart = () => {
      aiSpeakingRef.current = true;
      setMicrophoneMuted(true);
    };
    utterance.onend = () => {
      finishSpeaking();
    };
    utterance.onerror = () => {
      finishSpeaking();
    };

    // Chrome SpeechSynthesis Watchdog: prevents perpetual AI SPEAKING state if onend fails to fire
    const wordCount = text.trim().split(/\s+/).length;
    const estimatedDurationMs = Math.max(5000, (wordCount / 2.2) * 1000 + 4000);
    utteranceWatchdogRef.current = window.setTimeout(() => {
      if (aiSpeakingRef.current) {
        console.warn("[voice] SpeechSynthesis watchdog expired; restoring microphone listening");
        finishSpeaking();
      }
    }, estimatedDurationMs);

    setTimeout(() => {
      if (!isUnmountingRef.current && aiSpeakingRef.current) {
        try {
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn("[voice] SpeechSynthesis speak invocation error:", e);
          finishSpeaking();
        }
      }
    }, 50);
  }

  function scheduleTokenRenewal(sessionId: number) {
    if (tokenExpiryTimerRef.current) window.clearTimeout(tokenExpiryTimerRef.current);
    // Refresh at 500s (before Deepgram 600s TTL expires)
    tokenExpiryTimerRef.current = window.setTimeout(() => {
      if (!isUnmountingRef.current && sessionRef.current === sessionId && statusRef.current !== "ending") {
        if (draftRef.current.trim() || interimTranscript) {
          console.info("[voice] Candidate actively answering; delaying token renewal by 15s");
          tokenExpiryTimerRef.current = window.setTimeout(() => {
            scheduleTokenRenewal(sessionId);
          }, 15000);
          return;
        }
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
              socket.readyState !== WebSocket.OPEN
            ) {
              return;
            }

            void event.data.arrayBuffer().then((audio) => {
              if (
                isUnmountingRef.current ||
                sessionRef.current !== sessionId ||
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

          // Unconditional 3-second heartbeat keeps Deepgram WebSocket alive during candidate thinking,
          // answer editing, and backend LLM generation (preventing 12.8s NET-0001 code 1011 idle timeout)
          if (keepAliveRef.current) window.clearInterval(keepAliveRef.current);
          try {
            socket.send(JSON.stringify({ type: "KeepAlive" }));
          } catch {}
          keepAliveRef.current = window.setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              try {
                socket.send(JSON.stringify({ type: "KeepAlive" }));
              } catch {}
            }
          }, 3000);

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
      if (recorderRef.current) {
        recorderRef.current.ondataavailable = null;
        recorderRef.current.onerror = null;
        if (recorderRef.current.state !== "inactive") {
          try {
            recorderRef.current.stop();
          } catch {}
        }
        recorderRef.current = null;
      }

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
        stream.getAudioTracks().length > 0 &&
        stream.getAudioTracks().some((t) => t.readyState === "live");

      if (isStreamLive && stream) {
        stream.getAudioTracks().forEach((t) => {
          t.enabled = true;
        });
      } else {
        console.info("[voice] Audio track inactive, requesting fresh stream");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        userStreamRef.current = stream;
        if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
          userMeterRef.current = createLevelMeter(audioCtxRef.current, stream);
        }
      }

      setDiagnostics((prev) => ({
        ...prev,
        micPermission: "granted",
        micDeviceDetected: true,
        audioTrackStatus: "live",
      }));

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
        userMeterRef.current = userMeter;

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
        if ((data as any).minQuestions) setMinQuestions((data as any).minQuestions);
        if ((data as any).maxQuestions) setMaxQuestions((data as any).maxQuestions);
        if (data.message) {
          setConversationLog((prev) => [...prev, { role: "ai", text: data.message! }]);
          speakAI(data.message);
        }
        if (isCurrentSession() && !window.speechSynthesis.speaking) {
          setStatus("listening");
        }

        // Animation frame for visualizer
        const tick = () => {
          if (!isCurrentSession()) return;
          const currentMeter = userMeterRef.current;
          setUserLevel(aiSpeakingRef.current ? 0 : (currentMeter ? currentMeter() : 0));
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
    clearUtteranceWatchdog();
    window.speechSynthesis.cancel();
    setMicrophoneMuted(true);
    updateStatus("submitting");
    setSubmittedAnswer(answer);
    setConversationLog((prev) => [...prev, { role: "user", text: answer }]);
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
      if (response.data.minQuestions) setMinQuestions(response.data.minQuestions);
      if (response.data.maxQuestions) setMaxQuestions(response.data.maxQuestions);
      if (nextQuestion) setConversationLog((prev) => [...prev, { role: "ai", text: nextQuestion }]);

      if (response.data.questionType || response.data.skillAssessed || response.data.difficulty) {
        setContext((prev) => ({
          ...prev,
          questionType: response.data.questionType,
          skillAssessed: response.data.skillAssessed,
          selfAssessedLevel: response.data.difficulty || prev.selfAssessedLevel,
        }));
      }

      if (nextQuestion) {
        speakAI(nextQuestion);
      } else {
        setMicrophoneMuted(false);
        updateStatus("listening");
      }
    } catch (submitError) {
      console.error("Transcript processing error:", submitError);
      setError("Unable to submit this answer. Please try again.");
      updateStatus("error");
      setMicrophoneMuted(false);
    } finally {
      processingRef.current = false;
    }
  }

  function cleanup() {
    clearUtteranceWatchdog();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (keepAliveRef.current) window.clearInterval(keepAliveRef.current);
    keepAliveRef.current = null;
    if (tokenExpiryTimerRef.current) window.clearTimeout(tokenExpiryTimerRef.current);
    tokenExpiryTimerRef.current = null;
    if (recorderRef.current) {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onerror = null;
      if (recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {}
      }
      recorderRef.current = null;
    }
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
    activeUtteranceRef.current = null;
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
        desc: "Microphone active â€¢ Speak your answer",
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

  // Transcript panel scroll ref
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationLog]);

  return (
    <main className="flex min-h-screen flex-col bg-background">
      {/* â”€â”€ Top Bar â”€â”€ */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary leading-none">AI Interview</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {context.targetRole
                  ? `${context.targetRole}${context.targetCompany ? ` Â· ${context.targetCompany}` : ""}`
                  : "Technical Assessment"}
              </p>
            </div>
          </div>

          {/* Question Progress */}
          <div className="hidden sm:flex flex-col items-center gap-1">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <span>Question {questionNumber}</span>
              {maxQuestions && (
                <span className="text-muted-foreground">of ~{maxQuestions}</span>
              )}
              {context.selfAssessedLevel && (
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {context.selfAssessedLevel}
                </span>
              )}
            </div>
            {maxQuestions && (
              <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${Math.min(100, (questionNumber / maxQuestions) * 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Connection Status + Controls */}
          <div className="flex items-center gap-2">
            {(diagnostics.deepgramStatus !== "connected" || status === "error") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { reconnectAttemptsRef.current = 0; void reconnectVoice(); }}
                disabled={isReconnecting}
                className="gap-1.5 text-xs border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
              >
                {isReconnecting ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                {isReconnecting ? "Reconnectingâ€¦" : "Reconnect Voice"}
              </Button>
            )}
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${voiceState.badge}`}>
              <span className={`size-1.5 rounded-full ${voiceState.dot}`} />
              {voiceState.label}
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={endInterview}
              disabled={status === "ending"}
              className="gap-1.5 text-xs"
            >
              {status === "ending" ? <Loader2 className="size-3 animate-spin" /> : <PhoneOff className="size-3" />}
              End
            </Button>
          </div>
        </div>

        {/* Pipeline status mini-bar */}
        <div className="border-t border-border/60 bg-muted/40">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 overflow-x-auto px-5 py-1.5 sm:px-8">
            <div className="flex shrink-0 items-center gap-5 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full ${
                  diagnostics.micPermission === "granted" && diagnostics.micDeviceDetected ? "bg-emerald-500" :
                  diagnostics.micPermission === "denied" ? "bg-destructive" : "bg-amber-400"
                }`} />
                <span className="text-muted-foreground">Mic:</span>
                <span className="font-medium">{diagnostics.micPermission === "granted" ? "Ready" : diagnostics.micPermission === "denied" ? "Blocked" : "Connectingâ€¦"}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full ${
                  diagnostics.deepgramStatus === "connected" ? "bg-emerald-500" :
                  diagnostics.deepgramStatus === "error" ? "bg-destructive" : "bg-amber-400"
                }`} />
                <span className="text-muted-foreground">STT:</span>
                <span className="font-medium">{diagnostics.deepgramStatus === "connected" ? "Nova-3 Live" : diagnostics.deepgramStatus}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full ${diagnostics.chunksSent > 0 ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                <span className="text-muted-foreground">Audio:</span>
                <span className="font-medium">{diagnostics.chunksSent > 0 ? `${diagnostics.chunksSent} chunks` : "Waitingâ€¦"}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowDiagnostics((p) => !p)}
              className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Activity className="size-3 text-primary" />
              Diagnostics
              {showDiagnostics ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            </button>
          </div>

          {/* Collapsible diagnostics */}
          {showDiagnostics && (
            <div className="mx-auto max-w-6xl border-t border-border/60 px-5 pb-3 pt-2 sm:px-8">
              <div className="grid gap-2 text-[11px] sm:grid-cols-3">
                <div className="rounded-md border border-border/50 bg-background/50 p-2">
                  <span className="text-muted-foreground">Permission:</span>{" "}
                  <span className={`font-medium ${
                    diagnostics.micPermission === "granted" ? "text-emerald-600" :
                    diagnostics.micPermission === "denied" ? "text-destructive" : "text-amber-600"
                  }`}>{diagnostics.micPermission}</span>
                </div>
                <div className="rounded-md border border-border/50 bg-background/50 p-2">
                  <span className="text-muted-foreground">Device:</span>{" "}
                  <span className="font-medium">{diagnostics.micDeviceLabel || (diagnostics.micDeviceDetected ? "Detected" : "Not detected")}</span>
                </div>
                <div className="rounded-md border border-border/50 bg-background/50 p-2">
                  <span className="text-muted-foreground">Recorder:</span>{" "}
                  <span className="font-medium capitalize">{diagnostics.recorderStatus}</span>
                </div>
              </div>
              <div className={`mt-2 rounded-md border px-3 py-2 text-[11px] flex items-start gap-2 ${
                assessment.tone === "healthy" ? "border-emerald-500/30 bg-emerald-50 text-emerald-700" :
                assessment.tone === "warning" ? "border-amber-500/30 bg-amber-50 text-amber-700" :
                "border-destructive/40 bg-red-50 text-destructive"
              }`}>
                {assessment.tone === "healthy" ? (
                  <Check className="size-3.5 mt-0.5 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                )}
                <div className="flex-1">
                  <span className="font-semibold">{assessment.stage}:</span>{" "}{assessment.advice}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* â”€â”€ Main Two-Panel Layout â”€â”€ */}
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-0 px-5 py-6 sm:px-8 lg:grid-cols-[1fr_380px] lg:gap-6">

        {/* â”€â”€ LEFT: Interview Console â”€â”€ */}
        <div className="flex flex-col gap-5">

          {/* Voice Orbs */}
          <div className="flex items-center justify-center gap-10 rounded-2xl border border-border bg-card/60 py-6 shadow-sm">
            <VoiceOrb
              level={aiLevel}
              speaking={aiSpeaking}
              label="Interviewer"
              sublabel={aiSpeaking ? "Speaking" : "Ready"}
              icon={Bot}
              accent="violet"
            />
            <div className="flex flex-col items-center gap-1">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${voiceState.badge}`}>
                <span className={`size-1.5 rounded-full ${voiceState.dot}`} />
                {voiceState.label}
              </span>
              <span className="text-[11px] text-muted-foreground">{voiceState.desc}</span>
            </div>
            <VoiceOrb
              level={userLevel}
              speaking={userSpeaking}
              label="You"
              sublabel={aiSpeaking ? "Mic paused" : "Listening"}
              icon={User}
              accent="emerald"
            />
          </div>

          {/* Current Question Card */}
          <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                Question {questionNumber}
              </span>
              {maxQuestions && (
                <span className="text-xs text-muted-foreground">of ~{maxQuestions}</span>
              )}
              {context.questionType && (
                <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground capitalize">
                  {context.questionType}
                </span>
              )}
              {context.skillAssessed && (
                <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/8 px-2 py-0.5 text-[11px] font-medium text-primary">
                  <Sparkles className="size-3" />
                  {context.skillAssessed}
                </span>
              )}
            </div>
            <p className="text-base leading-relaxed text-foreground">
              {question || (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Generating your first questionâ€¦
                </span>
              )}
            </p>
          </div>

          {/* Answer Area */}
          <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Your Answer</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {aiSpeaking
                    ? "Microphone paused while the interviewer speaks."
                    : status === "submitting"
                      ? "Submitted. Analyzing and preparing next questionâ€¦"
                      : "Voice transcription appears below. Edit freely before submitting."}
                </p>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">{draft.length} chars</span>
            </div>

            <textarea
              value={draft}
              onChange={(e) => { userEditedRef.current = true; updateDraft(e.target.value); setInterimTranscript(""); }}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void submitAnswer(); } }}
              disabled={!editableStatuses.includes(status) || aiSpeaking}
              placeholder="Your voice transcription appears here in real time. Edit and review before submitting. (Ctrl+Enter to submit)"
              className="mt-1 min-h-28 w-full resize-y rounded-xl border border-input bg-background px-3.5 py-3 text-sm leading-relaxed outline-none transition-all focus:border-ring focus:ring-[3px] focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-55"
            />

            {interimTranscript && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-50 px-3 py-1.5 text-[11px] text-cyan-700">
                <span className="size-1.5 rounded-full bg-cyan-500 animate-ping" />
                <span className="font-semibold">Live speech:</span>
                <span className="italic truncate">{interimTranscript}</span>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {status === "requesting-microphone" || status === "connecting-deepgram" ? (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    {status === "requesting-microphone" ? "Requesting micâ€¦" : "Connectingâ€¦"}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    {audioChunks > 0 ? `${audioChunks} audio chunks streamed` : "Speak into your microphone"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {draft.trim() && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { userEditedRef.current = false; updateDraft(""); setInterimTranscript(""); }}
                    disabled={!editableStatuses.includes(status) || aiSpeaking}
                    className="h-8 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </Button>
                )}
                <Button
                  onClick={() => void submitAnswer()}
                  disabled={!draft.trim() || !editableStatuses.includes(status) || aiSpeaking}
                  className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  size="sm"
                >
                  <Send className="size-3.5" />
                  Submit Answer
                </Button>
              </div>
            </div>
          </div>

          {/* Status messages */}
          {submittedAnswer && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
              Answer submitted â€” next question is being prepared.
            </div>
          )}

          {error && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-red-50 px-3 py-2 text-sm text-destructive">
              <span>{error}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { reconnectAttemptsRef.current = 0; void reconnectVoice(); }}
                disabled={isReconnecting}
                className="h-7 shrink-0 text-[11px] border-destructive/30 text-destructive hover:bg-red-50"
              >
                Reconnect Voice
              </Button>
            </div>
          )}
        </div>

        {/* â”€â”€ RIGHT: Live Conversation Transcript â”€â”€ */}
        <aside className="mt-6 flex flex-col rounded-2xl border border-border bg-card/60 shadow-sm lg:mt-0 lg:max-h-[calc(100vh-10rem)] lg:overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Mic className="size-4 text-primary" />
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-foreground">Live Transcript</h2>
            {conversationLog.length > 0 && (
              <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {conversationLog.length} turns
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 lg:max-h-full">
            {conversationLog.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center py-8">
                <div className="rounded-full bg-primary/8 p-3">
                  <Bot className="size-5 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground">The conversation will appear here as it progresses.</p>
              </div>
            ) : (
              conversationLog.map((turn, i) => (
                <div key={i} className={`flex gap-2 ${turn.role === "ai" ? "justify-start" : "flex-row-reverse"}`}>
                  <div className={`grid size-6 shrink-0 place-items-center rounded-full ${
                    turn.role === "ai"
                      ? "bg-gradient-to-br from-violet-500 to-indigo-600 text-white"
                      : "bg-gradient-to-br from-emerald-400 to-teal-600 text-white"
                  }`}>
                    {turn.role === "ai" ? <Bot className="size-3" /> : <User className="size-3" />}
                  </div>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[11px] leading-relaxed ${
                    turn.role === "ai"
                      ? "rounded-tl-sm border border-border bg-white text-foreground shadow-xs"
                      : "rounded-tr-sm bg-primary text-primary-foreground"
                  }`}>
                    <p className="mb-0.5 font-semibold opacity-60" style={{ fontSize: "10px" }}>
                      {turn.role === "ai" ? "Interviewer" : "You"}
                    </p>
                    <p className="whitespace-pre-wrap">{turn.text}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </aside>
      </div>
    </main>
  );
}
