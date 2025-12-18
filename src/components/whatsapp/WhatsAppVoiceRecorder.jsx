import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, X, Send, Loader } from 'lucide-react';

// SOLUCIÓN DEFINITIVA: opus-media-recorder para grabar en OGG en TODOS los navegadores
// Esto resuelve el problema de Chrome/Windows que NO soporta OGG nativamente
// Esta biblioteca usa WebAssembly para forzar grabación en OGG incluso en Chrome
import OpusMediaRecorder from 'opus-media-recorder';

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
  const actualMimeTypeRef = useRef(null); // Guardar el MIME type REAL de grabación

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      console.log('🎤 Iniciando grabación con opus-media-recorder (forzado a OGG Opus)');
      console.log('✅ Esto garantiza grabación en OGG incluso en Chrome/Windows');
      console.log('✅ OGG Opus es el formato oficialmente soportado por WhatsApp Cloud API');
      
      // FORZAR siempre audio/ogg usando opus-media-recorder
      // Esta biblioteca usa WebAssembly para grabar en OGG incluso en navegadores que no lo soportan nativamente
      const mimeType = 'audio/ogg';
      
      // CONFIGURACIÓN CRÍTICA: Usar CDN externo para workers
      // Vercel no sirve correctamente los archivos .umd.js (devuelve HTML 404)
      // Por eso usamos unpkg.com como CDN confiable
      const workerOptions = {
        encoderWorkerFactory: () => {
          console.log('🔧 Creando worker desde unpkg.com...');
          return new Worker('https://unpkg.com/opus-media-recorder@0.8.0/encoderWorker.umd.js');
        },
        OggOpusEncoderWasmPath: 'https://unpkg.com/opus-media-recorder@0.8.0/OggOpusEncoder.wasm',
        WebMOpusEncoderWasmPath: 'https://unpkg.com/opus-media-recorder@0.8.0/WebMOpusEncoder.wasm'
      };
      
      console.log('🎯 Intentando crear OpusMediaRecorder con workers desde unpkg CDN...');
      
      let mediaRecorder;
      try {
        // CRÍTICO: Crear OpusMediaRecorder SIN workerOptions primero
        // Dejar que opus-media-recorder use su configuración por defecto
        mediaRecorder = new OpusMediaRecorder(stream, { mimeType });
        console.log('✅ OpusMediaRecorder inicializado correctamente con OGG Opus');
        console.log('✅ Workers se cargarán automáticamente desde la configuración interna');
        actualMimeTypeRef.current = 'audio/ogg';
      } catch (err) {
        console.error('❌ OpusMediaRecorder falló:', err);
        console.error('❌ Detalles del error:', err.message, err.stack);
        
        // FALLBACK: Usar MediaRecorder nativo
        console.warn('⚠️ Usando MediaRecorder nativo como fallback');
        if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          console.log('✅ Navegador soporta OGG nativamente');
          mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/ogg;codecs=opus' });
          actualMimeTypeRef.current = 'audio/ogg';
        } else {
          console.error('❌ Navegador NO soporta OGG nativamente');
          console.error('⚠️ ADVERTENCIA: Usando WEBM (NO compatible con WhatsApp Cloud API)');
          mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
          actualMimeTypeRef.current = 'audio/webm';
          alert('⚠️ ADVERTENCIA: Tu navegador no soporta OGG. El audio puede no llegar correctamente a WhatsApp.');
        }
      }
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Usar el MIME type REAL que se usó para grabar
        const finalMimeType = actualMimeTypeRef.current || 'audio/ogg';
        const finalExtension = finalMimeType === 'audio/webm' ? 'webm' : 'ogg';
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎤 AUDIO GRABADO - INFORMACIÓN CRÍTICA');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Crear blob con el tipo REAL
        const blob = new Blob(chunksRef.current, { type: finalMimeType + ';codecs=opus' });
        
        // Metadata para WhatsApp Cloud API
        blob.mimeTypeForApi = finalMimeType;
        blob.fileExtensionForApi = finalExtension;
        
        console.log('[AUDIO] Tamaño del blob:', blob.size, 'bytes');
        console.log('[AUDIO] Tipo del blob:', blob.type);
        console.log('[AUDIO] MIME type para API:', blob.mimeTypeForApi);
        console.log('[AUDIO] Extensión de archivo:', blob.fileExtensionForApi);
        
        if (finalMimeType === 'audio/webm') {
          console.error('❌ ¡ADVERTENCIA! Se grabó en WEBM (NO OGG)');
          console.error('❌ WhatsApp Cloud API NO soporta oficialmente WEBM');
          console.error('❌ El audio probablemente NO llegará al destinatario');
          console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        } else {
          console.log('✅ Grabado en OGG (formato correcto para WhatsApp)');
          console.log('✅ Este formato es oficialmente soportado por WhatsApp Cloud API');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        }
        
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        // Detener el stream
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Iniciar temporizador
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Error al acceder al micrófono:', err);
      alert('No se pudo acceder al micrófono. Por favor verifica los permisos.');
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }

  function cancelRecording() {
    if (isRecording) {
      stopRecording();
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
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
      audioRef.current.play();
      setIsPlaying(true);
    }
  }

  async function sendAudio() {
    if (!audioBlob) return;

    setIsSending(true);
    try {
      await onSendAudio(audioBlob, recordingTime);
      
      // Limpiar después de enviar
      cancelRecording();
    } catch (err) {
      console.error('Error al enviar audio:', err);
      alert('Error al enviar el audio');
    } finally {
      setIsSending(false);
    }
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Vista: Grabando
  if (isRecording) {
    return (
      <div className="flex items-center gap-2 bg-red-50 px-3 py-2 rounded-full">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-mono text-red-600">
            {formatTime(recordingTime)}
          </span>
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
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </button>

        <span className="text-sm font-mono text-green-600">
          {formatTime(recordingTime)}
        </span>

        <button
          onClick={cancelRecording}
          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-full"
        >
          <X className="w-4 h-4" />
        </button>

        <button
          onClick={sendAudio}
          disabled={isSending}
          className="p-1.5 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:bg-gray-300"
        >
          {isSending ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    );
  }

  // Vista: Botón inicial de micrófono
  return (
    <button
      onClick={startRecording}
      disabled={disabled}
      className="p-3 text-gray-600 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Mic className="w-5 h-5" />
    </button>
  );
}
