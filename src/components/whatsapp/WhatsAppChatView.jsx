import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, User, Info, Loader, CheckCheck, Check, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import WhatsAppMediaMessage from './WhatsAppMediaMessage';
import WhatsAppVoiceRecorder from './WhatsAppVoiceRecorder';
import WhatsAppFileAttachment from './WhatsAppFileAttachment';

const WA_GRAPH_VERSION = 'v21.0';
const STORAGE_BUCKET = 'whatsapp-media';
const MAX_FILE_BYTES = 16 * 1024 * 1024; // 16MB

function safeExtFromMime(mime = '') {
  const m = mime.split(';')[0].trim().toLowerCase();
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
  };
  if (map[m]) return map[m];
  const slash = m.indexOf('/');
  if (slash > -1) return m.slice(slash + 1) || 'bin';
  return 'bin';
}

function inferMessageTypeFromFile(file) {
  const t = (file?.type || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  return 'document';
}

export default function WhatsAppChatView({ contact, connection, onShowClientInfo }) {
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Scroll inteligente
  const messagesEndRef = useRef(null);
  const listRef = useRef(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  const scrollToBottom = useCallback((behavior = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const computeIsNearBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  }, []);

  const upsertMessageInState = useCallback((row) => {
    if (!row?.id) return;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === row.id);
      if (idx === -1) {
        // Insert nuevo -> mantener orden por created_at asc
        const next = [...prev, row];
        next.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        return next;
      }
      // Update existente (status, media_url, etc.)
      const next = prev.slice();
      next[idx] = { ...next[idx], ...row };
      return next;
    });
  }, []);

  async function loadMessages({ showSpinner = false } = {}) {
    if (!contact?.phone_number) return;

    try {
      if (showSpinner) setIsLoading(true);

      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('phone_number', contact.phone_number)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMessages(data || []);
    } catch (err) {
      console.error('Error loading messages:', err);
      setMessages([]);
    } finally {
      if (showSpinner) setIsLoading(false);
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

  // ✅ Carga inicial + realtime SIN polling
  useEffect(() => {
    if (!contact?.phone_number) return;

    let mounted = true;

    (async () => {
      setIsLoading(true);
      await loadMessages({ showSpinner: false });
      await markMessagesAsRead();
      if (!mounted) return;

      // al abrir conversación, bajar al final de una
      setTimeout(() => scrollToBottom('auto'), 0);
      setIsLoading(false);
    })();

    // Realtime: INSERT para mensajes nuevos
    const chInsert = supabase
      .channel(`wa_msg_insert_${contact.phone_number}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `phone_number=eq.${contact.phone_number}`,
        },
        async (payload) => {
          const wasNear = computeIsNearBottom();
          const row = payload?.new;

          upsertMessageInState(row);

          // marcar leído si inbound
          if (row?.direction === 'inbound') {
            markMessagesAsRead();
          }

          // auto-scroll SOLO si estabas abajo
          if (wasNear) {
            setIsNearBottom(true);
            setTimeout(() => scrollToBottom('auto'), 0);
          }
        }
      )
      .subscribe();

    // Realtime: UPDATE para status/read/media_url etc
    const chUpdate = supabase
      .channel(`wa_msg_update_${contact.phone_number}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `phone_number=eq.${contact.phone_number}`,
        },
        (payload) => {
          const row = payload?.new;
          upsertMessageInState(row);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(chInsert);
      supabase.removeChannel(chUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.phone_number]);

  // Scroll handler (manual)
  const onScroll = useCallback(() => {
    const near = computeIsNearBottom();
    setIsNearBottom(near);
  }, [computeIsNearBottom]);

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
        `https://graph.facebook.com/${WA_GRAPH_VERSION}/${connection.phone_number_id}/messages`,
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

      const { data: inserted, error: insertError } = await supabase
        .from('whatsapp_messages')
        .insert({
          phone_number: contact.phone_number,
          message: messageToSend,
          direction: 'outbound',
          status: 'sent',
          message_type: 'text',
          whatsapp_message_id: result.messages?.[0]?.id ?? null,
          platform_response: result,
        })
        .select('*')
        .single();

      if (insertError) console.error('❌ Error guardando outbound:', insertError);

      // update UI inmediato sin reload completo
      if (inserted) upsertMessageInState(inserted);

      // auto-scroll solo si estás abajo (si envías, asumo que quieres ver el final)
      setIsNearBottom(true);
      setTimeout(() => scrollToBottom('auto'), 0);
    } catch (err) {
      console.error('❌ [SEND_ERROR]', err);
      alert('Error al enviar el mensaje: ' + (err?.message || err));
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

      if (audioBlob.size > MAX_FILE_BYTES) {
        throw new Error('Audio demasiado grande. Máximo 16MB.');
      }

      const mime = audioBlob.type || 'audio/ogg;codecs=opus';
      const ext = mime.includes('webm') ? 'webm' : 'ogg';
      const filename = `out_${cleanPhone}_${Date.now()}.${ext}`;
      const storagePath = `audio/${filename}`;

      const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, audioBlob, {
        contentType: mime,
        cacheControl: '3600',
        upsert: true,
      });
      if (upErr) throw new Error('No se pudo subir el audio a Storage.');

      const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
      const publicUrl = pub?.publicUrl || null;

      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append('file', new File([audioBlob], filename, { type: mime }));

      const mediaUploadRes = await fetch(
        `https://graph.facebook.com/${WA_GRAPH_VERSION}/${phoneNumberId}/media`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form }
      );

      const mediaUploadJson = await mediaUploadRes.json();
      if (!mediaUploadRes.ok) {
        throw new Error(mediaUploadJson?.error?.message || 'Error subiendo media a WhatsApp');
      }

      const mediaId = mediaUploadJson?.id;
      if (!mediaId) throw new Error('No se recibió media_id desde WhatsApp.');

      const msgRes = await fetch(
        `https://graph.facebook.com/${WA_GRAPH_VERSION}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
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
      if (!msgRes.ok) throw new Error(msgJson?.error?.message || 'Error enviando audio por WhatsApp');

      const whatsappMessageId = msgJson?.messages?.[0]?.id ?? null;

      const { data: inserted, error: insertError } = await supabase
        .from('whatsapp_messages')
        .insert({
          phone_number: contact.phone_number,
          direction: 'outbound',
          status: 'sent',
          message_type: 'audio',
          message: '',
          whatsapp_message_id: whatsappMessageId,
          media_id: mediaId,
          media_url: publicUrl,
          media_mime_type: mime,
          media_filename: filename,
          media_size: audioBlob.size,
          platform_response: {
            storage_path: storagePath,
            storage_public_url: publicUrl,
            media_upload: mediaUploadJson,
            message_send: msgJson,
            duration_seconds: durationSeconds ?? null,
          },
        })
        .select('*')
        .single();

      if (insertError) throw new Error(insertError.message);
      if (inserted) upsertMessageInState(inserted);

      setIsNearBottom(true);
      setTimeout(() => scrollToBottom('auto'), 0);
    } catch (err) {
      console.error('❌ [SEND_AUDIO_ERROR]', err);
      alert('Error al enviar el audio: ' + (err?.message || err));
    } finally {
      clearTimeout(timeoutId);
      setIsSending(false);
    }
  }

  // ✅ FILE OUTBOUND (image/video/document)
  async function sendFile(file, caption = '') {
    if (!file || !connection || !contact?.phone_number) return;

    setIsSending(true);

    const timeoutId = setTimeout(() => {
      console.error('⚠️ Timeout al enviar archivo, reseteando UI');
      setIsSending(false);
    }, 35000);

    try {
      const cleanPhone = contact.phone_number.replace(/\D/g, '');
      const phoneNumberId = connection.phone_number_id;
      const accessToken = connection.access_token;

      if (!phoneNumberId || !accessToken) {
        throw new Error('Falta phone_number_id o access_token en la conexión.');
      }

      if (file.size > MAX_FILE_BYTES) {
        throw new Error('Archivo demasiado grande. Máximo 16MB.');
      }

      const messageType = inferMessageTypeFromFile(file);
      const mime = file.type || 'application/octet-stream';
      const ext = safeExtFromMime(mime);

      const safeName = (file.name || `file.${ext}`).replace(/[^\w.\-]+/g, '_');
      const filename = `out_${cleanPhone}_${Date.now()}_${safeName}`;
      const storagePath = `${messageType}/${filename}`;

      const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
        contentType: mime,
        cacheControl: '3600',
        upsert: true,
      });

      if (upErr) {
        console.error('❌ Storage upload error:', upErr);
        throw new Error('No se pudo subir el archivo a Storage.');
      }

      const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
      const publicUrl = pub?.publicUrl || null;

      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append('file', new File([file], filename, { type: mime }));

      const mediaUploadRes = await fetch(
        `https://graph.facebook.com/${WA_GRAPH_VERSION}/${phoneNumberId}/media`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form }
      );
      const mediaUploadJson = await mediaUploadRes.json();
      if (!mediaUploadRes.ok) {
        console.error('❌ WhatsApp media upload error:', mediaUploadJson);
        throw new Error(mediaUploadJson?.error?.message || 'Error subiendo media a WhatsApp');
      }

      const mediaId = mediaUploadJson?.id;
      if (!mediaId) throw new Error('No se recibió media_id desde WhatsApp.');

      const body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: messageType,
      };

      const cap = (caption || '').trim();

      if (messageType === 'image') body.image = cap ? { id: mediaId, caption: cap } : { id: mediaId };
      if (messageType === 'video') body.video = cap ? { id: mediaId, caption: cap } : { id: mediaId };
      if (messageType === 'document') {
        body.document = cap
          ? { id: mediaId, caption: cap, filename: safeName }
          : { id: mediaId, filename: safeName };
      }

      const msgRes = await fetch(
        `https://graph.facebook.com/${WA_GRAPH_VERSION}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      const msgJson = await msgRes.json();
      if (!msgRes.ok) {
        console.error('❌ WhatsApp send error:', msgJson);
        throw new Error(msgJson?.error?.message || 'Error enviando archivo por WhatsApp');
      }

      const whatsappMessageId = msgJson?.messages?.[0]?.id ?? null;

      const { data: inserted, error: insertError } = await supabase
        .from('whatsapp_messages')
        .insert({
          phone_number: contact.phone_number,
          direction: 'outbound',
          status: 'sent',
          message_type: messageType,
          message: cap || '',
          whatsapp_message_id: whatsappMessageId,
          media_id: mediaId,
          media_url: publicUrl,
          media_mime_type: mime,
          media_filename: safeName,
          media_size: file.size,
          platform_response: {
            storage_path: storagePath,
            storage_public_url: publicUrl,
            media_upload: mediaUploadJson,
            message_send: msgJson,
          },
        })
        .select('*')
        .single();

      if (insertError) throw new Error(insertError.message);
      if (inserted) upsertMessageInState(inserted);

      setIsNearBottom(true);
      setTimeout(() => scrollToBottom('auto'), 0);
    } catch (err) {
      console.error('❌ [SEND_FILE_ERROR]', err);
      alert('Error al enviar el archivo: ' + (err?.message || err));
    } finally {
      clearTimeout(timeoutId);
      setIsSending(false);
    }
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

        {/* ✅ Refresh manual */}
        <button
          onClick={async () => {
            await loadMessages({ showSpinner: true });
            await markMessagesAsRead();
          }}
          className="p-2 hover:bg-gray-100 rounded-full"
          title="Actualizar conversación"
        >
          <RefreshCw className="w-5 h-5 text-gray-600" />
        </button>

        <button
          onClick={() => onShowClientInfo(contact)}
          className="p-2 hover:bg-gray-100 rounded-full"
          title="Ver info"
        >
          <Info className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Mensajes */}
      <div
        ref={listRef}
        onScroll={onScroll}
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
          <WhatsAppFileAttachment onSendFile={sendFile} disabled={isSending} />

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
            <WhatsAppVoiceRecorder onSendAudio={sendAudio} disabled={isSending} />
          )}
        </div>
      </div>
    </div>
  );
}
