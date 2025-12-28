import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

/**
 * =========================================================
 *  CONFIG
 * =========================================================
 */
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const WA_GRAPH_VERSION = "v21.0";
const STORAGE_BUCKET = "whatsapp-media";

/**
 * (Dejamos Nerd para después)
 * Si quieres activar forwarding luego, pon una URL real aquí.
 */
const NERD_WEBHOOK_URL = ""; // e.g. "https://nerd.../functions/v1/whatsapp-webhook"

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function safeString(v: unknown) {
  return typeof v === "string" ? v : "";
}
function safeNumber(v: unknown, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function mimeToExt(mimeRaw: string): string {
  const mime = (mimeRaw || "").split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/webm": "webm",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "application/pdf": "pdf",
  };
  if (map[mime]) return map[mime];
  const slash = mime.indexOf("/");
  if (slash > -1) return mime.slice(slash + 1) || "bin";
  return "bin";
}
function randomId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * =========================================================
 *  IA SETTINGS (tu tabla real: whatsapp_ai_config)
 * =========================================================
 */
type AiConfig = {
  auto_reply_enabled: boolean;
  reply_outside_schedule: boolean;
  start_time: string | null; // "HH:MM"
  end_time: string | null;   // "HH:MM"
  days_enabled: string[] | null; // ["1","2","3"...] 1=Lun ... 7=Dom
  training_data: string | null;
};

const DEFAULT_AI_CONFIG: AiConfig = {
  auto_reply_enabled: false,
  reply_outside_schedule: true,
  start_time: "09:00",
  end_time: "18:00",
  days_enabled: ["1", "2", "3", "4", "5"],
  training_data: "",
};

function isWithinScheduleLocal(cfg: AiConfig): boolean {
  // day: 1=Lun ... 7=Dom
  const now = new Date();
  const dayJs = now.getDay(); // 0=Dom..6=Sab
  const dayIso = dayJs === 0 ? 7 : dayJs;

  if (Array.isArray(cfg.days_enabled) && cfg.days_enabled.length > 0) {
    if (!cfg.days_enabled.includes(String(dayIso))) return false;
  }

  const start = cfg.start_time;
  const end = cfg.end_time;
  if (!start || !end) return true;

  const [sh, sm] = start.split(":").map((x) => parseInt(x, 10));
  const [eh, em] = end.split(":").map((x) => parseInt(x, 10));

  const startMin = (sh || 0) * 60 + (sm || 0);
  const endMin = (eh || 0) * 60 + (em || 0);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const inRange = startMin <= endMin
    ? (nowMin >= startMin && nowMin <= endMin)
    : (nowMin >= startMin || nowMin <= endMin);

  // Si reply_outside_schedule=true => responde fuera del horario
  return cfg.reply_outside_schedule ? !inRange : inRange;
}

async function loadAiConfig(supabase: ReturnType<typeof createClient>): Promise<AiConfig> {
  try {
    const { data, error } = await supabase
      .from("whatsapp_ai_config")
      .select("*")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      console.warn("⚠️ No pude leer whatsapp_ai_config, uso defaults.", error);
      return { ...DEFAULT_AI_CONFIG };
    }

    return {
      auto_reply_enabled: Boolean(data.auto_reply_enabled),
      reply_outside_schedule: Boolean(data.reply_outside_schedule),
      start_time: data.start_time ?? DEFAULT_AI_CONFIG.start_time,
      end_time: data.end_time ?? DEFAULT_AI_CONFIG.end_time,
      days_enabled: Array.isArray(data.days_enabled) ? data.days_enabled : DEFAULT_AI_CONFIG.days_enabled,
      training_data: data.training_data ?? DEFAULT_AI_CONFIG.training_data,
    };
  } catch (e) {
    console.warn("⚠️ Excepción leyendo whatsapp_ai_config, uso defaults.", e);
    return { ...DEFAULT_AI_CONFIG };
  }
}

/**
 * =========================================================
 *  OpenAI (Chat Completions) + contexto con historial
 * =========================================================
 */
function buildSystemPrompt(training: string) {
  const base =
    [
      "Eres el asistente de ventas y soporte de Keloke.cl (Chile).",
      "Hablas en español chileno, cercano y profesional.",
      "Respondes corto y útil (máx 4-6 líneas), sin textos eternos.",
      "Tu objetivo: convertir la conversación en venta y resolver dudas rápido.",
      "Haz 1-2 preguntas SOLO si faltan datos clave (capacidad, presupuesto, comuna, urgencia).",
      "Si ya te dieron comuna/producto, NO vuelvas a pedir lo mismo: avanza.",
      "No inventes stock ni promesas raras; ofrece links y confirmación.",
      "Siempre cierra con CTA suave.",
    ].join(" ");

  const ctx = training?.trim()
    ? `\n\nCONTEXTO DEL NEGOCIO (para usar en respuestas):\n${training.trim()}`
    : "";

  return base + ctx;
}

async function generateOpenAIReply(args: {
  system: string;
  conversation: { role: "user" | "assistant"; content: string }[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const model = args.model || (Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini");

  if (!apiKey) {
    console.error("❌ Falta OPENAI_API_KEY en Supabase Secrets");
    return "Pucha 😅 tuve un tema técnico. ¿Me dices qué modelo de freidora buscas (tamaño/personas) y tu comuna?";
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: args.system },
          ...args.conversation,
        ],
        temperature: typeof args.temperature === "number" ? args.temperature : 0.6,
        max_tokens: args.maxTokens ?? 260,
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      console.error("❌ OpenAI error:", res.status, raw);
      return "Te leo 🙌 ¿Cuántas personas son y qué presupuesto aprox? así te mando 2 opciones con link.";
    }

    const data = JSON.parse(raw);
    const text = safeString(data?.choices?.[0]?.message?.content)?.trim();
    return text || "Ya bacán 🙌 ¿Cuántas personas son y tu presupuesto aprox? así te mando opciones con link.";
  } catch (e) {
    console.error("❌ Error llamando OpenAI:", e);
    return "Tu mensaje quedó 🙌 pero tuve un drama con la IA. ¿Cuántas personas son y tu comuna?";
  }
}

/**
 * =========================================================
 *  WhatsApp send (texto)
 * =========================================================
 */
async function sendWhatsAppTextReply(
  to: string,
  text: string,
  accessToken: string,
  phoneNumberId: string,
) {
  const url =
    `https://graph.facebook.com/${WA_GRAPH_VERSION}/${phoneNumberId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    console.error("❌ Error enviando WhatsApp:", res.status, raw);
    throw new Error(`WhatsApp send failed: ${res.status} ${raw}`);
  }

  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * =========================================================
 *  MEDIA (INBOUND)
 * =========================================================
 */
async function fetchWhatsAppMediaMeta(mediaId: string, accessToken: string) {
  const url = `https://graph.facebook.com/${WA_GRAPH_VERSION}/${mediaId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const raw = await res.text();
  const json = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  if (!res.ok) throw new Error(json?.error?.message || `Media meta failed ${res.status}`);
  if (!json?.url) throw new Error("Media meta sin url");
  return json;
}
async function downloadWhatsAppMediaBinary(mediaUrl: string, accessToken: string) {
  const res = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Media binary download failed ${res.status}`);
  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}
async function uploadToStorageAndGetPublicUrl(
  supabase: ReturnType<typeof createClient>,
  filePath: string,
  bytes: Uint8Array,
  mimeType: string,
) {
  const blob = new Blob([bytes], { type: mimeType });
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, blob, { contentType: mimeType, upsert: false });
  if (error) throw new Error("No se pudo subir a storage");

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
  if (!data?.publicUrl) throw new Error("No se pudo obtener publicUrl");
  return data.publicUrl;
}
async function handleInboundMedia(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  messageType: string,
  message: any,
) {
  let mediaId = "";
  if (messageType === "audio") mediaId = safeString(message?.audio?.id);
  else if (messageType === "image") mediaId = safeString(message?.image?.id);
  else if (messageType === "video") mediaId = safeString(message?.video?.id);
  else if (messageType === "document") mediaId = safeString(message?.document?.id);
  else if (messageType === "sticker") mediaId = safeString(message?.sticker?.id);
  if (!mediaId) return null;

  const meta = await fetchWhatsAppMediaMeta(mediaId, accessToken);
  const mediaUrl = safeString(meta?.url);
  const mimeType = safeString(meta?.mime_type) || "application/octet-stream";
  const ext = mimeToExt(mimeType);
  const bytes = await downloadWhatsAppMediaBinary(mediaUrl, accessToken);

  const fileName = `${messageType}_in_${randomId()}_${mediaId}.${ext}`;
  const filePath = `${messageType}/inbound/${fileName}`;
  const publicUrl = await uploadToStorageAndGetPublicUrl(supabase, filePath, bytes, mimeType);

  return { publicUrl, mimeType, fileName, size: bytes.length, mediaId };
}

/**
 * =========================================================
 *  Historial para que NO repita
 * =========================================================
 */
async function buildConversationFromDB(
  supabase: ReturnType<typeof createClient>,
  phone: string,
  userText: string,
) {
  // Traemos últimos N mensajes para dar contexto (evita “reinicio”)
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("direction,message,created_at")
    .eq("phone_number", phone)
    .order("created_at", { ascending: false })
    .limit(12);

  const ordered = (data || []).slice().reverse();

  const conversation: { role: "user" | "assistant"; content: string }[] = [];
  for (const row of ordered) {
    const dir = safeString(row.direction);
    const msg = safeString(row.message);
    if (!msg) continue;
    conversation.push({
      role: dir === "outbound" ? "assistant" : "user",
      content: msg,
    });
  }

  // Asegura que el último input sea el del usuario actual (por si DB demora)
  if (!conversation.length || conversation[conversation.length - 1].role !== "user") {
    conversation.push({ role: "user", content: userText });
  }

  return conversation;
}

/**
 * =========================================================
 *  Server
 * =========================================================
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Verify (Meta)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "keloke_webhook_token";

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Missing Supabase secrets" }, 500);
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();

    // 0) Config IA (tu tabla)
    const aiCfg = await loadAiConfig(supabase);
    const canAnswerBySchedule = isWithinScheduleLocal(aiCfg);

    // 1) Conexión WhatsApp activa
    const { data: connection, error: connError } = await supabase
      .from("social_connections")
      .select("*")
      .eq("platform", "whatsapp")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (connError || !connection) {
      return jsonResponse({ error: "No WhatsApp connection found", details: connError ?? null }, 500);
    }

    const accessToken = safeString(connection.access_token);
    const phoneNumberId = safeString(connection.phone_number_id);
    if (!accessToken || !phoneNumberId) {
      return jsonResponse({ error: "WhatsApp connection missing access_token/phone_number_id" }, 500);
    }

    // 2) Procesar cambios
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;

        // 2A) Mensajes entrantes
        if (value?.messages) {
          for (const message of value.messages) {
            const fromPhone = safeString(message.from);
            const messageType = safeString(message.type);
            const messageId = safeString(message.id);
            const timestamp = safeString(message.timestamp);

            if (!fromPhone || !messageType || !messageId) continue;

            // Idempotencia inbound
            const { data: existingMsg } = await supabase
              .from("whatsapp_messages")
              .select("id")
              .eq("whatsapp_message_id", messageId)
              .eq("direction", "inbound")
              .limit(1)
              .maybeSingle();

            if (existingMsg?.id) continue;

            const lastMessageAt = timestamp
              ? new Date(parseInt(timestamp) * 1000).toISOString()
              : new Date().toISOString();

            // Contacto upsert simple (sin tocar id identity)
            const { data: existingContact } = await supabase
              .from("whatsapp_contacts")
              .select("id")
              .eq("phone_number", fromPhone)
              .maybeSingle();

            if (!existingContact) {
              const name = safeString(value?.contacts?.[0]?.profile?.name) || fromPhone;
              await supabase.from("whatsapp_contacts").insert({
                phone_number: fromPhone,
                contact_name: name,
                last_message_at: lastMessageAt,
              });
            } else {
              await supabase.from("whatsapp_contacts").update({ last_message_at: lastMessageAt })
                .eq("phone_number", fromPhone);
            }

            const messageData: any = {
              phone_number: fromPhone,
              direction: "inbound",
              status: "received",
              whatsapp_message_id: messageId,
              message_type: messageType,
              platform_response: message,
            };

            if (messageType === "text") {
              messageData.message = safeString(message.text?.body) || "";
            } else {
              let caption = "";
              if (messageType === "image") caption = safeString(message?.image?.caption);
              if (messageType === "video") caption = safeString(message?.video?.caption);
              if (messageType === "document") caption = safeString(message?.document?.caption);
              messageData.message = caption || `Mensaje de tipo ${messageType} recibido`;
            }

            // Media inbound
            if (["audio", "image", "video", "document", "sticker"].includes(messageType)) {
              try {
                const media = await handleInboundMedia(supabase, accessToken, messageType, message);
                if (media) {
                  messageData.media_url = media.publicUrl;
                  messageData.media_mime_type = media.mimeType;
                  messageData.media_filename = media.fileName;
                  messageData.media_size = media.size;
                  messageData.media_id = media.mediaId;
                }
              } catch (e) {
                console.error("❌ Media error:", e);
              }
            }

            // Guardar inbound
            await supabase.from("whatsapp_messages").insert(messageData);

            // 2B) Auto-reply IA SOLO si text + enabled + schedule ok
            if (messageType === "text") {
              const userText = (messageData.message || "").trim();
              if (!userText) continue;

              if (!aiCfg.auto_reply_enabled) {
                console.log("⏸️ IA apagada (auto_reply_enabled=false)");
                continue;
              }

              if (!canAnswerBySchedule) {
                console.log("🕒 Según config, no corresponde responder ahora.");
                continue;
              }

              // HISTORIAL para que no repita:
              const conversation = await buildConversationFromDB(supabase, fromPhone, userText);

              const system = buildSystemPrompt(aiCfg.training_data || "");
              const aiReply = await generateOpenAIReply({
                system,
                conversation,
                model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini",
                maxTokens: 260,
                temperature: 0.6,
              });

              const waResponse = await sendWhatsAppTextReply(fromPhone, aiReply, accessToken, phoneNumberId);

              // Guardar outbound
              await supabase.from("whatsapp_messages").insert({
                phone_number: fromPhone,
                direction: "outbound",
                status: "sent",
                whatsapp_message_id: waResponse?.messages?.[0]?.id ?? null,
                message_type: "text",
                message: aiReply,
                platform_response: waResponse,
              });
            }
          }
        }

        // Status updates
        if (value?.statuses) {
          for (const status of value.statuses) {
            const stId = safeString(status?.id);
            const stVal = safeString(status?.status);
            if (!stId || !stVal) continue;

            await supabase.from("whatsapp_messages")
              .update({ status: stVal } as any)
              .eq("whatsapp_message_id", stId);
          }
        }
      }
    }

    // Forward a Nerd (desactivado por ahora)
    if (NERD_WEBHOOK_URL) {
      try {
        const forwarded = safeString(req.headers.get("X-Forwarded-From"));
        if (!forwarded) {
          await fetch(NERD_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Forwarded-From": "keloke-panel" },
            body: JSON.stringify(body),
          });
        }
      } catch (e) {
        console.error("❌ Nerd forward error:", e);
      }
    }

    return jsonResponse({ success: true }, 200);
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    return jsonResponse({ error: String((error as any)?.message ?? error) }, 500);
  }
});
