// Supabase Edge Function: whatsapp-webhook
// Deno runtime

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type WAWebhook = any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
const META_WHATSAPP_TOKEN = Deno.env.get("META_WHATSAPP_TOKEN") || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders, ...extraHeaders },
  });
}

function text(body: string, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...corsHeaders, ...extraHeaders },
  });
}

function nowISO() {
  return new Date().toISOString();
}

function normalizePhone(s: string) {
  // WhatsApp Cloud "from" viene como "569xxxxxxxx"
  return (s || "").replace(/[^\d]/g, "");
}

async function getActiveConnectionByPhoneNumberId(phoneNumberId: string) {
  // social_connections: platform, phone_number_id, waba_id, access_token, is_active
  const { data, error } = await supabase
    .from("social_connections")
    .select("*")
    .eq("platform", "whatsapp")
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("DB social_connections error:", error);
    return null;
  }
  return data || null;
}

async function upsertContact(waId: string, contactName?: string) {
  const phone = normalizePhone(waId);
  if (!phone) return;

  // whatsapp_contacts: phone_number, contact_name, last_message_at, updated_at
  const payload: any = {
    phone_number: phone,
    updated_at: nowISO(),
  };
  if (contactName) payload.contact_name = contactName;

  const { error } = await supabase
    .from("whatsapp_contacts")
    .upsert(payload, { onConflict: "phone_number" });

  if (error) console.error("upsertContact error:", error);
}

async function insertMessage(row: any) {
  const { error } = await supabase.from("whatsapp_messages").insert(row);
  if (error) console.error("insertMessage error:", error, row);
}

async function getAIConfig() {
  // whatsapp_ai_config: auto_reply_enabled, reply_outside_schedule, start_time, end_time, days_enabled, training_data, ai_model, ai_provider
  const { data, error } = await supabase
    .from("whatsapp_ai_config")
    .select("*")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getAIConfig error:", error);
    return null;
  }
  return data || null;
}

function withinScheduleChile(cfg: any) {
  // Si reply_outside_schedule = true => siempre responde
  if (!cfg) return true;
  if (cfg.reply_outside_schedule === true) return true;

  // Si no hay horas definidas, responde igual
  if (!cfg.start_time || !cfg.end_time) return true;

  // Días: cfg.days_enabled puede venir como array de strings ("1".."7") o nombres ("mon"...)
  const tz = "America/Santiago";
  const dt = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(dt);

  const weekday = parts.find((p) => p.type === "weekday")?.value?.toLowerCase() || "";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);

  const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  const start = String(cfg.start_time).slice(0, 5);
  const end = String(cfg.end_time).slice(0, 5);

  // days_enabled puede ser ["mon","tue",...] o ["1","2"...]
  const days = Array.isArray(cfg.days_enabled) ? cfg.days_enabled : [];
  const weekdayMap: Record<string, string> = {
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
    sun: "sun",
  };

  const okDay =
    days.length === 0 ||
    days.includes(weekday) ||
    days.includes(weekdayMap[weekday]) ||
    // soporte "1..7" (1=lun ... 7=dom)
    (() => {
      const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
      const idx = order.indexOf(weekday.slice(0, 3));
      if (idx < 0) return false;
      return days.includes(String(idx + 1));
    })();

  const okTime = hhmm >= start && hhmm <= end;

  return okDay && okTime;
}

async function getConversation(waId: string) {
  const phone = normalizePhone(waId);
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("phone_number", phone)
    .maybeSingle();
  if (error) {
    console.error("getConversation error:", error);
    return null;
  }
  return data || null;
}

async function upsertConversation(waId: string, patch: any) {
  const phone = normalizePhone(waId);
  const payload = { phone_number: phone, updated_at: nowISO(), ...patch };
  const { error } = await supabase
    .from("whatsapp_conversations")
    .upsert(payload, { onConflict: "phone_number" });
  if (error) console.error("upsertConversation error:", error);
}

function extractBudgetLukas(text: string): number | null {
  const t = (text || "").toLowerCase();
  // "90 lucas", "90lks", "90000", "90.000"
  const m1 = t.match(/(\d{1,3}(?:[.,]\d{3})+|\d{1,6})\s*(lucas|lks|luca)?/i);
  if (!m1) return null;
  const raw = m1[1].replace(/\./g, "").replace(/,/g, "");
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;

  // Si escribió "90 lucas" => 90000
  if ((m1[2] || "").toLowerCase().includes("luc")) return n * 1000;
  // Si puso 90000 => ok
  return n;
}

async function waSendText(phoneNumberId: string, toWaId: string, body: string, accessToken: string) {
  const url = `https://graph.facebook.com/v24.0/${phoneNumberId}/messages`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(toWaId),
      type: "text",
      text: { body },
    }),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error("WA send failed:", resp.status, json);
    throw new Error(`WA send failed ${resp.status}`);
  }
  return json;
}

async function fetchMediaUrl(mediaId: string, accessToken: string) {
  // 1) get media url
  const meta = await fetch(`https://graph.facebook.com/v24.0/${mediaId}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  }).then((r) => r.json());

  if (!meta?.url) return null;

  // 2) download binary
  const fileResp = await fetch(meta.url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!fileResp.ok) return null;

  const contentType = fileResp.headers.get("content-type") || "application/octet-stream";
  const bytes = new Uint8Array(await fileResp.arrayBuffer());
  return { bytes, contentType };
}

async function saveToStorage(mediaId: string, bytes: Uint8Array, contentType: string) {
  const ext = (() => {
    if (contentType.includes("jpeg")) return "jpg";
    if (contentType.includes("png")) return "png";
    if (contentType.includes("webp")) return "webp";
    if (contentType.includes("mp4")) return "mp4";
    if (contentType.includes("mpeg")) return "mp3";
    if (contentType.includes("ogg")) return "ogg";
    if (contentType.includes("pdf")) return "pdf";
    return "bin";
  })();

  const path = `wa/${mediaId}.${ext}`;
  const bucket = "whatsapp-media";

  // upload (upsert)
  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: true });

  if (upErr) {
    console.error("storage upload error:", upErr);
    return null;
  }

  // signed url (7 días)
  const { data: signed, error: signErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (signErr) {
    console.error("signed url error:", signErr);
    return null;
  }

  return signed.signedUrl || null;
}

async function buildAndSendAIReply(params: {
  phoneNumberId: string;
  waId: string;
  accessToken: string;
  aiCfg: any;
}) {
  const { phoneNumberId, waId, accessToken, aiCfg } = params;

  // Estado conversacional (evita loops)
  const conv = await getConversation(waId) || {};
  const state = conv.state || "NEW";
  const product = conv.product || null;
  const budget = conv.budget || null;
  const comuna = conv.comuna || null;

  // Si ya se mandó oferta recientemente, no spamear
  const lastOfferAt = conv.last_offer_at ? new Date(conv.last_offer_at).getTime() : 0;
  const recentlyOffered = lastOfferAt && (Date.now() - lastOfferAt < 1000 * 60 * 10);

  // Tomamos el último inbound del usuario para avanzar
  const { data: lastMsg } = await supabase
    .from("whatsapp_messages")
    .select("message_content, message_type, created_at")
    .eq("phone_number", normalizePhone(waId))
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1);

  const userText = (lastMsg?.[0]?.message_content || "").trim();

  // Flujo determinista (no IA) para capturar variables clave
  if (!product) {
    await upsertConversation(waId, { state: "ASK_PRODUCT" });
    await waSendText(phoneNumberId, waId, "Te leo 🙌 ¿Qué producto buscas?", accessToken);
    return;
  }

  if (!budget) {
    const b = extractBudgetLukas(userText);
    if (b) {
      await upsertConversation(waId, { budget: b, state: "ASK_COMUNA" });
      await waSendText(phoneNumberId, waId, "Perfecto 🙌 ¿En qué comuna estás? (para estimar entrega/tiempos)", accessToken);
      return;
    }
    await upsertConversation(waId, { state: "ASK_BUDGET" });
    await waSendText(phoneNumberId, waId, "Perfecto 🙌 ¿Cuál es tu presupuesto aprox (en lucas)?", accessToken);
    return;
  }

  if (!comuna) {
    const c = userText;
    if (c.length >= 3) {
      await upsertConversation(waId, { comuna: c, state: "READY_TO_OFFER" });
      await waSendText(phoneNumberId, waId, "Perfecto 🙌 Dame 10 segundos y te mando 2 opciones con link.", accessToken);
      // sigue a oferta en la misma ejecución (sin esperar otro mensaje)
    } else {
      await upsertConversation(waId, { state: "ASK_COMUNA" });
      await waSendText(phoneNumberId, waId, "¿En qué comuna estás?", accessToken);
      return;
    }
  }

  // Oferta (2 links) sin depender de Shopify API (cero riesgo). Links directos a búsqueda Keloke.
  const finalConv = await getConversation(waId) || {};
  const p = finalConv.product || product;
  const b = finalConv.budget || budget;
  const co = finalConv.comuna || comuna;

  if ((finalConv.state === "READY_TO_OFFER" || state === "READY_TO_OFFER") && !recentlyOffered) {
    const q = encodeURIComponent(String(p));
    const link1 = `https://keloke.cl/search?q=${q}`;
    const link2 = `https://keloke.cl/collections/all?filter.v.price.gte=0&filter.v.price.lte=${encodeURIComponent(String(b))}&q=${q}`;

    const msg =
      `Listo 🙌\n\n` +
      `Producto: *${p}*\nPresupuesto: *$${Number(b).toLocaleString("es-CL")}*\nComuna: *${co}*\n\n` +
      `✅ Opción 1 (búsqueda directa):\n${link1}\n\n` +
      `✅ Opción 2 (filtrada por presupuesto):\n${link2}\n\n` +
      `Si me dices *color / tamaño / uso* te afino y te mando la mejor al tiro.`;

    await waSendText(phoneNumberId, waId, msg, accessToken);
    await upsertConversation(waId, { state: "OFFER_SENT", last_offer_at: nowISO() });
    return;
  }

  // Si está OFFER_SENT o se necesita respuesta “humana”, usar IA para no quedar pegado.
  if (!OPENAI_API_KEY || !aiCfg?.auto_reply_enabled) return;

  if (!withinScheduleChile(aiCfg)) return;

  const training = (aiCfg.training_data || "").trim();
  const system =
    `Eres el asistente de ventas y soporte de Keloke.cl (Chile). ` +
    `Responde en español chileno, corto y claro. ` +
    `Objetivo: convertir a compra enviando 2 opciones con link cuando tengas producto+presupuesto+comuna. ` +
    `Nunca repitas la misma pregunta si ya está respondida.\n\n` +
    (training ? `Contexto adicional:\n${training}\n\n` : "");

  // Contexto: últimos 12 mensajes (inbound/outbound)
  const { data: hist } = await supabase
    .from("whatsapp_messages")
    .select("direction, message_content, message_type, created_at")
    .eq("phone_number", normalizePhone(waId))
    .order("created_at", { ascending: false })
    .limit(12);

  const messages = (hist || []).reverse().map((m: any) => {
    const role = m.direction === "inbound" ? "user" : "assistant";
    const content =
      m.message_type === "text"
        ? (m.message_content || "")
        : `[${m.message_type || "media"}] ${m.message_content || ""}`.trim();
    return { role, content };
  });

  // Llamada OpenAI Responses API (simple)
  const oaiResp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: aiCfg.ai_model || OPENAI_MODEL,
      input: [
        { role: "system", content: system },
        ...messages,
      ],
      // para que no se alargue infinito
      max_output_tokens: 220,
    }),
  });

  const oaiJson = await oaiResp.json().catch(() => ({}));
  const outText =
    oaiJson?.output?.[0]?.content?.[0]?.text ||
    oaiJson?.output_text ||
    "";

  if (oaiResp.ok && outText?.trim()) {
    await waSendText(phoneNumberId, waId, outText.trim(), accessToken);
    return;
  }

  console.error("OpenAI error:", oaiResp.status, oaiJson);
}

// MAIN HANDLER
Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const url = new URL(req.url);

    // 1) Webhook verification (Meta GET)
    if (req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && challenge) {
        if (token && token === WHATSAPP_VERIFY_TOKEN) {
          return text(challenge, 200);
        }
        // Esto es EXACTAMENTE tu 403 actual: token no calza con el que el código espera.
        return text("Forbidden", 403);
      }

      return text("ok", 200);
    }

    if (req.method !== "POST") return text("Method Not Allowed", 405);

    const payload: WAWebhook = await req.json().catch(() => null);
    if (!payload) return json({ ok: false, error: "invalid_json" }, 400);

    // Meta manda "statuses" y "messages"
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value || {};
    const metadata = value?.metadata || {};
    const phoneNumberId = String(metadata?.phone_number_id || "");
    const wabaId = String(metadata?.phone_number_id ? (metadata?.waba_id || "") : (metadata?.waba_id || ""));

    // Si no hay phone_number_id, no podemos contestar
    if (!phoneNumberId) {
      console.error("No phone_number_id in payload:", payload);
      return json({ ok: true }, 200);
    }

    // Buscar access_token para este phone_number_id
    const conn = await getActiveConnectionByPhoneNumberId(phoneNumberId);
    const accessToken = (conn?.access_token as string) || META_WHATSAPP_TOKEN;

    // Guardar statuses si llegan (opcional)
    if (Array.isArray(value?.statuses) && value.statuses.length) {
      // Si quieres persistirlos, aquí.
    }

    const messages = value?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      // Acknowledge
      return json({ ok: true }, 200);
    }

    // Nombre de contacto si viene
    const contacts = value?.contacts;
    const contactName = contacts?.[0]?.profile?.name;

    const aiCfg = await getAIConfig();

    for (const m of messages) {
      const waId = normalizePhone(m.from || "");
      if (!waId) continue;

      await upsertContact(waId, contactName);

      const msgType = m.type || "unknown";
      let messageContent: string | null = null;
      let mediaUrl: string | null = null;
      let mediaMime: string | null = null;
      let mediaId: string | null = null;
      let caption: string | null = null;

      if (msgType === "text") {
        messageContent = m.text?.body ?? null;
      } else if (msgType === "image") {
        mediaId = m.image?.id ?? null;
        caption = m.image?.caption ?? null;
        messageContent = caption || "[image]";
      } else if (msgType === "video") {
        mediaId = m.video?.id ?? null;
        caption = m.video?.caption ?? null;
        messageContent = caption || "[video]";
      } else if (msgType === "audio") {
        mediaId = m.audio?.id ?? null;
        messageContent = "[audio]";
      } else if (msgType === "document") {
        mediaId = m.document?.id ?? null;
        caption = m.document?.caption ?? null;
        const filename = m.document?.filename ?? null;
        messageContent = caption || filename || "[document]";
      } else {
        messageContent = `[${msgType}]`;
      }

      // Si es media, bajar y subir a Storage para que la app tenga URL real (no “encabezado”)
      if (mediaId && accessToken) {
        const downloaded = await fetchMediaUrl(mediaId, accessToken);
        if (downloaded?.bytes) {
          mediaMime = downloaded.contentType || null;
          const signedUrl = await saveToStorage(mediaId, downloaded.bytes, downloaded.contentType);
          if (signedUrl) mediaUrl = signedUrl;
        }
      }

      // Persistir inbound message
      await insertMessage({
        from_number: waId,
        to_number: null,
        message_type: msgType,
        message_content: messageContent,
        media_url: mediaUrl,
        direction: "inbound",
        timestamp: new Date((m.timestamp ? parseInt(m.timestamp, 10) : Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        phone_number: waId,
        status: "received",
        whatsapp_message_id: m.id || null,
        message: messageContent,
        platform_response: null,
        media_mime_type: mediaMime,
        media_filename: m.document?.filename ?? null,
        media_size: null,
        caption: caption,
        media_duration: null,
        created_at: nowISO(),
        updated_at: nowISO(),
        media_sha256: null,
        contact_name: contactName || null,
        is_read: false,
        media_id: mediaId,
        platform_response_status: null,
      });

      // Actualizar conversación determinista
      const conv = await getConversation(waId) || {};
      if (!conv.product) {
        // si el usuario mandó texto “normal”, usarlo como producto
        if (msgType === "text" && messageContent && messageContent.length >= 2) {
          await upsertConversation(waId, { product: messageContent.trim(), state: "ASK_BUDGET" });
        }
      } else if (!conv.budget && msgType === "text" && messageContent) {
        const b = extractBudgetLukas(messageContent);
        if (b) await upsertConversation(waId, { budget: b, state: "ASK_COMUNA" });
      } else if (conv.product && conv.budget && !conv.comuna && msgType === "text" && messageContent) {
        if (messageContent.trim().length >= 3) await upsertConversation(waId, { comuna: messageContent.trim(), state: "READY_TO_OFFER" });
      }

      // Responder (IA + flujo)
      if (aiCfg?.auto_reply_enabled && accessToken) {
        await buildAndSendAIReply({
          phoneNumberId,
          waId,
          accessToken,
          aiCfg,
        });
      }
    }

    return json({ ok: true }, 200);
  } catch (e) {
    console.error("Fatal error:", e);
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
