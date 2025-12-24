import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, X, Send, Loader } from 'lucide-react';

export default function WhatsAppVoiceRecorder({ onSendAudio, disabled }) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const streamRef = useRef(null);

  const actualMimeTypeRef = useRef(null); // "audio/ogg" | "audio/webm"
  const actualExtRef = useRef(null);      // "ogg" | "webm"

  useEffect(() => {
    return () => {
      cleanupTimer();
      cleanupAudioUrl();
      stopStream();
      tryStopRecorderSilently();
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
    if (audioUrl) {
      try { URL.revokeObjectURL(audioUrl); } catch {}
    }
  }

  function stopStream() {
    const s = streamRef.current;
    if (s) {
      try { s.getTracks().forEach(t => t.stop()); } catch {}
      streamRef.current = null;
    }
  }

  function tryStopRecorderSilently() {
    const r = mediaRecorderRef.current;
    if (r && r.state && r.state !== 'inactive') {
      try { r.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function supportsNative(mime) {
    try {
      return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime);
    } catch {
      return false;
    }
  }

  async function createRecorder(stream) {
    // 1) OGG nativo (ideal)
    if (supportsNative('audio/ogg;codecs=opus')) {
      console.log('✅ [VOICE] MediaRecorder nativo OGG/OPUS');
      actualMimeTypeRef.current = 'audio/ogg';
      actualExtRef.current = 'ogg';
      return new MediaRecorder(stream, { mimeType: 'audio/ogg;codecs=opus' });
    }

    // 2) opus-media-recorder (WASM) desde TU mismo dominio (Vercel)
    try {
      console.log('🧩 [VOICE] No hay OGG nativo. Probando opus-media-recorder (same-origin)…');

      const mod = await import('opus-media-recorder');
      const OpusMediaRecorder = mod?.default || mod;

      const base = window.location.origin; // same-origin
      const workerUrl = `${base}/opus/encoderWorker.umd.js`;
      const oggWasm = `${base}/opus/OggOpusEncoder.wasm`;
      const webmWasm = `${base}/opus/WebMOpusEncoder.wasm`;

      const recorder = new OpusMediaRecorder(
        stream,
        { mimeType: 'audio/ogg' },
        {
          encoderWorkerFactory: () => new Worker(workerUrl),
          OggOpusEncoderWasmPath: oggWasm,
          WebMOpusEncoderWasmPath: webmWasm,
        }
      );

      console.log('✅ [VOICE] OpusMediaRecorder OK (OGG forzado)');
      actualMimeTypeRef.current = 'audio/ogg';
      actualExtRef.current = 'ogg';
      return recorder;
    } catch (err) {
      console.error('❌ [VOICE] opus-media-recorder falló:', err);
    }

    // 3) último recurso: WEBM
    if (supportsNative('audio/webm;codecs=opus')) {
      console.warn('⚠️ [VOICE] Fallback WEBM/OPUS (último recurso)');
      actualMimeTypeRef.current = 'audio/webm';
      actualExtRef.current = 'webm';
      alert('⚠️ Tu navegador no permite OGG. Se grabará WEBM (WhatsApp puede fallar).');
      return new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    }

    throw new Error('Este navegador no soporta grabación de audio.');
  }

  async function startRecording() {
    if (disabled || isRecording || isSending) return;

    try {
      cleanupTimer();
      cleanupAudioUrl();
      setAudioBlob(null);
      setAudioUrl(null);
      setRecordingTime(0);
      setIsPlaying(false);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = await createRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e?.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        cleanupTimer();

        const finalMime = actualMimeTypeRef.current || 'audio/ogg';
        const finalExt = actualExtRef.current || (finalMime.includes('webm') ? 'webm' : 'ogg');

        const blob = new Blob(chunksRef.current, {
          type: finalMime.includes('ogg') ? 'audio/ogg;codecs=opus' : 'audio/webm;codecs=opus',
        });

        blob.mimeTypeForApi = finalMime;
        blob.fileExtensionForApi = finalExt;

        console.log('✅ [VOICE] AUDIO LISTO', {
          size: blob.size,
          type: blob.type,
          mimeTypeForApi: blob.mimeTypeForApi,
          fileExtensionForApi: blob.fileExtensionForApi,
        });

        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        stopStream();
      };

      recorder.start();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setRecordingTime((p) => p + 1);
      }, 1000);
    } catch (err) {
      console.error('❌ startRecording error:', err);
      stopStream();
      cleanupTimer();
      setIsRecording(false);
      alert('No se pudo acceder al micrófono. Revisa permisos (candado).');
    }
  }

  function stopRecording() {
    if (!mediaRecorderRef.current || !isRecording) return;
    try {
      mediaRecorderRef.current.stop();
    } catch (err) {
      console.error('❌ stopRecording error:', err);
      stopStream();
    } finally {
      setIsRecording(false);
      cleanupTimer();
    }
  }

  function cancelRecording() {
    try {
      if (isRecording) stopRecording();
    } catch {}

    cleanupTimer();
    cleanupAudioUrl();
    stopStream();
    tryStopRecorderSilently();

    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setIsPlaying(false);
  }

  function togglePlayPause() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  }

  async function sendAudio() {
    if (!audioBlob) return;

    setIsSending(true);
    try {
      // CLAVE: solo limpiar si realmente envió OK
      await onSendAudio(audioBlob, recordingTime);
      cancelRecording();
    } catch (err) {
      console.error('❌ sendAudio error:', err);
      alert('No se pudo enviar el audio (revisa consola).');
      // NO limpiar preview si falló
    } finally {
      setIsSending(false);
    }
  }

  // Grabando
  if (isRecording) {
    return (
      <div className="flex items-center gap-2 bg-red-50 px-3 py-2 rounded-full">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
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
      disabled={disabled || isSending}
      className="p-3 text-gray-600 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Mic className="w-5 h-5" />
    </button>
  );
}
