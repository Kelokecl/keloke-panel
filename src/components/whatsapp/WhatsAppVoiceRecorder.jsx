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

  // metadata real para API
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
      try {
        URL.revokeObjectURL(audioUrl);
      } catch {}
    }
  }

  function stopStream() {
    const s = streamRef.current;
    if (s) {
      try {
        s.getTracks().forEach((t) => t.stop());
      } catch {}
      streamRef.current = null;
    }
  }

  function tryStopRecorderSilently() {
    const r = mediaRecorderRef.current;
    if (r && r.state && r.state !== 'inactive') {
      try {
        r.stop();
      } catch {}
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
    // 1) Preferir OGG Opus nativo si el browser lo soporta
    if (supportsNative('audio/ogg;codecs=opus')) {
      console.log('✅ [VOICE] Usando MediaRecorder nativo OGG/OPUS');
      actualMimeTypeRef.current = 'audio/ogg';
      actualExtRef.current = 'ogg';
      return new MediaRecorder(stream, { mimeType: 'audio/ogg;codecs=opus' });
    }

    // 2) Si NO hay OGG nativo => intentar opus-media-recorder (WASM) forzando OGG
    try {
      console.log('🧩 [VOICE] Browser no soporta OGG nativo. Probando opus-media-recorder (WASM) ...');

      // Import dinámico para evitar problemas de build/SSR
      const mod = await import('opus-media-recorder');
      const OpusMediaRecorder = mod?.default || mod;

      // CDN estable (evita Vercel sirviendo HTML 404)
      const CDN_BASE = 'https://unpkg.com/opus-media-recorder@0.8.0/';

      const recorder = new OpusMediaRecorder(
        stream,
        { mimeType: 'audio/ogg' },
        {
          // Worker + WASM por CDN
          encoderWorkerFactory: () => new Worker(`${CDN_BASE}encoderWorker.umd.js`),
          OggOpusEncoderWasmPath: `${CDN_BASE}OggOpusEncoder.wasm`,
          WebMOpusEncoderWasmPath: `${CDN_BASE}WebMOpusEncoder.wasm`,
        }
      );

      console.log('✅ [VOICE] OpusMediaRecorder OK (OGG/OPUS forzado)');
      actualMimeTypeRef.current = 'audio/ogg';
      actualExtRef.current = 'ogg';
      return recorder;
    } catch (err) {
      console.error('❌ [VOICE] opus-media-recorder falló:', err);
    }

    // 3) ÚLTIMO fallback: WEBM Opus nativo (no ideal para WhatsApp Cloud API)
    if (supportsNative('audio/webm;codecs=opus')) {
      console.warn('⚠️ [VOICE] Fallback a WEBM/OPUS (último recurso).');
      actualMimeTypeRef.current = 'audio/webm';
      actualExtRef.current = 'webm';
      alert('⚠️ Tu navegador no permite OGG. Se grabará en WEBM (puede que WhatsApp no lo acepte siempre).');
      return new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    }

    // 4) Nada disponible
    throw new Error('Este navegador no soporta grabación de audio con MediaRecorder.');
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

      // pedir mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = await createRecorder(stream);

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e?.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onerror = (e) => {
        console.error('❌ [VOICE] Recorder error:', e);
      };

      recorder.onstop = () => {
        cleanupTimer();

        const finalMime = actualMimeTypeRef.current || 'audio/ogg';
        const finalExt = actualExtRef.current || (finalMime.includes('webm') ? 'webm' : 'ogg');

        const blob = new Blob(chunksRef.current, {
          type: finalMime.includes('ogg') ? 'audio/ogg;codecs=opus' : 'audio/webm;codecs=opus',
        });

        // metadata para tu sendAudio (sin romper)
        blob.mimeTypeForApi = finalMime;
        blob.fileExtensionForApi = finalExt;

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎤 [VOICE] AUDIO LISTO');
        console.log('   size:', blob.size);
        console.log('   blob.type:', blob.type);
        console.log('   mimeTypeForApi:', blob.mimeTypeForApi);
        console.log('   fileExtensionForApi:', blob.fileExtensionForApi);
        if (finalMime === 'audio/webm') {
          console.warn('⚠️ [VOICE] Grabado en WEBM (último recurso).');
        } else {
          console.log('✅ [VOICE] Grabado en OGG (ideal).');
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        setAudioBlob(blob);

        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        // apagar stream sí o sí
        stopStream();
      };

      recorder.start();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('❌ Error al iniciar grabación:', err);
      stopStream();
      cleanupTimer();
      setIsRecording(false);

      const msg = String(err?.message || err);
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
        alert('No se pudo acceder al micrófono: revisa permisos del navegador (candado en la URL).');
      } else {
        alert('No se pudo iniciar la grabación. Revisa consola para detalle.');
      }
    }
  }

  function stopRecording() {
    if (!mediaRecorderRef.current || !isRecording) return;

    try {
      mediaRecorderRef.current.stop();
    } catch (err) {
      console.error('❌ Error deteniendo grabación:', err);
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
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.error('Error reproduciendo audio:', e);
      });
    }
  }

  async function sendAudio() {
    if (!audioBlob || !onSendAudio) return;

    setIsSending(true);
    try {
      await onSendAudio(audioBlob, recordingTime);
      cancelRecording();
    } catch (err) {
      console.error('❌ Error al enviar audio:', err);
      alert('Error al enviar el audio (revisa consola).');
    } finally {
      setIsSending(false);
    }
  }

  // Vista: Grabando
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
          aria-label="Detener grabación"
          title="Detener"
        >
          <Square className="w-4 h-4" fill="currentColor" />
        </button>
      </div>
    );
  }

  // Vista: Preview del audio
  if (audioBlob) {
    return (
      <div className="flex items-center gap-2 bg-green-50 px-3 py-2 rounded-full">
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
        />

        <button
          onClick={togglePlayPause}
          className="p-1.5 text-green-600 hover:bg-green-100 rounded-full"
          aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
          title={isPlaying ? 'Pausar' : 'Reproducir'}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        <span className="text-sm font-mono text-green-600">{formatTime(recordingTime)}</span>

        <button
          onClick={cancelRecording}
          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-full"
          aria-label="Cancelar"
          title="Cancelar"
        >
          <X className="w-4 h-4" />
        </button>

        <button
          onClick={sendAudio}
          disabled={isSending}
          className="p-1.5 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:bg-gray-300"
          aria-label="Enviar audio"
          title="Enviar"
        >
          {isSending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    );
  }

  // Vista: Botón inicial de micrófono
  return (
    <button
      onClick={startRecording}
      disabled={disabled || isSending}
      className="p-3 text-gray-600 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label="Grabar audio"
      title="Grabar audio"
    >
      <Mic className="w-5 h-5" />
    </button>
  );
}
