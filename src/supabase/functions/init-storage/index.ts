import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

// supabase/functions/init-storage/index.ts
// Edge Function: init-storage
// Objetivo: Inicializar buckets/policies para WhatsApp media u otros assets.
// Fix crítico: responder OPTIONS (CORS preflight) SIEMPRE.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-requested-with",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

Deno.serve(async (req) => {
  // ✅ CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Crear cliente de Supabase con service_role (permisos administrativos)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const bucketName = 'whatsapp-media'

    // Verificar si el bucket ya existe
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets()
    
    if (listError) {
      console.error('Error al listar buckets:', listError)
      throw listError
    }

    const bucketExists = buckets?.some(bucket => bucket.name === bucketName)

    if (bucketExists) {
      console.log(`✅ Bucket ${bucketName} ya existe`)
      return new Response(
        JSON.stringify({
          success: true,
          message: `Bucket ${bucketName} ya existe`,
          bucket: bucketName,
          alreadyExists: true,
          bucketPublic: true,
          limit: 16777216,
          allowedMimeTypes: [
            'image/jpeg', 'image/png', 'image/webp',
            'video/mp4', 'video/mov',
            'audio/webm', 'audio/ogg', 'audio/mpeg',
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          ]
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Crear el bucket con configuración correcta
    const { data: newBucket, error: createError } = await supabaseAdmin.storage.createBucket(bucketName, {
      public: true, // Acceso público para lectura (necesario para WhatsApp Cloud API)
      fileSizeLimit: 16777216, // 16 MB en bytes
      allowedMimeTypes: [
        // Imágenes
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        // Videos
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo',
        'video/x-ms-wmv',
        // Audio
        'audio/webm',
        'audio/ogg',
        'audio/mpeg',
        'audio/mp4',
        'audio/wav',
        // Documentos
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ]
    })

    if (createError) {
      console.error('Error al crear bucket:', createError)
      throw createError
    }

    console.log(`✅ Bucket ${bucketName} creado exitosamente`)

    return new Response(
      JSON.stringify({
        ok: true,
        message: "init-storage OK (CORS + OPTIONS fixed)",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

})
