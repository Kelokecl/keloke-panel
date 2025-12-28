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

// ✅ Nerd (destino externo). Si lo apuntas a ti mismo, lo saltamos para evitar loop.
const NERD_WEBHOOK_URL =
  "https://nffeqekvvqsqwbjrmkjs.supabase.co/functions/v1/whatsapp-webhook";

const STORAGE_BUCKET = "whatsapp-media"; // bucket público
const WA_GRAPH_VERSION = "v21.0";
const CHILE_TZ = "America/Santiago";

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
 *  IA CONFIG (tu tabla real: whatsapp_ai_config)
 * =========================================================
 */
type WhatsAppAIConfig = {
  id: number;
  auto_reply_enabled: boolean;
  reply_outside_schedule: boolean;
  start_time: string | null; // "HH:MM"
  end_time: string | null;   // "HH:MM"
  days_enabled: string[] | null; // ["1".."7"]
  training_data: string | null;
  updated_at: string | null;
};

const AI_FALLBACK: Omit<WhatsAppAIConfig, "id"> = {
  auto_reply_enabled: false,
  reply_outside_schedule: true,
  start_time: "09:00",
  end_time: "18:00",
  days_enabled: ["1", "2", "3", "4", "5"],
  training_data: "",
  updated_at: null,
};

async function loadWhatsAppAIConfig(
  supabase: ReturnType<typeof createClient>,
): Promise<{ cfg: (WhatsAppAIConfig | null); ok: boolean }> {
  try {
    const { data, error } = await supabase
      .from("whatsapp_ai_config")
      .select("*")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("❌ Error leyendo whatsapp_ai_config:", error);
      return { cfg: null, ok: false };
    }
    if (!data) {
      console.warn("⚠️ No hay fila en whatsapp_ai_config (cfg=null).");
      return { cfg: null, ok: false };
    }

    const cfg: WhatsAppAIConfig = {
      id: Number(data.id),
      auto_reply_enabled: Boolean(data.auto_reply_enabled),
      reply_outside_schedule: Boolean(data.reply_outside_schedule),
      start_time: safeString(data.start_time) || null,
      end_time: safeString(data.end_time) || null,
      days_enabled: Array.isArray(data.days_enabled) ? data.days_enabled : null,
      training_data: safeString(data.training_data) || null,
      updated_at: data.updated_at ?? null,
    };

    return { cfg, ok: true };
  } catch (e) {
    console.error("❌ Excepción leyendo whatsapp_ai_config:", e);
    return { cfg: null, ok: false };
  }
}

/**
 * Retorna { hhmm, dayId } en TZ Chile.
 * dayId: "1"=Lun .. "7"=Dom
 */
function getChileTimeParts() {
  const now = new Date();

  const hhmm = new Intl.DateTimeFormat("en-GB", {
    timeZone: CHILE_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  const wk = new Intl.DateTimeFormat("en-US", {
    timeZone: CHILE_TZ,
    weekday: "short",
  }).format(now);

  const map: Record<string, string> = {
    Mon: "1",
    Tue: "2",
    Wed: "3",
    Thu: "4",
    Fri: "5",
    Sat: "6",
    Sun: "7",
  };

  return { hhmm, dayId: map[wk] ?? "1" };
}

/**
 * Decide si debe responder automáticamente según config.
 *
 * - auto_reply_enabled debe ser true
 * - Si reply_outside_schedule = false => responde SIEMPRE (cuando enabled)
 * - Si reply_outside_schedule = true => responde SOLO FUERA del horario/días configurados
 */
function shouldAutoReplyNow(cfg: WhatsAppAIConfig | null): boolean {
  if (!cfg) return false;

  if (!cfg.auto_reply_enabled) return false;

  // Si no es "solo fuera del horario", responde siempre
  if (!cfg.reply_outside_schedule) return true;

  // Si es "solo fuera del horario":
  const { hhmm, dayId } = getChileTimeParts();

  const start = (cfg.start_time || "09:00").slice(0, 5);
  const end = (cfg.end_time || "18:00").slice(0, 5);

  const days = Array.isArray(cfg.days_enabled) && cfg.days_enabled.length > 0
    ? cfg.days_enabled
    : ["1", "2", "3", "4", "5"];

  const inEnabledDay = days.includes(dayId);

  // si no es día habilitado => consideramos "fuera" => responder
  if (!inEnabledDay) return true;

  // compara HH:MM lexicográficamente (funciona por ser 2-digit)
  const insideHours = (hhmm >= start && hhmm <= end);

  // “solo fuera del horario”: responde si NO está dentro de horas
  return !insideHours;
}

/**
 * =========================================================
 *  IA: OpenAI (Responses API)
 * =========================================================
 */
function buildSystemPrompt(training: string) {
  // Prompt base + training_data (si viene)
  const base = [
    "Eres el asistente de ventas y soporte de Keloke.cl (Chile).",
    "Objetivo: convertir conversaciones en ventas y resolver dudas rápido.",
    "Tono: español chileno, cercano y profesional (sin flaitería).",
    "Formato: respuestas cortas (máx 3–5 líneas).",
    "Siempre haz 1–2 preguntas para calificar: (qué busca/uso) + (comuna/envío) + (presupuesto si aplica).",
    "No inventes stock ni tiempos exactos si no los tienes; ofrece enviar link oficial y confirmar.",
    "Si preguntan precio: da rango orientativo + ofrece mandar link con precio actualizado.",
    "Cierra con CTA suave: '¿Te mando links y opciones ahora?'",
  ].join(" ");

  const extra = (training || "").trim();
  if (!extra) return base;

  return `${base}\n\nCONTEXTO DE ENTRENAMIENTO (usar como guía, sin contradecir):\n${extra}`;
}

async function generateOpenAIReply(
  userText: string,
  training: string,
): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-5-mini";

  if (!apiKey) {
    console.error("❌ No se encontró OPENAI_API_KEY en Secrets");
    return "Pucha 😅 tuve un tema técnico. ¿Me dices qué producto buscas y tu comuna para enviarte opciones?";
  }

  const system = buildSystemPrompt(training);

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "developer", content: system },
          { role: "user", content: userText },
        ],
        reasoning: { effort: "low" },
        max_output_tokens: 260,
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      console.error("❌ OpenAI error:", res.status, raw);
      return "Te leo 🙌 ¿Qué producto buscas, para qué uso y en qué comuna estás? y te mando opciones al tiro.";
    }

    const data = JSON.parse(raw);
    const text = safeString(data?.output_text)?.trim();
    if (text) return text;

    return "Ya bacán 🙌 ¿Qué producto andas buscando y para qué uso? ¿En qué comuna estás?";
  } catch (err) {
    console.error("❌ Error llamando OpenAI:", err);
    return "Tu mensaje quedó registrado 🙌 pero tuve un drama con la IA. ¿Qué producto buscas y en qué comuna estás?";
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

  console.log("📤 Enviando respuesta a WhatsApp:", JSON.stringify(body));

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

  try {
    const json = JSON.parse(raw);
    console.log("✅ Respuesta WhatsApp OK:", json);
    return json;
  } catch {
    console.log("✅ Respuesta WhatsApp (texto plano):", raw);
    return null;
  }
}

/**
 * =========================================================
 *  MEDIA (INBOUND): media_id -> meta(url) -> binary -> Storage -> publicUrl
 * =========================================================
 */
async function fetchWhatsAppMediaMeta(mediaId: string, accessToken: string) {
  const url = `https://graph.facebook.com/${WA_GRAPH_VERSION}/${mediaId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const raw = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // ignore
  }

  if (!res.ok) {
    console.error("❌ [MEDIA_META] Error:", res.status, raw);
    throw new Error(json?.error?.message || `Media meta failed ${res.status}`);
  }

  if (!json?.url) throw new Error("Media meta sin url");
  return json;
}

async function downloadWhatsAppMediaBinary(
  mediaUrl: string,
  accessToken: string,
) {
  const res = await fetch(mediaUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("❌ [MEDIA_BIN] Error:", res.status, t);
    throw new Error(`Media binary download failed ${res.status}`);
  }

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

  const { error: upErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, blob, {
      contentType: mimeType,
      upsert: false,
    });

  if (upErr) {
    console.error("❌ [STORAGE] Upload error:", upErr);
    throw new Error("No se pudo subir a storage");
  }

  const { data: pub } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filePath);

  const publicUrl = pub?.publicUrl;
  if (!publicUrl) throw new Error("No se pudo obtener publicUrl");
  return publicUrl;
}

type MediaResult = {
  publicUrl: string;
  mimeType: string;
  fileName: string;
  size: number;
  mediaId: string;
};

async function handleInboundMedia(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  messageType: string,
  message: any,
): Promise<MediaResult | null> {
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

  // ✅ ordenado por carpetas
  const fileName = `${messageType}_in_${randomId()}_${mediaId}.${ext}`;
  const filePath = `${messageType}/inbound/${fileName}`;

  const publicUrl = await uploadToStorageAndGetPublicUrl(
    supabase,
    filePath,
    bytes,
    mimeType,
  );

  return {
    publicUrl,
    mimeType,
    fileName,
    size: bytes.length,
    mediaId,
  };
}

/**
 * =========================================================
 *  Server
 * =========================================================
 */
serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // GET verify token (Meta)
  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      const VERIFY_TOKEN =
        Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "keloke_webhook_token";

      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("✅ Webhook verificado correctamente");
        return new Response(challenge ?? "", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }
      return new Response("Forbidden", { status: 403 });
    } catch (e) {
      console.error("❌ Error GET verification:", e);
      return new Response("Error in GET verification", { status: 500 });
    }
  }

  // POST webhook
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("❌ Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
      return jsonResponse({ error: "Missing Supabase secrets" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📥 WEBHOOK RECIBIDO - INICIO PROCESAMIENTO");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const body = await req.json();
    console.log("📦 Body completo:", JSON.stringify(body, null, 2));

    // 0) Cargar config IA real
    const { cfg: aiCfg, ok: aiOk } = await loadWhatsAppAIConfig(supabase);
    if (aiOk) {
      console.log("🤖 whatsapp_ai_config cargado:", {
        id: aiCfg?.id,
        auto_reply_enabled: aiCfg?.auto_reply_enabled,
        reply_outside_schedule: aiCfg?.reply_outside_schedule,
        start_time: aiCfg?.start_time,
        end_time: aiCfg?.end_time,
        days_enabled: aiCfg?.days_enabled,
      });
    } else {
      console.log("⚠️ No se pudo cargar whatsapp_ai_config (o no hay fila).");
    }

    // 1) Buscar conexión WhatsApp activa
    console.log("🟢 PASO 1: Buscando conexión de WhatsApp...");
    const { data: connection, error: connError } = await supabase
      .from("social_connections")
      .select("*")
      .eq("platform", "whatsapp")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (connError || !connection) {
      console.error("❌ ERROR: No se encontró conexión WhatsApp activa");
      return jsonResponse(
        {
          error: "No WhatsApp connection found (platform=whatsapp, is_active=true)",
          details: connError ?? null,
        },
        500,
      );
    }

    const accessToken = safeString(connection.access_token);
    const phoneNumberId = safeString(connection.phone_number_id);

    if (!accessToken || !phoneNumberId) {
      console.error("❌ Conexión incompleta: falta access_token o phone_number_id");
      return jsonResponse(
        { error: "WhatsApp connection missing access_token/phone_number_id" },
        500,
      );
    }

    console.log("✅ Conexión encontrada:", {
      id: connection.id,
      platform: connection.platform,
      is_active: connection.is_active,
    });

    // 2) Procesar entradas
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;

        // 2A) Mensajes entrantes
        if (value?.messages) {
          for (const message of value.messages) {
            console.log("📨 Procesando mensaje:", message);

            const fromPhone = safeString(message.from);
            const messageType = safeString(message.type);
            const messageId = safeString(message.id);
            const timestamp = safeString(message.timestamp);

            if (!fromPhone || !messageId || !messageType) continue;

            // ✅ Idempotencia: si ya guardamos este inbound, saltar
            const { data: existingMsg } = await supabase
              .from("whatsapp_messages")
              .select("id")
              .eq("whatsapp_message_id", messageId)
              .eq("direction", "inbound")
              .limit(1)
              .maybeSingle();

            if (existingMsg?.id) {
              console.log("⏭️ Ya existe inbound, salto:", messageId);
              continue;
            }

            // Contacto
            const lastMessageAt = timestamp
              ? new Date(parseInt(timestamp) * 1000).toISOString()
              : new Date().toISOString();

            const { data: existingContact, error: contactSelectError } =
              await supabase
                .from("whatsapp_contacts")
                .select("*")
                .eq("phone_number", fromPhone)
                .maybeSingle();

            if (contactSelectError) {
              console.error("❌ Error buscando contacto:", contactSelectError);
            }

            if (!existingContact) {
              const name =
                safeString(value?.contacts?.[0]?.profile?.name) || fromPhone;
              const { error: insertContactError } = await supabase
                .from("whatsapp_contacts")
                .insert({
                  phone_number: fromPhone,
                  contact_name: name,
                  last_message_at: lastMessageAt,
                });

              if (insertContactError) {
                console.error("❌ Error creando contacto:", insertContactError);
              }
            } else {
              const { error: updateContactError } = await supabase
                .from("whatsapp_contacts")
                .update({ last_message_at: lastMessageAt })
                .eq("phone_number", fromPhone);

              if (updateContactError) {
                console.error("❌ Error actualizando contacto:", updateContactError);
              }
            }

            // Construir data inbound base
            const messageData: any = {
              phone_number: fromPhone,
              direction: "inbound",
              status: "received",
              whatsapp_message_id: messageId,
              message_type: messageType,
              platform_response: message,
            };

            // Texto
            if (messageType === "text") {
              messageData.message = safeString(message.text?.body) || "";
            } else {
              // caption si aplica
              let caption = "";
              if (messageType === "image") caption = safeString(message?.image?.caption);
              if (messageType === "video") caption = safeString(message?.video?.caption);
              if (messageType === "document") caption = safeString(message?.document?.caption);
              messageData.message = caption || `Mensaje de tipo ${messageType} recibido`;
            }

            // ✅ MEDIA inbound completo
            if (
              messageType === "audio" ||
              messageType === "image" ||
              messageType === "video" ||
              messageType === "document" ||
              messageType === "sticker"
            ) {
              try {
                console.log("🎯 [MEDIA] Detectado tipo:", messageType);

                const media = await handleInboundMedia(
                  supabase,
                  accessToken,
                  messageType,
                  message,
                );

                if (media) {
                  messageData.media_url = media.publicUrl;
                  messageData.media_mime_type = media.mimeType;
                  messageData.media_filename = media.fileName;
                  messageData.media_size = media.size;
                  messageData.media_id = media.mediaId;

                  messageData.platform_response = {
                    ...messageData.platform_response,
                    _media: {
                      media_id: media.mediaId,
                      public_url: media.publicUrl,
                      mime_type: media.mimeType,
                      filename: media.fileName,
                      size: media.size,
                    },
                  };

                  console.log("✅ [MEDIA] Subido OK:", media.publicUrl);
                } else {
                  console.warn("⚠️ [MEDIA] No se encontró media_id en payload");
                }
              } catch (e) {
                console.error("❌ [MEDIA] Error procesando media:", e);
                messageData.message = `Mensaje de tipo ${messageType} recibido (media error)`;
              }
            }

            // Guardar inbound
            const { data: insertedInbound, error: inboundErr } = await supabase
              .from("whatsapp_messages")
              .insert(messageData)
              .select();

            if (inboundErr) {
              console.error("❌ Error guardando inbound:", inboundErr);
            } else {
              console.log("✅ Inbound guardado:", insertedInbound?.[0]?.id);
            }

            /**
             * 2B) Responder SOLO si:
             * - es texto
             * - cfg auto_reply_enabled=true
             * - y cumple regla de horario según reply_outside_schedule
             */
            if (messageType === "text") {
              const userText = (messageData.message || "").trim();
              if (!userText) continue;

              // Fallback si no hay config: NO respondemos automático
              const effectiveCfg: WhatsAppAIConfig = aiCfg ?? {
                id: 0,
                ...AI_FALLBACK,
              };

              const canReply = shouldAutoReplyNow(effectiveCfg);

              if (!effectiveCfg.auto_reply_enabled) {
                console.log("⏸️ IA desactivada (auto_reply_enabled=false). No respondo automático.");
                continue;
              }

              if (!canReply) {
                const { hhmm, dayId } = getChileTimeParts();
                console.log("🕒 Dentro de horario/día configurado (reply_outside_schedule=true). No respondo automático.", {
                  chile_time: hhmm,
                  chile_day: dayId,
                  start_time: effectiveCfg.start_time,
                  end_time: effectiveCfg.end_time,
                  days_enabled: effectiveCfg.days_enabled,
                });
                continue;
              }

              const training = (effectiveCfg.training_data || "").trim();

              console.log("🤖 Llamando OpenAI…", { model: Deno.env.get("OPENAI_MODEL") ?? "gpt-5-mini" });
              const aiReply = await generateOpenAIReply(userText, training);
              console.log("💬 IA Reply:", aiReply);

              const waResponse = await sendWhatsAppTextReply(
                fromPhone,
                aiReply,
                accessToken,
                phoneNumberId,
              );

              const outboundData: any = {
                phone_number: fromPhone,
                direction: "outbound",
                status: "sent",
                whatsapp_message_id: waResponse?.messages?.[0]?.id ?? null,
                message_type: "text",
                message: aiReply,
                platform_response: waResponse,
              };

              const { error: outboundErr } = await supabase
                .from("whatsapp_messages")
                .insert(outboundData);

              if (outboundErr) console.error("❌ Error guardando outbound:", outboundErr);
              else console.log("✅ Outbound guardado");
            }
          }
        }

        // 2C) Status updates (delivered, read, etc.)
        if (value?.statuses) {
          for (const status of value.statuses) {
            const stId = safeString(status?.id);
            const stVal = safeString(status?.status);
            if (!stId || !stVal) continue;

            await supabase
              .from("whatsapp_messages")
              .update({ status: stVal } as any)
              .eq("whatsapp_message_id", stId);

            console.log("📊 Status update:", stId, stVal);
          }
        }
      }
    }

    // 3) Forward a Nerd (sin loop infinito)
    try {
      const forwarded = safeString(req.headers.get("X-Forwarded-From"));

      const thisUrl = new URL(req.url);
      const thisCanonical = `${thisUrl.origin}${thisUrl.pathname}`;
      const nerdCanonical = safeString(NERD_WEBHOOK_URL);

      const sameUrl = nerdCanonical === thisCanonical;

      if (!forwarded && !sameUrl && nerdCanonical) {
        await fetch(nerdCanonical, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-From": "keloke-panel",
          },
          body: JSON.stringify(body),
        });
        console.log("✓ Webhook reenviado a Nerd correctamente");
      } else {
        console.log("⏭️ Skip forward a Nerd (evitando loop)", { forwarded, sameUrl });
      }
    } catch (error) {
      console.error("❌ Error reenviando webhook a Nerd:", error);
    }

    return jsonResponse({ success: true }, 200);
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    return jsonResponse({ error: String((error as any)?.message ?? error) }, 500);
  }
});
