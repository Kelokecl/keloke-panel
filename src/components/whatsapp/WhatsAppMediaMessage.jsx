import { FileText, Download, Play, ExternalLink } from 'lucide-react';

export default function WhatsAppMediaMessage({ message }) {
  const messageType = message?.message_type || 'text';
  const mediaUrl = message?.media_url || null;
  const mime = message?.media_mime_type || '';
  const fileName = message?.media_filename || 'archivo';
  const caption = (message?.message || '').trim(); // ✅ tu esquema guarda caption en `message`

  function openMedia() {
    if (!mediaUrl) return;
    window.open(mediaUrl, '_blank', 'noopener,noreferrer');
  }

  if (messageType === 'text' || !messageType) {
    return <p className="text-sm whitespace-pre-wrap break-words">{message?.message}</p>;
  }

  // Si es media pero aún no hay URL, igual muestra algo
  if (!mediaUrl) {
    return (
      <div className="text-sm">
        <p className="opacity-80">Archivo enviado ({messageType})</p>
        {caption ? <p className="mt-1">{caption}</p> : null}
      </div>
    );
  }

  if (messageType === 'image') {
    return (
      <div className="max-w-xs">
        <img
          src={mediaUrl}
          alt={caption || 'Imagen'}
          className="rounded-lg w-full h-auto object-cover cursor-pointer hover:opacity-90"
          onClick={openMedia}
        />
        {caption ? <p className="mt-2 text-sm">{caption}</p> : null}
      </div>
    );
  }

  if (messageType === 'video') {
    return (
      <div className="max-w-xs">
        <video controls className="rounded-lg w-full h-auto" preload="metadata">
          <source src={mediaUrl} type={mime || 'video/mp4'} />
          Tu navegador no soporta video HTML5.
        </video>
        {caption ? <p className="mt-2 text-sm">{caption}</p> : null}
      </div>
    );
  }

  if (messageType === 'audio' || messageType === 'voice') {
    return (
      <div className="flex items-center gap-3 p-3 bg-white/10 rounded-lg max-w-sm">
        <Play className="w-5 h-5 flex-shrink-0" />
        <audio controls className="flex-1 h-8" preload="metadata">
          <source src={mediaUrl} type={mime || 'audio/ogg'} />
        </audio>
        <button
          onClick={openMedia}
          className="p-1 rounded hover:bg-black/5"
          title="Abrir"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (messageType === 'document') {
    return (
      <a
        href={mediaUrl}
        download={fileName}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors max-w-sm"
      >
        <FileText className="w-10 h-10 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{fileName || 'Documento'}</p>
          <p className="text-xs opacity-75">{mime || 'Archivo'}</p>
          {caption ? <p className="text-xs mt-1 opacity-80 line-clamp-2">{caption}</p> : null}
        </div>
        <Download className="w-5 h-5 flex-shrink-0" />
      </a>
    );
  }

  if (messageType === 'sticker') {
    return <img src={mediaUrl} alt="Sticker" className="w-32 h-32 object-contain" />;
  }

  return null;
}
