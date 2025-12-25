import { useState, useEffect, useRef } from 'react';
import { Send, User, Info, Loader, CheckCheck, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import WhatsAppMediaMessage from './WhatsAppMediaMessage';
import WhatsAppVoiceRecorder from './WhatsAppVoiceRecorder';
import WhatsAppFileAttachment from './WhatsAppFileAttachment';

export default function WhatsAppChatView({ contact, connection, onShowClientInfo }) {
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Scroll inteligente
  const messagesEndRef = useRef(null);
  const listRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  useEffect(() => {
    if (!contact?.phone_number) return;

    lastMessageIdRef.current = null;
    setIsNearBottom(true);

    loadMessages();
    markMessagesAsRead();

    const interval = setInterval(loadMessages, 30000);

    const channel = supabase
      .channel(`chat_${contact.phone_number}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `phone_number=eq.${contact.phone_number}`,
        },
        () => {
          loadMessages();
          markMessagesAsRead();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.phone_number]);

  useEffect(() => {
    if (isNearBottom) scrollToBottom();
  }, [messages, isNearBottom]);

  async function loadMessages() {
    if (!contact?.phone_number) return;

    try {
      setIsLoading(true);

      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('phone_number', contact.phone_number)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const lastId = data?.length ? data[data.length - 1].id : null;
      if (lastMessageIdRef.current === lastId) return;

      lastMessageIdRef.current = lastId;
      setMessages(data || []);
    } catch (err) {
      console.error('Error loading messages:', err);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function markMessagesAsRead() {
    if (!contact?.phone_number) return;

    try {
      const { error } = await supabase
        .from('whatsapp_messages')
        .update({ is_read: true })
        .eq('phone_number', contact.phone_number)
        .eq('direction', 'inbound')
        .eq('is_read', false);

      if (error) throw error;
    } catch (err) {
      console.error('Error marking messages as read:', err);
    }
  }

  async function sendMessage() {
    if (!messageText.trim() || !connection) return;

    const messageToSend = messageText.trim();
    setIsSending(true);

    const timeoutId = setTimeout(() => {
      console.error('⚠️ Timeout al enviar mensaje, reseteando UI');
      setMessageText('');
      setIsSending(false);
    }, 10000);

    try {
      const cleanPhone = contact.phone_number.replace(/\D/g, '');

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${connection.phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${connection.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanPhone,
            type: 'text',
            text: { body: messageToSend },
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || 'Error WhatsApp API');

      const { error: insertError } = await supabase.from('whatsapp_messages').insert({
        phone_number: contact.phone_number,
        message: messageToSend,
        direction: 'outbound',
        status: 'sent',
        message_type: 'text',
        whatsapp_message_id: result.messages?.[0]?.id ?? null,
        platform_response: result,
      });

      if (insertError) console.error('❌ Error guardando outbound:', insertError);

      setIsNearBottom(true);
      await loadMessages();
      setTimeout(scrollToBottom, 50);
    } catch (err) {
      console.error('❌ [SEND_ERROR]', err);
      alert('Error al enviar el mensaje: ' + err.message);
    } finally {
      clearTimeout(timeoutId);
      setMessageText('');
      setIsSending(false);
    }
  }

  // ✅ AUDIO OUTBOUND (Storage + WhatsApp media_id + insert DB)
  async function sendAudio(audioBlob, durationSeconds) {
    if (!audioBlob || !connection || !contact?.phone_number) return;

    setIsSending(true);

    const timeoutId = setTimeout(() => {
      console.error('⚠️ Timeout al enviar audio, reseteando UI');
      setIsSending(false);
    }, 25000);

    try {
      const cleanPhone = contact.phone_number.replace(/\D/g, '');
      const phoneNumberId = connection.phone_number_id;
      const accessToken = connection.access_token;

      if (!phoneNumberId || !accessToken) {
        throw new Error('Falta phone_number_id o access_token en la conexión.');
      }

      // 0) Preparar nombre/metadata
      const mime = audioBlob.type || 'audio/ogg;codecs=opus';
      const ext = mime.includes('webm') ? 'webm' : 'ogg';
      const filename = `out_${cleanPhone}_${Date.now()}.${ext}`;
      const storagePath = `audio/${filename}`;

      // 1) Subir a Supabase Storage (para poder reproducirlo en tu app)
      //    OJO: si esto falla es porque falta policy de INSERT en el bucket.
      const { error: upErr } = await supabase
        .storage
        .from('whatsapp-media')
        .upload(storagePath, audioBlob, {
          contentType: mime,
          cacheControl: '3600',
          upsert: true,
        });

      if (upErr) {
        console.error('❌ Error subiendo a Supabase Storage:', upErr);
        throw new Error('No se pudo subir el audio a Storage.');
      }

      const { data: pub } = supabase
        .storage
        .from('whatsapp-media')
        .getPublicUrl(storagePath);

      const publicUrl = pub?.publicUrl || null;

      // 2) Subir media a WhatsApp (devuelve media_id)
      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append('file', new File([audioBlob], filename, { type: mime }));

      const mediaUploadRes = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/media`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form,
        }
      );

      const mediaUploadJson = await mediaUploadRes.json();
      if (!mediaUploadRes.ok) {
        console.error('❌ Error subiendo media a WhatsApp:', mediaUploadJson);
        throw new Error(mediaUploadJson?.error?.message || 'Error subiendo media a WhatsApp');
      }

      const mediaId = mediaUploadJson?.id;
      if (!mediaId) throw new Error('No se recibió media_id desde WhatsApp.');

      // 3) Enviar mensaje de audio usando media_id
      const msgRes = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanPhone,
            type: 'audio',
            audio: { id: mediaId },
          }),
        }
      );

      const msgJson = await msgRes.json();
      if (!msgRes.ok) {
        console.error('❌ Error enviando mensaje audio:', msgJson);
        throw new Error(msgJson?.error?.message || 'Error enviando audio por WhatsApp');
      }

      const whatsappMessageId = msgJson?.messages?.[0]?.id ?? null;

      // 4) Guardar outbound en Supabase (SIN duration_seconds)
      const { error: insertError } = await supabase.from('whatsapp_messages').insert({
        phone_number: contact.phone_number,
        direction: 'outbound',
        status: 'sent',
        message_type: 'audio',
        message: '',

        whatsapp_message_id: whatsappMessageId,

        media_id: mediaId,
        media_url: publicUrl,          // ✅ clave: reproducible en tu app
        media_mime_type: mime,
        media_filename: filename,
        media_size: audioBlob.size,

        platform_response: {
          storage_path: storagePath,
          storage_public_url: publicUrl,
          media_upload: mediaUploadJson,
          message_send: msgJson,
          duration_seconds: durationSeconds ?? null, // ✅ guardado solo dentro de platform_response (no rompe DB)
        },
      });

      if (insertError) {
        console.error('❌ Error guardando outbound audio en Supabase:', insertError);
        throw new Error(insertError.message);
      }

      setIsNearBottom(true);
      await loadMessages();
      setTimeout(scrollToBottom, 50);
    } catch (err) {
      console.error('❌ [SEND_AUDIO_ERROR]', err);
      alert('Error al enviar el audio: ' + (err?.message || err));
    } finally {
      clearTimeout(timeoutId);
      setIsSending(false);
    }
  }

  async function sendFile(file, caption) {
    throw new Error('sendFile aún no integrado.');
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
      <div
        ref={listRef}
        onScroll={() => {
          const el = listRef.current;
          if (!el) return;
          const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          setIsNearBottom(near);
        }}
        className="flex-1 overflow-y-auto p-4 space-y-2"
      >
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
                  msg.direction === 'outbound' ? 'bg-[#d9fdd3]' : 'bg-white'
                }`}
              >
                <WhatsAppMediaMessage message={msg} />
                <div className="flex items-center justify-end gap-1 mt-1">
                  <span className="text-[10px] text-gray-500">
                    {new Date(msg.created_at).toLocaleTimeString('es-CL', {
                      hour: '2-digit',
                      minute: '2-digit',
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
          <WhatsAppFileAttachment onSendFile={() => {}} disabled={isSending} />

          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Escribe un mensaje..."
            rows={1}
            className="flex-1 px-4 py-2 border rounded-full resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
          />

          {messageText.trim() ? (
            <button
              onClick={sendMessage}
              disabled={isSending}
              className="p-3 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isSending ? <Loader className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          ) : (
            // ✅ CLAVE: ahora sí llama a sendAudio
            <WhatsAppVoiceRecorder onSendAudio={sendAudio} disabled={isSending} />
          )}
        </div>
      </div>
    </div>
  );
}
