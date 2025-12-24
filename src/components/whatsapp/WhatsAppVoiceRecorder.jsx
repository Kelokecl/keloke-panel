import { useState, useRef, useEffect } from "react";
import { Mic, Square, Play, Pause, X, Send, Loader } from "lucide-react";
import OpusMediaRecorder from "opus-media-recorder";

/**
 * WhatsAppVoiceRecorder (Nivel Dios)
 * - Graba en OGG/Opus usando opus-media-recorder (WASM) desde MISMA ORIGIN (/public)
 * - Evita SecurityError de Worker cross-origin (unpkg)
 * - Fallback a MediaRecorder nativo solo si es estrictamente necesario
 */
export default function WhatsAppVoiceRecorder({ onSendAudio, disabled }) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioRef = useRef(null);

  const actualMimeTypeRef = useRef("audio/ogg"); // lo que realmente quedó

  useEffect(() => {
    return () => {
      cleanupTimer();
      cleanupAudioUrl();
      stopStreamTracks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanupTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function cleanupAudioUrl() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }

  function stopStreamTracks() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function startRecording() {
    if (disabled || isSending) return;

    try {
      cleanupTimer();
      stopStreamTracks();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      setRecordingTime(0);

      // Worker/WASM desde tu dominio (Vercel) => /public/opus/*
      const workerOptions = {
        encoderWorkerFactory: () => new Worker("/opus/encoderWorker.umd.js"),
        OggOpusEncoderWasmPath: "/opus/OggOpusEncoder.wasm",
        WebMOpusEncoderWasmPath: "/opus/WebMOpusEncoder.wasm",
      };

      let recorder = null;

      // Intento 1: OGG/Opus con opus-media-recorder (ideal)
      try {
        recorder = new OpusMediaRecorder(stream, { mimeType: "audio/ogg" }, workerOptions);
        actualMimeTypeRef.current = "audio/ogg";
        console.log("✅ [VOICE] OpusMediaRecorder OK (audio/ogg)");
      } catch (e) {
        console.warn("⚠️ [VOICE] OpusMediaRecorder falló, probando MediaRecorder nativo:", e);

        // Intento 2: MediaRecorder nativo (si soporta OGG)
        if (window.MediaRecorder && MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
          recorder = new MediaRecorder(stream, { mimeType: "audio/ogg;codecs=opus" });
          actualMimeTypeRef.current = "audio/ogg";
          console.log("✅ [VOICE] MediaRecorder nativo OK (audio/ogg)");
        } else if (window.MediaRecorder && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          // Último recurso: webm (NO ideal para WhatsApp Cloud API)
          recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
          actualMimeTypeRef.current = "audio/webm";
          console.warn("⚠️ [VOICE] Fallback WEBM (NO ideal para WhatsApp)");
        } else {
          throw new Error("Tu navegador no soporta grabación de audio (MediaRecorder no disponible).");
        }
      }

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        cleanupTimer();

        const mime = actualMimeTypeRef.current || "audio/ogg";
        const ext = mime === "audio/webm" ? "webm" : "ogg";

        const blob = new Blob(chunksRef.current, {
          type: mime === "audio/ogg" ? "audio/ogg;codecs=opus" : "audio/webm;codecs=opus",
        });

        // metadata para tu sendAudio() en ChatView
        blob.mimeTypeForApi = mime;
        blob.fileExtensionForApi = ext;

        cleanupAudioUrl();
        const url = URL.createObjectURL(blob);

        setAudioBlob(blob);
        setAudioUrl(url);
        setIsRecording(false);
        setIsPlaying(false);

        // ojo: NO detenemos tracks aquí si quieres seguir grabando rápido.
        // pero para evitar mic “ocupado”, sí los detenemos.
        stopStreamTracks();

        console.log("✅ [VOICE] AUDIO LISTO", {
          size: blob.size,
          type: blob.type,
          mimeTypeForApi: blob.mimeTypeForApi,
          fileExtensionForApi: blob.fileExtensionForApi,
        });
      };

      recorder.start();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("❌ [VOICE] Error startRecording:", err);
      alert("No se pudo iniciar el micrófono. Revisa permisos del navegador.");
      setIsRecording(false);
      cleanupTimer();
      stopStreamTracks();
    }
  }

  function stopRecording() {
    if (!mediaRecorderRef.current || !isRecording) return;

    try {
      mediaRecorderRef.current.stop();
    } catch (e) {
      console.error("❌ [VOICE] stopRecording error:", e);
      setIsRecording(false);
      cleanupTimer();
      stopStreamTracks();
    }
  }

  function cancelRecording() {
    if (isRecording) stopRecording();

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    cleanupAudioUrl();

    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setIsPlaying(false);

    // limpia chunks por si acaso
    chunksRef.current = [];
  }

  async function togglePlayPause() {
    if (!audioRef.current) return;

    try {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        const p = audioRef.current.play();
        if (p?.then) await p;
        setIsPlaying(true);
      }
    } catch (e) {
      console.error("❌ [VOICE] play error:", e);
      setIsPlaying(false);
    }
  }

  async function sendAudio() {
    if (!audioBlob || !onSendAudio) return;

    setIsSending(true);
    try {
      await onSendAudio(audioBlob, recordingTime);
      // solo limpiamos si el envío fue OK
      cancelRecording();
    } catch (err) {
      console.error("❌ [VOICE] Error al enviar audio:", err);
      alert("Error al enviar el audio. Revisa consola.");
    } finally {
      setIsSending(false);
    }
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  // UI: grabando
  if (isRecording) {
    return (
      <div className="flex items-center gap-2 bg-red-50 px-3 py-2 rounded-full">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm font-mono text-red-600">{formatTime(recordingTime)}</span>
        </div>
        <button
          onClick={stopRecording}
          className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600"
          title="Detener"
        >
          <Square className="w-4 h-4" fill="currentColor" />
        </button>
      </div>
    );
  }

  // UI: preview
  if (audioBlob && audioUrl) {
    return (
      <div className="flex items-center gap-2 bg-green-50 px-3 py-2 rounded-full">
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onEnded={() => setIsPlaying(false)}
        />

        <button
          onClick={togglePlayPause}
          className="p-1.5 text-green-700 hover:bg-green-100 rounded-full"
          title={isPlaying ? "Pausar" : "Reproducir"}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        <span className="text-sm font-mono text-green-700">{formatTime(recordingTime)}</span>

        <button
          onClick={cancelRecording}
          disabled={isSending}
          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-full disabled:opacity-50"
          title="Cancelar"
        >
          <X className="w-4 h-4" />
        </button>

        <button
          onClick={sendAudio}
          disabled={isSending}
          className="p-1.5 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:bg-gray-300"
          title="Enviar"
        >
          {isSending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    );
  }

  // UI: botón mic
  return (
    <button
      onClick={startRecording}
      disabled={disabled || isSending}
      className="p-3 text-gray-600 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
      title="Grabar audio"
    >
      <Mic className="w-5 h-5" />
    </button>
  );
}
