// src/components/InstagramModule.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { Instagram, MessageCircle, RefreshCw, User, Send } from "lucide-react";

function formatTime(ts) {
  if (!ts) return "";
  const date = new Date(ts);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString("es-CL");
}

function safeText(v, fallback = "") {
  return typeof v === "string" ? v : fallback;
}

export default function InstagramModule() {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState("");

  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const [error, setError] = useState("");

  // anti-race
  const listSeqRef = useRef(0);
  const msgSeqRef = useRef(0);

  // cache: convId -> messages[]
  const messagesCacheRef = useRef(new Map());

  const selectedConversation = useMemo(() => {
    return conversations.find((c) => c.conversation_id === selectedId) || null;
  }, [conversations, selectedId]);

  const callEdge = useCallback(async (body) => {
    // usa supabase.functions.invoke (manda Authorization del usuario)
    const { data, error } = await supabase.functions.invoke("instagram-admin", { body });
    if (error) {
      // error puede venir como "Edge Function returned a non-2xx status code"
      throw new Error(error.message || "Edge error");
    }
    if (!data?.ok) {
      throw new Error(data?.error || "Edge error");
    }
    return data;
  }, []);

  const fetchConversations = useCallback(async () => {
    const seq = ++listSeqRef.current;

    setError("");
    setIsLoadingList(true);

    try {
      const res = await callEdge({ action: "list_conversations", limit: 50 });

      if (listSeqRef.current !== seq) return;

      const list = Array.isArray(res.conversations) ? res.conversations : [];
      setConversations(list);

      // si la conversación seleccionada ya no existe, deselecciona
      if (selectedId && !list.some((x) => x.conversation_id === selectedId)) {
        setSelectedId(null);
        setMessages([]);
      }
    } catch (e) {
      if (listSeqRef.current !== seq) return;
      setError(e?.message || "Error al cargar conversaciones.");
    } finally {
      if (listSeqRef.current !== seq) return;
      setIsLoadingList(false);
    }
  }, [callEdge, selectedId]);

  const fetchMessages = useCallback(
    async (conversationId) => {
      if (!conversationId) return;

      // cache first
      const cached = messagesCacheRef.current.get(conversationId);
      if (cached && cached.length) {
        setMessages(cached);
      }

      const seq = ++msgSeqRef.current;
      setError("");
      setIsLoadingMessages(true);

      try {
        const res = await callEdge({
          action: "list_messages",
          conversation_id: conversationId,
          limit: 200,
        });

        if (msgSeqRef.current !== seq) return;

        const list = Array.isArray(res.messages) ? res.messages : [];
        messagesCacheRef.current.set(conversationId, list);
        setMessages(list);

        // marcar como leído (solo los del cliente)
        await callEdge({
          action: "mark_read",
          conversation_id: conversationId,
        });

        // refresca contador de unread
        fetchConversations();
      } catch (e) {
        if (msgSeqRef.current !== seq) return;
        setError(e?.message || "Error al cargar mensajes.");
      } finally {
        if (msgSeqRef.current !== seq) return;
        setIsLoadingMessages(false);
      }
    },
    [callEdge, fetchConversations]
  );

  // load inicial
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // realtime: 1 sola suscripción (sin re-suscribir por selectedConversation)
  useEffect(() => {
    const channel = supabase
      .channel("instagram_messages_rt")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "instagram_messages" },
        (payload) => {
          const msg = payload?.new;
          if (!msg) return;

          // refresca lista (contadores/orden)
          fetchConversations();

          const convId = msg?.conversation_id || msg?.sender_id;
          if (!convId) return;

          // actualiza cache
          const current = messagesCacheRef.current.get(convId) || [];
          messagesCacheRef.current.set(convId, [...current, msg]);

          // si está abierta, actualiza UI
          if (convId === selectedId) {
            setMessages((prev) => [...prev, msg]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConversations, selectedId]);

  const selectConversation = useCallback(
    async (conv) => {
      const convId = conv?.conversation_id;
      if (!convId) return;
      setSelectedId(convId);
      setReplyText("");
      await fetchMessages(convId);
    },
    [fetchMessages]
  );

  const sendReply = useCallback(async () => {
    if (!selectedConversation) return;
    const text = replyText.trim();
    if (!text) return;

    setError("");
    setIsSending(true);

    try {
      const convId = selectedConversation.conversation_id;

      const res = await callEdge({
        action: "send",
        conversation_id: convId,
        message_text: text,
      });

      // el edge devuelve el registro insertado (o al menos ok)
      // refresca mensajes desde cache+db
      setReplyText("");

      // optimista: si trae message, lo agregamos (evita esperar realtime)
      if (res?.message) {
        const msg = res.message;
        const current = messagesCacheRef.current.get(convId) || [];
        messagesCacheRef.current.set(convId, [...current, msg]);
        setMessages((prev) => [...prev, msg]);
      } else {
        await fetchMessages(convId);
      }

      // refresca lista
      fetchConversations();
    } catch (e) {
      setError(e?.message || "Error al enviar respuesta.");
    } finally {
      setIsSending(false);
    }
  }, [callEdge, fetchConversations, fetchMessages, replyText, selectedConversation]);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar conversaciones */}
      <div className="w-96 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Instagram className="w-6 h-6 text-pink-600" />
              <h2 className="text-xl font-bold text-gray-900">Instagram</h2>
            </div>
            <button
              onClick={fetchConversations}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Actualizar"
              disabled={isLoadingList}
            >
              <RefreshCw className={`w-5 h-5 text-gray-600 ${isLoadingList ? "animate-spin" : ""}`} />
            </button>
          </div>

          <p className="text-sm text-gray-600">
            {conversations.length} conversación{conversations.length !== 1 ? "es" : ""}
          </p>

          {error ? (
            <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoadingList ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="w-6 h-6 animate-spin text-pink-600" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6 text-center">
              <Instagram className="w-12 h-12 mb-3 text-gray-300" />
              <p className="text-sm">No hay mensajes aún</p>
              <p className="text-xs mt-2">Conecta Instagram y espera DMs/comentarios.</p>
            </div>
          ) : (
            conversations.map((conv) => {
              const active = selectedId === conv.conversation_id;
              return (
                <div
                  key={conv.conversation_id}
                  onClick={() => selectConversation(conv)}
                  className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                    active ? "bg-pink-50 border-l-4 border-l-pink-600" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-6 h-6 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-gray-900 truncate">
                          {safeText(conv.sender_username, "Usuario Instagram")}
                        </span>
                        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                          {formatTime(conv.last_message_time)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {conv.last_message_type === "comment" ? (
                          <MessageCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        ) : null}

                        <p className="text-sm text-gray-600 truncate flex-1">
                          {safeText(conv.last_message, "(Multimedia)")}
                        </p>

                        {Number(conv.unread_count || 0) > 0 ? (
                          <span className="bg-pink-600 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                            {conv.unread_count}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Conversación */}
      <div className="flex-1 flex flex-col bg-white">
        {!selectedConversation ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Instagram className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">Selecciona una conversación</p>
              <p className="text-sm mt-2">Elige un DM o comentario para responder</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {safeText(selectedConversation.sender_username, "Usuario Instagram")}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {selectedConversation.kind === "comment" ? "Comentario" : "Mensaje directo"}
                  </p>
                </div>

                <div className="ml-auto">
                  <button
                    onClick={() => fetchMessages(selectedConversation.conversation_id)}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-sm flex items-center gap-2"
                    disabled={isLoadingMessages}
                    title="Refrescar mensajes"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingMessages ? "animate-spin" : ""}`} />
                    Refrescar
                  </button>
                </div>
              </div>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoadingMessages && messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <RefreshCw className="w-6 h-6 animate-spin text-pink-600" />
                </div>
              ) : (
                messages.map((msg) => {
                  const fromBiz = !!msg.is_from_business;
                  const ts = msg.timestamp || msg.created_at || null;

                  return (
                    <div key={msg.id} className={`flex ${fromBiz ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-md px-4 py-2 rounded-2xl ${
                          fromBiz ? "bg-pink-600 text-white" : "bg-gray-100 text-gray-900"
                        }`}
                      >
                        {msg.message_type === "comment" && !fromBiz ? (
                          <div className="flex items-center gap-1 mb-1 text-xs opacity-75">
                            <MessageCircle className="w-3 h-3" />
                            <span>Comentario</span>
                          </div>
                        ) : null}

                        <p className="text-sm whitespace-pre-wrap">{safeText(msg.message_text, "")}</p>

                        {msg.media_url ? (
                          <img
                            src={msg.media_url}
                            alt="Media"
                            className="mt-2 rounded-lg max-w-full"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : null}

                        <p className="text-xs opacity-75 mt-1">{formatTime(ts)}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Reply */}
            <div className="p-4 border-t border-gray-200 bg-white">
              <div className="flex items-end gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendReply();
                    }
                  }}
                  placeholder={selectedConversation.kind === "comment" ? "Responder al comentario..." : "Escribe tu mensaje..."}
                  rows={3}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none"
                />

                <button
                  onClick={sendReply}
                  disabled={!replyText.trim() || isSending}
                  className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  title="Enviar"
                >
                  {isSending ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>

              <p className="text-xs text-gray-500 mt-2">Enter para enviar, Shift+Enter para nueva línea</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
