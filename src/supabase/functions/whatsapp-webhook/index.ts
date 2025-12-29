// supabase/functions/whatsapp-webhook/index.ts
// Deno / Supabase Edge Function

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type WAWebhookBody = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: any;
    }>;
  }>;
};

type AIConfig = {
  auto_reply_enabled: boolean;
  reply_outside_schedule: boolean;
  start_time: string; // "09:00"
  end_time: string;   // "17:00"
  days_enabled: string[]; // ["1","2"...] or ["mon"...]
  training_data: string | null;
  ai_model: string | null;
  ia_provider: string | null;
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function text(data: string, status = 200) {
  return new Response(data, { status });
}

function normalizePhone(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

function stripDiacritics(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(s: string): string {
  return stripDiacritics((s || "").trim().toLowerCase());
}

function nowChile(): Date {
  // Chile timezone: America/Santiago
  // Deno supports Intl timeZone formatting; we just need hour/day in that TZ.
  // We'll derive using formatToParts.
  return new Date();
}

function getChileParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const hh = parseInt(get("hour") || "0", 10);
  const mm = parseInt(get("minute") || "0", 10);
  const wd = get("weekday").toLowerCase(); // mon,tue,wed...
  return { hh, mm, wd };
}

function parseHHMM(s: string): { hh: number; mm: number } {
  const m = (s || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { hh: 0, mm: 0 };
  return { hh: parseInt(m[1], 10), mm: parseInt(m[2], 10) };
}

function isScheduleOk(cfg: AIConfig): { ok: boolean; debug: any } {
  const { hh, mm, wd } = getChileParts(nowChile());
  const start = parseHHMM(cfg.start_time || "09:00");
  const end = parseHHMM(cfg.end_time || "17:00");

  // days_enabled puede venir como ["1","2"...] o ["mon","tue"...]
  const daySet = new Set((cfg.days_enabled || []).map((x) => normalizeText(String(x))));
  const wdKey = wd; // mon/tue/...
  // mapeo a 1-7 (lun=1 ... dom=7)
  const map: Record<string, string> = { mon: "1", tue: "2", wed: "3", thu: "4", fri: "5", sat: "6", sun: "7" };
  const wdNum = map[wdKey] || "";

  const dayOk = daySet.size === 0 ? true : (daySet.has(wdKey) || (wdNum && daySet.has(wdNum)));

  const cur = hh * 60 + mm;
  const st = start.hh * 60 + start.mm;
  const en = end.hh * 60 + end.mm;

  const timeOk = st <= en ? (cur >= st && cur <= en) : (cur >= st || cur <= en); // soporta rangos cruzando medianoche

  const ok = dayOk && timeOk;

  return {
    ok,
    debug: { chile: { hh, mm, wd: wdKey, wdNum }, start, end, dayOk, timeOk },
  };
}

function extractProductBudgetComuna(message: string) {
  const raw = message || "";
  const t = normalizeText(raw);

  // presupuesto: detecta "30 lucas", "30000", "$30.000", "30k"
  let budget: number | null = null;

  const lucasMatch = t.match(/(\d{1,3})\s*lucas?/);
  if (lucasMatch) budget = parseInt(lucasMatch[1], 10) * 1000;

  const kMatch = t.match(/(\d{1,3})\s*k\b/);
  if (!budget && kMatch) budget = parseInt(kMatch[1], 10) * 1000;

  const numMatch = t.replace(/\./g, "").match(/\b(\d{4,7})\b/);
  if (!budget && numMatch) budget = parseInt(numMatch[1], 10);

  // comuna: lo tomamos tal cual si el mensaje parece una comuna (una o dos palabras)
  // Mejor: si el mensaje NO contiene muchos números y es corto.
  let comuna: string | null = null;
  const onlyText = t.replace(/[0-9$]/g, "").trim();
  if (onlyText && onlyText.split(/\s+/).length <= 3 && onlyText.length <= 30) {
    // Ej: "ñuñoa" -> queda "nunoa"
    comuna = stripDiacritics(raw).trim();
  }

  // producto: heurística simple: si dice "busco X", "quiero X", etc.
  let product: string | null = null;
  const prodMatch = t.match(/(busco|buscando|quiero|necesito|es|seria)\s+(una|un|el|la)?\s*([a-zñáéíóú0-9\s-]{3,60})/);
  if (prodMatch) product = prodMatch[3].trim();

  // fallback producto si el mensaje es solo un sustantivo corto y no es comuna
  if (!product && t.length <= 40 && !lucasMatch && !kMatch && !numMatch) {
    product = t;
  }

  return { product, budget, comuna };
}

async function callOpenAI(params: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
}): Promise<string> {
  const { apiKey, model, system, user } = params;

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // Mantén esto corto para WhatsApp
      max_output_tokens: 220,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`OpenAI error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  // Responses API: intentamos sacar texto
  const out = data?.output_text;
  if (typeof out === "string" && out.trim()) return out.trim();

  // fallback: recorrer output
  const chunks = data?.output || [];
  for (const c of chunks) {
    const content = c?.content || [];
    for (const it of content) {
      if (it?.type === "output_text" && it?.text) return String(it.text).trim();
    }
  }
  return "Te leo 🙌 ¿Qué producto buscas y tu presupuesto aprox?";
}

async function sendWhatsAppText(params: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  body: string;
  graphVersion?: string;
}): Promise<any> {
  const { phoneNumberId, accessToken, to, body } = params;
  const graphVersion = params.graphVersion || "v21.0";

  if (!phoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID is empty/undefined");
  if (!accessToken) throw new Error("WHATSAPP_ACCESS_TOKEN is empty/undefined");

  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const jsonResp = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`WA send failed ${resp.status}: ${JSON.stringify(jsonResp)}`);
  }
  return jsonResp;
}

async function getAIConfig(supabase: any): Promise<AIConfig> {
  // usa whatsapp_ai_config (tu tabla “config vieja”)
  const { data, error } = await supabase
    .from("whatsapp_ai_config")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  // defaults “nivel dios” para que nunca quede null y se rompa lógica
  const cfg: AIConfig = {
    auto_reply_enabled: Boolean(data?.auto_reply_enabled ?? true),
    reply_outside_schedule: Boolean(data?.reply_outside_schedule ?? true),
    start_time: String(data?.start_time ?? "09:00"),
    end_time: String(data?.end_time ?? "17:00"),
    days_enabled: Array.isArray(data?.days_enabled) ? data.days_enabled : ["1","2","3","4","5","6","7"],
    training_data: (data?.training_data ?? null),
    ai_model: String(data?.ai_model ?? "gpt-5-mini"),
    ia_provider: String(data?.ia_provider ?? "openai"),
  };

  return cfg;
}

async function getWhatsAppConnection(supabase: any): Promise<{
  phone_number_id: string;
  access_token: string;
  waba_id?: string | null;
}> {
  const { data, error } = await supabase
    .from("social_connections")
    .select("phone_number_id, access_token, waba_id, platform, is_active")
    .eq("platform", "whatsapp")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return {
    phone_number_id: data?.phone_number_id || "",
    access_token: data?.access_token || "",
    waba_id: data?.waba_id ?? null,
  };
}

async function upsertConversation(supabase: any, phone: string, patch: any) {
  // tabla: whatsapp_conversations (según tu screenshot)
  const payload = {
    phone_number: phone,
    ...patch,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .upsert(payload, { onConflict: "phone_number" })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getConversation(supabase: any, phone: string) {
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("phone_number", phone)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function insertMessage(supabase: any, msg: any) {
  const { error } = await supabase.from("whatsapp_messages").insert(msg);
  if (error) throw error;
}

async function alreadyProcessed(supabase: any, waMsgId: string): Promise<boolean> {
  if (!waMsgId) return false;
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("whatsapp_message_id", waMsgId)
    .limit(1);

  if (error) throw error;
  return (data || []).length > 0;
}

function verifySignature(appSecret: string, rawBody: string, signatureHeader: string | null) {
  // Si no tienes APP_SECRET, no validamos (pero recomendado).
  if (!appSecret) return true;
  if (!signatureHeader) return false;

  // Meta: "sha256=..."
  const parts = signatureHeader.split("=");
  if (parts.length !== 2) return false;
  const sig = parts[1];

  // HMAC SHA256
  const key = new TextEncoder().encode(appSecret);
  const data = new TextEncoder().encode(rawBody);

  // Deno crypto
  return crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then((cryptoKey) => crypto.subtle.sign("HMAC", cryptoKey, data))
    .then((buf) => {
      const hash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      return hash === sig;
    })
    .catch(() => false);
}

Deno.serve(async (req) => {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

    // OPTIONAL fallbacks
    const WHATSAPP_PHONE_NUMBER_ID_FALLBACK = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
    const WHATSAPP_ACCESS_TOKEN_FALLBACK = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";

    // Webhook verify secrets
    const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
    const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // --- GET: webhook verification
    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token && challenge && token === VERIFY_TOKEN) {
        return text(challenge, 200);
      }
      return text("Forbidden", 403);
    }

    // --- POST: webhook events
    const rawBody = await req.text();

    // Signature check (if META_APP_SECRET exists)
    const sigHeader = req.headers.get("x-hub-signature-256");
    const sigOk = await verifySignature(META_APP_SECRET, rawBody, sigHeader);
    if (META_APP_SECRET && !sigOk) {
      console.log("Signature invalid");
      return text("Invalid signature", 401);
    }

    let body: WAWebhookBody;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    // Only handle WhatsApp messages
    const change = body?.entry?.[0]?.changes?.[0];
    const value = change?.value;

    // Status updates etc.
    const messages = value?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ ok: true, ignored: true }, 200);
    }

    const msg = messages[0];
    const waMsgId = String(msg?.id ?? "");
    const from = normalizePhone(String(msg?.from ?? ""));
    const textBody = msg?.text?.body ? String(msg.text.body) : "";

    if (!from) {
      console.log("No 'from' in message");
      return json({ ok: true }, 200);
    }

    // dedupe
    if (waMsgId && await alreadyProcessed(supabase, waMsgId)) {
      console.log("Duplicate message ignored:", waMsgId);
      return json({ ok: true, dedupe: true }, 200);
    }

    // Save inbound
    await insertMessage(supabase, {
      from_number: from,
      to_number: null,
      message_type: msg?.type ?? "text",
      message_content: textBody || null,
      direction: "inbound",
      timestamp: new Date().toISOString(),
      phone_number: from,
      status: "received",
      whatsapp_message_id: waMsgId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const cfg = await getAIConfig(supabase);
    const schedule = isScheduleOk(cfg);
    console.log("AI CONFIG:", cfg);
    console.log("Schedule OK (Chile):", schedule.ok, schedule.debug);

    const FORCE_REPLY = cfg.auto_reply_enabled === true;
    const allowBySchedule = schedule.ok || cfg.reply_outside_schedule === true;

    if (!FORCE_REPLY || !allowBySchedule) {
      console.log("Not replying now by config/schedule");
      return json({ ok: true, no_reply: true }, 200);
    }

    // Load WhatsApp connection (phone_number_id + token)
    const conn = await getWhatsAppConnection(supabase);

    const phoneNumberId = conn.phone_number_id || WHATSAPP_PHONE_NUMBER_ID_FALLBACK;
    const accessToken = conn.access_token || WHATSAPP_ACCESS_TOKEN_FALLBACK;

    console.log("WA connection debug:", {
      has_phone_number_id: Boolean(phoneNumberId),
      has_access_token: Boolean(accessToken),
      phone_number_id_preview: phoneNumberId ? phoneNumberId.slice(0, 6) + "..." : null,
    });

    if (!phoneNumberId || !accessToken) {
      // Esta es exactamente la causa del "undefined"
      return json({
        ok: false,
        error: "Missing WhatsApp credentials",
        detail: {
          phone_number_id: phoneNumberId ? "OK" : "EMPTY",
          access_token: accessToken ? "OK" : "EMPTY",
          fix: "Revisa social_connections (platform=whatsapp, is_active=true) y/o Secrets WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN",
        },
      }, 500);
    }

    // Conversation state
    let conv = await getConversation(supabase, from);
    if (!conv) {
      conv = await upsertConversation(supabase, from, {
        state: "ASK_PRODUCT",
        product: null,
        budget: null,
        comuna: null,
      });
    }

    // Update conv fields from message
    const extracted = extractProductBudgetComuna(textBody);
    const patch: any = {};

    if (extracted.product && !conv.product) patch.product = extracted.product;
    if (typeof extracted.budget === "number" && !conv.budget) patch.budget = extracted.budget;
    // comuna: solo si estamos pidiéndola o si conv.comuna está vacía
    if (extracted.comuna && !conv.comuna) patch.comuna = extracted.comuna;

    // Determine next state
    const next = {
      product: patch.product ?? conv.product,
      budget: patch.budget ?? conv.budget,
      comuna: patch.comuna ?? conv.comuna,
    };

    let state = conv.state || "ASK_PRODUCT";
    if (!next.product) state = "ASK_PRODUCT";
    else if (!next.budget) state = "ASK_BUDGET";
    else if (!next.comuna) state = "ASK_COMUNA";
    else state = "READY_TO_OFFER";

    patch.state = state;

    conv = await upsertConversation(supabase, from, patch);

    // Build assistant response (use AI, but keep deterministic prompts so no loops)
    const training = cfg.training_data
      ? `${cfg.training_data}\n\n`
      : "";

    const system = `${training}Eres un asistente de ventas para Keloke.cl (Chile).
Reglas:
- Responde SIEMPRE en español chileno, amable, corto y claro.
- NO repitas la misma pregunta si el cliente ya respondió.
- Si ya tenemos producto, presupuesto y comuna, entrega 1 link de búsqueda y sugiere 2 opciones (sin inventar stock).
- Máximo 2 mensajes cortos en uno (ideal 1).
`;

    let userPrompt = "";
    if (state === "ASK_PRODUCT") {
      userPrompt = `Cliente dijo: "${textBody}". Aún NO tengo producto. Pide el producto que busca (una sola pregunta).`;
    } else if (state === "ASK_BUDGET") {
      userPrompt = `Cliente busca: "${conv.product}". Cliente dijo: "${textBody}". Aún NO tengo presupuesto. Pide presupuesto aprox (una sola pregunta).`;
    } else if (state === "ASK_COMUNA") {
      userPrompt = `Producto: "${conv.product}", presupuesto: "${conv.budget}". Cliente dijo: "${textBody}". Aún NO tengo comuna. Pide comuna (una sola pregunta).`;
    } else {
      const q = encodeURIComponent(String(conv.product || "producto"));
      const link = `https://keloke.cl/search?q=${q}`;
      userPrompt = `Tengo: producto="${conv.product}", presupuesto=${conv.budget}, comuna="${conv.comuna}".
Cliente dijo: "${textBody}".
Responde confirmando y entrega este link de búsqueda: ${link}. Luego sugiere que elija 1 opción del link o que aclare color/tamaño si aplica.`;
    }

    let replyText = "";
    try {
      if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY secret");
      replyText = await callOpenAI({
        apiKey: OPENAI_API_KEY,
        model: cfg.ai_model || "gpt-5-mini",
        system,
        user: userPrompt,
      });
    } catch (e) {
      console.log("OpenAI failed, fallback:", String(e));
      // fallback determinista (nunca loop)
      if (state === "ASK_PRODUCT") replyText = "Te leo 🙌 ¿Qué producto estás buscando?";
      else if (state === "ASK_BUDGET") replyText = `Perfecto 🙌 ¿Qué presupuesto aprox tienes para ${conv.product}? (ej: 30 lucas)`;
      else if (state === "ASK_COMUNA") replyText = "Perfecto 🙌 ¿En qué comuna estás?";
      else {
        const q = encodeURIComponent(String(conv.product || "producto"));
        replyText = `Listo 🙌 Mira opciones acá: https://keloke.cl/search?q=${q}\n¿Te tinca alguna del link o me dices color/tamaño?`;
      }
    }

    // Send WhatsApp
    const waResp = await sendWhatsAppText({
      phoneNumberId,
      accessToken,
      to: from,
      body: replyText,
      graphVersion: "v21.0",
    });

    // Save outbound
    await insertMessage(supabase, {
      from_number: null,
      to_number: from,
      message_type: "text",
      message_content: replyText,
      direction: "outbound",
      timestamp: new Date().toISOString(),
      phone_number: from,
      status: "sent",
      whatsapp_message_id: waResp?.messages?.[0]?.id ?? null,
      platform_response: waResp ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return json({ ok: true }, 200);
  } catch (err) {
    console.log("Fatal error:", err);
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
});
