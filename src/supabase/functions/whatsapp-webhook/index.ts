import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

/* =========================================================
   CONFIG
========================================================= */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const WA_GRAPH_VERSION = "v21.0";

/* =========================================================
   HELPERS
========================================================= */
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const s = (v: unknown) => (typeof v === "string" ? v : "");

/* =========================================================
   AI CONFIG
========================================================= */
type AiConfig = {
  auto_reply_enabled: boolean;
  reply_outside_schedule: boolean;
  start_time: string | null;
  end_time: string | null;
  days_enabled: string[] | null;
  training_data: string | null;
};

const DEFAULT_AI: AiConfig = {
  auto_reply_enabled: true,
  reply_outside_schedule: true,
  start_time: null,
  end_time: null,
  days_enabled: null,
  training_data: "",
};

function canReply(cfg: AiConfig): boolean {
  if (cfg.reply_outside_schedule) return true;

  const now = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Santiago",
    })
  );

  const dayIso = now.getDay() === 0 ? 7 : now.getDay();

  if (cfg.days_enabled && !cfg.days_enabled.includes(String(dayIso))) {
    return false;
  }

  if (!cfg.start_time || !cfg.end_time) return true;

  const [sh, sm] = cfg.start_time.split(":").map(Number);
  const [eh, em] = cfg.end_time.split(":").map(Number);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  return startMin <= endMin
    ? nowMin >= startMin && nowMin <= endMin
    : nowMin >= startMin || nowMin <= endMin;
}

/* =========================================================
   OPENAI (RESPONSES API – ROBUST)
========================================================= */
async function callOpenAI(userText: string, training = ""): Promise<string | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null;

  const system = `
Eres el asistente de ventas de Keloke.cl (Chile).
Hablas chileno, claro y directo.
No repitas preguntas.
Si ya hay producto y presupuesto, avanza.
Cierra con CTA suave.
${training || ""}
`;

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      input: `${system}\n\nCliente: ${userText}`,
      max_output_tokens: 250,
    }),
  });

  if (!res.ok) {
    console.error("❌ OpenAI HTTP", res.status);
    return null;
  }

  const data = await res.json();

  let text = "";

  if (typeof data.output_text === "string") {
    text = data.output_text;
  } else if (Array.isArray(data.output)) {
    for (const o of data.output) {
      if (o?.content) {
        for (const c of o.content) {
          if (c?.type === "output_text" && c.text) {
            text += c.text;
          }
        }
      }
    }
  }

  return text.trim() || null;
}

/* =========================================================
   WHATSAPP SEND
========================================================= */
async function sendWhatsApp(
  to: string,
  body: string,
  token: string,
  phoneId: string,
) {
  const res = await fetch(
    `https://graph.facebook.com/${WA_GRAPH_VERSION}/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    },
  );

  if (!res.ok) {
    console.error("❌ WhatsApp send error", await res.text());
  }
}

/* =========================================================
   SERVER
========================================================= */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Meta verify
  if (req.method === "GET") {
    const u = new URL(req.url);
    if (
      u.searchParams.get("hub.mode") === "subscribe" &&
      u.searchParams.get("hub.verify_token") ===
        (Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "keloke_webhook_token")
    ) {
      return new Response(u.searchParams.get("hub.challenge") ?? "");
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const payload = await req.json();

    const { data: conn } = await supabase
      .from("social_connections")
      .select("*")
      .eq("platform", "whatsapp")
      .eq("is_active", true)
      .maybeSingle();

    if (!conn) return json({ ok: true });

    const { data: aiCfgRaw } = await supabase
      .from("whatsapp_ai_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    const aiCfg: AiConfig = { ...DEFAULT_AI, ...aiCfgRaw };

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const msg of change.value?.messages ?? []) {
          if (msg.type !== "text") continue;

          const phone = s(msg.from);
          const text = s(msg.text?.body);
          if (!phone || !text) continue;

          await supabase.from("whatsapp_messages").insert({
            phone_number: phone,
            direction: "inbound",
            message: text,
            message_type: "text",
            whatsapp_message_id: msg.id,
            status: "received",
          });

          if (!aiCfg.auto_reply_enabled) continue;
          if (!canReply(aiCfg)) continue;

          const reply = await callOpenAI(text, aiCfg.training_data ?? "");
          if (!reply) continue;

          await sendWhatsApp(
            phone,
            reply,
            conn.access_token,
            conn.phone_number_id,
          );

          await supabase.from("whatsapp_messages").insert({
            phone_number: phone,
            direction: "outbound",
            message: reply,
            message_type: "text",
            status: "sent",
          });
        }
      }
    }

    return json({ success: true });
  } catch (e) {
    console.error("❌ Webhook error", e);
    return json({ error: String(e) }, 500);
  }
});
