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
 *  IA SETTINGS (toggle + horario + contexto)
 * =========================================================
 *
 * Tabla esperada: public.whatsapp_ai_settings (1 fila)
 * Fallback: si no existe tabla o falla query -> se comporta como antes.
 */
type AiSettings = {
  is_enabled: boolean;
  only_outside_hours: boolean;
  start_time: string | null; // "HH:MM:SS"
  end_time: string | null;
  days: number[] | null; // 1=Lun ... 7=Dom
  training_context: string | null;
  provider: string; // "openai" | "claude"
  model: string; // "gpt-5-mini"
};

function isWithinScheduleLocal(
  onlyOutside: boolean,
  start: string | null,
  end: string | null,
  days: number[] | null,
) {
  // Nota: esto usa la hora local del runtime (Edge).
  // Si quieres 100% Chile, se puede hacer con TZ fijo + librería, pero esto es suficiente para operar.
  const now = new Date();
  const dayJs = now.getDay(); // 0=Dom ... 6=Sab
  const dayIso = dayJs === 0 ? 7 : dayJs; // 1=Lun ... 7=Dom

  if (Array.isArray(days) && days.length > 0 && !days.includes(dayIso)) {
    return false;
  }

  if (!start || !end) return true; // sin horario configurado => permitido

  const [sh, sm] = start.split(":").map((x) => parseInt(x, 10));
  const [eh, em] = end.split(":").map((x) => parseInt(x, 10));

  const startMin = (sh || 0) * 60 + (sm || 0);
  const endMin = (eh || 0) * 60 + (em || 0);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const inRange = startMin <= endMin
    ? (nowMin >= startMin && nowMin <= endMin)
    : (nowMin >= startMin || nowMin <= endMin); // cruza medianoche

  return onlyOutside ? !inRange : inRange;
}

async function loadAiSettings(
  supabase: ReturnType<typeof createClient>,
): Promise<{ settings: AiSettings; ok: boolean }> {
  const fallback: AiSettings = {
    is_enabled: true, // fallback para NO romper comportamiento anterior
    only_outside_hours: false,
    start_time: null,
    end_time: null,
    days: null,
    training_context: null,
    provider: (Deno.env.get("IA_PROVIDER") ?? "openai").toLowerCase(),
    model: Deno.env.get("OPENAI_MODEL") ?? "gpt-5-mini",
  };

  try {
    const { data, error } = await supabase
      .from("whatsapp_ai_settings")
      .select("*")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      console.warn("⚠️ No se pudo leer whatsapp_ai_settings (fallback).", error);
      return { settings: fallback, ok: false };
    }

    const settings: AiSettings = {
      is_enabled: Boolean(data.is_enabled),
      only_outside_hours: Boolean(data.only_outside_hours),
      start_time: data.start_time ?? null,
      end_time: data.end_time ?? null,
      days: Array.isArray(data.days) ? data.days : null,
      training_context: data.training_context ?? null,
      provider: safeString(data.provider || fallback.provider).toLowerCase(),
      model: safeString(data.model || fallback.model) || "gpt-5-mini",
    };

    return { settings, ok: true };
  } catch (e) {
    console.warn("⚠️ Excepción leyendo whatsapp_ai_settings (fallback).", e);
    return { settings: fallback, ok: false };
  }
}

/**
 * =========================================================
 *  IA: OpenAI (principal) + Claude (opcional)
 * =========================================================
 */
async function generateOpenAIReply(userText: string, modelOverride?: string): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const model = modelOverride || (Deno.env.get("OPENAI_MODEL") ?? "gpt-5-mini");

  if (!apiKey) {
    console.error("❌ No se encontró OPENAI_API_KEY en Secrets");
    return "Pucha 😅 tuve un tema técnico. ¿Me dices qué producto buscas y te ayudo al tiro?";
  }

  const system = [
    "Eres el asistente de soporte y ventas de la tienda online Keloke.cl.",
    "Responde en español chileno, cercano, breve (máx 3–4 líneas).",
    "Haz 1–2 preguntas para entender necesidad (uso, presupuesto, comuna/envío/tiempo).",
    "Sugiere 1–2 opciones y ofrece mandar links de productos.",
    "Si te piden 'qué venden' da categorías y pregunta qué busca.",
    "No inventes stock específico si no se te dio; ofrece revisar y mandar links.",
    "Si el cliente pide precio, da rango/estimación y ofrece link exacto.",
    "Cierra con CTA suave: '¿Te mando links y opciones ahora?'",
  ].join(" ");

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
        max_output_tokens: 240,
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      console.error("❌ OpenAI error:", res.status, raw);
      return "Te leo 🙌 ¿Qué producto buscas y tu presupuesto aprox? y te mando opciones al tiro.";
    }

    const data = JSON.parse(raw);
    const text = safeString(data?.output_text)?.trim();
    if (text) return text;

    return "Ya bacán 🙌 ¿Qué producto andas buscando (y para qué uso)? Si quieres te mando links al tiro.";
  } catch (err) {
    console.error("❌ Error llamando OpenAI:", err);
    return "Tu mensaje quedó registrado 🙌 pero tuve un drama con la IA. ¿Qué producto buscas y en qué comuna estás?";
  }
}

async function generateClaudeReply(userText: string): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-3-5-sonnet-20240620";

  if (!apiKey) {
    console.error("❌ No se encontró ANTHROPIC_API_KEY en Secrets");
    return "Pucha 😅 tuve un tema técnico. ¿Qué producto buscas y te ayudo al tiro?";
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 260,
        messages: [
          {
            role: "user",
            content:
              `Eres el asistente de soporte y ventas de la tienda online Keloke.cl. ` +
              `Responde en español chileno, cercano, breve (máx 3-4 líneas), ` +
              `haz 1-2 preguntas para entender y ofrece mandar links.\n\n` +
              `Mensaje del cliente (WhatsApp): "${userText}"`,
          },
        ],
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      console.error("❌ Error respuesta Claude:", response.status, raw);
      return "Te leo 🙌 ¿Me dices qué producto buscas y tu presupuesto aprox? y te mando opciones.";
    }

    const data = JSON.parse(raw);
    const text = safeString(data?.content?.[0]?.text)?.trim();
    return text || "Gracias por escribirnos 🙌 ¿Qué andas buscando? Si quieres te mando links al tiro.";
  } catch (error) {
    console.error("❌ Error llamando a Claude:", error);
    return "Tu mensaje ya quedó registrado 🙌, pero tuve un problema con la IA. ¿Qué producto buscas?";
  }
}

async function generateAIReply(userText: string, provider: string, model: string): Promise<string> {
  const p = (provider || "openai").toLowerCase();
  if (p === "claude") return await generateClaudeReply(userText);
  // ✅ OpenAI por defecto, con modelo configurable (gpt-5-mini)
  return await generateOpenAIReply(userText, model || "gpt-5-mini");
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

    // 0) Cargar settings IA (si existe tabla)
    const { settings: aiSettings, ok: aiSettingsOk } = await loadAiSettings(supabase);
    if (aiSettingsOk) console.log("🤖 IA settings cargados desde DB");
    else console.log("🤖 IA settings fallback (DB no disponible o sin tabla)");

    const canAnswerBySchedule = isWithinScheduleLocal(
      aiSettings.only_outside_hours,
      aiSettings.start_time,
      aiSettings.end_time,
      aiSettings.days,
    );

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

            // 2B) Responder SOLO si es texto, IA habilitada y horario permitido
            if (messageType === "text") {
              const userText = (messageData.message || "").trim();
              if (!userText) continue;

              if (!aiSettings.is_enabled) {
                console.log("⏸️ IA desactivada (is_enabled=false). No respondo automático.");
                continue;
              }

              if (!canAnswerBySchedule) {
                console.log("🕒 Fuera de ventana configurada. No respondo automático.");
                continue;
              }

              const training = (aiSettings.training_context || "").trim();
              const prompt = training
                ? `CONTEXTO DEL NEGOCIO:\n${training}\n\nMENSAJE CLIENTE:\n${userText}`
                : userText;

              console.log("🤖 Llamando IA…", { provider: aiSettings.provider, model: aiSettings.model });
              const aiReply = await generateAIReply(prompt, aiSettings.provider, aiSettings.model);
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

            // ✅ No asumimos columnas extra: solo actualizamos "status"
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
