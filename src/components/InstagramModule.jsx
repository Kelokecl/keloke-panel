// src/components/InstagramModule.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { Instagram, MessageCircle, RefreshCw, User, Send, Sparkles, Filter, CheckCircle2 } from "lucide-react";

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

function cls(...a) {
  return a.filter(Boolean).join(" ");
}

export default function InstagramModule() {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState("");

  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  // filtros
  const [filterKind, setFilterKind] = useState("all"); // all|dm|comment
  const [filterUnread, setFilterUnread] = useState(false);
  const [search, setSearch] = useState("");

  // anti-race
  const listSeqRef = useRef(0);
  const msgSeqRef = useRef(0);

  // cache
  const messagesCacheRef = useRef(new Map()); // convId -> messages[]
  const convMetaRef = useRef(new Map());      // convId -> kind

  // autoscroll
  const bottomRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const selectedConversation = useMemo(() => {
    return conversations.find((c) => c.conversation_id === selectedId) || null;
  }, [conversations, selectedId]);

  const callEdge = useCallback(async (body) => {
    const { data, error } = await supabase.functions.invoke("instagram-admin", { body });
    if (error) throw new Error(error.message || "Edge error");
    if (!data?.ok) throw new Error(data?.error || "Edge error");
    return data;
  }, []);

  const fetchConversations = useCallback(async () => {
    const seq = ++listSeqRef.current;
    setError("");
    setIsLoadingList(true);

    try {
      const res = await callEdge({ action: "list_conversations", limit: 120 });

      if (listSeqRef.current !== seq) return;

      const list = Array.isArray(res.conversations) ? res.conversations : [];
      setConversations(list);

      // memo kind por conv (para UI)
      for (const c of list) {
        if (c?.conversation_id) convMetaRef.current.set(c.conversation_id, c.kind || (c.last_message_type === "comment" ? "comment" : "dm"));
      }

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
    async (conversationId, { silent = false } = {}) => {
      if (!conversationId) return;

      const cached = messagesCacheRef.current.get(conversationId);
      if (cached?.length) setMessages(cached);

      const seq = ++msgSeqRef.current;
      if (!silent) setError("");
      setIsLoadingMessages(true);

      try {
        const res = await callEdge({
          action: "list_messages",
          conversation_id: conversationId,
          limit: 300,
        });

        if (msgSeqRef.current !== seq) return;

        const list = Array.isArray(res.messages) ? res.messages : [];
        messagesCacheRef.current.set(conversationId, list);
        setMessages(list);

        // mark read inbound
        await callEdge({ action: "mark_read", conversation_id: conversationId });

        // refresca unread counts
        fetchConversations();
      } catch (e) {
        if (msgSeqRef.current !== seq) return;
        if (!silent) setError(e?.message || "Error al cargar mensajes.");
      } finally {
        if (msgSeqRef.current !== seq) return;
        setIsLoadingMessages(false);
      }
    },
    [callEdge, fetchConversations]
  );

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // realtime (1 sola suscripción)
  useEffect(() => {
    const channel = supabase
      .channel("instagram_messages_rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "instagram_messages" }, (payload) => {
        const msg = payload?.new;
        if (!msg) return;

        const convId = msg?.conversation_id || msg?.sender_id;
        if (!convId) return;

        // update cache
        const current = messagesCacheRef.current.get(convId) || [];
        messagesCacheRef.current.set(convId, [...current, msg]);

        // update list
        fetchConversations();

        // if open conversation, append
        if (convId === selectedId) {
          setMessages((prev) => [...prev, msg]);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConversations, selectedId]);

  // autoscroll bottom on new messages (only if autoScroll enabled)
  useEffect(() => {
    if (!selectedId) return;
    if (!autoScroll) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedId, autoScroll]);

  const selectConversation = useCallback(
    async (conv) => {
      const convId = conv?.conversation_id;
      if (!convId) return;
      setSelectedId(convId);
      setReplyText("");
      setAutoScroll(true);
      await fetchMessages(convId);
    },
    [fetchMessages]
  );

  const sendReply = useCallback(async () => {
    if (!selectedConversation) return;
    const text = replyText.trim();
    if (!text || isSending) return;

    setError("");
    setIsSending(true);

    const convId = selectedConversation.conversation_id;

    // optimistic UI
    const optimistic = {
      id: `tmp_${Date.now()}`,
      conversation_id: convId,
      message_text: text,
      is_from_business: true,
      is_read: true,
      created_at: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      message_type: "message",
    };

    setReplyText("");
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await callEdge({
        action: "send",
        conversation_id: convId,
        message_text: text,
        mode: "direct", // o "queue" si quieres cola por defecto
      });

      // replace optimistic if possible
      if (res?.message?.id) {
        const real = res.message;
        setMessages((prev) => prev.map((m) => (String(m.id).startsWith("tmp_") ? real : m)));
        const current = messagesCacheRef.current.get(convId) || [];
        messagesCacheRef.current.set(convId, [...current.filter((m) => !String(m.id).startsWith("tmp_")), real]);
      } else {
        // fallback refresh
        await fetchMessages(convId, { silent: true });
      }

      setToast("Enviado");
      setTimeout(() => setToast(""), 1400);
      fetchConversations();
    } catch (e) {
      // rollback optimistic
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setReplyText(text); // devuelve texto al input
      setError(e?.message || "Error al enviar respuesta.");
    } finally {
      setIsSending(false);
    }
  }, [callEdge, fetchConversations, fetchMessages, isSending, replyText, selectedConversation]);

  const genAiDraft = useCallback(async () => {
    if (!selectedConversation || isAiLoading) return;
    setError("");
    setIsAiLoading(true);

    try {
      const convId = selectedConversation.conversation_id;

      const res = await callEdge({
        action: "ai_draft",
        conversation_id: convId,
        intent: "sales_reply",
        tone: "cercano_profesional",
        max_context: 12,
      });

      const draft = String(res?.draft || "").trim();
      if (!draft) throw new Error("IA no devolvió texto");
      setReplyText(draft);
      setToast("Draft IA listo");
      setTimeout(() => setToast(""), 1400);
    } catch (e) {
      setError(e?.message || "Error generando IA.");
    } finally {
      setIsAiLoading(false);
    }
  }, [callEdge, isAiLoading, selectedConversation]);

  const filteredConversations = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (conversations || []).filter((c) => {
      const kind = c.kind || (c.last_message_type === "comment" ? "comment" : "dm");
      if (filterKind !== "all" && kind !== filterKind) return false;
      if (filterUnread && Number(c.unread_count || 0) <= 0) return false;

      if (!s) return true;
      const name = safeText(c.sender_username, "").toLowerCase();
      const last = safeText(c.last_message, "").toLowerCase();
      return name.includes(s) || last.includes(s);
    });
  }, [conversations, filterKind, filterUnread, search]);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-[420px] bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Instagram className="w-6 h-6 text-pink-600" />
              <h2 className="text-xl font-bold text-gray-900">Instagram Inbox</h2>
            </div>

            <button
              onClick={fetchConversations}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Actualizar"
              disabled={isLoadingList}
            >
              <RefreshCw className={cls("w-5 h-5 text-gray-600", isLoadingList && "animate-spin")} />
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <div className="flex-1">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
              />
            </div>

            <button
              onClick={() => setFilterUnread((v) => !v)}
              className={cls(
                "px-3 py-2 rounded-lg border text-sm flex items-center gap-2",
                filterUnread ? "bg-pink-50 border-pink-200 text-pink-700" : "bg-white border-gray-200 text-gray-700"
              )}
              title="Solo no leídos"
            >
              <CheckCircle2 className="w-4 h-4" />
              Unread
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Tipo:
            </span>

            {["all", "dm", "comment"].map((k) => (
              <button
                key={k}
                onClick={() => setFilterKind(k)}
                className={cls(
                  "px-3 py-1.5 rounded-full text-xs border",
                  filterKind === k ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-200"
                )}
              >
                {k === "all" ? "Todos" : k === "dm" ? "DM" : "Comentarios"}
              </button>
            ))}

            <span className="ml-auto text-xs text-gray-500">
              {filteredConversations.length} / {conversations.length}
            </span>
          </div>

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
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6 text-center">
              <Instagram className="w-12 h-12 mb-3 text-gray-300" />
              <p className="text-sm">No hay conversaciones</p>
              <p className="text-xs mt-2">Si esperabas mensajes, revisa Webhooks/ingesta.</p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const active = selectedId === conv.conversation_id;
              const kind = conv.kind || (conv.last_message_type === "comment" ? "comment" : "dm");

              return (
                <div
                  key={conv.conversation_id}
                  onClick={() => selectConversation(conv)}
                  className={cls(
                    "p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors",
                    active && "bg-pink-50 border-l-4 border-l-pink-600"
                  )}
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
                        {kind === "comment" ? (
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

                      <div className="mt-1 text-[11px] text-gray-400">
                        {kind === "comment" ? "Comentario" : "DM"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 flex flex-col bg-white">
        {!selectedConversation ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Instagram className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">Selecciona una conversación</p>
              <p className="text-sm mt-2">DMs y comentarios en un solo inbox</p>
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
                    {(selectedConversation.kind || (selectedConversation.last_message_type === "comment" ? "comment" : "dm")) === "comment"
                      ? "Comentario"
                      : "Mensaje directo"}
                  </p>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => fetchMessages(selectedConversation.conversation_id)}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-sm flex items-center gap-2"
                    disabled={isLoadingMessages}
                    title="Refrescar mensajes"
                  >
                    <RefreshCw className={cls("w-4 h-4", isLoadingMessages && "animate-spin")} />
                    Refrescar
                  </button>

                  <button
                    onClick={genAiDraft}
                    className={cls(
                      "px-3 py-2 rounded-lg text-sm flex items-center gap-2 border",
                      isAiLoading ? "bg-gray-100 text-gray-500 border-gray-200" : "bg-pink-600 text-white border-pink-600 hover:bg-pink-700"
                    )}
                    disabled={isAiLoading}
                    title="Generar respuesta IA (ventas/suscripción)"
                  >
                    <Sparkles className={cls("w-4 h-4", isAiLoading && "animate-spin")} />
                    IA
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div
              className="flex-1 overflow-y-auto p-4 space-y-4"
              onScroll={(e) => {
                const el = e.currentTarget;
                const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
                setAutoScroll(nearBottom);
              }}
            >
              {isLoadingMessages && messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <RefreshCw className="w-6 h-6 animate-spin text-pink-600" />
                </div>
              ) : (
                messages.map((msg) => {
                  const fromBiz = !!msg.is_from_business;
                  const ts = msg.timestamp || msg.created_at || null;

                  return (
                    <div key={msg.id} className={cls("flex", fromBiz ? "justify-end" : "justify-start")}>
                      <div
                        className={cls(
                          "max-w-[680px] px-4 py-2 rounded-2xl",
                          fromBiz ? "bg-pink-600 text-white" : "bg-gray-100 text-gray-900"
                        )}
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

              <div ref={bottomRef} />
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
                  placeholder="Escribe tu respuesta… (Enter envía, Shift+Enter nueva línea)"
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

              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Auto-scroll: <span className="font-semibold">{autoScroll ? "ON" : "OFF"}</span>
                </p>

                {toast ? (
                  <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-lg">
                    {toast}
                  </span>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
