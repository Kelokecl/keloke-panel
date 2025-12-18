import { User, Image, Mic, FileText, Video } from 'lucide-react';

export default function WhatsAppConversationItem({ 
  contact, 
  lastMessage, 
  unreadCount, 
  isActive, 
  onClick 
}) {
  function getLastMessagePreview() {
    if (!lastMessage) return 'Sin mensajes';

    switch (lastMessage.message_type) {
      case 'image':
        return (
          <span className="flex items-center gap-1">
            <Image className="w-3 h-3" />
            Imagen
          </span>
        );
      case 'audio':
      case 'voice':
        return (
          <span className="flex items-center gap-1">
            <Mic className="w-3 h-3" />
            Audio
          </span>
        );
      case 'video':
        return (
          <span className="flex items-center gap-1">
            <Video className="w-3 h-3" />
            Video
          </span>
        );
      case 'document':
        return (
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            Documento
          </span>
        );
      default:
        return lastMessage.message?.substring(0, 40) + (lastMessage.message?.length > 40 ? '...' : '');
    }
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Ayer';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('es-CL', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
    }
  }

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors text-left ${
        isActive ? 'bg-green-50 border-l-4 border-green-500' : ''
      }`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white font-semibold">
        {contact.profile_picture_url ? (
          <img 
            src={contact.profile_picture_url} 
            alt={contact.contact_name}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <User className="w-6 h-6" />
        )}
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-1">
          <h4 className="font-semibold text-gray-900 truncate">
            {contact.contact_name || contact.phone_number}
          </h4>
          <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
            {formatTime(lastMessage?.created_at)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-gray-600 truncate">
            {getLastMessagePreview()}
          </p>
          {unreadCount > 0 && (
            <span className="flex-shrink-0 w-5 h-5 bg-green-500 text-white text-xs rounded-full flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
