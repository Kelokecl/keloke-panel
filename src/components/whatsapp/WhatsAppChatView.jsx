import { useState, useEffect, useRef } from 'react';
import { Send, User, Info, Loader, CheckCheck, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import WhatsAppMediaMessage from './WhatsAppMediaMessage';
import WhatsAppVoiceRecorder from './WhatsAppVoiceRecorder';
import WhatsAppFileAttachment from './WhatsAppFileAttachment';

export default function WhatsAppChatView({ 
  contact, 
  connection, 
  onShowClientInfo 
}) {
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (contact) {
      loadMessages();
      markMessagesAsRead();
      
      // Auto-refresh cada 3 segundos
      const interval = setInterval(loadMessages, 3000);
      
      // Tiempo real
      const subscription = supabase
        .channel(`chat_${contact.phone_number}`)
        .on('postgres_changes',
          { 
            event: '*', 
            schema: 'public', 
            table: 'whatsapp_messages',
            filter: `phone_number=eq.${contact.phone_number}`
          },
          () => {
            loadMessages();
          }
        )
        .subscribe();

      return () => {
        clearInterval(interval);
        subscription.unsubscribe();
      };
    }
  }, [contact]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  async function loadMessages() {
    if (!contact) return;
    
    try {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('phone_number', contact.phone_number)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function markMessagesAsRead() {
    if (!contact) return;
    
    try {
      await supabase
        .from('whatsapp_messages')
        .update({ is_read: true })
        .eq('phone_number', contact.phone_number)
        .eq('direction', 'inbound')
        .eq('is_read', false);
    } catch (err) {
      console.error('Error marking messages as read:', err);
    }
  }

  async function sendMessage() {
    if (!messageText.trim() || !connection) return;

    // Guardar el mensaje antes de limpiar el input
    const messageToSend = messageText.trim();
    
    setIsSending(true);
    
    // CRÍTICO: Usar un timeout como safety net
    // Si después de 10 segundos no termina, resetear el estado
    const timeoutId = setTimeout(() => {
      console.error('⚠️ Timeout al enviar mensaje, reseteando UI');
      setMessageText('');
      setIsSending(false);
    }, 10000);
    
    try {
      const cleanPhone = contact.phone_number.replace(/\D/g, '');
      
      console.log('📤 [SEND] Enviando mensaje de texto...');
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${connection.phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${connection.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanPhone,
            type: 'text',
            text: { body: messageToSend }
          })
        }
      );

      const result = await response.json();
      console.log('📥 [SEND] Respuesta WhatsApp API:', result);
      
      if (!response.ok) throw new Error(result.error?.message);

      console.log('💾 [SEND] Guardando en BD...');
      const { error: insertError } = await supabase.from('whatsapp_messages').insert({
        phone_number: contact.phone_number,
        message: messageToSend,
        direction: 'outbound',
        status: 'sent',
        message_type: 'text',
        whatsapp_message_id: result.messages?.[0]?.id,
        platform_response: result
      });

      if (insertError) {
        console.error('❌ [SEND] Error guardando en BD:', insertError);
      } else {
        console.log('✅ [SEND] Guardado correctamente en BD');
      }

      console.log('🔄 [SEND] Recargando mensajes...');
      await loadMessages();
      console.log('✅ [SEND] Flujo completo exitoso');
    } catch (err) {
      console.error('❌ [SEND_ERROR]', err);
      alert('Error al enviar el mensaje: ' + err.message);
    } finally {
      // CRÍTICO: SIEMPRE limpiar input y desactivar loading
      // Esto sucede INDEPENDIENTEMENTE de si el webhook funciona o no
      clearTimeout(timeoutId);
      setMessageText('');
      setIsSending(false);
      console.log('✅ [SEND] UI reseteada correctamente');
    }
  }

  async function sendAudio(audioBlob, duration) {
    if (!connection) return;

    try {
      // Usar el MIME type y extensión REALES que vienen del blob
      const mimeTypeForApi = audioBlob.mimeTypeForApi || 'audio/webm';
      const fileExtensionForApi = audioBlob.fileExtensionForApi || 'webm';
      const fileName = `audio_${Date.now()}.${fileExtensionForApi}`;
      
      // LOGS DE DEBUG COMPLETOS (solicitados por el usuario)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📤 [AUDIO_DEBUG] INICIO DEL FLUJO DE ENVÍO');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[AUDIO_DEBUG] Blob recibido del grabador:');
      console.log('[AUDIO_DEBUG]   - size:', audioBlob.size, 'bytes');
      console.log('[AUDIO_DEBUG]   - blob.type:', audioBlob.type);
      console.log('[AUDIO_DEBUG]   - blob.mimeTypeForApi:', audioBlob.mimeTypeForApi);
      console.log('[AUDIO_DEBUG]   - blob.fileExtensionForApi:', audioBlob.fileExtensionForApi);
      console.log('[AUDIO_DEBUG] Valores que se usarán:');
      console.log('[AUDIO_DEBUG]   - mimeType para WhatsApp:', mimeTypeForApi);
      console.log('[AUDIO_DEBUG]   - extensión del archivo:', fileExtensionForApi);
      console.log('[AUDIO_DEBUG]   - nombre final:', fileName);
      console.log('[AUDIO_DEBUG]   - duración:', duration, 'segundos');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // 1. Subir audio a Supabase Storage
      console.log('📤 [AUDIO] Subiendo a Supabase Storage...');
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(fileName, audioBlob, {
          contentType: mimeTypeForApi, // Usar el Content-Type REAL
          upsert: false
        });

      if (uploadError) {
        console.error('❌ [AUDIO] Error subiendo a Storage:', uploadError);
        throw uploadError;
      }
      console.log('✅ [AUDIO] Subido correctamente a Storage');

      // 2. Obtener URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('whatsapp-media')
        .getPublicUrl(fileName);
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔗 [AUDIO_DEBUG] URL PÚBLICA GENERADA');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[AUDIO_DEBUG] URL pública:', publicUrl);
      console.log('[AUDIO_DEBUG] ⚠️  IMPORTANTE: Verificar esta URL en incógnito');
      console.log('[AUDIO_DEBUG] ⚠️  Debe descargar un archivo .ogg (NO .webm)');
      console.log('[AUDIO_DEBUG] ⚠️  Debe reproducirse correctamente en un reproductor local');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // 3. Enviar por WhatsApp Cloud API
      const cleanPhone = contact.phone_number.replace(/\D/g, '');
      
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'audio',
        audio: { link: publicUrl }
      };
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📡 [AUDIO_DEBUG] PAYLOAD PARA WHATSAPP CLOUD API');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[AUDIO_DEBUG] Payload completo:');
      console.log(JSON.stringify(payload, null, 2));
      console.log('[AUDIO_DEBUG] Endpoint:', `https://graph.facebook.com/v21.0/${connection.phone_number_id}/messages`);
      console.log('[AUDIO_DEBUG] Headers:');
      console.log('[AUDIO_DEBUG]   - Authorization: Bearer [REDACTED]');
      console.log('[AUDIO_DEBUG]   - Content-Type: application/json');
      console.log('[AUDIO_DEBUG] ⚠️  VERIFICAR:');
      console.log('[AUDIO_DEBUG]   ✓ type debe ser "audio" (NO "document")');
      console.log('[AUDIO_DEBUG]   ✓ audio.link debe terminar en .ogg (NO .webm)');
      console.log('[AUDIO_DEBUG]   ✓ URL debe ser accesible públicamente');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${connection.phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${connection.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        }
      );

      const result = await response.json();
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📥 [AUDIO_DEBUG] RESPUESTA DE WHATSAPP CLOUD API');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[AUDIO_DEBUG] HTTP Status:', response.status, response.statusText);
      console.log('[AUDIO_DEBUG] Response Body:');
      console.log(JSON.stringify(result, null, 2));
      
      if (!response.ok) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('❌ [AUDIO_DEBUG] ERROR EN WHATSAPP API');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('[AUDIO_DEBUG] Error Code:', result.error?.code);
        console.log('[AUDIO_DEBUG] Error Message:', result.error?.message);
        console.log('[AUDIO_DEBUG] Error Type:', result.error?.type);
        console.log('[AUDIO_DEBUG] Error Details:', result.error?.error_data);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        const errorMsg = result.error?.message || 'Error desconocido de WhatsApp API';
        alert(`❌ Error al enviar audio: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ [AUDIO_DEBUG] AUDIO ENVIADO EXITOSAMENTE');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[AUDIO_DEBUG] WhatsApp Message ID:', result.messages?.[0]?.id);
      console.log('[AUDIO_DEBUG] ⚠️  IMPORTANTE: Verificar en el teléfono');
      console.log('[AUDIO_DEBUG] ⚠️  ¿Llegó el audio al WhatsApp del destinatario?');
      console.log('[AUDIO_DEBUG] ⚠️  ¿Se puede reproducir correctamente?');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // 4. Guardar en BD
      console.log('💾 [AUDIO] Guardando en base de datos...');
      await supabase.from('whatsapp_messages').insert({
        phone_number: contact.phone_number,
        message: 'Audio',
        direction: 'outbound',
        status: 'sent',
        message_type: 'audio',
        media_url: publicUrl,
        media_mime_type: mimeTypeForApi, // Guardar el MIME type REAL
        media_filename: fileName,
        media_size: audioBlob.size,
        media_duration: duration,
        whatsapp_message_id: result.messages?.[0]?.id,
        platform_response: result
      });

      await loadMessages();
      console.log('✅ [AUDIO] Flujo completo exitoso');
    } catch (err) {
      console.error('❌ [AUDIO] Error en flujo completo:', err);
      alert(`Error al enviar audio: ${err.message}`);
      throw err;
    }
  }

  async function sendFile(file, caption) {
    if (!connection) return;

    try {
      // 1. Determinar tipo de mensaje
      let messageType = 'document';
      if (file.type.startsWith('image/')) messageType = 'image';
      else if (file.type.startsWith('video/')) messageType = 'video';

      // 2. Subir archivo a Supabase Storage
      const fileName = `${messageType}_${Date.now()}_${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(fileName, file, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) throw uploadError;

      // 3. Obtener URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('whatsapp-media')
        .getPublicUrl(fileName);

      // 4. Enviar por WhatsApp Cloud API
      const cleanPhone = contact.phone_number.replace(/\D/g, '');
      
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: messageType,
        [messageType]: { 
          link: publicUrl,
          ...(caption && { caption })
        }
      };

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${connection.phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${connection.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message);

      // 5. Guardar en BD
      await supabase.from('whatsapp_messages').insert({
        phone_number: contact.phone_number,
        message: caption || file.name,
        direction: 'outbound',
        status: 'sent',
        message_type: messageType,
        media_url: publicUrl,
        media_mime_type: file.type,
        media_filename: file.name,
        media_size: file.size,
        caption: caption || null,
        whatsapp_message_id: result.messages?.[0]?.id,
        platform_response: result
      });

      await loadMessages();
    } catch (err) {
      console.error('Error sending file:', err);
      throw err;
    }
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'read':
      case 'delivered':
        return <CheckCheck className="w-4 h-4 text-blue-400" />;
      case 'sent':
        return <CheckCheck className="w-4 h-4" />;
      default:
        return <Check className="w-4 h-4" />;
    }
  }

  if (!contact) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <p className="text-gray-500">Selecciona una conversación para comenzar</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#e5ddd5]">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white">
          <User className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">
            {contact.contact_name || contact.phone_number}
          </h3>
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-500">{contact.phone_number}</p>
            {connection && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                WhatsApp conectado
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => onShowClientInfo(contact)}
          className="p-2 hover:bg-gray-100 rounded-full"
        >
          <Info className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          <div className="flex justify-center">
            <Loader className="w-6 h-6 animate-spin text-green-500" />
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-md px-4 py-2 rounded-lg ${
                  msg.direction === 'outbound'
                    ? 'bg-[#d9fdd3]'
                    : 'bg-white'
                }`}
              >
                <WhatsAppMediaMessage message={msg} />
                <div className="flex items-center justify-end gap-1 mt-1">
                  <span className="text-[10px] text-gray-500">
                    {new Date(msg.created_at).toLocaleTimeString('es-CL', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                  {msg.direction === 'outbound' && getStatusIcon(msg.status)}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t p-4">
        <div className="flex items-end gap-2 relative">
          {/* Botón de adjuntar archivos */}
          <WhatsAppFileAttachment
            onSendFile={sendFile}
            disabled={isSending}
          />

          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
            placeholder="Escribe un mensaje..."
            rows={1}
            className="flex-1 px-4 py-2 border rounded-full resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          
          {/* Mostrar micrófono cuando no hay texto, botón de enviar cuando hay texto */}
          {messageText.trim() ? (
            <button
              onClick={sendMessage}
              disabled={isSending}
              className="p-3 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          ) : (
            <WhatsAppVoiceRecorder
              onSendAudio={sendAudio}
              disabled={isSending}
            />
          )}
        </div>
      </div>
    </div>
  );
}
