// Supabase Edge Function: whatsapp-webhook
// Deno runtime

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type WAWebhook = any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";

// ✅ Shopify Storefront
const SHOPIFY_STOREFRONT_TOKEN = Deno.env.get("SHOPIFY_STOREFRONT_TOKEN") || "";
const SHOPIFY_STORE_DOMAIN = Deno.env.get("SHOPIFY_STORE_DOMAIN") || ""; // csn703-10.myshopify.com
const PUBLIC_STORE_DOMAIN = "https://keloke.cl";

const WA_GRAPH_VERSION = Deno.env.get("WA_GRAPH_VERSION") || "v24.0";

// ✅ MEDIA FIX (solo esto)
const STORAGE_BUCKET = "whatsapp-media";
const MAX_FILE_BYTES = 16 * 1024 * 1024; // 16MB

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders },
  });
}

function text(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...corsHeaders },
  });
}

function nowISO() {
  return new Date().toISOString();
}

function normalizePhone(s: string) {
  return (s || "").replace(/[^\d]/g, "");
}

function clamp(str: string, n = 900) {
  return String(str || "").slice(0, n);
}

function stripUrls(s: string) {
  return String(s || "").replace(/https?:\/\/\S+/g, "").trim();
}

function extractProductHandleFromKelokeUrl(s: string): string | null {
  const m = String(s || "").match(/keloke\.cl\/products\/([a-z0-9-]+)/i);
  return m?.[1] || null;
}

function prettifyHandle(h: string) {
  return h.replace(/-/g, " ").trim();
}

function looksLikeGreeting(s: string) {
  const t = String(s || "").toLowerCase().trim();
  return /^(hola|wena|buenas|buenos dias|buenas tardes|buenas noches|holi|hello)\b/.test(t);
}

function looksLikeShortAnswer(s: string) {
  const t = String(s || "").toLowerCase().trim();
  return (
    t.length <= 10 &&
    /^(si|sí|no|dale|ya|ok|oka|listo|perfecto|gracias|vale|casa|negocio|despacho|regalo|seguido|ocasional)$/i.test(t)
  );
}

function extractBudgetLukas(text: string): number | null {
  const t = (text || "").toLowerCase();
  const m1 = t.match(/(\d{1,3}(?:[.,]\d{3})+|\d{1,6})\s*(lucas|lks|luca)?/i);
  if (!m1) return null;
  const raw = m1[1].replace(/\./g, "").replace(/,/g, "");
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  if ((m1[2] || "").toLowerCase().includes("luc")) return n * 1000;
  return n;
}

// ✅ use_case NORMALIZADO (regalo/casa/negocio/despacho/uso_seguido/uso_ocasional)
function extractUseCase(text: string): string | null {
  const t = (text || "").toLowerCase();

  const rules: Array<[RegExp, string]> = [
    [/\b(regalo|cumple|cumpleaños|para regalar|obsequio)\b/i, "regalo"],
    [/\b(casa|hogar|depto|departamento)\b/i, "casa"],
    [/\b(negocio|emprend|emprendimiento|pyme|local|tienda|empresa|oficina)\b/i, "negocio"],
    [/\b(despacho|env[ií]o|delivery|reparto|bodega)\b/i, "despacho"],
    [/\b(uso\s*seguido|seguido|diario|frecuente)\b/i, "uso_seguido"],
    [/\b(uso\s*ocasional|ocasional|de\s*vez\s*en\s*cuando)\b/i, "uso_ocasional"],
  ];

  for (const [re, val] of rules) {
    if (re.test(t)) return val;
  }
  return null;
}

function cleanProductQuery(raw: string) {
  let t = stripUrls(raw);
  t = t.replace(/\b(hola|tengo una consulta sobre|consulta sobre|quiero|necesito|busco|me interesa|quisiera)\b/gi, "").trim();
  // evita queries muy largas tipo “ideal para notas…”
  if (t.length > 60) t = t.slice(0, 60);
  return t.trim();
}

function pickCloseQuestion(product: string) {
  const p = String(product || "").toLowerCase();
  if (/(lampara|lámpara|led|velador|escritorio)/i.test(p)) {
    return "¿La quieres de *escritorio* o para *velador*? (una palabra)";
  }
  if (/(freidora|air\s*fryer)/i.test(p)) {
    return "¿La necesitas para *uso seguido* o *uso ocasional*?";
  }
  if (/(audif|auricular|headphone|parlante|speaker)/i.test(p)) {
    return "¿La quieres para *casa* o para *calle/deporte*?";
  }
  return "Dime 1 cosa para afinarla: ¿*color* o *tamaño*? (elige una)";
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
  const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const idx = order.indexOf(weekday.slice(0, 3));
  const okDay = days.length === 0 || days.includes(weekday) || (idx >= 0 && days.includes(String(idx + 1)));

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
  const { error } = await supabase.from("whatsapp_conversations").upsert(payload, { onConflict: "phone_number" });
  if (error) console.error("upsertConversation error:", error);
}

async function resetConversation(waId: string) {
  await upsertConversation(waId, {
    product: null,
    budget: null,
    comuna: null,
    use_case: null,
    state: "ASK_PRODUCT",
    last_offer_at: null,
    last_offer_payload: null,
    last_ai_reply_at: null,
    last_ai_reply_text: null,
  });
}

async function upsertContact(waId: string, contactName?: string) {
  const phone = normalizePhone(waId);
  if (!phone) return;

  const payload: any = { phone_number: phone, updated_at: nowISO() };
  if (contactName) payload.contact_name = contactName;

  const { error } = await supabase.from("whatsapp_contacts").upsert(payload, { onConflict: "phone_number" });
  if (error) console.error("upsertContact error:", error);
}

async function insertMessage(row: any) {
  const { error } = await supabase.from("whatsapp_messages").insert(row);
  if (error) console.error("insertMessage error:", error, row);
}

async function hasInboundMessageIdAlready(whatsappMessageId: string) {
  if (!whatsappMessageId) return false;
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("whatsapp_message_id", whatsappMessageId)
    .limit(1);

  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

async function waSendText(phoneNumberId: string, toWaId: string, body: string, accessToken: string) {
  const url = `https://graph.facebook.com/${WA_GRAPH_VERSION}/${phoneNumberId}/messages`;
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

// ✅ Shopify Search (Storefront GraphQL)
async function shopifySearchTop2(query: string, budget?: number | null) {
  if (!SHOPIFY_STOREFRONT_TOKEN || !SHOPIFY_STORE_DOMAIN) return null;

  const q = cleanProductQuery(query);
  if (!q) return null;

  const gql = `
    query SearchProducts($q: String!) {
      products(first: 8, query: $q) {
        edges {
          node {
            title
            handle
            availableForSale
            featuredImage { url }
            priceRange {
              minVariantPrice { amount currencyCode }
            }
          }
        }
      }
    }
  `;

  const variables = { q };

  const resp = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/api/2024-10/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query: gql, variables }),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json?.errors) {
    console.error("Shopify error:", resp.status, json);
    return null;
  }

  const products = (json?.data?.products?.edges || []).map((e: any) => e.node);

  const filtered = products.filter((p: any) => {
    const price = Number(p?.priceRange?.minVariantPrice?.amount || 0);
    if (!price) return false;
    if (budget && Number.isFinite(budget)) return price <= budget;
    return true;
  });

  const pick = (filtered.length ? filtered : products).slice(0, 2);
  if (!pick.length) return null;

  return pick.map((p: any) => ({
    title: p.title,
    price: p.priceRange?.minVariantPrice?.amount,
    currency: p.priceRange?.minVariantPrice?.currencyCode,
    url: `${PUBLIC_STORE_DOMAIN}/products/${p.handle}`,
  }));
}

function buildOfferText(params: {
  product: string;
  budget: number;
  comuna: string;
  useCase: string;
  options: Array<{ title: string; price?: any; url: string }>;
}) {
  const { product, budget, comuna, useCase, options } = params;

  const lines = options
    .map((it, idx) => {
      const price = it.price ? ` $${Number(it.price).toLocaleString("es-CL")}` : "";
      return `✅ Opción ${idx + 1}: *${it.title}*${price}\n${it.url}`;
    })
    .join("\n\n");

  const closeQ = pickCloseQuestion(product);

  return (
    `¡Listo! 🙌 Soy tu asesor de *Keloke.cl*.\n` +
    `Para *${useCase || "tu caso"}* con *$${Number(budget).toLocaleString("es-CL")}* (${comuna}), estas son las mejores que encontré:\n\n` +
    `${lines}\n\n` +
    `${closeQ}`
  );
}

async function sendAndLogOutbound(params: {
  phoneNumberId: string;
  waId: string;
  accessToken: string;
  textBody: string;
  contactName?: string | null;
}) {
  const { phoneNumberId, waId, accessToken, textBody, contactName } = params;

  const sent = await waSendText(phoneNumberId, waId, textBody, accessToken);

  await insertMessage({
    from_number: normalizePhone(phoneNumberId),
    message_type: "text",
    message_content: textBody,
    direction: "outbound",
    timestamp: nowISO(),
    phone_number: normalizePhone(waId),
    status: "sent",
    whatsapp_message_id: sent?.messages?.[0]?.id || null,
    message: textBody,
    contact_name: contactName || null,
    is_read: true,
    created_at: nowISO(),
    updated_at: nowISO(),
  });

  return sent;
}

function extractMessageText(m: any): { type: string; content: string | null } {
  const msgType = m.type || "unknown";

  if (msgType === "text") return { type: "text", content: m.text?.body ?? null };
  if (msgType === "image") return { type: "image", content: m.image?.caption ?? "[image]" };
  if (msgType === "video") return { type: "video", content: m.video?.caption ?? "[video]" };
  if (msgType === "audio") return { type: "audio", content: "[audio]" };
  if (msgType === "document") {
    const name = m.document?.filename ? ` ${m.document.filename}` : "";
    const mime = m.document?.mime_type ? ` (${m.document.mime_type})` : "";
    const cap = m.document?.caption ? ` — ${m.document.caption}` : "";
    return { type: "document", content: `[document]${name}${mime}${cap}`.trim() };
  }

  if (msgType === "interactive") {
    const title =
      m.interactive?.button_reply?.title ||
      m.interactive?.list_reply?.title ||
      m.interactive?.list_reply?.description ||
      null;
    return { type: "interactive", content: title ? `[interactive] ${title}` : "[interactive]" };
  }

  if (msgType === "button") {
    const txt = m.button?.text || null;
    return { type: "button", content: txt ? `[button] ${txt}` : "[button]" };
  }

  if (msgType === "sticker") return { type: "sticker", content: "[sticker]" };

  if (msgType === "location") {
    const name = m.location?.name || "";
    const addr = m.location?.address || "";
    const lat = m.location?.latitude;
    const lng = m.location?.longitude;
    const loc = [name, addr].filter(Boolean).join(" — ");
    const coords = (lat && lng) ? ` (${lat},${lng})` : "";
    return { type: "location", content: `[location] ${loc}${coords}`.trim() || "[location]" };
  }

  return { type: msgType, content: `[${msgType}]` };
}

function shouldResetOnNewAsk(conv: any, userText: string) {
  const t = String(userText || "").toLowerCase();
  const hasKelokeProduct = /keloke\.cl\/products\/[a-z0-9-]+/i.test(userText || "");
  const isNewAsk = /\b(necesito|busco|quiero|me interesa|tengo una consulta|consulta)\b/i.test(t);

  if (hasKelokeProduct) return true;

  const updatedAt = conv?.updated_at ? new Date(conv.updated_at).getTime() : 0;
  const stale = updatedAt && (Date.now() - updatedAt > 1000 * 60 * 25); // 25 min

  if (stale && (looksLikeGreeting(userText) || isNewAsk)) return true;

  const state = String(conv?.state || "");
  if (state === "OFFER_SENT" && !looksLikeShortAnswer(userText) && userText.trim().length >= 12) return true;

  return false;
}

async function maybeAIReply(params: {
  phoneNumberId: string;
  waId: string;
  accessToken: string;
  aiCfg: any;
  contactName?: string | null;
  conv: any;
}) {
  const { phoneNumberId, waId, accessToken, aiCfg, contactName, conv } = params;

  if (!OPENAI_API_KEY || !aiCfg?.auto_reply_enabled) return;
  if (!withinScheduleChile(aiCfg)) return;

  const lastAiAt = conv?.last_ai_reply_at ? new Date(conv.last_ai_reply_at).getTime() : 0;
  const recentlyAi = lastAiAt && (Date.now() - lastAiAt < 1000 * 12);
  if (recentlyAi) return;

  const { data: hist } = await supabase
    .from("whatsapp_messages")
    .select("direction, message_content, message, message_type, created_at")
    .eq("phone_number", normalizePhone(waId))
    .order("created_at", { ascending: false })
    .limit(16);

  const msgs = (hist || []).reverse().map((m: any) => {
    const role = m.direction === "inbound" ? "user" : "assistant";
    const content =
      m.message_type === "text"
        ? String(m.message_content ?? m.message ?? "")
        : `[${m.message_type || "media"}] ${String(m.message_content ?? m.message ?? "")}`.trim();
    return { role, content };
  });

  const offerCtx = conv?.last_offer_payload ? JSON.stringify(conv.last_offer_payload) : "";

  const system =
    `Eres el asesor de ventas de Keloke.cl (Chile).` +
    ` Tono: chileno, cercano, claro, sin sonar robot.` +
    ` Objetivo: ayudar y cerrar compra.` +
    ` Reglas:` +
    ` - Máximo 1 pregunta.` +
    ` - NO repitas preguntas ya respondidas (mira historial).` +
    ` - Si hay 2 opciones ya enviadas, recomienda 1 y justifica en 1 frase.` +
    ` - Sé breve (1 a 4 líneas).` +
    (offerCtx ? `\nOferta previa (NO inventes otras): ${offerCtx}\n` : "") +
    (aiCfg?.training_data ? `\nContexto adicional:\n${aiCfg.training_data}\n` : "");

  const oaiResp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: aiCfg.ai_model || OPENAI_MODEL,
      input: [{ role: "system", content: system }, ...msgs],
      max_output_tokens: 160,
      temperature: 0.7,
    }),
  });

  const oaiJson = await oaiResp.json().catch(() => ({}));
  const outText = oaiJson?.output?.[0]?.content?.[0]?.text || oaiJson?.output_text || "";

  if (oaiResp.ok && outText?.trim()) {
    const cleaned = clamp(outText.trim(), 900);

    if (String(cleaned) === String(conv?.last_ai_reply_text || "").trim()) return;

    await sendAndLogOutbound({
      phoneNumberId,
      waId,
      accessToken,
      textBody: cleaned,
      contactName,
    });

    await upsertConversation(waId, { last_ai_reply_at: nowISO(), last_ai_reply_text: cleaned });
    return;
  }

  console.error("OpenAI error:", oaiResp.status, oaiJson);
}

async function buildAndSendReply(params: {
  phoneNumberId: string;
  waId: string;
  accessToken: string;
  aiCfg: any;
  contactName?: string | null;
  inboundText: string;
}) {
  const { phoneNumberId, waId, accessToken, aiCfg, contactName, inboundText } = params;

  let conv = (await getConversation(waId)) || {};

  if (shouldResetOnNewAsk(conv, inboundText)) {
    await resetConversation(waId);
    conv = (await getConversation(waId)) || {};
  }

  const handle = extractProductHandleFromKelokeUrl(inboundText);
  if (handle) {
    const p = prettifyHandle(handle);
    await upsertConversation(waId, { product: p, state: "ASK_BUDGET", budget: null, comuna: null, use_case: null });
    conv = (await getConversation(waId)) || {};
  }

  const uc = extractUseCase(inboundText);
  if (uc && !conv.use_case) {
    await upsertConversation(waId, { use_case: uc });
    conv = (await getConversation(waId)) || {};
  }

  const product = conv.product || null;
  const budget = conv.budget || null;
  const comuna = conv.comuna || null;
  const useCase = conv.use_case || null;

  if (!product) {
    const msg = looksLikeGreeting(inboundText)
      ? "¡Hola! 🙌 Soy tu asesor de *Keloke.cl*. ¿Qué estás buscando hoy? (producto o link)"
      : "Te leo 🙌 ¿Qué producto estás buscando? (o mándame el link)";
    await upsertConversation(waId, { state: "ASK_PRODUCT" });
    await sendAndLogOutbound({ phoneNumberId, waId, accessToken, textBody: msg, contactName });
    return;
  }

  if (!budget) {
    const b = extractBudgetLukas(inboundText);
    if (b) {
      await upsertConversation(waId, { budget: b, state: "ASK_COMUNA" });
      await sendAndLogOutbound({
        phoneNumberId,
        waId,
        accessToken,
        textBody: "Perfecto 🙌 ¿En qué comuna estás? Así te digo entrega/tiempos.",
        contactName,
      });
      return;
    }

    await upsertConversation(waId, { state: "ASK_BUDGET" });
    await sendAndLogOutbound({
      phoneNumberId,
      waId,
      accessToken,
      textBody: "Bacán 🙌 ¿Tu presupuesto aprox es de cuántas lucas? (ej: 30 lucas)",
      contactName,
    });
    return;
  }

  if (!comuna) {
    const bHere = extractBudgetLukas(inboundText);
    if (!bHere) {
      const c = stripUrls(inboundText).trim();
      if (c.length >= 3) {
        await upsertConversation(waId, { comuna: c, state: "ASK_USE_CASE" });
        await sendAndLogOutbound({
          phoneNumberId,
          waId,
          accessToken,
          textBody: "Perfecto 🙌 ¿Lo quieres para *casa*, *negocio*, *despacho* o *regalo*? (una palabra)",
          contactName,
        });
        return;
      }
    }

    await upsertConversation(waId, { state: "ASK_COMUNA" });
    await sendAndLogOutbound({
      phoneNumberId,
      waId,
      accessToken,
      textBody: "¿En qué comuna estás? (solo la comuna 🙌)",
      contactName,
    });
    return;
  }

  if (!useCase) {
    const uc2 = extractUseCase(inboundText);
    if (uc2) {
      await upsertConversation(waId, { use_case: uc2, state: "READY_TO_OFFER" });
      conv = (await getConversation(waId)) || {};
    } else {
      await upsertConversation(waId, { state: "ASK_USE_CASE" });
      await sendAndLogOutbound({
        phoneNumberId,
        waId,
        accessToken,
        textBody: "Para afinarla al tiro: ¿es para *casa*, *negocio*, *despacho* o *regalo*? (una palabra 🙌)",
        contactName,
      });
      return;
    }
  }

  conv = (await getConversation(waId)) || {};
  const p = conv.product || product;
  const b = Number(conv.budget || budget);
  const co = conv.comuna || comuna;
  const u = conv.use_case || useCase || "";

  const lastOfferAt = conv.last_offer_at ? new Date(conv.last_offer_at).getTime() : 0;
  const recentlyOffered = lastOfferAt && (Date.now() - lastOfferAt < 1000 * 60 * 10);

  const lastOfferProduct = conv?.last_offer_payload?.product ? String(conv.last_offer_payload.product) : "";
  const productChanged = lastOfferProduct && String(lastOfferProduct).toLowerCase() !== String(p).toLowerCase();

  if (!recentlyOffered || productChanged) {
    const shopifyPick = await shopifySearchTop2(String(p), b);

    if (shopifyPick?.length) {
      const offerPayload = {
        product: p,
        budget: b,
        comuna: co,
        use_case: u || null,
        options: shopifyPick.map((it: any, idx: number) => ({
          label: `Opción ${idx + 1}`,
          title: it.title,
          price: it.price ? Number(it.price) : null,
          currency: it.currency || "CLP",
          url: it.url,
        })),
      };

      const msg = buildOfferText({
        product: p,
        budget: b,
        comuna: co,
        useCase: u,
        options: shopifyPick,
      });

      await sendAndLogOutbound({ phoneNumberId, waId, accessToken, textBody: msg, contactName });

      await upsertConversation(waId, {
        state: "OFFER_SENT",
        last_offer_at: nowISO(),
        last_offer_payload: offerPayload,
      });

      return;
    }

    const q = encodeURIComponent(cleanProductQuery(String(p)));
    const link1 = `${PUBLIC_STORE_DOMAIN}/search?q=${q}`;
    const link2 = `${PUBLIC_STORE_DOMAIN}/collections/all?filter.v.price.gte=0&filter.v.price.lte=${encodeURIComponent(String(b))}&q=${q}`;

    const offerPayload = {
      product: p,
      budget: b,
      comuna: co,
      use_case: u || null,
      options: [
        { label: "Opción 1", title: "Búsqueda", url: link1 },
        { label: "Opción 2", title: "Hasta tu presupuesto", url: link2 },
      ],
    };

    const msg =
      `¡Listo! 🙌 Soy tu asesor de *Keloke.cl*.\n` +
      `Te dejo 2 links directos para *${cleanProductQuery(String(p))}* hasta *$${b.toLocaleString("es-CL")}* (${co}):\n\n` +
      `✅ Opción 1 (búsqueda):\n${link1}\n\n` +
      `✅ Opción 2 (hasta tu presupuesto):\n${link2}\n\n` +
      `${pickCloseQuestion(p)}`;

    await sendAndLogOutbound({ phoneNumberId, waId, accessToken, textBody: msg, contactName });

    await upsertConversation(waId, {
      state: "OFFER_SENT",
      last_offer_at: nowISO(),
      last_offer_payload: offerPayload,
    });

    return;
  }

  conv = (await getConversation(waId)) || {};
  const t = String(inboundText || "").toLowerCase();
  const offer = conv?.last_offer_payload;

  const wantsOption = t.match(/\b(opcion|opción)\s*(1|2)\b/i);
  const usage = extractUseCase(inboundText);

  if (offer?.options?.length) {
    if (wantsOption) {
      const idx = Number(wantsOption[2]) - 1;
      const pick = offer.options[idx] || offer.options[0];
      const msg =
        `De una 🙌 Me quedo con *${pick.label}* porque calza mejor con lo que buscas.\n` +
        `${pick.url}\n` +
        `¿La quieres en algún *color/tamaño* específico? (una cosa y te la dejo lista)`;
      await sendAndLogOutbound({ phoneNumberId, waId, accessToken, textBody: msg, contactName });
      return;
    }

    if (usage === "uso_seguido" || usage === "uso_ocasional") {
      const pick = usage === "uso_seguido" ? (offer.options[1] || offer.options[0]) : offer.options[0];
      const why = usage === "uso_seguido"
        ? "para uso seguido conviene ir por algo más firme/completo"
        : "para uso ocasional te sale mejor algo simple y rendidor";

      const msg =
        `Perfecto 🙌 Yo te recomiendo *${pick.label}*: ${why}.\n` +
        `${pick.url}\n` +
        `¿La quieres con alguna preferencia de *color/tamaño*? (una cosa y cierro)`;
      await sendAndLogOutbound({ phoneNumberId, waId, accessToken, textBody: msg, contactName });
      return;
    }
  }

  const shouldUseAI = !looksLikeShortAnswer(inboundText) && (inboundText.includes("?") || inboundText.trim().length >= 18);
  if (shouldUseAI) {
    await maybeAIReply({ phoneNumberId, waId, accessToken, aiCfg, contactName, conv });
    return;
  }

  await sendAndLogOutbound({
    phoneNumberId,
    waId,
    accessToken,
    textBody: "Te caché 🙌 Dime solo *opción 1 o 2* y te la dejo lista para comprar.",
    contactName,
  });
}

// ✅ MEDIA FIX helpers (solo esto)
function safeExtFromMime(mime = "") {
  const m = mime.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/calendar": "ics",
    "application/ics": "ics",
    "application/octet-stream": "bin",
  };
  if (map[m]) return map[m];
  const slash = m.indexOf("/");
  if (slash > -1) return m.slice(slash + 1) || "bin";
  return "bin";
}

async function waGetMediaInfo(mediaId: string, accessToken: string) {
  const url = `https://graph.facebook.com/${WA_GRAPH_VERSION}/${mediaId}?fields=url,mime_type,file_size`;
  const resp = await fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const j = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(j?.error?.message || `media info failed ${resp.status}`);
  return j; // { url, mime_type, file_size }
}

async function waDownloadMediaBinary(downloadUrl: string, accessToken: string) {
  const resp = await fetch(downloadUrl, {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`media download failed ${resp.status}`);
  const ab = await resp.arrayBuffer();
  return new Uint8Array(ab);
}

function inferInboundMediaId(m: any, msgType: string): string | null {
  if (msgType === "image") return m.image?.id || null;
  if (msgType === "video") return m.video?.id || null;
  if (msgType === "audio") return m.audio?.id || null;
  if (msgType === "document") return m.document?.id || null;
  if (msgType === "sticker") return m.sticker?.id || null;
  return null;
}

function inferInboundFilename(m: any, msgType: string, mime: string): string {
  if (msgType === "document") return m.document?.filename || `document.${safeExtFromMime(mime)}`;
  if (msgType === "image") return `image.${safeExtFromMime(mime)}`;
  if (msgType === "video") return `video.${safeExtFromMime(mime)}`;
  if (msgType === "audio") return `audio.${safeExtFromMime(mime)}`;
  if (msgType === "sticker") return `sticker.${safeExtFromMime(mime || "image/webp")}`;
  return `file.${safeExtFromMime(mime)}`;
}

async function fetchStoreAndReturnMediaFields(params: {
  waId: string;
  msgType: string;
  msg: any;
  accessToken: string;
}) {
  const { waId, msgType, msg, accessToken } = params;
  const mediaId = inferInboundMediaId(msg, msgType);
  if (!mediaId || !accessToken) return null;

  const info = await waGetMediaInfo(mediaId, accessToken);
  const mime = String(info?.mime_type || "application/octet-stream");
  const size = Number(info?.file_size || 0);

  if (size && size > MAX_FILE_BYTES) {
    // guardamos al menos el id/mime para mostrar “archivo muy grande”
    return {
      media_id: mediaId,
      media_url: null,
      media_mime_type: mime,
      media_filename: inferInboundFilename(msg, msgType, mime),
      media_size: size,
      platform_response: { media_info: info, note: "file_too_large" },
    };
  }

  const dlUrl = String(info?.url || "");
  if (!dlUrl) return null;

  const bytes = await waDownloadMediaBinary(dlUrl, accessToken);
  const filename = inferInboundFilename(msg, msgType, mime);
  const safeName = filename.replace(/[^\w.\-]+/g, "_");

  const storagePath = `inbound/${normalizePhone(waId)}/${Date.now()}_${safeName}`;

  const blob = new Blob([bytes], { type: mime });

  const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, blob, {
    contentType: mime,
    cacheControl: "3600",
    upsert: true,
  });

  if (upErr) {
    return {
      media_id: mediaId,
      media_url: null,
      media_mime_type: mime,
      media_filename: safeName,
      media_size: bytes.byteLength,
      platform_response: { media_info: info, storage_error: upErr },
    };
  }

  const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  const publicUrl = pub?.publicUrl || null;

  return {
    media_id: mediaId,
    media_url: publicUrl,
    media_mime_type: mime,
    media_filename: safeName,
    media_size: bytes.byteLength,
    platform_response: { media_info: info, storage_path: storagePath, storage_public_url: publicUrl },
  };
}

// MAIN
Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const url = new URL(req.url);

    // Webhook verify
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

    if (!phoneNumberId) return json({ ok: true }, 200);

    const conn = await getActiveConnectionByPhoneNumberId(phoneNumberId);
    const accessToken = String(conn?.access_token || "");

    const messages = value?.messages;
    if (!Array.isArray(messages) || messages.length === 0) return json({ ok: true }, 200);

    const contacts = value?.contacts;
    const contactName = contacts?.[0]?.profile?.name;

    const aiCfg = await getAIConfig();

    for (const m of messages) {
      const waId = normalizePhone(m.from || "");
      if (!waId) continue;

      // ✅ anti-duplicados
      const msgId = String(m.id || "");
      if (msgId && (await hasInboundMessageIdAlready(msgId))) continue;

      await upsertContact(waId, contactName);

      const extracted = extractMessageText(m);
      const msgType = extracted.type;
      const messageContent = extracted.content;

      // ✅ MEDIA FIX: si es media, descarga + guarda URL pública para que tu UI la vea
      let mediaFields: any = null;
      try {
        if (["image", "video", "audio", "document", "sticker"].includes(msgType)) {
          mediaFields = await fetchStoreAndReturnMediaFields({
            waId,
            msgType,
            msg: m,
            accessToken,
          });
        }
      } catch (e) {
        // no rompas el flujo si falla media
        console.error("media fetch/store error:", e);
        mediaFields = null;
      }

      await insertMessage({
        from_number: waId,
        message_type: msgType,
        message_content: messageContent,
        direction: "inbound",
        timestamp: new Date((m.timestamp ? parseInt(m.timestamp, 10) : Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        phone_number: waId,
        status: "received",
        whatsapp_message_id: msgId || null,
        message: messageContent,
        contact_name: contactName || null,
        is_read: false,
        created_at: nowISO(),
        updated_at: nowISO(),
        ...(mediaFields ? mediaFields : {}),
      });

      // ✅ Solo respondemos si Auto está ON y hay token
      if (aiCfg?.auto_reply_enabled && accessToken) {
        const inboundText = msgType === "text" ? String(messageContent || "") : String(messageContent || "");
        await buildAndSendReply({ phoneNumberId, waId, accessToken, aiCfg, contactName, inboundText });
      }
    }

    return json({ ok: true }, 200);
  } catch (e) {
    console.error("Fatal error:", e);
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
