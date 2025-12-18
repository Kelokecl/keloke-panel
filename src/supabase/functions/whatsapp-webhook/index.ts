import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verificación del webhook (GET request)
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      const VERIFY_TOKEN = 'keloke_webhook_token';

      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verificado correctamente');
        return new Response(challenge, { 
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      return new Response('Forbidden', { status: 403 });
    }

    // Procesar mensajes entrantes (POST request)
    if (req.method === 'POST') {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📥 WEBHOOK RECIBIDO - INICIO PROCESAMIENTO');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      const body = await req.json();
      console.log('📦 Body completo:', JSON.stringify(body, null, 2));
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Obtener configuración de WhatsApp
      console.log('🔍 PASO 1: Buscando conexión de WhatsApp activa...');
      console.log('   Query: social_connections WHERE platform=whatsapp AND is_active=true');
      
      const { data: connections, error: connectionError } = await supabase
        .from('social_connections')
        .select('*')
        .eq('platform', 'whatsapp')
        .eq('is_active', true)
        .maybeSingle();

      if (connectionError) {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ ERROR CRÍTICO: Error buscando conexión');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('Error details:', JSON.stringify(connectionError, null, 2));
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return new Response(JSON.stringify({ error: 'Connection error', details: connectionError }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!connections) {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ ERROR: No se encontró conexión de WhatsApp');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('⚠️  VERIFICAR EN SUPABASE:');
        console.error('   1. Tabla social_connections existe');
        console.error('   2. Existe registro con platform=whatsapp');
        console.error('   3. El campo is_active=true');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return new Response(JSON.stringify({ error: 'No connection' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('✅ Conexión encontrada:');
      console.log('   - ID:', connections.id);
      console.log('   - Platform:', connections.platform);
      console.log('   - Active:', connections.is_active);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      const accessToken = connections.access_token;

      // Procesar cada entrada del webhook
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value;

          // Procesar mensajes
          if (value?.messages) {
            for (const message of value.messages) {
              console.log('📨 Procesando mensaje:', message);

              const fromPhone = message.from;
              const messageType = message.type;
              const messageId = message.id;
              const timestamp = message.timestamp;

              // Obtener o crear contacto
              console.log(`👤 Gestionando contacto: ${fromPhone}`);
              const { data: existingContact, error: contactSelectError } = await supabase
                .from('whatsapp_contacts')
                .select('*')
                .eq('phone_number', fromPhone)
                .maybeSingle(); // CORRECCIÓN: usar maybeSingle()

              if (contactSelectError) {
                console.error('❌ Error buscando contacto:', contactSelectError);
              }

              if (!existingContact) {
                console.log('📝 Creando nuevo contacto...');
                const { error: insertContactError } = await supabase.from('whatsapp_contacts').insert({
                  phone_number: fromPhone,
                  contact_name: value.contacts?.[0]?.profile?.name || fromPhone,
                  last_message_at: new Date(parseInt(timestamp) * 1000).toISOString()
                });
                
                if (insertContactError) {
                  console.error('❌ Error creando contacto:', insertContactError);
                } else {
                  console.log('✅ Contacto creado correctamente');
                }
              } else {
                console.log('📝 Actualizando contacto existente...');
                const { error: updateContactError } = await supabase.from('whatsapp_contacts')
                  .update({ last_message_at: new Date(parseInt(timestamp) * 1000).toISOString() })
                  .eq('phone_number', fromPhone);
                
                if (updateContactError) {
                  console.error('❌ Error actualizando contacto:', updateContactError);
                } else {
                  console.log('✅ Contacto actualizado correctamente');
                }
              }

              let messageData: any = {
                phone_number: fromPhone,
                direction: 'inbound',
                status: 'received',
                whatsapp_message_id: messageId,
                message_type: messageType,
                platform_response: message
              };

              // Procesar según tipo de mensaje
              switch (messageType) {
                case 'text':
                  messageData.message = message.text?.body || '';
                  break;

                case 'image':
                case 'audio':
                case 'video':
                case 'document':
                  console.log(`📎 Procesando ${messageType}...`);
                  
                  const mediaData = message[messageType];
                  const mediaId = mediaData.id;
                  const caption = mediaData.caption || '';

                  console.log(`🔍 Media ID: ${mediaId}`);

                  try {
                    // 1. Obtener URL del media desde WhatsApp API
                    console.log('📡 Obteniendo URL del media...');
                    const mediaInfoResponse = await fetch(
                      `https://graph.facebook.com/v21.0/${mediaId}`,
                      {
                        headers: {
                          'Authorization': `Bearer ${accessToken}`
                        }
                      }
                    );

                    if (!mediaInfoResponse.ok) {
                      const errorText = await mediaInfoResponse.text();
                      console.error('❌ Error obteniendo info del media:', errorText);
                      throw new Error(`Error getting media info: ${errorText}`);
                    }

                    const mediaInfo = await mediaInfoResponse.json();
                    console.log('📋 Info del media:', mediaInfo);

                    const mediaUrl = mediaInfo.url;
                    const mimeType = mediaInfo.mime_type;
                    const fileSize = mediaInfo.file_size;

                    // 2. Descargar el archivo desde WhatsApp
                    console.log('⬇️ Descargando archivo...');
                    const downloadResponse = await fetch(mediaUrl, {
                      headers: {
                        'Authorization': `Bearer ${accessToken}`
                      }
                    });

                    if (!downloadResponse.ok) {
                      console.error('❌ Error descargando archivo');
                      throw new Error('Error downloading media');
                    }

                    const fileBlob = await downloadResponse.blob();
                    console.log('✅ Archivo descargado:', fileBlob.size, 'bytes');

                    // 3. Subir a Supabase Storage
                    const fileExt = mimeType.split('/')[1]?.split(';')[0] || 'bin';
                    const fileName = `${messageType}_${Date.now()}_${mediaId}.${fileExt}`;
                    
                    console.log('📤 Subiendo a Supabase Storage:', fileName);

                    const { data: uploadData, error: uploadError } = await supabase.storage
                      .from('whatsapp-media')
                      .upload(fileName, fileBlob, {
                        contentType: mimeType,
                        upsert: false
                      });

                    if (uploadError) {
                      console.error('❌ Error subiendo a Storage:', uploadError);
                      throw uploadError;
                    }

                    console.log('✅ Subido a Storage correctamente');

                    // 4. Obtener URL pública
                    const { data: { publicUrl } } = supabase.storage
                      .from('whatsapp-media')
                      .getPublicUrl(fileName);

                    console.log('🔗 URL pública:', publicUrl);

                    // 5. Guardar en BD con todos los campos de media
                    messageData.message = caption || `${messageType} recibido`;
                    messageData.media_url = publicUrl;
                    messageData.media_mime_type = mimeType;
                    messageData.media_filename = fileName;
                    messageData.media_size = fileSize;
                    messageData.caption = caption || null;

                    // Para audios, agregar duración si está disponible
                    if (messageType === 'audio' && mediaData.duration) {
                      messageData.media_duration = mediaData.duration;
                    }

                    console.log('✅ Media procesado completamente');

                  } catch (mediaError) {
                    console.error(`❌ Error procesando ${messageType}:`, mediaError);
                    // Si falla el procesamiento del media, guardar como texto
                    messageData.message = `${messageType} recibido${caption ? `: ${caption}` : ''}`;
                  }
                  break;

                default:
                  messageData.message = `Mensaje de tipo ${messageType} recibido`;
                  console.log(`⚠️ Tipo de mensaje no soportado: ${messageType}`);
              }

              // Guardar mensaje en BD
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.log('💾 PASO FINAL: Guardando mensaje en BD...');
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.log('📋 Datos a insertar:');
              console.log(JSON.stringify(messageData, null, 2));
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              
              const { data: insertedData, error: insertError } = await supabase
                .from('whatsapp_messages')
                .insert(messageData)
                .select();

              if (insertError) {
                console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.error('❌ ERROR CRÍTICO: Error guardando mensaje');
                console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.error('Error code:', insertError.code);
                console.error('Error message:', insertError.message);
                console.error('Error details:', JSON.stringify(insertError, null, 2));
                console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.error('⚠️  POSIBLES CAUSAS:');
                console.error('   1. Tabla whatsapp_messages no existe');
                console.error('   2. Columnas faltantes o tipos incorrectos');
                console.error('   3. Constraints que fallan (NOT NULL, FOREIGN KEY)');
                console.error('   4. RLS (Row Level Security) bloqueando el INSERT');
                console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              } else {
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('✅ MENSAJE GUARDADO CORRECTAMENTE');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('📋 Datos insertados:');
                console.log(JSON.stringify(insertedData, null, 2));
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('⚠️  VERIFICAR EN SUPABASE:');
                console.log('   1. Ir a Table Editor → whatsapp_messages');
                console.log('   2. Actualizar tabla (F5)');
                console.log('   3. Debe aparecer el registro con ID:', insertedData?.[0]?.id);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              }
            }
          }

          // Procesar cambios de estado de mensajes
          if (value?.statuses) {
            for (const status of value.statuses) {
              console.log('📊 Actualizando estado de mensaje:', status);
              
              await supabase
                .from('whatsapp_messages')
                .update({ 
                  status: status.status,
                  platform_response: status 
                })
                .eq('whatsapp_message_id', status.id);
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Method not allowed', { status: 405 });

  } catch (error) {
    console.error('❌ Error en webhook:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
