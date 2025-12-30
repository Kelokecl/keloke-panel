// Supabase Edge Function: whatsapp-webhook
// Deno runtime

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type WAWebhook = any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";

// ⚠️ Este token NO es obligatorio si social_connections tiene access_token.
// Lo dejamos solo como "último respaldo".
const META_WHATSAPP_TOKEN = Deno.env.get("META_WHATSAPP_TOKEN") || "";

// OpenAI (para conversación natural post-oferta)
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
  return (s || "").replace(/[^\d]/g, "");
}

async function getActiveConnectionByPhoneNumberId(phoneNumberId: string) {
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
  if (!cfg) return true;
  if (cfg.reply_outside_schedule === true) return true;
  if (!cfg.start_time || !cfg.end_time) return true;

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

  const days = Array.isArray(cfg.days_enabled) ? cfg.days_enabled : [];
  const okDay =
    days.length === 0 ||
    days.includes(weekday) ||
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

/**
 * ✅ FIX CRÍTICO:
 * No confundimos números del producto ("+ 20 rollos") con presupuesto.
 * Solo aceptamos presupuesto si:
 *  - viene con "$", o
 *  - viene con "lucas/lks/luca", o
 *  - viene con "k" (90k), o
 *  - el texto tiene palabra "presupuesto", "hasta", "máximo", "max", "dispongo"
 *  - o es un número "grande" (>= 1000) sin contexto raro.
 */
function extractBudgetCLP(text: string): number | null {
  const t = (text || "").toLowerCase().trim();
  if (!t) return null;

  // si el mensaje parece ser descripción de producto/pack con "rollos", no tomamos números chicos
  const looksLikeProductQty = /rollo|rollos|pack|unidad|unidades|x\s*\d+|\+\s*\d+/.test(t);

  const hasBudgetIntent = /presupuesto|hasta|maximo|máximo|dispongo|puedo pagar|mi tope|tope|cuanto vale|precio/.test(t);
  const hasMoneyMark = /\$/.test(t);
  const hasLucas = /\b(lucas|luca|lks)\b/.test(t);
  const hasK = /\b\d+\s*k\b/.test(t);

  // 90k / 90 k
  const mk = t.match(/\b(\d{1,3})\s*k\b/);
  if (mk) return parseInt(mk[1], 10) * 1000;

  // $90.000 / $90000 / 90.000 (si hay intención de presupuesto)
  const mMoney = t.match(/\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{3,6})/);
  if (!mMoney) return null;

  let n = parseInt(mMoney[1].replace(/\./g, "").replace(/,/g, ""), 10);
  if (!Number.isFinite(n) || n <= 0) return null;

  // 90 lucas -> 90000
  const mLucas = t.match(/\b(\d{1,3})\s*(lucas|luca|lks)\b/);
  if (mLucas) return parseInt(mLucas[1], 10) * 1000;

  // Si es número chico (ej 20) y parece cantidad de producto, lo ignoramos
  if (n < 1000 && looksLikeProductQty && !hasMoneyMark && !hasLucas && !hasK && !hasBudgetIntent) {
    return null;
  }

  // Si no hay señal de dinero y el número es chico, pedimos confirmación
  if (n < 1000 && !hasMoneyMark && !hasLucas && !hasK && !hasBudgetIntent) {
    return null;
  }

  return n;
}

function extractProductFromMessage(text: string): string | null {
  const s = (text || "").trim();
  if (!s) return null;

  // Si viene URL de producto Keloke, extraemos el handle para guardarlo limpio
  const m = s.match(/keloke\.cl\/products\/([a-z0-9\-]+)/i);
  if (m?.[1]) return `handle:${m[1]}`;

  // Si viene “Hola tengo una consulta sobre: X”, nos quedamos con X
  const m2 = s.match(/consulta\s+sobre:\s*(.+)$/i);
  if (m2?.[1]) return m2[1].trim().slice(0, 120);

  // Si es texto normal, lo dejamos pero recortado
  return s.slice(0, 120);
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

  const j = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error("WA send failed:", resp.status, j);
    throw new Error(`WA send failed ${resp.status}`);
  }
  return j;
}

async function fetchMediaUrl(mediaId: string, accessToken: string) {
  const meta = await fetch(`https://graph.facebook.com/v24.0/${mediaId}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  }).then((r) => r.json());

  if (!meta?.url) return null;

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

  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: true });

  if (upErr) {
    console.error("storage upload error:", upErr);
    return null;
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (signErr) {
    console.error("signed url error:", signErr);
    return null;
  }

  return signed.signedUrl || null;
}

function isOptionMessage(t: string) {
  const s = (t || "").toLowerCase().trim();
  return /opci[oó]n\s*1|opci[oó]n\s*2|1\b|2\b/.test(s);
}

/**
 * ✅ Oferta “rápida” (fallback determinista)
 * (mientras conectamos Shopify bien, esto ya vende y guía)
 */
function buildOfferText(product: string, budget: number, comuna: string) {
  const q = encodeURIComponent(String(product));
  const link1 = `https://keloke.cl/search?q=${q}`;
  const link2 = `https://keloke.cl/collections/all?filter.v.price.gte=0&filter.v.price.lte=${encodeURIComponent(String(budget))}&q=${q}`;

  return (
    `Listo 🙌\n\n` +
    `Producto: *${product}*\n` +
    `Presupuesto: *$${Number(budget).toLocaleString("es-CL")}*\n` +
    `Comuna: *${comuna}*\n\n` +
    `✅ Opción 1 (búsqueda directa):\n${link1}\n\n` +
    `✅ Opción 2 (filtrada por presupuesto):\n${link2}\n\n` +
    `Dime *color / tamaño / uso* y te dejo 1 recomendación final para comprar al tiro.`
  );
}

async function sendPostOfferFallback(phoneNumberId: string, waId: string, accessToken: string, conv: any, userText: string) {
  // Si el usuario dice “Opción 2” o manda color (ej: blanco), lo guiamos aunque OpenAI falte
  const prefs = userText.trim();
  const p = (conv.product || "").replace(/^handle:/, "") || "el producto";

  if (isOptionMessage(prefs)) {
    await waSendText(
      phoneNumberId,
      waId,
      `Perfecto 🙌 ¿Lo quieres en algún *color* o *tamaño* específico? Si me dices eso, te mando el link exacto del mejor match para comprar ahora.`,
      accessToken
    );
    return true;
  }

  if (prefs.length >= 3) {
    await waSendText(
      phoneNumberId,
      waId,
      `Perfecto ✅ Anotado: *${prefs}*.\n\n¿Lo quieres para qué uso principal? (ej: casa / negocio / despacho / regalo). Con eso te cierro la mejor opción en 1 mensaje.`,
      accessToken
    );
    return true;
  }

  return false;
}

async function buildAndSendAIReply(params: {
  phoneNumberId: string;
  waId: string;
  accessToken: string;
  aiCfg: any;
}) {
  const { phoneNumberId, waId, accessToken, aiCfg } = params;

  const conv = await getConversation(waId) || {};
  const state = conv.state || "NEW";
  const product = conv.product || null;
  const budget = conv.budget || null;
  const comuna = conv.comuna || null;

  const lastOfferAt = conv.last_offer_at ? new Date(conv.last_offer_at).getTime() : 0;
  const recentlyOffered = lastOfferAt && (Date.now() - lastOfferAt < 1000 * 60 * 3); // 3 min (más agresivo)

  const { data: lastMsg } = await supabase
    .from("whatsapp_messages")
    .select("message_content, message_type, created_at")
    .eq("phone_number", normalizePhone(waId))
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1);

  const userText = (lastMsg?.[0]?.message_content || "").trim();

  // 1) Captura producto
  if (!product) {
    await upsertConversation(waId, { state: "ASK_PRODUCT" });
    await waSendText(phoneNumberId, waId, "¡Hola! 👋 Soy el asistente virtual de Keloke. ¿Qué producto estás buscando?", accessToken);
    return;
  }

  // 2) Captura presupuesto (FIX: NO lee “20 rollos” como presupuesto)
  if (!budget) {
    const b = extractBudgetCLP(userText);
    if (b) {
      await upsertConversation(waId, { budget: b, state: "ASK_COMUNA" });
      await waSendText(phoneNumberId, waId, "Perfecto 🙌 ¿En qué comuna estás? (para estimar entrega/tiempos)", accessToken);
      return;
    }
    await upsertConversation(waId, { state: "ASK_BUDGET" });
    await waSendText(phoneNumberId, waId, "Perfecto 🙌 ¿Cuál es tu presupuesto aprox? (ej: *$30.000* o *30 lucas*)", accessToken);
    return;
  }

  // 3) Captura comuna
  if (!comuna) {
    const c = userText;
    if (c.length >= 3) {
      await upsertConversation(waId, { comuna: c, state: "READY_TO_OFFER" });
      await waSendText(phoneNumberId, waId, "Perfecto 🙌 Dame 10 segundos y te mando 2 opciones con link.", accessToken);
      // seguimos y mandamos oferta en la misma ejecución
    } else {
      await upsertConversation(waId, { state: "ASK_COMUNA" });
      await waSendText(phoneNumberId, waId, "¿En qué comuna estás?", accessToken);
      return;
    }
  }

  const finalConv = await getConversation(waId) || {};
  const pRaw = finalConv.product || product;
  const b = finalConv.budget || budget;
  const co = finalConv.comuna || comuna;

  // Limpieza para mostrar producto
  const pDisplay = String(pRaw).replace(/^handle:/, "");

  // 4) Oferta (solo si corresponde)
  if ((finalConv.state === "READY_TO_OFFER" || state === "READY_TO_OFFER") && !recentlyOffered) {
    const msg = buildOfferText(pDisplay, Number(b), String(co));
    await waSendText(phoneNumberId, waId, msg, accessToken);
    await upsertConversation(waId, { state: "OFFER_SENT", last_offer_at: nowISO() });
    return;
  }

  // 5) Post-oferta: si NO hay OpenAI, igual respondemos (fallback)
  if (finalConv.state === "OFFER_SENT" || state === "OFFER_SENT") {
    if (!OPENAI_API_KEY || !aiCfg?.auto_reply_enabled || !withinScheduleChile(aiCfg)) {
      const did = await sendPostOfferFallback(phoneNumberId, waId, accessToken, finalConv, userText);
      if (did) return;
      // fallback mínimo
      await waSendText(phoneNumberId, waId, "¿Quieres que te recomiende 1 opción exacta? Dime *color/tamaño/uso* y tu *presupuesto* y te cierro la mejor.", accessToken);
      return;
    }
  }

  // 6) IA conversacional (si OpenAI está OK)
  if (!OPENAI_API_KEY || !aiCfg?.auto_reply_enabled) return;
  if (!withinScheduleChile(aiCfg)) return;

  const training = (aiCfg.training_data || "").trim();

  const system =
    `Eres el asistente virtual de ventas y soporte de Keloke.cl (Chile). ` +
    `Debes decir explícitamente que eres un asistente virtual (no finjas ser humano). ` +
    `Tono: cercano, vendedor, natural, chileno, breve. ` +
    `Objetivo: ayudar a elegir, reducir fricción y cerrar compra. ` +
    `Si el cliente ya dio producto/presupuesto/comuna, ofrece 1 recomendación final con CTA.\n\n` +
    `Datos actuales:\n` +
    `- Producto: ${pDisplay}\n` +
    `- Presupuesto: ${Number(b).toLocaleString("es-CL")}\n` +
    `- Comuna: ${co}\n\n` +
    (training ? `Contexto adicional:\n${training}\n\n` : "");

  const { data: hist } = await supabase
    .from("whatsapp_messages")
    .select("direction, message_content, message_type, created_at")
    .eq("phone_number", normalizePhone(waId))
    .order("created_at", { ascending: false })
    .limit(14);

  const history = (hist || []).reverse().map((m: any) => {
    const role = m.direction === "inbound" ? "user" : "assistant";
    const content =
      m.message_type === "text"
        ? (m.message_content || "")
        : `[${m.message_type || "media"}] ${(m.message_content || "").trim()}`.trim();

    return {
      role,
      content: [{ type: "text", text: content || "" }],
    };
  });

  const oaiResp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: aiCfg.ai_model || OPENAI_MODEL,
      input: [
        { role: "system", content: [{ type: "text", text: system }] },
        ...history,
      ],
      max_output_tokens: 260,
    }),
  });

  const oaiJson = await oaiResp.json().catch(() => ({}));
  const outText = (oaiJson?.output_text || "").trim();

  if (oaiResp.ok && outText) {
    await waSendText(phoneNumberId, waId, outText, accessToken);
    return;
  }

  console.error("OpenAI error:", oaiResp.status, oaiJson);
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const url = new URL(req.url);

    // Webhook verification (Meta GET)
    if (req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && challenge) {
        if (token && token === WHATSAPP_VERIFY_TOKEN) return text(challenge, 200);
        return text("Forbidden", 403);
      }
      return text("ok", 200);
    }

    if (req.method !== "POST") return text("Method Not Allowed", 405);

    const payload: WAWebhook = await req.json().catch(() => null);
    if (!payload) return json({ ok: false, error: "invalid_json" }, 400);

    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value || {};
    const metadata = value?.metadata || {};
    const phoneNumberId = String(metadata?.phone_number_id || "");

    if (!phoneNumberId) {
      console.error("No phone_number_id in payload");
      return json({ ok: true }, 200);
    }

    const conn = await getActiveConnectionByPhoneNumberId(phoneNumberId);

    // ✅ token principal desde DB (social_connections)
    const accessToken = (conn?.access_token as string) || META_WHATSAPP_TOKEN;

    if (!accessToken) {
      console.error("No WhatsApp access token found (social_connections or META_WHATSAPP_TOKEN).");
      return json({ ok: true }, 200);
    }

    const messages = value?.messages;
    if (!Array.isArray(messages) || messages.length === 0) return json({ ok: true }, 200);

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

      if (mediaId && accessToken) {
        const downloaded = await fetchMediaUrl(mediaId, accessToken);
        if (downloaded?.bytes) {
          mediaMime = downloaded.contentType || null;
          const signedUrl = await saveToStorage(mediaId, downloaded.bytes, downloaded.contentType);
          if (signedUrl) mediaUrl = signedUrl;
        }
      }

      // Persistir inbound
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

      // ✅ Estado conversacional (mejor captura)
      const conv = await getConversation(waId) || {};

      if (!conv.product) {
        if (msgType === "text" && messageContent && messageContent.length >= 2) {
          const prod = extractProductFromMessage(messageContent);
          await upsertConversation(waId, { product: prod, state: "ASK_BUDGET" });
        }
      } else if (!conv.budget && msgType === "text" && messageContent) {
        const b = extractBudgetCLP(messageContent);
        if (b) await upsertConversation(waId, { budget: b, state: "ASK_COMUNA" });
      } else if (conv.product && conv.budget && !conv.comuna && msgType === "text" && messageContent) {
        if (messageContent.trim().length >= 3) await upsertConversation(waId, { comuna: messageContent.trim(), state: "READY_TO_OFFER" });
      }

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
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
