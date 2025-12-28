// supabase/functions/whatsapp-webhook/index.ts
// Deno / Supabase Edge Function

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type WAIncomingMessage = {
  from: string;
  id: string;
  timestamp?: string;
  type: string;
  text?: { body: string };
  button?: { text: string; payload?: string };
  interactive?: any;
  image?: any;
  audio?: any;
  video?: any;
  document?: any;
};

type WAValue = {
  messages?: WAIncomingMessage[];
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  metadata?: { phone_number_id?: string };
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN")!;
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";
const FORCE_REPLY = (Deno.env.get("FORCE_REPLY") || "").toLowerCase() === "true";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status = 200) {
  return new Response(body, { status });
}

/**
 * Chile time / weekday helpers (America/Santiago)
 */
function getChileParts(now = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(now);
  const out: Record<string, string> = {};
  for (const p of parts) out[p.type] = p.value;
  // weekday: Mon/Tue/...
  const wd = (out.weekday || "").toLowerCase(); // mon, tue...
  const hh = Number(out.hour || "0");
  const mm = Number(out.minute || "0");
  return { wd, hh, mm };
}

function parseHHMM(s?: string | null): { hh: number; mm: number } | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

function normalizeDaysEnabled(days: any): Set<string> {
  const set = new Set<string>();
  if (!days) return set;
  let arr: any[] = [];
  if (Array.isArray(days)) arr = days;
  else if (typeof days === "string") {
    // Sometimes it's stored as '["1","2","mon","tue"]'
    try {
      const parsed = JSON.parse(days);
      if (Array.isArray(parsed)) arr = parsed;
      else arr = [days];
    } catch {
      arr = [days];
    }
  } else {
    arr = [days];
  }

  for (const d of arr) {
    const v = String(d).trim().toLowerCase();
    if (!v) continue;
    set.add(v);
  }
  return set;
}

function scheduleOk(config: any) {
  // If config incomplete, assume OK
  const start = parseHHMM(config?.start_time);
  const end = parseHHMM(config?.end_time);
  const daysSet = normalizeDaysEnabled(config?.days_enabled);

  const { wd, hh, mm } = getChileParts(new Date());
  const minutes = hh * 60 + mm;

  // weekday mapping
  const wdMap: Record<string, string> = {
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
    sun: "sun",
  };

  // Accept either mon/tue... or 1-7 (Mon=1..Sun=7)
  const isoNum: Record<string, string> = {
    mon: "1",
    tue: "2",
    wed: "3",
    thu: "4",
    fri: "5",
    sat: "6",
    sun: "7",
  };

  const todayOk =
    daysSet.size === 0 ||
    daysSet.has(wdMap[wd] || wd) ||
    daysSet.has(isoNum[wd] || "");

  if (!todayOk) return false;
  if (!start || !end) return true;

  const startMin = start.hh * 60 + start.mm;
  const endMin = end.hh * 60 + end.mm;

  // Same-day window (09:00-17:00)
  if (startMin <= endMin) return minutes >= startMin && minutes <= endMin;

  // Overnight window (e.g. 22:00-06:00)
  return minutes >= startMin || minutes <= endMin;
}

/**
 * Parsing / extraction helpers
 */
function stripAccents(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function normalizeText(s: string) {
  return stripAccents(String(s || "").trim().toLowerCase());
}

function extractProductFromUrl(text: string): string | null {
  const m = text.match(/\/products\/([a-zA-Z0-9\-_%]+)/);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]).split("?")[0];
  return slug.replace(/[-_]+/g, " ").trim();
}

function parseBudgetCLP(text: string): number | null {
  const t = normalizeText(text);

  // Examples:
  // "30 lucas", "30k", "30.000", "30000", "$30.000", "20 mil", "25mil"
  // 1) number + lucas
  const lucas = t.match(/(\d{1,3})(?:\s*)(lucas?|lk)\b/);
  if (lucas) return Number(lucas[1]) * 1000;

  // 2) number + k
  const k = t.match(/\b(\d{1,3})\s*k\b/);
  if (k) return Number(k[1]) * 1000;

  // 3) number + mil
  const mil = t.match(/\b(\d{1,3})\s*mil\b/);
  if (mil) return Number(mil[1]) * 1000;

  // 4) explicit CLP with separators
  const m = t.match(/\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,8})/);
  if (!m) return null;
  const raw = m[1].replace(/[.,]/g, "");
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // Discard very small numbers (like "2 opciones")
  if (n < 1000) return null;
  return n;
}

function parseComuna(text: string): string | null {
  const t = String(text || "").trim();
  if (!t) return null;

  // If user sends only one/two words, treat as comuna
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length <= 4 && t.length <= 40) return t;

  // If user writes "en ñuñoa", "comuna ñuñoa", etc
  const m = normalizeText(t).match(/\b(comuna|en)\s+([a-záéíóúñü\s\-]{3,40})$/i);
  if (m) return String(m[2]).trim();

  return null;
}

/**
 * WhatsApp send helper
 */
async function sendWhatsAppText(to: string, body: string) {
  const url = `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("WA send failed:", res.status, data);
    throw new Error(`WA send failed ${res.status}`);
  }
  return data;
}

/**
 * OpenAI helper (Responses API)
 */
async function openAIRespond(system: string, user: string) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // keep it stable and cheap
      temperature: 0.5,
      max_output_tokens: 260,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("OpenAI error:", res.status, data);
    throw new Error(`OpenAI error ${res.status}`);
  }

  // Responses API text extraction
  const output = data?.output ?? [];
  let text = "";
  for (const item of output) {
    if (item?.type === "message") {
      const content = item?.content ?? [];
      for (const c of content) {
        if (c?.type === "output_text") text += c?.text ?? "";
      }
    }
  }
  return (text || "").trim();
}

/**
 * DB helpers
 */
async function getAIConfig() {
  const { data, error } = await sb
    .from("whatsapp_ai_config")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function ensureContact(phone: string, name?: string | null) {
  const { data: existing, error: selErr } = await sb
    .from("whatsapp_contacts")
    .select("*")
    .eq("phone_number", phone)
    .limit(1)
    .maybeSingle();

  if (selErr) throw selErr;

  if (existing) {
    const updates: any = { last_message_at: new Date().toISOString() };
    if (name && !existing.contact_name) updates.contact_name = name;
    await sb.from("whatsapp_contacts").update(updates).eq("phone_number", phone);
    return existing;
  }

  const insert = {
    phone_number: phone,
    contact_name: name || null,
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb.from("whatsapp_contacts").insert(insert).select().single();
  if (error) throw error;
  return data;
}

async function getOrCreateConversation(phone: string) {
  const { data, error } = await sb
    .from("whatsapp_conversations")
    .select("*")
    .eq("phone_number", phone)
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  if (data) return data;

  const insert = {
    phone_number: phone,
    state: "ASK_PRODUCT",
    product: null,
    budget: null,
    comuna: null,
    updated_at: new Date().toISOString(),
  };

  const { data: created, error: insErr } = await sb
    .from("whatsapp_conversations")
    .insert(insert)
    .select()
    .single();
  if (insErr) throw insErr;
  return created;
}

async function saveMessage(row: any) {
  const { error } = await sb.from("whatsapp_messages").insert(row);
  if (error) throw error;
}

async function alreadyProcessed(waMessageId: string) {
  const { data, error } = await sb
    .from("whatsapp_messages")
    .select("id")
    .eq("whatsapp_message_id", waMessageId)
    .limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}

async function updateConversation(phone: string, patch: any) {
  patch.updated_at = new Date().toISOString();
  const { data, error } = await sb
    .from("whatsapp_conversations")
    .update(patch)
    .eq("phone_number", phone)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Offer builder (deterministic links, no humo)
 * - Generates 2 search links on keloke.cl
 */
function buildOfferLinks(product: string, budget: number) {
  const q1 = encodeURIComponent(product);
  // Suggest related query variant
  const alt = product.includes("lampara")
    ? "lampara escritorio"
    : `${product} oferta`;
  const q2 = encodeURIComponent(alt);

  const link1 = `https://keloke.cl/search?q=${q1}`;
  const link2 = `https://keloke.cl/search?q=${q2}`;

  // keep message short and sellable
  const msg =
    `Perfecto 🙌 Con presupuesto aprox $${budget.toLocaleString("es-CL")} te dejo 2 opciones para mirar altiro:\n\n` +
    `1) ${product} (búsqueda directa): ${link1}\n` +
    `2) Alternativa recomendada: ${link2}\n\n` +
    `¿Quieres que sea más *moderna*, *minimalista* o *con luces RGB*?`;

  return msg;
}

/**
 * State machine
 */
async function handleInboundText(phone: string, name: string | null, incomingText: string, aiConfig: any) {
  // Ensure contact + conversation exist
  await ensureContact(phone, name);
  let convo = await getOrCreateConversation(phone);

  const clean = String(incomingText || "").trim();
  const cleanNorm = normalizeText(clean);

  // Global quick commands
  if (cleanNorm === "reset" || cleanNorm === "reiniciar") {
    convo = await updateConversation(phone, {
      state: "ASK_PRODUCT",
      product: null,
      budget: null,
      comuna: null,
    });
    return "Listo ✅ Reinicié la conversación.\n¿Qué producto buscas y tu presupuesto aprox (en lucas)?";
  }

  // If already ready, don't loop
  if (convo.state === "READY_TO_OFFER") {
    // if we have all data, send offer and move state
    if (convo.product && convo.budget && convo.comuna) {
      const offer = buildOfferLinks(convo.product, Number(convo.budget));
      await updateConversation(phone, { state: "OFFER_SENT" });
      return offer;
    }
    // otherwise repair missing fields safely
    if (!convo.product) return "Te leo 🙌 ¿Qué producto estás buscando?";
    if (!convo.budget) return "Perfecto 🙌 ¿Cuál es tu presupuesto aprox? (ej: 30 lucas)";
    if (!convo.comuna) return "Perfecto 🙌 ¿En qué comuna estás?";
  }

  if (convo.state === "OFFER_SENT") {
    // continue in assist mode with AI (or guide)
    // if user asks new product, restart lightly
    const maybeBudget = parseBudgetCLP(clean);
    const maybeProduct = extractProductFromUrl(clean) || (clean.length <= 60 ? clean : null);
    if (maybeProduct && maybeProduct !== convo.product) {
      convo = await updateConversation(phone, {
        state: "ASK_BUDGET",
        product: maybeProduct,
        budget: null,
        comuna: null,
      });
      return `Dale 🙌 ¿Presupuesto aprox para *${maybeProduct}*? (ej: 30 lucas)`;
    }

    // AI free follow-up
    const training = aiConfig?.training_data || "";
    const system =
      `Eres el asistente de ventas y soporte de Keloke.cl (Chile).\n` +
      `Reglas:\n- Responde corto, claro y con tono chileno profesional.\n- Si falta información, pide UNA cosa a la vez.\n- Nunca repitas la misma pregunta si el cliente ya respondió.\n- Si el cliente ya entregó comuna, no la vuelvas a pedir.\n\n` +
      `Contexto conversación:\nProducto: ${convo.product || "N/A"}\nPresupuesto: ${convo.budget || "N/A"}\nComuna: ${convo.comuna || "N/A"}\n\n` +
      `Entrenamiento adicional:\n${training}`;

    try {
      const ai = await openAIRespond(system, clean);
      return ai || "Te leo 🙌 ¿Quieres que te recomiende 2 opciones con link?";
    } catch {
      return "Te leo 🙌 ¿Quieres que te recomiende 2 opciones con link?";
    }
  }

  // If user sends a product URL, extract it
  const productFromUrl = extractProductFromUrl(clean);

  // Try to parse budget/comuna from message (user may send multiple in one)
  const budget = parseBudgetCLP(clean);
  const comuna = parseComuna(clean);

  // State transitions
  if (convo.state === "ASK_PRODUCT") {
    const product =
      productFromUrl ||
      (clean.length <= 80 ? clean : null);

    if (!product) {
      return "Te leo 🙌 ¿Qué producto estás buscando?";
    }

    // If message also includes budget, jump ahead
    if (budget) {
      convo = await updateConversation(phone, { product, budget, state: "ASK_COMUNA" });
      return "Perfecto 🙌 ¿En qué comuna estás?";
    }

    convo = await updateConversation(phone, { product, state: "ASK_BUDGET" });
    return `Perfecto 🙌 ¿Cuál es tu presupuesto aprox para *${product}*? (ej: 30 lucas)`;
  }

  if (convo.state === "ASK_BUDGET") {
    const b = budget;
    if (!b) {
      return "Perfecto 🙌 ¿Cuál es tu presupuesto aprox? (ej: 30 lucas)";
    }
    convo = await updateConversation(phone, { budget: b, state: "ASK_COMUNA" });
    return "Perfecto 🙌 ¿En qué comuna estás?";
  }

  if (convo.state === "ASK_COMUNA") {
    const c = comuna;
    if (!c) {
      return "Perfecto 🙌 ¿En qué comuna estás?";
    }
    convo = await updateConversation(phone, { comuna: c, state: "READY_TO_OFFER" });

    // Offer immediately (no loops)
    const offer = buildOfferLinks(convo.product || "producto", Number(convo.budget || 0));
    await updateConversation(phone, { state: "OFFER_SENT" });
    return offer;
  }

  // Unknown state fallback: reset safely
  await updateConversation(phone, { state: "ASK_PRODUCT", product: null, budget: null, comuna: null });
  return "Te leo 🙌 ¿Qué producto estás buscando y tu presupuesto aprox?";
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);

    // 1) Webhook verification (GET)
    if (req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
        return textResponse(challenge || "", 200);
      }
      return textResponse("Forbidden", 403);
    }

    // 2) Incoming messages (POST)
    if (req.method !== "POST") return textResponse("Method Not Allowed", 405);

    const body = await req.json().catch(() => null);
    if (!body) return json({ ok: true });

    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value: WAValue | undefined = changes?.value;

    const messages = value?.messages || [];
    if (messages.length === 0) return json({ ok: true });

    // Config: SINGLE source of truth
    const aiConfig = await getAIConfig();

    const enabled = !!aiConfig?.auto_reply_enabled;
    const scheduleOK = scheduleOk(aiConfig);
    const allowNow = FORCE_REPLY || aiConfig?.reply_outside_schedule === true || scheduleOK;

    // For each message (usually 1)
    for (const m of messages) {
      const from = m.from; // user phone
      const waId = m.id;

      // Idempotency: if already processed, skip completely
      if (await alreadyProcessed(waId)) {
        console.log("Skip duplicate:", waId);
        continue;
      }

      // Extract name (if provided)
      const contactName =
        value?.contacts?.[0]?.profile?.name ||
        null;

      // Extract text
      let incomingText = "";
      if (m.type === "text") incomingText = m.text?.body || "";
      else if (m.type === "button") incomingText = m.button?.text || "";
      else if (m.type === "interactive") incomingText = JSON.stringify(m.interactive || {});
      else incomingText = `[${m.type}]`;

      // Save inbound message
      await saveMessage({
        from_number: from,
        to_number: WHATSAPP_PHONE_NUMBER_ID,
        message_type: m.type,
        message_content: incomingText,
        direction: "inbound",
        timestamp: new Date().toISOString(),
        phone_number: from,
        status: "received",
        whatsapp_message_id: waId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Always update contact/conversation bookkeeping
      await ensureContact(from, contactName);

      // If AI disabled or outside schedule, don't reply (but do not break)
      if (!enabled) {
        console.log("AI disabled -> stored only");
        continue;
      }
      if (!allowNow) {
        console.log("Outside schedule -> stored only");
        continue;
      }

      // Generate reply using state machine (+ optional AI in follow-ups)
      const reply = await handleInboundText(from, contactName, incomingText, aiConfig);

      // Send reply to WhatsApp
      const waResp = await sendWhatsAppText(from, reply);

      // Save outbound message
      await saveMessage({
        from_number: WHATSAPP_PHONE_NUMBER_ID,
        to_number: from,
        message_type: "text",
        message_content: reply,
        direction: "outbound",
        timestamp: new Date().toISOString(),
        phone_number: from,
        status: "sent",
        whatsapp_message_id: waResp?.messages?.[0]?.id || null,
        platform_response: waResp || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    return json({ ok: true });
  } catch (err) {
    console.error("Fatal error:", err);
    return json({ ok: false, error: String(err?.message || err) }, 200);
  }
});
