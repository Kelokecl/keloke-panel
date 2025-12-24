import { useState, useEffect, useRef, useCallback } from "react";
import { Send, User, Info, Loader, CheckCheck, Check } from "lucide-react";
import { supabase } from "../../lib/supabase";
import WhatsAppMediaMessage from "./WhatsAppMediaMessage";
import WhatsAppVoiceRecorder from "./WhatsAppVoiceRecorder";
import WhatsAppFileAttachment from "./WhatsAppFileAttachment";

export default function WhatsAppChatView({ contact, connection, onShowClientInfo }) {
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const pollingRef = useRef(null);
  const abortRef = useRef(null);
  const lastReadMarkRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const normalizePhone = useCallback((p) => String(p || "").replace(/\D/g, ""), []);

  const loadMessages = useCallback(async () => {
    const phone = contact?.phone_number;
    if (!phone) return;

    // Cancelar request anterior si aún está volando (evita race + spam)
    try {
      abortRef.current?.abort?.();
    } catch {}
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("phone_number", phone)
        .order("created_at", { ascending: true })
        .abortSignal(controller.signal);

      if (error) throw error;

      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      // Si fue abort, no lo muestres como error real
      if (err?.name !== "AbortError") {
        console.error("❌ Error loading messages:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [contact?.phone_number]);

  const markMessagesAsRead = useCallback(async () => {
    const phone = contact?.phone_number;
    if (!phone) return;

    // Throttle (evita que se dispare 200 veces por refresh/subs)
    const now = Date.now();
    if (now - lastReadMarkRef.current < 1500) return;
    lastReadMarkRef.current = now;

    try {
      const { error } = await supabase
        .from("whatsapp_messages")
        .update({ is_read: true })
        .eq("phone_number", phone)
        .eq("direction", "inbound")
        .eq("is_read", false);

      if (error) throw error;
    } catch (err) {
      console.error("❌ Error marking messages as read:", err);
    }
  }, [contact?.phone_number]);

  useEffect(() => {
    if (!contact?.phone_number) {
      setMessages([]);
      return;
    }

    // carga inicial
    loadMessages().then(() => markMessagesAsRead());

    // Polling fallback (por si realtime falla)
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(() => {
      loadMessages();
    }, 4000);

    // Realtime
    const channel = supabase
      .channel(`chat_${contact.phone_number}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_messages",
          filter: `phone_number=eq.${contact.phone_number}`,
        },
        async (payload) => {
          // Actualiza chat altiro
          await loadMessages();

          // Si llega inbound, márcalo como leído
          const dir = payload?.new?.direction;
          if (dir === "inbound") {
            await markMessagesAsRead();
          }
        }
      )
      .subscribe();

    return () => {
      try {
        abortRef.current?.abort?.();
      } catch {}
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
      channel.unsubscribe();
    };
  }, [contact?.phone_number, loadMessages, markMessagesAsRead]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const getStatusIcon = (status) => {
    switch (status) {
      case "read":
      case "delivered":
        return <CheckCheck className="w-4 h-4 text-blue-400" />;
      case "sent":
        return <CheckCheck className="w-4 h-4" />;
      default:
        return <Check className="w-4 h-4" />;
    }
  };

  async function sendMessage() {
    if (!messageText.trim() || !connection) return;

    const messageToSend = messageText.trim();
    setIsSending(true);

    const timeoutId = setTimeout(() => {
      console.error("⚠️ Timeout al enviar mensaje, reseteando UI");
      setMessageText("");
      setIsSending(false);
    }, 10000);

    try {
      const cleanPhone = normalizePhone(contact.phone_number);

      // ✅ Envío directo (funciona ya). (Después lo migramos a Edge Function para no exponer token)
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${connection.phone_number_id}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${connection.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: cleanPhone,
            type: "text",
            text: { body: messageToSend },
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Error WhatsApp API");

      // Guardar en BD (outbound)
      const { error: insertError } = await supabase.from("whatsapp_messages").insert({
        phone_number: contact.phone_number,
        message: messageToSend,
        direction: "outbound",
        status: "sent",
        message_type: "text",
        whatsapp_message_id: result?.messages?.[0]?.id ?? null,
        platform_response: result,
      });

      if (insertError) console.error("❌ Error guardando outbound:", insertError);

      await loadMessages();
    } catch (err) {
      console.error("❌ [SEND_ERROR]", err);
      alert("Error al enviar el mensaje: " + (err?.message || String(err)));
    } finally {
      clearTimeout(timeoutId);
      setMessageText("");
      setIsSending(false);
    }
  }

  async function sendAudio(audioBlob, duration) {
    if (!connection) return;

    try {
      const mimeTypeForApi = audioBlob?.mimeTypeForApi || "audio/webm";
      const fileExtensionForApi = audioBlob?.fileExtensionForApi || "webm";
      const fileName = `audio_${Date.now()}.${fileExtensionForApi}`;

      // 1) Upload a Storage
      const { error: uploadError } = await supabase.storage
        .from("whatsapp-media")
        .upload(fileName, audioBlob, {
          contentType: mimeTypeForApi,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // 2) URL pública
      const {
        data: { publicUrl },
      } = supabase.storage.from("whatsapp-media").getPublicUrl(fileName);

      // 3) Enviar a WhatsApp
      const cleanPhone = normalizePhone(contact.phone_number);

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${connection.phone_number_id}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${connection.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: cleanPhone,
            type: "audio",
            audio: { link: publicUrl },
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Error WhatsApp API");

      // 4) Guardar BD
      await supabase.from("whatsapp_messages").insert({
        phone_number: contact.phone_number,
        message: "Audio",
        direction: "outbound",
        status: "sent",
        message_type: "audio",
        media_url: publicUrl,
        media_mime_type: mimeTypeForApi,
        media_filename: fileName,
        media_size: audioBlob.size,
        media_duration: duration,
        whatsapp_message_id: result?.messages?.[0]?.id ?? null,
        platform_response: result,
      });

      await loadMessages();
    } catch (err) {
      console.error("❌ Error sending audio:", err);
      alert("Error al enviar audio: " + (err?.message || String(err)));
      throw err;
    }
  }

  async function sendFile(file, caption) {
    if (!connection) return;

    try {
      let messageType = "document";
      if (file.type.startsWith("image/")) messageType = "image";
      else if (file.type.startsWith("video/")) messageType = "video";

      const fileName = `${messageType}_${Date.now()}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("whatsapp-media")
        .upload(fileName, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("whatsapp-media").getPublicUrl(fileName);

      const cleanPhone = normalizePhone(contact.phone_number);

      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhone,
        type: messageType,
        [messageType]: {
          link: publicUrl,
          ...(caption ? { caption } : {}),
        },
      };

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${connection.phone_number_id}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${connection.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Error WhatsApp API");

      await supabase.from("whatsapp_messages").insert({
        phone_number: contact.phone_number,
        message: caption || file.name,
        direction: "outbound",
        status: "sent",
        message_type: messageType,
        media_url: publicUrl,
        media_mime_type: file.type,
        media_filename: file.name,
        media_size: file.size,
        caption: caption || null,
        whatsapp_message_id: result?.messages?.[0]?.id ?? null,
        platform_response: result,
      });

      await loadMessages();
    } catch (err) {
      console.error("❌ Error sending file:", err);
      throw err;
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

        <button onClick={() => onShowClientInfo?.(contact)} className="p-2 hover:bg-gray-100 rounded-full">
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
              key={msg.id ?? msg.whatsapp_message_id ?? `${msg.phone_number}-${msg.created_at}`}
              className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-md px-4 py-2 rounded-lg ${
                  msg.direction === "outbound" ? "bg-[#d9fdd3]" : "bg-white"
                }`}
              >
                <WhatsAppMediaMessage message={msg} />
                <div className="flex items-center justify-end gap-1 mt-1">
                  <span className="text-[10px] text-gray-500">
                    {msg.created_at
                      ? new Date(msg.created_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
                      : ""}
                  </span>
                  {msg.direction === "outbound" && getStatusIcon(msg.status)}
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
              if (e.key === "Enter" && !e.shiftKey) {
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
