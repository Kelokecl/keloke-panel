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

function looksLikeUseCase(text: string) {
  const t = (text || "").toLowerCase();
  const keys = ["regalo", "casa", "hogar", "negocio", "despacho", "oficina", "emprend", "pyme"];
  return keys.some((k) => t.includes(k));
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

// ✅ Shopify Search (Storefront GraphQL)
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

  // Truco: la sintaxis de query Shopify soporta title:* / tag:* / etc.
  // Aquí buscamos por texto general.
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

  // Filtra por budget si viene (precio <= budget)
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

  // anti-spam oferta
  const lastOfferAt = conv.last_offer_at ? new Date(conv.last_offer_at).getTime() : 0;
  const recentlyOffered = lastOfferAt && (Date.now() - lastOfferAt < 1000 * 60 * 10);

  // anti-loop IA (no mandar lo mismo seguido)
  const lastAiAt = conv.last_ai_reply_at ? new Date(conv.last_ai_reply_at).getTime() : 0;
  const recentlyAi = lastAiAt && (Date.now() - lastAiAt < 1000 * 8);

  // último inbound
  const { data: lastMsg } = await supabase
    .from("whatsapp_messages")
    .select("message_content, message, message_type, created_at")
    .eq("phone_number", normalizePhone(waId))
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1);

  const userText = String(lastMsg?.[0]?.message_content ?? lastMsg?.[0]?.message ?? "").trim();

  // ✅ Captura rápida de use_case si lo dijo
  if (!useCase && looksLikeUseCase(userText)) {
    await upsertConversation(waId, { use_case: userText.trim() });
  }

  // Flujo determinista “humano”
  if (!product) {
    await upsertConversation(waId, { state: "ASK_PRODUCT" });
    await waSendText(phoneNumberId, waId, "Te leo 🙌 ¿Qué producto estás buscando?", accessToken);
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
    await waSendText(phoneNumberId, waId, "Bacán 🙌 ¿Cuál es tu presupuesto aprox (en lucas o $)?", accessToken);
    return;
  }

  if (!comuna) {
    if (userText.length >= 3) {
      await upsertConversation(waId, { comuna: userText.trim(), state: "ASK_USE_CASE" });
      await waSendText(
        phoneNumberId,
        waId,
        "Perfecto 🙌 ¿Lo quieres para qué uso principal? (casa / negocio / despacho / regalo). Con eso te cierro la mejor opción en 1 mensaje.",
        accessToken
      );
      return;
    }
    await upsertConversation(waId, { state: "ASK_COMUNA" });
    await waSendText(phoneNumberId, waId, "¿En qué comuna estás?", accessToken);
    return;
  }

  // ✅ Ya tenemos comuna, ahora pedimos use_case UNA sola vez y lo guardamos
  const updated = (await getConversation(waId)) || {};
  if (!updated.use_case) {
    // si acaba de responder y no calza, igual aceptamos lo que sea como use_case
    if (userText.length >= 2) {
      await upsertConversation(waId, { use_case: userText.trim(), state: "READY_TO_OFFER" });
    } else {
      await upsertConversation(waId, { state: "ASK_USE_CASE" });
      await waSendText(
        phoneNumberId,
        waId,
        "¿Lo quieres para casa, negocio, despacho o regalo? 👀",
        accessToken
      );
      return;
    }
  } else {
    await upsertConversation(waId, { state: "READY_TO_OFFER" });
  }

  // ✅ Oferta con Shopify real (2 productos), si no hay token cae a links genéricos
  const finalConv = (await getConversation(waId)) || {};
  const p = finalConv.product || product;
  const b = finalConv.budget || budget;
  const co = finalConv.comuna || comuna;
  const uc = finalConv.use_case || useCase || "";

  if (!recentlyOffered) {
    const shopifyPick = await shopifySearchTop2(String(p), Number(b));

    if (shopifyPick?.length) {
      const lines = shopifyPick
        .map((it: any, idx: number) => {
          const price = it.price ? `$${Number(it.price).toLocaleString("es-CL")}` : "";
          return `✅ Opción ${idx + 1}: *${it.title}* ${price}\n${it.url}`;
        })
        .join("\n\n");

      const msg =
        `Listo 🙌 Te dejé 2 opciones buenas para *${uc || "tu caso"}*.\n\n` +
        `Producto: *${p}*\nPresupuesto: *$${Number(b).toLocaleString("es-CL")}*\nComuna: *${co}*\n\n` +
        `${lines}\n\n` +
        `Si me dices *si lo necesitas para envío seguido o uso ocasional*, te confirmo la mejor y te la dejo lista para comprar.`;

      await waSendText(phoneNumberId, waId, msg, accessToken);
      await upsertConversation(waId, { state: "OFFER_SENT", last_offer_at: nowISO() });
// NO return: dejamos que la IA pueda responder si el cliente contesta algo extra luego
return;

    }

    // fallback a links
    const q = encodeURIComponent(String(p));
    const link1 = `${PUBLIC_STORE_DOMAIN}/search?q=${q}`;
    const link2 = `${PUBLIC_STORE_DOMAIN}/collections/all?filter.v.price.gte=0&filter.v.price.lte=${encodeURIComponent(String(b))}&q=${q}`;

    const msg =
      `Listo 🙌\n\n` +
      `Producto: *${p}*\nPresupuesto: *$${Number(b).toLocaleString("es-CL")}*\nComuna: *${co}*\n\n` +
      `✅ Opción 1:\n${link1}\n\n` +
      `✅ Opción 2 (hasta tu presupuesto):\n${link2}\n\n` +
      `Si me dices *color / tamaño / uso* te afino al tiro.`;

    await waSendText(phoneNumberId, waId, msg, accessToken);
    await upsertConversation(waId, { state: "OFFER_SENT", last_offer_at: nowISO() });
    return;
  }

  // ✅ IA “humana” solo para conversación post-oferta / dudas (anti-loop + horario)
  if (!OPENAI_API_KEY || !aiCfg?.auto_reply_enabled) return;
  if (!withinScheduleChile(aiCfg)) return;
  if (recentlyAi) return;

  const training = (aiCfg.training_data || "").trim();
  const system =
    `Eres el asistente de ventas de Keloke.cl en Chile. ` +
    `Hablas como humano, chileno, natural (sin sonar robot). ` +
    `Objetivo: cerrar venta con confianza, resolver dudas, y guiar a compra. ` +
    `Regla CLAVE: NO repitas la misma pregunta si el cliente ya respondió. ` +
    `Si hay 2 opciones ya enviadas, ahora tu pega es: recomendar 1 y pedir 1 dato final para cerrar (color/tamaño/uso/envío). ` +
    `Sé breve: 1 a 4 líneas.\n\n` +
    (training ? `Contexto adicional:\n${training}\n\n` : "");

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
      max_output_tokens: 200,
    }),
  });

  const oaiJson = await oaiResp.json().catch(() => ({}));
  const outText =
    oaiJson?.output?.[0]?.content?.[0]?.text ||
    oaiJson?.output_text ||
    "";

  if (oaiResp.ok && outText?.trim()) {
    const cleaned = outText.trim().slice(0, 900);

    // evita mandar exactamente lo mismo dos veces
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
        timestamp: new Date((m.timestamp ? parseInt(m.timestamp, 10) : Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        phone_number: waId,
        status: "received",
        whatsapp_message_id: m.id || null,
        message: messageContent,
        contact_name: contactName || null,
        is_read: false,
        created_at: nowISO(),
        updated_at: nowISO(),
      });

      // ✅ Estado: si no hay product, toma el texto como producto (pero limpia URLs largas)
      const conv = (await getConversation(waId)) || {};
      if (!conv.product && msgType === "text" && messageContent) {
        const cleaned = messageContent.replace(/https?:\/\/\S+/g, "").trim();
        if (cleaned.length >= 2) await upsertConversation(waId, { product: cleaned, state: "ASK_BUDGET" });
      } else if (!conv.budget && msgType === "text" && messageContent) {
        const b = extractBudgetLukas(messageContent);
        if (b) await upsertConversation(waId, { budget: b, state: "ASK_COMUNA" });
      } else if (conv.product && conv.budget && !conv.comuna && msgType === "text" && messageContent) {
        if (messageContent.trim().length >= 3) await upsertConversation(waId, { comuna: messageContent.trim(), state: "ASK_USE_CASE" });
      }

      if (aiCfg?.auto_reply_enabled && accessToken) {
        await buildAndSendReply({ phoneNumberId, waId, accessToken, aiCfg });
      }
    }

    return json({ ok: true }, 200);
  } catch (e) {
    console.error("Fatal error:", e);
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
