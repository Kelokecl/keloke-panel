import { Image, FileText, Video, Music, Download, Play } from 'lucide-react';

export default function WhatsAppMediaMessage({ message }) {
  const { message_type, media_url, media_filename, caption, media_mime_type } = message;

  function renderMedia() {
    switch (message_type) {
      case 'image':
        return (
          <div className="max-w-xs">
            <img 
              src={media_url} 
              alt={caption || 'Imagen'} 
              className="rounded-lg w-full h-auto object-cover cursor-pointer hover:opacity-90"
              onClick={() => window.open(media_url, '_blank')}
            />
            {caption && (
              <p className="mt-2 text-sm">{caption}</p>
            )}
          </div>
        );

      case 'video':
        return (
          <div className="max-w-xs">
            <video 
              controls 
              className="rounded-lg w-full h-auto"
              preload="metadata"
            >
              <source src={media_url} type={media_mime_type || 'video/mp4'} />
              Tu navegador no soporta video HTML5.
            </video>
            {caption && (
              <p className="mt-2 text-sm">{caption}</p>
            )}
          </div>
        );

      case 'audio':
      case 'voice':
        return (
          <div className="flex items-center gap-3 p-3 bg-white/10 rounded-lg max-w-sm">
            <Play className="w-5 h-5 flex-shrink-0" />
            <audio controls className="flex-1 h-8" preload="metadata">
              <source src={media_url} type={media_mime_type || 'audio/ogg'} />
            </audio>
          </div>
        );

      case 'document':
        return (
          <a
            href={media_url}
            download={media_filename}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors max-w-sm"
          >
            <FileText className="w-10 h-10 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {media_filename || 'Documento'}
              </p>
              <p className="text-xs opacity-75">
                {media_mime_type || 'Archivo'}
              </p>
            </div>
            <Download className="w-5 h-5 flex-shrink-0" />
          </a>
        );

      case 'sticker':
        return (
          <img 
            src={media_url} 
            alt="Sticker" 
            className="w-32 h-32 object-contain"
          />
        );

      default:
        return null;
    }
  }

  if (message_type === 'text' || !message_type) {
    return <p className="text-sm whitespace-pre-wrap break-words">{message.message}</p>;
  }

  return (
    <div className="space-y-2">
      {renderMedia()}
    </div>
  );
}
