import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

/* =======================
   CONFIG
======================= */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

const WA_GRAPH_VERSION = "v21.0";
const OPENAI_MODEL = "gpt-5-mini";

/* =======================
   UTILS
======================= */
const ok = (b: any) =>
  new Response(JSON.stringify(b), { headers: corsHeaders });

const str = (v: any) => (typeof v === "string" ? v.trim() : "");

function extractBudget(text: string): number | null {
  const m = text.replace(/\./g, "").match(/(\d{2,6})\s*(lucas?|mil)?/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n < 1000 ? n * 1000 : n;
}

function extractComuna(text: string): string | null {
  const comunas = [
    "santiago","maipú","maipu","providencia","las condes","ñuñoa",
    "puente alto","la florida","san bernardo","quilicura","renca",
    "estación central","estacion central","independencia"
  ];
  const t = text.toLowerCase();
  return comunas.find(c => t.includes(c)) ?? null;
}

function extractProduct(text: string): string | null {
  const productos = [
    "freidora","airfryer","lampara","lámpara","panel","led",
    "parlante","audifonos","audífonos","reloj","smartwatch"
  ];
  const t = text.toLowerCase();
  return productos.find(p => t.includes(p)) ?? null;
}

/* =======================
   OPENAI
======================= */
async function askOpenAI(prompt: string): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt,
      max_output_tokens: 220,
    }),
  });

  const raw = await r.text();
  if (!r.ok) {
    console.error("❌ OpenAI:", raw);
    throw new Error("OpenAI error");
  }

  const j = JSON.parse(raw);
  return (
    j.output_text ||
    j.output?.[0]?.content?.[0]?.text ||
    "Perfecto 🙌 ¿en qué comuna estás?"
  );
}

/* =======================
   WHATSAPP SEND
======================= */
async function sendWhatsApp(
  to: string,
  text: string,
  token: string,
  phoneId: string,
) {
  const url = `https://graph.facebook.com/${WA_GRAPH_VERSION}/${phoneId}/messages`;
  await fetch(url, {
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
  });
}

/* =======================
   SERVER
======================= */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json();

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        if (msg.type !== "text") continue;

        const phone = str(msg.from);
        const text = str(msg.text?.body);

        /* ---------- CARGAR / CREAR CONVERSACIÓN ---------- */
        const { data: convo } = await supabase
          .from("whatsapp_conversations")
          .select("*")
          .eq("phone_number", phone)
          .maybeSingle();

        let state = convo?.state ?? "START";
        let product = convo?.product;
        let budget = convo?.budget;
        let comuna = convo?.comuna;

        /* ---------- EXTRACCIÓN ---------- */
        product ??= extractProduct(text);
        budget ??= extractBudget(text);
        comuna ??= extractComuna(text);

        /* ---------- FSM ---------- */
        if (product && !budget) state = "HAS_PRODUCT";
        if (product && budget && !comuna) state = "HAS_BUDGET";
        if (product && budget && comuna) state = "READY_TO_OFFER";

        await supabase.from("whatsapp_conversations").upsert({
          phone_number: phone,
          state,
          product,
          budget,
          comuna,
          updated_at: new Date().toISOString(),
        });

        /* ---------- PROMPT DINÁMICO ---------- */
        const prompt = `
Eres el asistente de ventas de Keloke.cl (Chile).

DATOS DEL CLIENTE:
- Producto: ${product ?? "NO INDICADO"}
- Presupuesto: ${budget ? `$${budget}` : "NO INDICADO"}
- Comuna: ${comuna ?? "NO INDICADA"}
- Estado: ${state}

REGLAS DURAS:
- NO repitas preguntas ya respondidas
- Pregunta SOLO el dato faltante
- Máx 4 líneas
- Español chileno, cercano
- Objetivo: avanzar a venta

RESPONDE SOLO EL MENSAJE FINAL AL CLIENTE.
        `.trim();

        const reply = await askOpenAI(prompt);

        /* ---------- ENVÍO ---------- */
        const { data: conn } = await supabase
          .from("social_connections")
          .select("*")
          .eq("platform", "whatsapp")
          .eq("is_active", true)
          .single();

        await sendWhatsApp(phone, reply, conn.access_token, conn.phone_number_id);

        await supabase.from("whatsapp_messages").insert({
          phone_number: phone,
          direction: "outbound",
          message_type: "text",
          message: reply,
          status: "sent",
        });
      }
    }
  }

  return ok({ success: true });
});
