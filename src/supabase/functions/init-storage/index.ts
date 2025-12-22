import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

// supabase/functions/init-storage/index.ts
// Edge Function: init-storage
// Objetivo: Inicializar buckets/policies para WhatsApp media u otros assets.
// FIX DEFINITIVO: CORS + OPTIONS + headers consistentes + sintaxis limpia

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-requested-with",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

Deno.serve(async (req) => {
  // ✅ CORS preflight SIEMPRE
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const bucketName = "whatsapp-media";

    // 1️⃣ Listar buckets
    const { data: buckets, error: listError } =
      await supabaseAdmin.storage.listBuckets();

    if (listError) {
      console.error("Error al listar buckets:", listError);
      throw listError;
    }

    const bucketExists = buckets?.some(
      (bucket) => bucket.name === bucketName
    );

    // 2️⃣ Bucket ya existe → responder OK (con CORS)
    if (bucketExists) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `Bucket ${bucketName} ya existe`,
          bucket: bucketName,
          alreadyExists: true,
          bucketPublic: true,
          limit: 16777216,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3️⃣ Crear bucket
    const { error: createError } =
      await supabaseAdmin.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 16777216,
        allowedMimeTypes: [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/webp",
          "video/mp4",
          "video/quicktime",
          "audio/webm",
          "audio/ogg",
          "audio/mpeg",
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
      });

    if (createError) {
      console.error("Error al crear bucket:", createError);
      throw createError;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "init-storage OK (bucket creado)",
        bucket: bucketName,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("init-storage error:", e);
    return new Response(
      JSON.stringify({ error: String(e?.message || e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
