import { FileText, Download, ExternalLink, Play } from 'lucide-react';

function normalizeMime(mime) {
  if (!mime) return '';
  // "audio/ogg;codecs=opus" -> "audio/ogg"
  return String(mime).split(';')[0].trim().toLowerCase();
}

function safeStr(v) {
  return typeof v === 'string' ? v : '';
}

export default function WhatsAppMediaMessage({ message }) {
  const messageType = safeStr(message?.message_type) || 'text';
  const mediaUrl = safeStr(message?.media_url);
  const mediaFilename = safeStr(message?.media_filename);
  const caption = safeStr(message?.caption) || safeStr(message?.message) || '';
  const mime = normalizeMime(message?.media_mime_type);

  // ✅ Texto normal
  if (messageType === 'text' || !messageType) {
    return (
      <p className="text-sm whitespace-pre-wrap break-words">
        {safeStr(message?.message)}
      </p>
    );
  }

  // ✅ Si es media pero no hay URL todavía (o falló el procesamiento)
  if (!mediaUrl) {
    return (
      <div className="text-sm opacity-80">
        <span className="inline-flex items-center gap-2">
          <Play className="w-4 h-4" />
          Archivo recibido/enviado, pero aún no está disponible para previsualizar.
        </span>
      </div>
    );
  }

  function OpenLink({ className = '' }) {
    return (
      <a
        href={mediaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-2 text-xs underline opacity-90 hover:opacity-100 ${className}`}
        title="Abrir en una pestaña nueva"
      >
        <ExternalLink className="w-4 h-4" />
        Abrir
      </a>
    );
  }

  function renderMedia() {
    switch (messageType) {
      case 'image':
        return (
          <div className="max-w-xs">
            <img
              src={mediaUrl}
              alt={caption || 'Imagen'}
              className="rounded-lg w-full h-auto object-cover cursor-pointer hover:opacity-90"
              onClick={() => window.open(mediaUrl, '_blank')}
              onError={(e) => {
                // fallback visual si falla carga
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              {caption ? <p className="text-sm break-words">{caption}</p> : <span />}
              <OpenLink />
            </div>
          </div>
        );

      case 'video':
        return (
          <div className="max-w-xs space-y-2">
            <video
              controls
              className="rounded-lg w-full h-auto"
              preload="metadata"
            >
              <source src={mediaUrl} type={mime || 'video/mp4'} />
              Tu navegador no soporta video HTML5.
            </video>
            <div className="flex items-center justify-between gap-2">
              {caption ? <p className="text-sm break-words">{caption}</p> : <span />}
              <OpenLink />
            </div>
          </div>
        );

      case 'audio':
      case 'voice': {
        const audioType = mime || 'audio/ogg';
        return (
          <div className="flex flex-col gap-2 p-3 bg-white/10 rounded-lg max-w-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs opacity-80">
                {mediaFilename ? mediaFilename : 'Audio'}
              </span>
              <OpenLink />
            </div>
            <audio controls className="w-full h-8" preload="metadata">
              <source src={mediaUrl} type={audioType} />
              Tu navegador no soporta audio HTML5.
            </audio>
          </div>
        );
      }

      case 'document': {
        const label = mediaFilename || 'Documento';
        return (
          <div className="max-w-sm">
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
              title="Abrir documento"
            >
              <FileText className="w-10 h-10 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{label}</p>
                <p className="text-xs opacity-75">{mime || 'Archivo'}</p>
              </div>
              <Download className="w-5 h-5 flex-shrink-0" />
            </a>

            {/* Caption opcional */}
            {caption ? (
              <p className="mt-2 text-sm break-words">{caption}</p>
            ) : null}
          </div>
        );
      }

      case 'sticker':
        return (
          <div className="space-y-2">
            <img
              src={mediaUrl}
              alt="Sticker"
              className="w-32 h-32 object-contain"
              onClick={() => window.open(mediaUrl, '_blank')}
              style={{ cursor: 'pointer' }}
            />
            <OpenLink />
          </div>
        );

      default:
        // Tipo desconocido → mostrar link
        return (
          <div className="p-3 bg-white/10 rounded-lg max-w-sm space-y-2">
            <p className="text-sm">
              Archivo ({messageType}) disponible.
            </p>
            <OpenLink className="no-underline" />
          </div>
        );
    }
  }

  return <div className="space-y-2">{renderMedia()}</div>;
}
