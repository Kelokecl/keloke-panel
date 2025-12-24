import { useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Pause, X, Send, Loader } from "lucide-react";
import OpusMediaRecorder from "opus-media-recorder";

const OPUS_ASSETS = {
  worker: "/opus/encoderWorker.umd.js",
  oggWasm: "/opus/OggOpusEncoder.wasm",
  webmWasm: "/opus/WebMOpusEncoder.wasm",
};

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
  const stoppingRef = useRef(false);

  useEffect(() => {
    return () => {
      cleanupAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanupAll() {
    try {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (audioRef.current) {
        audioRef.current.pause?.();
      }
      if (mediaRecorderRef.current) {
        try {
          if (mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
          }
        } catch {}
        mediaRecorderRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    } catch {}
  }

  function resetPreview() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setIsPlaying(false);
  }

  async function startRecording() {
    if (disabled || isRecording) return;

    resetPreview();
    stoppingRef.current = false;
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Preferimos OGG (WhatsApp feliz)
      const mimeType = "audio/ogg;codecs=opus";

      // Worker mismo origen (Vercel), evita CORS/CSP
      const workerOptions = {
        encoderWorkerFactory: () => new Worker(OPUS_ASSETS.worker),
        OggOpusEncoderWasmPath: OPUS_ASSETS.oggWasm,
        WebMOpusEncoderWasmPath: OPUS_ASSETS.webmWasm,
      };

      let recorder;
      try {
        recorder = new OpusMediaRecorder(stream, { mimeType }, workerOptions);
        console.log("[VOICE] OpusMediaRecorder OK (ogg/opus)");
      } catch (e) {
        console.warn("[VOICE] OpusMediaRecorder falló, fallback MediaRecorder:", e);
        // fallback nativo si existe
        if (window.MediaRecorder) {
          const fallbackType =
            MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
              ? "audio/ogg;codecs=opus"
              : "audio/webm;codecs=opus";
          recorder = new MediaRecorder(stream, { mimeType: fallbackType });
          console.log("[VOICE] MediaRecorder fallback:", fallbackType);
        } else {
          throw new Error("Este navegador no soporta grabación de audio.");
        }
      }

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e?.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onerror = (e) => {
        console.error("[VOICE] recorder.onerror:", e);
      };

      recorder.onstop = async () => {
        try {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }

          // Blob final
          const typeGuess =
            chunksRef.current?.[0]?.type ||
            recorder.mimeType ||
            "audio/ogg;codecs=opus";

          const blob = new Blob(chunksRef.current, { type: typeGuess });

          // Si quedó vacío, no mostramos preview
          if (!blob || blob.size < 800) {
            console.warn("[VOICE] Blob vacío o muy chico:", blob?.size);
            resetPreview();
            return;
          }

          const url = URL.createObjectURL(blob);
          setAudioBlob(blob);
          setAudioUrl(url);

          console.log("[VOICE] AUDIO LISTO", {
            size: blob.size,
            type: blob.type,
            seconds: recordingTime,
          });
        } finally {
          // cortar stream
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }
          stoppingRef.current = false;
          setIsRecording(false);
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error al acceder al micrófono:", err);
      cleanupAll();
      alert("No se pudo acceder al micrófono. Revisa permisos.");
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (stoppingRef.current) return;

    try {
      stoppingRef.current = true;

      // Evita INVALID_STATE_ERR (stop doble)
      if (recorder.state && recorder.state !== "recording") {
        console.warn("[VOICE] stop ignorado, state:", recorder.state);
        stoppingRef.current = false;
        return;
      }

      recorder.stop();
    } catch (e) {
      console.error("[VOICE] stop error:", e);
      stoppingRef.current = false;
    }
  }

  function cancelRecording() {
    cleanupAll();
    resetPreview();
    setIsRecording(false);
    stoppingRef.current = false;
  }

  function togglePlayPause() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }

  async function sendAudio() {
    if (!audioBlob || isSending) return;

    setIsSending(true);
    try {
      await onSendAudio(audioBlob, recordingTime);
      cancelRecording();
    } catch (err) {
      console.error("Error al enviar audio:", err);
      alert("Error al enviar el audio");
    } finally {
      setIsSending(false);
    }
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  // Grabando
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
        >
          <Square className="w-4 h-4" fill="currentColor" />
        </button>
      </div>
    );
  }

  // Preview
  if (audioBlob) {
    return (
      <div className="flex items-center gap-2 bg-green-50 px-3 py-2 rounded-full">
        <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} />

        <button onClick={togglePlayPause} className="p-1.5 text-green-600 hover:bg-green-100 rounded-full">
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        <span className="text-sm font-mono text-green-600">{formatTime(recordingTime)}</span>

        <button onClick={cancelRecording} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-full">
          <X className="w-4 h-4" />
        </button>

        <button
          onClick={sendAudio}
          disabled={isSending}
          className="p-1.5 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:bg-gray-300"
        >
          {isSending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    );
  }

  // Botón mic
  return (
    <button
      onClick={startRecording}
      disabled={disabled}
      className="p-3 text-gray-600 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
      title="Grabar audio"
    >
      <Mic className="w-5 h-5" />
    </button>
  );
}
