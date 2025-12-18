import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Instagram, MessageCircle, Heart, Send, RefreshCw, User } from 'lucide-react';

export default function InstagramModule() {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    fetchConversations();
    
    // Suscripción en tiempo real a nuevos mensajes
    const subscription = supabase
      .channel('instagram_messages')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'instagram_messages' },
        (payload) => {
          console.log('Nuevo mensaje de Instagram:', payload.new);
          fetchConversations();
          if (selectedConversation && payload.new.conversation_id === selectedConversation.conversation_id) {
            setMessages(prev => [...prev, payload.new]);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [selectedConversation]);

  async function fetchConversations() {
    try {
      setIsLoading(true);
      
      // Obtener todas las conversaciones únicas
      const { data, error } = await supabase
        .from('instagram_messages')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Agrupar mensajes por conversación
      const conversationsMap = {};
      
      data.forEach(msg => {
        const convId = msg.conversation_id || msg.sender_id;
        
        if (!conversationsMap[convId]) {
          conversationsMap[convId] = {
            conversation_id: convId,
            sender_id: msg.sender_id,
            sender_username: msg.sender_username || 'Usuario Instagram',
            last_message: msg.message_text || '(Multimedia)',
            last_message_time: msg.created_at,
            message_type: msg.message_type,
            unread_count: msg.is_read ? 0 : 1,
            messages: [msg]
          };
        } else {
          conversationsMap[convId].messages.push(msg);
          if (!msg.is_read) {
            conversationsMap[convId].unread_count++;
          }
        }
      });

      const conversationsList = Object.values(conversationsMap).sort((a, b) => 
        new Date(b.last_message_time) - new Date(a.last_message_time)
      );

      setConversations(conversationsList);
    } catch (error) {
      console.error('Error al cargar conversaciones:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function selectConversation(conversation) {
    setSelectedConversation(conversation);
    setMessages(conversation.messages);

    // Marcar mensajes como leídos
    const unreadIds = conversation.messages
      .filter(m => !m.is_read && !m.is_from_business)
      .map(m => m.id);

    if (unreadIds.length > 0) {
      await supabase
        .from('instagram_messages')
        .update({ is_read: true })
        .in('id', unreadIds);
    }
  }

  async function sendReply() {
    if (!replyText.trim() || !selectedConversation) return;

    try {
      setIsSending(true);

      // Obtener credenciales de Instagram
      const { data: credentials, error: credError } = await supabase
        .from('social_connections')
        .select('access_token, user_id, username')
        .eq('platform', 'instagram')
        .eq('is_active', true)
        .maybeSingle();

      if (!credentials) {
        alert('No hay cuenta de Instagram conectada. Ve a Conexiones y vincula tu cuenta de Instagram.');
        return;
      }

      // Determinar si es un comentario o mensaje directo
      const isComment = selectedConversation.message_type === 'comment';
      
      if (isComment) {
        // Responder a comentario
        const commentId = messages[0]?.message_id;
        
        console.log('[IG_REPLY] Intentando responder comentario:', {
          commentId,
          message: replyText,
          tokenPreview: credentials.access_token.substring(0, 20) + '...'
        });
        
        const response = await fetch(
          `https://graph.facebook.com/v24.0/${commentId}/replies?access_token=${credentials.access_token}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `message=${encodeURIComponent(replyText)}`
          }
        );

        const responseData = await response.json();
        console.log('[IG_REPLY] Respuesta de Facebook:', responseData);

        if (!response.ok) {
          console.error('[IG_REPLY_ERROR] Error completo:', {
            status: response.status,
            statusText: response.statusText,
            error: responseData
          });
          throw new Error(responseData.error?.message || 'Error al enviar respuesta al comentario');
        }
      } else {
        // Enviar mensaje directo
        console.log('[IG_DM] Intentando enviar mensaje directo:', {
          recipientId: selectedConversation.sender_id,
          message: replyText,
          tokenPreview: credentials.access_token.substring(0, 20) + '...'
        });
        
        const response = await fetch(
          `https://graph.facebook.com/v24.0/me/messages?access_token=${credentials.access_token}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              recipient: { id: selectedConversation.sender_id },
              message: { text: replyText }
            })
          }
        );

        const responseData = await response.json();
        console.log('[IG_DM] Respuesta de Facebook:', responseData);

        if (!response.ok) {
          console.error('[IG_DM_ERROR] Error completo:', {
            status: response.status,
            statusText: response.statusText,
            error: responseData
          });
          throw new Error(responseData.error?.message || 'Error al enviar mensaje directo');
        }
      }

      // Guardar el mensaje en la BD
      const { error: insertError } = await supabase
        .from('instagram_messages')
        .insert({
          conversation_id: selectedConversation.conversation_id,
          sender_id: credentials.user_id || 'kelokecl',
          sender_username: credentials.username || 'kelokecl',
          message_type: isComment ? 'comment_reply' : 'message',
          message_text: replyText,
          is_from_business: true,
          is_read: true,
          timestamp: new Date().toISOString()
        });

      if (insertError) throw insertError;

      setReplyText('');
      fetchConversations();
    } catch (error) {
      console.error('[IG_ERROR] Error al enviar respuesta:', error);
      alert(`Error al enviar respuesta: ${error.message}\n\nRevisa la consola para más detalles.`);
    } finally {
      setIsSending(false);
    }
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString('es-CL');
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Lista de conversaciones */}
      <div className="w-96 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Instagram className="w-6 h-6 text-pink-600" />
              <h2 className="text-xl font-bold text-gray-900">Instagram</h2>
            </div>
            <button
              onClick={fetchConversations}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Actualizar"
            >
              <RefreshCw className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          <p className="text-sm text-gray-600">
            {conversations.length} conversación{conversations.length !== 1 ? 'es' : ''}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="w-6 h-6 animate-spin text-pink-600" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6 text-center">
              <Instagram className="w-12 h-12 mb-3 text-gray-300" />
              <p className="text-sm">No hay mensajes aún</p>
              <p className="text-xs mt-2">Los mensajes aparecerán aquí cuando recibas DMs o comentarios</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.conversation_id}
                onClick={() => selectConversation(conv)}
                className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedConversation?.conversation_id === conv.conversation_id
                    ? 'bg-pink-50 border-l-4 border-l-pink-600'
                    : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-gray-900 truncate">
                        {conv.sender_username}
                      </span>
                      <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                        {formatTime(conv.last_message_time)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {conv.message_type === 'comment' && (
                        <MessageCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      )}
                      <p className="text-sm text-gray-600 truncate flex-1">
                        {conv.last_message}
                      </p>
                      {conv.unread_count > 0 && (
                        <span className="bg-pink-600 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Vista de conversación */}
      <div className="flex-1 flex flex-col bg-white">
        {!selectedConversation ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Instagram className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">Selecciona una conversación</p>
              <p className="text-sm mt-2">Elige un mensaje o comentario para responder</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header de conversación */}
            <div className="p-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {selectedConversation.sender_username}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {selectedConversation.message_type === 'comment' ? 'Comentario' : 'Mensaje directo'}
                  </p>
                </div>
              </div>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.is_from_business ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-md px-4 py-2 rounded-2xl ${
                      msg.is_from_business
                        ? 'bg-pink-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    {msg.message_type === 'comment' && !msg.is_from_business && (
                      <div className="flex items-center gap-1 mb-1 text-xs opacity-75">
                        <MessageCircle className="w-3 h-3" />
                        <span>Comentario</span>
                      </div>
                    )}
                    <p className="text-sm">{msg.message_text}</p>
                    {msg.media_url && (
                      <img 
                        src={msg.media_url} 
                        alt="Media" 
                        className="mt-2 rounded-lg max-w-full"
                      />
                    )}
                    <p className="text-xs opacity-75 mt-1">
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Input de respuesta */}
            <div className="p-4 border-t border-gray-200 bg-white">
              <div className="flex items-end gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendReply();
                    }
                  }}
                  placeholder={
                    selectedConversation.message_type === 'comment'
                      ? 'Responder al comentario...'
                      : 'Escribe tu mensaje...'
                  }
                  rows="3"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none"
                />
                <button
                  onClick={sendReply}
                  disabled={!replyText.trim() || isSending}
                  className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isSending ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Enter para enviar, Shift+Enter para nueva línea
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
