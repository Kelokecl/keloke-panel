import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

/**
 * =========================================================
 *  CONFIG
 * =========================================================
 */
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NERD_WEBHOOK_URL =
  "https://nffeqekvvqsqwbjrmkjs.supabase.co/functions/v1/whatsapp-webhook";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeString(v: unknown) {
  return typeof v === "string" ? v : "";
}

/**
 * =========================================================
 *  IA: OpenAI (principal) + Claude (opcional)
 * =========================================================
 */

async function generateOpenAIReply(userText: string): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-5-mini";

  if (!apiKey) {
    console.error("❌ No se encontró OPENAI_API_KEY en Secrets");
    return "Pucha 😅 tuve un tema técnico. ¿Me dices qué producto buscas y te ayudo al tiro?";
  }

  // “persona” vendedora Keloke (chileno, corto, útil)
  const system = [
    "Eres el asistente de soporte y ventas de la tienda online Keloke.cl.",
    "Responde en español chileno, cercano, breve (máx 3–4 líneas).",
    "Haz 1–2 preguntas para entender necesidad (uso, presupuesto, envío/tiempo).",
    "Sugiere 1–2 opciones y ofrece mandar links de productos.",
    "Si te piden 'qué venden' da categorías y pide qué busca.",
    "No inventes stock específico si no se te dio; ofrece revisar y mandar links.",
  ].join(" ");

  try {
    // Respuestas API (OpenAI)
    // Doc: Authorization Bearer + endpoint /v1/responses :contentReference[oaicite:2]{index=2}
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "developer", content: system },
          { role: "user", content: userText },
        ],
        // Para respuestas rápidas y baratas (ajustable)
        reasoning: { effort: "low" },
        max_output_tokens: 220,
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      console.error("❌ OpenAI error:", res.status, raw);
      return "Te leo 🙌 ¿Me confirmas qué producto buscas y tu presupuesto aprox? y te mando opciones al tiro.";
    }

    const data = JSON.parse(raw);

    // output_text suele venir directo en Responses API
    const text = safeString(data?.output_text)?.trim();
    if (text) return text;

    // fallback si cambia estructura
    return "Ya bacán 🙌 ¿Qué producto andas buscando (y para qué uso)? Si quieres te mando links al tiro.";
  } catch (err) {
    console.error("❌ Error llamando OpenAI:", err);
    return "Tu mensaje quedó registrado 🙌 pero tuve un drama con la IA. ¿Qué producto buscas y en qué comuna estás?";
  }
}

// Claude opcional (si IA_PROVIDER=claude)
async function generateClaudeReply(userText: string): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-3-5-sonnet-20240620";

  if (!apiKey) {
    console.error("❌ No se encontró ANTHROPIC_API_KEY en Secrets");
    return "Pucha 😅 tuve un tema técnico. ¿Qué producto buscas y te ayudo al tiro?";
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 240,
        messages: [
          {
            role: "user",
            content:
              `Eres el asistente de soporte y ventas de la tienda online Keloke.cl. ` +
              `Responde en español chileno, cercano, breve (máx 3-4 líneas), ` +
              `haz 1-2 preguntas para entender y ofrece mandar links.\n\n` +
              `Mensaje del cliente (WhatsApp): "${userText}"`,
          },
        ],
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      console.error("❌ Error respuesta Claude:", response.status, raw);
      return "Te leo 🙌 ¿Me dices qué producto buscas y tu presupuesto aprox? y te mando opciones.";
    }

    const data = JSON.parse(raw);
    const text = safeString(data?.content?.[0]?.text)?.trim();
    return text || "Gracias por escribirnos 🙌 ¿Qué andas buscando? Si quieres te mando links al tiro.";
  } catch (error) {
    console.error("❌ Error llamando a Claude:", error);
    return "Tu mensaje ya quedó registrado 🙌, pero tuve un problema con la IA. ¿Qué producto buscas?";
  }
}

async function generateAIReply(userText: string): Promise<string> {
  const provider = (Deno.env.get("IA_PROVIDER") ?? "openai").toLowerCase();
  if (provider === "claude") return await generateClaudeReply(userText);
  return await generateOpenAIReply(userText);
}

/**
 * =========================================================
 *  WhatsApp send
 * =========================================================
 */
async function sendWhatsAppTextReply(
  to: string,
  text: string,
  accessToken: string,
  phoneNumberId: string,
) {
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  };

  console.log("📤 Enviando respuesta a WhatsApp:", JSON.stringify(body));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();

  if (!res.ok) {
    console.error("❌ Error enviando WhatsApp:", res.status, raw);
    throw new Error(`WhatsApp send failed: ${res.status} ${raw}`);
  }

  try {
    const json = JSON.parse(raw);
    console.log("✅ Respuesta WhatsApp OK:", json);
    return json;
  } catch {
    console.log("✅ Respuesta WhatsApp (texto plano):", raw);
    return null;
  }
}

/**
 * =========================================================
 *  Server
 * =========================================================
 */
serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // GET verify token (Meta)
  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      const VERIFY_TOKEN =
        Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "keloke_webhook_token";

      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("✅ Webhook verificado correctamente");
        return new Response(challenge ?? "", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }
      return new Response("Forbidden", { status: 403 });
    } catch (e) {
      console.error("❌ Error GET verification:", e);
      return new Response("Error in GET verification", { status: 500 });
    }
  }

  // POST webhook
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("❌ Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
      return jsonResponse({ error: "Missing Supabase secrets" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📥 WEBHOOK RECIBIDO - INICIO PROCESAMIENTO");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const body = await req.json();
    console.log("📦 Body completo:", JSON.stringify(body, null, 2));

    // 1) Buscar conexión WhatsApp en social_connections (platform=whatsapp, is_active=true)
    console.log("🟢 PASO 1: Buscando conexión de WhatsApp...");

    const { data: connection, error: connError } = await supabase
      .from("social_connections")
      .select("*")
      .eq("platform", "whatsapp")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    console.log("🧪 DEBUG - social_connections (platform=whatsapp):");
    console.log("   error:", connError);
    console.log("   data:", JSON.stringify(connection, null, 2));

    if (connError || !connection) {
      console.error("❌ ERROR: No se encontró conexión WhatsApp activa");
      return jsonResponse(
        {
          error: "No WhatsApp connection found (platform=whatsapp, is_active=true)",
          details: connError ?? null,
        },
        500,
      );
    }

    const accessToken = connection.access_token;
    const phoneNumberId = connection.phone_number_id;

    if (!accessToken || !phoneNumberId) {
      console.error("❌ Conexión incompleta: falta access_token o phone_number_id");
      return jsonResponse(
        { error: "WhatsApp connection missing access_token/phone_number_id" },
        500,
      );
    }

    console.log("✅ Conexión encontrada:", {
      id: connection.id,
      platform: connection.platform,
      is_active: connection.is_active,
    });

    // 2) Procesar entradas
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;

        // 2A) Mensajes entrantes
        if (value?.messages) {
          for (const message of value.messages) {
            console.log("📨 Procesando mensaje:", message);

            const fromPhone = message.from;
            const messageType = message.type;
            const messageId = message.id;
            const timestamp = message.timestamp;

            // Contacto
            const { data: existingContact, error: contactSelectError } =
              await supabase
                .from("whatsapp_contacts")
                .select("*")
                .eq("phone_number", fromPhone)
                .maybeSingle();

            if (contactSelectError) {
              console.error("❌ Error buscando contacto:", contactSelectError);
            }

            const lastMessageAt = new Date(
              parseInt(timestamp) * 1000,
            ).toISOString();

            if (!existingContact) {
              const { error: insertContactError } = await supabase
                .from("whatsapp_contacts")
                .insert({
                  phone_number: fromPhone,
                  contact_name: value.contacts?.[0]?.profile?.name ||
                    fromPhone,
                  last_message_at: lastMessageAt,
                });

              if (insertContactError) {
                console.error("❌ Error creando contacto:", insertContactError);
              }
            } else {
              const { error: updateContactError } = await supabase
                .from("whatsapp_contacts")
                .update({ last_message_at: lastMessageAt })
                .eq("phone_number", fromPhone);

              if (updateContactError) {
                console.error("❌ Error actualizando contacto:", updateContactError);
              }
            }

            // Construir data inbound
            const messageData: any = {
              phone_number: fromPhone,
              direction: "inbound",
              status: "received",
              whatsapp_message_id: messageId,
              message_type: messageType,
              platform_response: message,
            };

            // Texto
            if (messageType === "text") {
              messageData.message = message.text?.body || "";
            } else {
              // Otros tipos (guardamos algo simple; si quieres te re-activo tu flow de media completo)
              messageData.message =
                `Mensaje de tipo ${messageType} recibido`;
            }

            // Guardar inbound
            const { data: insertedInbound, error: inboundErr } = await supabase
              .from("whatsapp_messages")
              .insert(messageData)
              .select();

            if (inboundErr) {
              console.error("❌ Error guardando inbound:", inboundErr);
            } else {
              console.log("✅ Inbound guardado:", insertedInbound?.[0]?.id);
            }

            // 2B) Responder SOLO si es texto y tiene contenido
            if (messageType === "text") {
              const userText = (messageData.message || "").trim();
              console.log("🧠 Texto usuario:", userText);

              // Si llega vacío, no respondas (evita loops raros)
              if (!userText) continue;

              console.log("🤖 Llamando IA…");
              const aiReply = await generateAIReply(userText);
              console.log("💬 IA Reply:", aiReply);

              // Enviar WhatsApp
              const waResponse = await sendWhatsAppTextReply(
                fromPhone,
                aiReply,
                accessToken,
                phoneNumberId,
              );

              // Guardar outbound
              const outboundData: any = {
                phone_number: fromPhone,
                direction: "outbound",
                status: "sent",
                whatsapp_message_id: waResponse?.messages?.[0]?.id ?? null,
                message_type: "text",
                message: aiReply,
                platform_response: waResponse,
              };

              const { error: outboundErr } = await supabase
                .from("whatsapp_messages")
                .insert(outboundData);

              if (outboundErr) {
                console.error("❌ Error guardando outbound:", outboundErr);
              } else {
                console.log("✅ Outbound guardado");
              }
            }
          }
        }

        // 2C) Status updates (delivered, read, etc.)
        if (value?.statuses) {
          for (const status of value.statuses) {
            await supabase
              .from("whatsapp_messages")
              .update({
                status: status.status,
                platform_response: status,
              })
              .eq("whatsapp_message_id", status.id);

            console.log("📊 Status update:", status.id, status.status);
          }
        }
      }
    }

    // 3) Reenvío silencioso a Nerd (paralelo)
    try {
      await fetch(NERD_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-From": "keloke-panel",
        },
        body: JSON.stringify(body),
      });
      console.log("✓ Webhook reenviado a Nerd correctamente");
    } catch (error) {
      console.error("❌ Error reenviando webhook a Nerd:", error);
    }

    return jsonResponse({ success: true }, 200);
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    return jsonResponse({ error: String(error?.message ?? error) }, 500);
  }
});
