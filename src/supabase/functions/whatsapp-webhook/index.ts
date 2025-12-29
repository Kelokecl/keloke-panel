/// <reference lib="deno.unstable" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// -------------------- ENV --------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const META_VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") || "verify_token";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") || ""; // opcional (firma)

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}
if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// -------------------- TYPES (WhatsApp) --------------------
type WaWebhook = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: any;
    }>;
  }>;
};

type WaMessage = {
  id: string; // whatsapp_message_id
  from: string; // wa_id del cliente
  timestamp?: string;
  type: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  video?: { id?: string; mime_type?: string; caption?: string };
  audio?: { id?: string; mime_type?: string };
  document?: { id?: string; filename?: string; mime_type?: string; caption?: string };
};

type SocialConn = {
  platform: string;
  phone_number_id: string;
  waba_id: string | null;
  access_token: string;
  is_active: boolean;
};

type AiSettings = {
  is_enabled: boolean;
  only_outside_hours: boolean;
  start_time: string; // "09:00:00" o "09:00"
  end_time: string;
  days: number[]; // 1..7
  training_context: string;
  provider: string;
  model: string;
};

type AiConfig = {
  auto_reply_enabled: boolean;
  reply_outside_schedule: boolean;
  start_time: string;
  end_time: string;
  days_enabled: string[]; // ["1","2"...]
  training_data: string;
  ai_provider: string;
  ai_model: string;
};

// -------------------- HELPERS --------------------
function json(resBody: any, status = 200) {
  return new Response(JSON.stringify(resBody), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function text(resBody: string, status = 200) {
  return new Response(resBody, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function nowChileParts() {
  // Chile (America/Santiago)
  const dt = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = fmt.formatToParts(dt);
  const hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value || "0");
  const wdStr = (parts.find((p) => p.type === "weekday")?.value || "").toLowerCase();
  // Map: sun..sat -> 7..6? Aquí usaremos 1..7 (lun=1..dom=7)
  const map: Record<string, number> = {
    mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
  };
  const day = map[wdStr.slice(0, 3)] ?? 7;
  return { hour, minute, day };
}

function parseTimeToMinutes(t: string) {
  // "09:00" / "09:00:00"
  const s = t.trim();
  const [hh, mm] = s.split(":");
  return Number(hh) * 60 + Number(mm);
}

function isWithinSchedule(settings: AiSettings) {
  const { hour, minute, day } = nowChileParts();
  const nowM = hour * 60 + minute;
  const startM = parseTimeToMinutes(settings.start_time);
  const endM = parseTimeToMinutes(settings.end_time);

  const dayOk = settings.days.includes(day);
  const timeOk = nowM >= startM && nowM <= endM;
  return dayOk && timeOk;
}

function normalizePhone(s: string) {
  return (s || "").replace(/[^\d]/g, "");
}

function safeTextFromMessage(m: WaMessage): { message_type: string; message_content: string | null; media_id: string | null; caption: string | null; mime: string | null; filename: string | null } {
  const type = m.type;
  if (type === "text") {
    const body = m.text?.body?.trim() || "";
    return { message_type: "text", message_content: body || null, media_id: null, caption: null, mime: null, filename: null };
  }
  if (type === "image") {
    return { message_type: "image", message_content: null, media_id: m.image?.id || null, caption: m.image?.caption || null, mime: m.image?.mime_type || null, filename: null };
  }
  if (type === "video") {
    return { message_type: "video", message_content: null, media_id: m.video?.id || null, caption: m.video?.caption || null, mime: m.video?.mime_type || null, filename: null };
  }
  if (type === "audio") {
    return { message_type: "audio", message_content: null, media_id: m.audio?.id || null, caption: null, mime: m.audio?.mime_type || null, filename: null };
  }
  if (type === "document") {
    return { message_type: "document", message_content: null, media_id: m.document?.id || null, caption: m.document?.caption || null, mime: m.document?.mime_type || null, filename: m.document?.filename || null };
  }
  // otros tipos:
  return { message_type: type || "unknown", message_content: null, media_id: null, caption: null, mime: null, filename: null };
}

// -------------------- DB LOADERS --------------------
async function getSocialConn(): Promise<SocialConn | null> {
  const { data, error } = await supabase
    .from("social_connections")
    .select("platform, phone_number_id, waba_id, access_token, is_active")
    .eq("platform", "whatsapp")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("social_connections error:", error);
    return null;
  }
  return data as SocialConn | null;
}

async function getAiSettings(): Promise<AiSettings | null> {
  // 1) prefer whatsapp_ai_settings (como lo tenías)
  const s1 = await supabase
    .from("whatsapp_ai_settings")
    .select("is_enabled, only_outside_hours, start_time, end_time, days, training_context, provider, model")
    .eq("id", 1)
    .maybeSingle();

  if (!s1.error && s1.data) {
    const d = s1.data as any;
    return {
      is_enabled: !!d.is_enabled,
      only_outside_hours: !!d.only_outside_hours,
      start_time: String(d.start_time ?? "09:00"),
      end_time: String(d.end_time ?? "17:00"),
      days: Array.isArray(d.days) ? d.days.map((x: any) => Number(x)) : [1,2,3,4,5,6,7],
      training_context: String(d.training_context ?? ""),
      provider: String(d.provider ?? "openai"),
      model: String(d.model ?? "gpt-5-mini"),
    };
  }

  // 2) fallback whatsapp_ai_config
  const s2 = await supabase
    .from("whatsapp_ai_config")
    .select("auto_reply_enabled, reply_outside_schedule, start_time, end_time, days_enabled, training_data, ai_provider, ai_model")
    .limit(1)
    .maybeSingle();

  if (s2.error || !s2.data) {
    if (s2.error) console.error("whatsapp_ai_config error:", s2.error);
    return null;
  }

  const c = s2.data as AiConfig;
  return {
    is_enabled: !!c.auto_reply_enabled,
    only_outside_hours: !!c.reply_outside_schedule, // ojo: nombres distintos, pero sirve
    start_time: String(c.start_time ?? "09:00"),
    end_time: String(c.end_time ?? "17:00"),
    days: Array.isArray(c.days_enabled) ? c.days_enabled.map((x) => Number(x)) : [1,2,3,4,5,6,7],
    training_context: String(c.training_data ?? ""),
    provider: String(c.ai_provider ?? "openai"),
    model: String(c.ai_model ?? "gpt-5-mini"),
  };
}

async function getConversation(phone: string) {
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select("phone_number, state, product, budget, comuna, updated_at")
    .eq("phone_number", phone)
    .maybeSingle();

  if (error) {
    console.error("getConversation error:", error);
    return null;
  }
  return data as any;
}

async function upsertConversation(phone: string, patch: Partial<{ state: string; product: string | null; budget: number | null; comuna: string | null }>) {
  const existing = await getConversation(phone);
  const payload: any = {
    phone_number: phone,
    state: patch.state ?? existing?.state ?? "NEW",
    product: patch.product ?? existing?.product ?? null,
    budget: patch.budget ?? existing?.budget ?? null,
    comuna: patch.comuna ?? existing?.comuna ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("whatsapp_conversations").upsert(payload, { onConflict: "phone_number" });
  if (error) console.error("upsertConversation error:", error);
}

async function messageAlreadyProcessed(waMessageId: string) {
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("whatsapp_message_id", waMessageId)
    .limit(1);

  if (error) {
    console.error("messageAlreadyProcessed error:", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

async function insertInboundMessage(args: {
  from_number: string;
  to_number: string | null;
  phone_number: string;
  whatsapp_message_id: string;
  message_type: string;
  message_content: string | null;
  media_id: string | null;
  caption: string | null;
  media_mime_type: string | null;
  media_filename: string | null;
}) {
  // Insert mínimo “seguro” (columnas muy probables según tu tabla)
  const row: any = {
    from_number: args.from_number,
    to_number: args.to_number,
    phone_number: args.phone_number,
    direction: "inbound",
    whatsapp_message_id: args.whatsapp_message_id,
    message_type: args.message_type,
    message_content: args.message_content,
    caption: args.caption,
    media_id: args.media_id,
    media_mime_type: args.media_mime_type,
    media_filename: args.media_filename,
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("whatsapp_messages").insert(row);
  if (error) console.error("insertInboundMessage error:", error);
}

async function insertOutboundMessage(args: {
  from_number: string | null;
  to_number: string;
  phone_number: string;
  message_type: string;
  message_content: string;
  platform_response: any;
}) {
  const row: any = {
    from_number: args.from_number,
    to_number: args.to_number,
    phone_number: args.phone_number,
    direction: "outbound",
    message_type: args.message_type,
    message_content: args.message_content,
    platform_response: args.platform_response,
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("whatsapp_messages").insert(row);
  if (error) console.error("insertOutboundMessage error:", error);
}

// -------------------- META SIGNATURE (optional) --------------------
async function verifyMetaSignature(req: Request, rawBody: string) {
  if (!META_APP_SECRET) return true; // si no hay secret, no bloqueamos
  const sig = req.headers.get("x-hub-signature-256") || "";
  if (!sig.startsWith("sha256=")) return false;

  const their = sig.slice("sha256=".length);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(META_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const ours = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return ours === their;
}

// -------------------- WHATSAPP SEND --------------------
async function sendWhatsAppText(conn: SocialConn, to: string, body: string) {
  const phoneNumberId = conn.phone_number_id;
  if (!phoneNumberId) throw new Error("phone_number_id is missing (undefined)");

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${conn.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error("WA send failed:", resp.status, data);
    throw new Error(`WA send failed ${resp.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// -------------------- AI (OpenAI Responses API) --------------------
async function callOpenAI(model: string, system: string, messages: Array<{ role: "user" | "assistant"; content: string }>) {
  // Creamos un prompt compacto pero con contexto + historial
  const input = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input,
      // importantísimo para WhatsApp: respuesta corta, accionable
      text: { format: { type: "text" } },
    }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    console.error("OpenAI error:", resp.status, data);
    throw new Error(`OpenAI failed ${resp.status}: ${JSON.stringify(data)}`);
  }

  // extraer texto
  const out = (data.output_text ?? "").trim();
  return out || "Te leo 🙌 ¿Qué producto buscas y tu presupuesto aprox?";
}

// -------------------- STATE MACHINE (no loop) --------------------
function extractBudget(text: string): number | null {
  const t = text.toLowerCase();
  // soporta "30 lucas", "30000", "30.000"
  const m1 = t.match(/(\d{1,3})(?:\s*lucas|\s*luca)/);
  if (m1) return Number(m1[1]) * 1000;

  const m2 = t.match(/(\d[\d\.\s]{2,})/);
  if (m2) {
    const n = Number(m2[1].replace(/[^\d]/g, ""));
    if (Number.isFinite(n) && n >= 1000) return n;
  }
  return null;
}

function extractProduct(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  // heurística simple: si el texto es muy corto tipo "hola", no
  const bad = ["hola", "buenas", "hi", "hello", "gracias", "???", "ok"];
  if (bad.includes(t.toLowerCase())) return null;
  return t;
}

async function decideNextReply(phone: string, inboundText: string | null) {
  const conv = await getConversation(phone);
  const state = conv?.state ?? "NEW";

  // si no hay texto (imagen/audio/etc), pedimos claridad
  if (!inboundText || !inboundText.trim()) {
    return {
      reply: "Te leo 🙌 ¿Me confirmas en texto qué producto buscas y tu presupuesto aprox? Así te mando 2 opciones con link.",
      patch: { state: "ASK_PRODUCT_BUDGET" },
    };
  }

  const t = inboundText.trim();

  if (state === "NEW" || state === "ASK_PRODUCT_BUDGET") {
    const budget = extractBudget(t);
    const product = extractProduct(t);

    // Si el usuario ya dijo producto y presupuesto en un solo mensaje:
    if (budget && product) {
      return {
        reply: "Perfecto 🙌 ¿En qué comuna estás? (para estimar entrega/tiempos)",
        patch: { state: "ASK_COMUNA", product, budget },
      };
    }

    // Si solo presupuesto:
    if (budget && !conv?.product) {
      return {
        reply: "Perfecto 🙌 ¿Qué producto estás buscando? así te mando 2 opciones con link.",
        patch: { state: "ASK_PRODUCT", budget },
      };
    }

    // Si solo producto:
    if (product && !budget) {
      return {
        reply: "Perfecto 🙌 ¿Cuál es tu presupuesto aprox (en lucas)?",
        patch: { state: "ASK_BUDGET", product },
      };
    }

    return {
      reply: "Te leo 🙌 ¿Qué producto buscas y tu presupuesto aprox? así te mando 2 opciones con link.",
      patch: { state: "ASK_PRODUCT_BUDGET" },
    };
  }

  if (state === "ASK_PRODUCT") {
    const product = extractProduct(t);
    if (product) {
      if (conv?.budget) {
        return {
          reply: "Perfecto 🙌 ¿En qué comuna estás? (para estimar entrega/tiempos)",
          patch: { state: "ASK_COMUNA", product },
        };
      }
      return {
        reply: "Perfecto 🙌 ¿Cuál es tu presupuesto aprox (en lucas)?",
        patch: { state: "ASK_BUDGET", product },
      };
    }
    return { reply: "¿Qué producto estás buscando? 🙌", patch: {} };
  }

  if (state === "ASK_BUDGET") {
    const budget = extractBudget(t);
    if (budget) {
      return {
        reply: "Perfecto 🙌 ¿En qué comuna estás? (para estimar entrega/tiempos)",
        patch: { state: "ASK_COMUNA", budget },
      };
    }
    return { reply: "¿Cuál es tu presupuesto aprox? (ej: 30 lucas)", patch: {} };
  }

  if (state === "ASK_COMUNA") {
    const comuna = t;
    // listo para ofrecer
    return {
      reply: "Perfecto 🙌 Dame 10 segundos y te mando 2 opciones con link.",
      patch: { state: "READY_TO_OFFER", comuna },
    };
  }

  if (state === "READY_TO_OFFER") {
    // aquí ya entra la IA “real” (sin loops)
    return { reply: null, patch: {} };
  }

  return { reply: "Te leo 🙌 ¿Qué producto buscas y tu presupuesto aprox?", patch: { state: "ASK_PRODUCT_BUDGET" } };
}

// -------------------- MAIN HANDLER --------------------
Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);

    // -------- GET: verification --------
    if (req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token === META_VERIFY_TOKEN && challenge) {
        return text(challenge, 200);
      }
      return text("Forbidden", 403);
    }

    // -------- POST: webhook events --------
    const rawBody = await req.text();

    // firma opcional (si pones META_APP_SECRET)
    const okSig = await verifyMetaSignature(req, rawBody);
    if (!okSig) return text("Invalid signature", 401);

    const payload = JSON.parse(rawBody) as WaWebhook;

    const conn = await getSocialConn();
    if (!conn) {
      console.error("No active social_connections row for whatsapp");
      return json({ ok: true, warning: "no social connection active" }, 200);
    }

    const ai = await getAiSettings();
    if (!ai) {
      console.error("No AI settings/config found");
      // no matamos el webhook, solo respondemos 200 a Meta
      return json({ ok: true, warning: "no ai config" }, 200);
    }

    // Extraer mensajes
    const changes = payload.entry?.flatMap((e) => e.changes ?? []) ?? [];
    const msgEvents = changes
      .map((c) => c.value)
      .filter(Boolean)
      .flatMap((v) => v.messages ?? []) as WaMessage[];

    // si no hay mensajes (status updates, etc.)
    if (!msgEvents.length) return json({ ok: true }, 200);

    for (const m of msgEvents) {
      const from = normalizePhone(m.from);
      const waMessageId = m.id;

      // Dedup: si ya lo procesamos, no respondemos otra vez
      if (await messageAlreadyProcessed(waMessageId)) {
        console.log("Duplicate message ignored:", waMessageId);
        continue;
      }

      const parsed = safeTextFromMessage(m);

      // Guardar inbound (mínimo)
      await insertInboundMessage({
        from_number: from,
        to_number: null,
        phone_number: from,
        whatsapp_message_id: waMessageId,
        message_type: parsed.message_type,
        message_content: parsed.message_content,
        media_id: parsed.media_id,
        caption: parsed.caption,
        media_mime_type: parsed.mime,
        media_filename: parsed.filename,
      });

      // Si IA está apagada, no respondemos
      if (!ai.is_enabled) continue;

      // Horario
      const within = isWithinSchedule(ai);
      const shouldReply = ai.only_outside_hours ? !within : true;
      if (!shouldReply) continue;

      // Máquina de estados (evita loop)
      const decision = await decideNextReply(from, parsed.message_content);
      if (decision.patch && Object.keys(decision.patch).length) {
        await upsertConversation(from, decision.patch as any);
      }

      // Si state machine devolvió reply directo, lo mandamos y listo
      if (decision.reply) {
        const waResp = await sendWhatsAppText(conn, from, decision.reply);
        await insertOutboundMessage({
          from_number: conn.phone_number_id,
          to_number: from,
          phone_number: from,
          message_type: "text",
          message_content: decision.reply,
          platform_response: waResp,
        });
        continue;
      }

      // Si ya estamos READY_TO_OFFER, usamos IA real con contexto
      const conv = await getConversation(from);
      const context = `
${ai.training_context}

Reglas:
- Responde en español chileno, amable y vendedor.
- Sé breve (1-3 mensajes max).
- Si ya tenemos producto/presupuesto/comuna: ofrece 2 alternativas y pide confirmación para enviar link.
- Nunca repitas la misma pregunta si el dato ya está guardado.
- Si falta un dato, pregunta SOLO ese dato.
Datos actuales:
- Producto: ${conv?.product ?? "N/A"}
- Presupuesto: ${conv?.budget ?? "N/A"}
- Comuna: ${conv?.comuna ?? "N/A"}
Estado: ${conv?.state ?? "N/A"}
`;

      // Historial corto (últimos 8 mensajes) para coherencia
      const { data: history } = await supabase
        .from("whatsapp_messages")
        .select("direction, message_content")
        .eq("phone_number", from)
        .order("timestamp", { ascending: false })
        .limit(8);

      const hist = (history ?? [])
        .reverse()
        .filter((x: any) => x.message_content)
        .map((x: any) => ({
          role: x.direction === "outbound" ? "assistant" : "user",
          content: String(x.message_content),
        })) as Array<{ role: "user" | "assistant"; content: string }>;

      const aiReply = await callOpenAI(ai.model, context.trim(), hist);

      const waResp = await sendWhatsAppText(conn, from, aiReply);
      await insertOutboundMessage({
        from_number: conn.phone_number_id,
        to_number: from,
        phone_number: from,
        message_type: "text",
        message_content: aiReply,
        platform_response: waResp,
      });
    }

    // Importante: devolver 200 a Meta siempre (si no, reintenta y duplica)
    return json({ ok: true }, 200);
  } catch (err) {
    console.error("Fatal error:", err);
    // Igual 200 para que Meta no reintente infinito (pero dejamos log)
    return json({ ok: true, error: String(err?.message ?? err) }, 200);
  }
});
