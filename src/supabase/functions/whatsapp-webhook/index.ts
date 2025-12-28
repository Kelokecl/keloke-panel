import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

/* =========================
   CONFIG GENERAL
========================= */
const WA_VERSION = "v21.0";
const STORAGE_BUCKET = "whatsapp-media";
const FORCE_REPLY = true; // 🔥 RESPONDE SIEMPRE, SIN HORARIO

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const safe = (v: any) => (typeof v === "string" ? v : "");

/* =========================
   OPENAI (RESPONSES API)
========================= */
async function callOpenAI(prompt: string): Promise<string> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return "Pucha 😅 tuve un problema técnico. ¿Qué producto buscas?";

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      input: prompt,
      max_output_tokens: 250,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    console.error("❌ OpenAI error:", raw);
    return "Te leo 🙌 ¿Qué producto buscas y tu presupuesto aprox?";
  }

  const data = JSON.parse(raw);
  return (
    data.output_text ||
    data.output?.[0]?.content?.[0]?.text ||
    "¿Qué producto estás buscando?"
  );
}

/* =========================
   WHATSAPP SEND
========================= */
async function sendWhatsAppText(
  to: string,
  text: string,
  token: string,
  phoneId: string,
) {
  const res = await fetch(
    `https://graph.facebook.com/${WA_VERSION}/${phoneId}/messages`,
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
        text: { body: text },
      }),
    },
  );

  const raw = await res.text();
  if (!res.ok) throw new Error(raw);
  return JSON.parse(raw);
}

/* =========================
   MEDIA HANDLING
========================= */
async function downloadMedia(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Media download failed");
  return new Uint8Array(await res.arrayBuffer());
}

async function saveMedia(
  supabase: any,
  path: string,
  bytes: Uint8Array,
  mime: string,
) {
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, new Blob([bytes], { type: mime }), { upsert: false });

  if (error) throw error;
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/* =========================
   HISTORIAL IA
========================= */
async function buildPrompt(
  supabase: any,
  phone: string,
  userText: string,
) {
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("direction,message")
    .eq("phone_number", phone)
    .order("created_at", { ascending: false })
    .limit(10);

  const history = (data || [])
    .reverse()
    .map((m: any) =>
      m.direction === "outbound"
        ? `Asistente: ${m.message}`
        : `Cliente: ${m.message}`
    )
    .join("\n");

  return `
Eres el asistente de ventas de Keloke.cl (Chile).
Hablas español chileno, claro y directo.
No repitas preguntas ya respondidas.
Cierra con CTA suave.

${history}
Cliente: ${userText}
`;
}

/* =========================
   SERVER
========================= */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Verify Meta
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (
      url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") ===
        Deno.env.get("WHATSAPP_VERIFY_TOKEN")
    ) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", {
        status: 200,
      });
    }
    return new Response("Forbidden", { status: 403 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json();

  const { data: conn } = await supabase
    .from("social_connections")
    .select("*")
    .eq("platform", "whatsapp")
    .eq("is_active", true)
    .maybeSingle();

  if (!conn) return json({ error: "No WhatsApp connection" }, 500);

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        const from = msg.from;
        const id = msg.id;
        const type = msg.type;

        // idempotencia
        const { data: exists } = await supabase
          .from("whatsapp_messages")
          .select("id")
          .eq("whatsapp_message_id", id)
          .maybeSingle();
        if (exists) continue;

        let text = "";
        let mediaUrl = null;

        if (type === "text") {
          text = safe(msg.text?.body);
        } else if (msg[type]?.id) {
          const metaRes = await fetch(
            `https://graph.facebook.com/${WA_VERSION}/${msg[type].id}`,
            { headers: { Authorization: `Bearer ${conn.access_token}` } },
          );
          const meta = await metaRes.json();
          const bytes = await downloadMedia(meta.url, conn.access_token);
          mediaUrl = await saveMedia(
            supabase,
            `${type}/${Date.now()}_${msg[type].id}`,
            bytes,
            meta.mime_type || "application/octet-stream",
          );
          text = safe(msg[type]?.caption) || `Archivo ${type} recibido`;
        }

        await supabase.from("whatsapp_messages").insert({
          phone_number: from,
          direction: "inbound",
          message_type: type,
          message: text,
          media_url: mediaUrl,
          whatsapp_message_id: id,
          status: "received",
          platform_response: msg,
        });

        if (!FORCE_REPLY || !text) continue;

        const prompt = await buildPrompt(supabase, from, text);
        const reply = await callOpenAI(prompt);

        const wa = await sendWhatsAppText(
          from,
          reply,
          conn.access_token,
          conn.phone_number_id,
        );

        await supabase.from("whatsapp_messages").insert({
          phone_number: from,
          direction: "outbound",
          message_type: "text",
          message: reply,
          whatsapp_message_id: wa?.messages?.[0]?.id ?? null,
          status: "sent",
          platform_response: wa,
        });
      }
    }
  }

  return json({ ok: true });
});
