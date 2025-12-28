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
 */
const NERD_WEBHOOK_URL = ""; // desactivado

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeString(v: unknown) {
  return typeof v === "string" ? v : "";
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
  start_time: string | null; // "HH:MM" o "HH:MM:SS"
  end_time: string | null;   // "HH:MM" o "HH:MM:SS"
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
      days_enabled: Array.isArray(data.days_enabled)
        ? data.days_enabled
        : DEFAULT_AI_CONFIG.days_enabled,
      training_data: data.training_data ?? DEFAULT_AI_CONFIG.training_data,
    };
  } catch (e) {
    console.warn("⚠️ Excepción leyendo whatsapp_ai_config, uso defaults.", e);
    return { ...DEFAULT_AI_CONFIG };
  }
}

/**
 * =========================================================
 *  TZ Chile real (America/Santiago) + helpers
 * =========================================================
 */
const CHILE_TZ = "America/Santiago";

function getChileNowParts() {
  // Obtenemos hora/minuto/día ISO (1-7) en Chile (no UTC)
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: CHILE_TZ,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const parts = fmt.formatToParts(new Date());
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const wd = (parts.find((p) => p.type === "weekday")?.value ?? "").toLowerCase();

  // Mapeo weekday -> ISO (1=Lun...7=Dom)
  const map: Record<string, number> = {
    mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
  };
  const dayIso = map[wd.slice(0, 3)] ?? 0;

  return { hh, mm, dayIso };
}

function parseHHMM(x: string | null): { h: number; m: number } | null {
  if (!x) return null;
  const s = x.trim();
  if (!s) return null;
  // acepta "HH:MM" o "HH:MM:SS"
  const parts = s.split(":").map((v) => Number(v));
  if (parts.length < 2) return null;
  const h = Number.isFinite(parts[0]) ? parts[0] : 0;
  const m = Number.isFinite(parts[1]) ? parts[1] : 0;
  return { h, m };
}

/**
 * Regla:
 * - Si days_enabled está vacío/null => no restringe por días
 * - Si start/end inválidos => no restringe por horario (responde siempre)
 * - reply_outside_schedule:
 *   - true  => responde SOLO fuera del rango
 *   - false => responde SOLO dentro del rango
 */
function canAnswerByScheduleChile(cfg: AiConfig): boolean {
  const { hh, mm, dayIso } = getChileNowParts();

  if (Array.isArray(cfg.days_enabled) && cfg.days_enabled.length > 0) {
    if (!cfg.days_enabled.includes(String(dayIso))) return false;
  }

  const st = parseHHMM(cfg.start_time);
  const en = parseHHMM(cfg.end_time);

  // si no hay horario usable, respondemos siempre
  if (!st || !en) return true;

  const startMin = (st.h || 0) * 60 + (st.m || 0);
  const endMin = (en.h || 0) * 60 + (en.m || 0);
  const nowMin = (hh || 0) * 60 + (mm || 0);

  const inRange = startMin <= endMin
    ? (nowMin >= startMin && nowMin <= endMin)
    : (nowMin >= startMin || nowMin <= endMin); // cruza medianoche

  return cfg.reply_outside_schedule ? !inRange : inRange;
}

/**
 * =========================================================
 *  OpenAI Responses API (sin params que rompen)
 * =========================================================
 *
 * Tus logs mostraron errores por params:
 * - max_tokens (no)
 * - max_completion_tokens (no en Responses)
 * - temperature (algunos modelos/entradas lo rechazan)
 * - input con formato incorrecto (objeto)
 *
 * Solución: usar Responses API con:
 * - input: string
 * - max_output_tokens
 * - sin temperature
 */
function buildSystemPrompt(training: string) {
  const base = [
    "Eres el asistente de ventas y soporte de Keloke.cl (Chile).",
    "Hablas español chileno, cercano y profesional.",
    "Respondes claro y breve (máx 4-6 líneas).",
    "Si ya te dieron datos (producto/comuna/presupuesto), NO los vuelvas a pedir.",
    "Si faltan datos clave, pregunta 1 cosa a la vez.",
    "Da 1-2 opciones y ofrece mandar links.",
    "Cierra con CTA suave.",
  ].join(" ");

  const ctx = training?.trim()
    ? `\n\nCONTEXTO DEL NEGOCIO:\n${training.trim()}`
    : "";

  return base + ctx;
}

async function generateOpenAIReplyFromText(fullPrompt: string): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-5-mini";

  if (!apiKey) {
    console.error("❌ OPENAI_API_KEY missing");
    return "Pucha 😅 tuve un tema técnico. ¿Qué producto buscas? y te ayudo al tiro.";
  }

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: fullPrompt,          // ✅ string
        max_output_tokens: 260,      // ✅ correcto para Responses
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      console.error("❌ OpenAI error:", res.status, raw);
      return "Te leo 🙌 ¿Qué producto buscas y tu presupuesto aprox? así te mando 2 opciones con link.";
    }

    const data = JSON.parse(raw);
    const text = safeString(data?.output_text)?.trim();
    return text || "Ya bacán 🙌 ¿Qué andas buscando y en qué comuna estás?";
  } catch (e) {
    console.error("❌ OpenAI fetch error:", e);
    return "Te leo 🙌 ¿Qué producto buscas y tu presupuesto aprox? así te mando 2 opciones con link.";
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
 *  Historial rápido para evitar “reinicio”
 * =========================================================
 */
async function getRecentConversationText(
  supabase: ReturnType<typeof createClient>,
  phone: string,
  currentUserText: string,
) {
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("direction,message,created_at")
    .eq("phone_number", phone)
    .order("created_at", { ascending: false })
    .limit(10);

  const ordered = (data || []).slice().reverse();

  const lines: string[] = [];
  for (const row of ordered) {
    const dir = safeString((row as any).direction);
    const msg = safeString((row as any).message);
    if (!msg) continue;
    lines.push(`${dir === "outbound" ? "Asistente" : "Cliente"}: ${msg}`);
  }

  // Asegura el último input actual
  if (!lines.length || !lines[lines.length - 1].startsWith("Cliente:")) {
    lines.push(`Cliente: ${currentUserText}`);
  }

  return lines.join("\n");
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
      return new Response(challenge ?? "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
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

    // 🔥 Modo prueba para FORZAR respuesta sin pelear con horarios
    // En Secrets: WA_AI_FORCE_REPLY = "true"
    const FORCE_REPLY = (Deno.env.get("WA_AI_FORCE_REPLY") ?? "").toLowerCase() === "true";

    // 0) Config IA (tu tabla)
    const aiCfg = await loadAiConfig(supabase);

    // Log real de la config para que no haya dudas
    console.log("🤖 AI CONFIG (DB):", JSON.stringify(aiCfg));
    console.log("🕒 Chile now:", JSON.stringify(getChileNowParts()), "TZ:", CHILE_TZ);
    console.log("🧪 FORCE_REPLY:", FORCE_REPLY);

    const scheduleOk = FORCE_REPLY ? true : canAnswerByScheduleChile(aiCfg);

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

    const accessToken = safeString((connection as any).access_token);
    const phoneNumberId = safeString((connection as any).phone_number_id);
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

            // Contacto upsert simple
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
              await supabase
                .from("whatsapp_contacts")
                .update({ last_message_at: lastMessageAt })
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

              if (!scheduleOk) {
                console.log("🕒 Según config, no corresponde responder ahora.");
                continue;
              }

              // Prompt con historial + contexto
              const system = buildSystemPrompt(aiCfg.training_data || "");
              const history = await getRecentConversationText(supabase, fromPhone, userText);

              const fullPrompt =
                `${system}\n\n` +
                `HISTORIAL RECIENTE:\n${history}\n\n` +
                `INSTRUCCIÓN: responde como Keloke, sin repetir preguntas ya respondidas.`;

              const aiReply = await generateOpenAIReplyFromText(fullPrompt);

              const waResponse = await sendWhatsAppTextReply(
                fromPhone,
                aiReply,
                accessToken,
                phoneNumberId,
              );

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

            await supabase
              .from("whatsapp_messages")
              .update({ status: stVal } as any)
              .eq("whatsapp_message_id", stId);
          }
        }
      }
    }

    // Forward a Nerd (apagado)
    if (NERD_WEBHOOK_URL) {
      try {
        const forwarded = safeString(req.headers.get("X-Forwarded-From"));
        if (!forwarded) {
          await fetch(NERD_WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Forwarded-From": "keloke-panel",
            },
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
