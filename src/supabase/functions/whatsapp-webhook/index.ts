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

function stripUrlsKeepText(s: string) {
  return String(s || "").replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
}

function isGreeting(text: string) {
  const t = (text || "").toLowerCase().trim();
  return /^(hola|holaa+|buenas|buenos\s*d[ií]as|buenas\s*tardes|buenas\s*noches|wena+|hello|hi)\b/.test(t);
}

function extractProductHandleFromText(text: string): string | null {
  const t = String(text || "");
  // keloke.cl/products/<handle>
  const m1 = t.match(/keloke\.cl\/products\/([a-z0-9\-]+)/i);
  if (m1?.[1]) return m1[1].toLowerCase();
  // cualquier dominio /products/<handle>
  const m2 = t.match(/\/products\/([a-z0-9\-]+)/i);
  if (m2?.[1]) return m2[1].toLowerCase();
  return null;
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
  const { error } = await supabase
    .from("whatsapp_conversations")
    .upsert(payload, { onConflict: "phone_number" });
  if (error) console.error("upsertConversation error:", error);
}

async function resetConversationForNewProduct(waId: string, product: string) {
  // Reseteo suave para evitar “quedarse pegado” a freidora/budget/comuna
  await upsertConversation(waId, {
    product,
    budget: null,
    comuna: null,
    use_case: null,
    state: "ASK_BUDGET",
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

  const { error } = await supabase
    .from("whatsapp_contacts")
    .upsert(payload, { onConflict: "phone_number" });

  if (error) console.error("upsertContact error:", error);
}

async function insertMessage(row: any) {
  const { error } = await supabase.from("whatsapp_messages").insert(row);
  if (error) console.error("insertMessage error:", error, row);
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

// ✅ use_case NORMALIZADO
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

// ✅ Shopify: productByHandle (para cuando el cliente manda link)
async function shopifyGetProductTitleByHandle(handle: string): Promise<string | null> {
  if (!SHOPIFY_STOREFRONT_TOKEN || !SHOPIFY_STORE_DOMAIN) return null;
  if (!handle) return null;

  const gql = `
    query ProductByHandle($handle: String!) {
      productByHandle(handle: $handle) {
        title
        handle
      }
    }
  `;

  const resp = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/api/2024-10/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query: gql, variables: { handle } }),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json?.errors) {
    console.error("Shopify productByHandle error:", resp.status, json);
    return null;
  }

  const title = json?.data?.productByHandle?.title;
  return title ? String(title) : null;
}

// ✅ Shopify Search (top 2)
async function shopifySearchTop2(query: string, budget?: number | null) {
  if (!SHOPIFY_STOREFRONT_TOKEN || !SHOPIFY_STORE_DOMAIN) return null;

  const q = (query || "").trim();
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

async function buildAndSendReply(params: {
  phoneNumberId: string;
  waId: string;
  accessToken: string;
  aiCfg: any;
}) {
  const { phoneNumberId, waId, accessToken, aiCfg } = params;

  const conv = (await getConversation(waId)) || {};
  const product = conv.product || null;
  const budget = conv.budget || null;
  const comuna = conv.comuna || null;
  const useCase = conv.use_case || null;

  // último inbound
  const { data: lastMsg } = await supabase
    .from("whatsapp_messages")
    .select("message_content, message, message_type, created_at")
    .eq("phone_number", normalizePhone(waId))
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1);

  const userText = String(lastMsg?.[0]?.message_content ?? lastMsg?.[0]?.message ?? "").trim();
  const userClean = stripUrlsKeepText(userText);

  // ✅ “Hola” siempre debe responder y guiar (sin quedarse pegado)
  if (isGreeting(userClean) && !product) {
    await upsertConversation(waId, { state: "ASK_PRODUCT" });
    await waSendText(
      phoneNumberId,
      waId,
      "¡Hola! 👋 Soy tu asesor de ventas de *Keloke.cl* 🙌\n¿Qué estás buscando hoy? (ej: freidora, lámpara, masajeador, etc.)",
      accessToken
    );
    return;
  }

  // ✅ Captura use_case si lo dijo (solo si no existe)
  if (!useCase) {
    const uc0 = extractUseCase(userClean);
    if (uc0) await upsertConversation(waId, { use_case: uc0 });
  }

  // 1) producto
  if (!product) {
    await upsertConversation(waId, { state: "ASK_PRODUCT" });
    await waSendText(
      phoneNumberId,
      waId,
      "Te leo 🙌 Soy asesor de *Keloke.cl*.\n¿Qué producto necesitas? (o mándame el link del producto)",
      accessToken
    );
    return;
  }

  // 2) presupuesto
  if (!budget) {
    const b = extractBudgetLukas(userClean);
    if (b) {
      await upsertConversation(waId, { budget: b, state: "ASK_COMUNA" });
      await waSendText(phoneNumberId, waId, "Perfecto 🙌 ¿En qué comuna estás? (para tiempos/entrega)", accessToken);
      return;
    }
    await upsertConversation(waId, { state: "ASK_BUDGET" });
    await waSendText(phoneNumberId, waId, "Bacán 🙌 ¿Tu presupuesto aprox es de cuántas lucas? (ej: 30 lucas)", accessToken);
    return;
  }

  // 3) comuna
  if (!comuna) {
    if (userClean.length >= 3) {
      await upsertConversation(waId, { comuna: userClean.trim(), state: "ASK_USE_CASE" });
      await waSendText(
        phoneNumberId,
        waId,
        "Perfecto 🙌 Última: ¿lo quieres para *casa*, *negocio*, *despacho* o *regalo*? 👀",
        accessToken
      );
      return;
    }
    await upsertConversation(waId, { state: "ASK_COMUNA" });
    await waSendText(phoneNumberId, waId, "¿En qué comuna estás? 😊", accessToken);
    return;
  }

  // 4) use_case (una sola vez, normalizado)
  const updated = (await getConversation(waId)) || {};
  if (!updated.use_case) {
    const uc1 = extractUseCase(userClean);
    if (uc1) {
      await upsertConversation(waId, { use_case: uc1, state: "READY_TO_OFFER" });
    } else {
      await upsertConversation(waId, { state: "ASK_USE_CASE" });
      await waSendText(
        phoneNumberId,
        waId,
        "Para afinarte la mejor opción: ¿es para *casa*, *negocio*, *despacho* o *regalo*? 🙌",
        accessToken
      );
      return;
    }
  } else {
    await upsertConversation(waId, { state: "READY_TO_OFFER" });
  }

  // ✅ Oferta (con anti-spam por *mismo producto*)
  const finalConv = (await getConversation(waId)) || {};
  const p = String(finalConv.product || product);
  const b = Number(finalConv.budget || budget);
  const co = String(finalConv.comuna || comuna);
  const uc = String(finalConv.use_case || useCase || "");

  const lastOfferAtMs = finalConv.last_offer_at ? new Date(finalConv.last_offer_at).getTime() : 0;
  const lastOfferProduct = finalConv.last_offer_payload?.product ? String(finalConv.last_offer_payload.product) : "";
  const recentlyOfferedSameProduct =
    !!lastOfferAtMs && (Date.now() - lastOfferAtMs < 1000 * 60 * 10) && lastOfferProduct.toLowerCase() === p.toLowerCase();

  if (!recentlyOfferedSameProduct) {
    const shopifyPick = await shopifySearchTop2(String(p), Number(b));

    if (shopifyPick?.length) {
      const lines = shopifyPick
        .map((it: any, idx: number) => {
          const price = it.price ? `$${Number(it.price).toLocaleString("es-CL")}` : "";
          return `✅ Opción ${idx + 1}: *${it.title}* ${price}\n${it.url}`;
        })
        .join("\n\n");

      const offerPayload = {
        product: p,
        budget: Number(b),
        comuna: co,
        use_case: uc || null,
        options: shopifyPick.map((it: any, idx: number) => ({
          label: `Opción ${idx + 1}`,
          title: it.title,
          price: it.price ? Number(it.price) : null,
          currency: it.currency || "CLP",
          url: it.url,
        })),
      };

      const msg =
        `Listo 🙌 Soy tu asesor de *Keloke.cl*.\n` +
        `Para *${uc || "tu caso"}* y con $${Number(b).toLocaleString("es-CL")} en *${co}*, estas 2 son las mejores:\n\n` +
        `${lines}\n\n` +
        `Dime una sola cosa y te recomiendo 1 al tiro: ¿lo necesitas para *uso seguido* o *uso ocasional*?`;

      await waSendText(phoneNumberId, waId, msg, accessToken);
      await upsertConversation(waId, {
        state: "OFFER_SENT",
        last_offer_at: nowISO(),
        last_offer_payload: offerPayload,
      });
      return;
    }

    // fallback a links
    const q = encodeURIComponent(String(p));
    const link1 = `${PUBLIC_STORE_DOMAIN}/search?q=${q}`;
    const link2 = `${PUBLIC_STORE_DOMAIN}/collections/all?filter.v.price.gte=0&filter.v.price.lte=${encodeURIComponent(String(b))}&q=${q}`;

    const offerPayload = {
      product: p,
      budget: Number(b),
      comuna: co,
      use_case: uc || null,
      options: [
        { label: "Opción 1", title: "Búsqueda", url: link1 },
        { label: "Opción 2", title: "Hasta tu presupuesto", url: link2 },
      ],
    };

    const msg =
      `Listo 🙌 Soy tu asesor de *Keloke.cl*.\n\n` +
      `Producto: *${p}*\nPresupuesto: *$${Number(b).toLocaleString("es-CL")}*\nComuna: *${co}*\n\n` +
      `✅ Opciones:\n${link1}\n${link2}\n\n` +
      `Para cerrarlo bien: ¿lo quieres para casa, negocio, despacho o regalo?`;

    await waSendText(phoneNumberId, waId, msg, accessToken);
    await upsertConversation(waId, {
      state: "OFFER_SENT",
      last_offer_at: nowISO(),
      last_offer_payload: offerPayload,
    });
    return;
  }

  // ✅ IA post-oferta (solo dudas/cierre)
  if (!OPENAI_API_KEY || !aiCfg?.auto_reply_enabled) return;
  if (!withinScheduleChile(aiCfg)) return;

  const lastAiAtMs = finalConv.last_ai_reply_at ? new Date(finalConv.last_ai_reply_at).getTime() : 0;
  const recentlyAi = lastAiAtMs && (Date.now() - lastAiAtMs < 1000 * 8);
  if (recentlyAi) return;

  const training = (aiCfg.training_data || "").trim();
  const offerCtx = finalConv.last_offer_payload ? JSON.stringify(finalConv.last_offer_payload) : "";
  const useCaseCtx = finalConv.use_case || "";

  const system =
    `Eres un asesor de ventas TOP de Keloke.cl (Chile).` +
    ` Hablas natural, cercano, cero robótico, estilo chileno suave.` +
    ` Objetivo: resolver dudas y CERRAR la compra.` +
    ` Regla: si ya se ofrecieron 2 opciones, ahora elige 1 y pide 1 dato final para cerrar.` +
    ` NO repitas la misma pregunta si el cliente ya respondió.` +
    ` Responde en 1 a 4 líneas, con seguridad y calidez.` +
    (useCaseCtx ? `\nUso: ${useCaseCtx}\n` : "") +
    (offerCtx ? `\nOferta previa (NO inventes): ${offerCtx}\n` : "") +
    (training ? `\nContexto adicional:\n${training}\n` : "");

  const { data: hist } = await supabase
    .from("whatsapp_messages")
    .select("direction, message_content, message, message_type, created_at")
    .eq("phone_number", normalizePhone(waId))
    .order("created_at", { ascending: false })
    .limit(14);

  const msgs = (hist || []).reverse().map((m: any) => {
    const role = m.direction === "inbound" ? "user" : "assistant";
    const content =
      m.message_type === "text"
        ? String(m.message_content ?? m.message ?? "")
        : `[${m.message_type || "media"}] ${String(m.message_content ?? m.message ?? "")}`.trim();
    return { role, content };
  });

  const oaiResp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: aiCfg.ai_model || OPENAI_MODEL,
      input: [{ role: "system", content: system }, ...msgs],
      max_output_tokens: 220,
    }),
  });

  const oaiJson = await oaiResp.json().catch(() => ({}));
  const outText = oaiJson?.output?.[0]?.content?.[0]?.text || oaiJson?.output_text || "";

  if (oaiResp.ok && outText?.trim()) {
    const cleaned = outText.trim().slice(0, 900);
    if (String(cleaned) === String(finalConv.last_ai_reply_text || "").trim()) return;

    await waSendText(phoneNumberId, waId, cleaned, accessToken);
    await upsertConversation(waId, { last_ai_reply_at: nowISO(), last_ai_reply_text: cleaned });
    return;
  }

  console.error("OpenAI error:", oaiResp.status, oaiJson);
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

    if (!phoneNumberId) {
      console.error("No phone_number_id in payload");
      return json({ ok: true }, 200);
    }

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

      await upsertContact(waId, contactName);

      const msgType = m.type || "unknown";
      let messageContent: string | null = null;

      if (msgType === "text") messageContent = m.text?.body ?? null;
      else if (msgType === "image") messageContent = m.image?.caption ?? "[image]";
      else if (msgType === "video") messageContent = m.video?.caption ?? "[video]";
      else if (msgType === "audio") messageContent = "[audio]";
      else if (msgType === "document") messageContent = m.document?.caption ?? m.document?.filename ?? "[document]";
      else messageContent = `[${msgType}]`;

      await insertMessage({
        from_number: waId,
        message_type: msgType,
        message_content: messageContent,
        direction: "inbound",
        timestamp: new Date(
          (m.timestamp ? parseInt(m.timestamp, 10) : Math.floor(Date.now() / 1000)) * 1000
        ).toISOString(),
        phone_number: waId,
        status: "received",
        whatsapp_message_id: m.id || null,
        message: messageContent,
        contact_name: contactName || null,
        is_read: false,
        created_at: nowISO(),
        updated_at: nowISO(),
      });

      // ✅ Captura/Reset inteligente cuando llega un link o cambia el producto
      const conv = (await getConversation(waId)) || {};
      const txt = String(messageContent || "");
      const clean = stripUrlsKeepText(txt);
      const handle = msgType === "text" ? extractProductHandleFromText(txt) : null;

      if (msgType === "text") {
        // Si el cliente manda LINK de producto => product real por handle + reset
        if (handle) {
          const title = await shopifyGetProductTitleByHandle(handle);
          const productTitle = title || handle.replace(/-/g, " ");
          // si es distinto al actual => reseteamos (evita “freidora pegada”)
          if (!conv.product || String(conv.product).toLowerCase() !== productTitle.toLowerCase()) {
            await resetConversationForNewProduct(waId, productTitle);
          }
        } else {
          // Si NO es link, pero parece que el usuario está pidiendo otra cosa,
          // y el texto trae un producto claro (>= 3 chars) y no es solo “sí/no”
          const looksLikeNewProduct =
            clean.length >= 3 &&
            !/^(si|sí|no|ok|dale|ya|gracias|genial|perfecto)$/i.test(clean) &&
            !extractBudgetLukas(clean) &&
            !extractUseCase(clean) &&
            !isGreeting(clean);

          if (looksLikeNewProduct && conv.product && String(conv.product).toLowerCase() !== clean.toLowerCase()) {
            // Resetea contexto y toma este texto como nuevo producto
            await resetConversationForNewProduct(waId, clean);
          }

          // Estado base si todavía está vacío (primer contacto)
          const conv2 = (await getConversation(waId)) || {};
          if (!conv2.product && clean.length >= 2 && !isGreeting(clean)) {
            await upsertConversation(waId, { product: clean, state: "ASK_BUDGET" });
          }

          if (!conv2.budget) {
            const b = extractBudgetLukas(clean);
            if (b) await upsertConversation(waId, { budget: b, state: "ASK_COMUNA" });
          }

          if ((conv2.product || clean.length >= 2) && (conv2.budget || extractBudgetLukas(clean)) && !conv2.comuna && clean.length >= 3) {
            // ojo: acá podría confundirse si manda "Ñuñoa" vs "freidora" etc.
            // como estamos reseteando mejor, queda mucho más estable.
            // Igual solo setea comuna si ya está el flujo armado.
            if (conv2.product && (conv2.budget || extractBudgetLukas(clean))) {
              await upsertConversation(waId, { comuna: clean, state: "ASK_USE_CASE" });
            }
          }

          if (!conv2.use_case) {
            const uc = extractUseCase(clean);
            if (uc) await upsertConversation(waId, { use_case: uc });
          }
        }
      }

      if (aiCfg?.auto_reply_enabled && accessToken) {
        await buildAndSendReply({ phoneNumberId, waId, accessToken, aiCfg });
      }
    }

    return json({ ok: true }, 200);
  } catch (e) {
    console.error("Fatal error:", e);
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
