import { supabase } from './supabase';

/**
 * Inicializa el bucket de Supabase Storage para WhatsApp media
 * Llama a la Edge Function con permisos administrativos (service_role)
 * Se ejecuta automáticamente al cargar la aplicación
 */
export async function initWhatsAppStorage() {
  try {
    console.log('🔧 Inicializando bucket de WhatsApp media...');
    console.log('📡 Llamando a Edge Function con permisos administrativos...');

    // Llamar a la Edge Function con permisos administrativos (service_role key)
    const { data, error } = await supabase.functions.invoke('init-storage', {
      method: 'POST'
    });

    if (error) {
      console.error('❌ Error al llamar a init-storage:', error);
      return { success: false, error };
    }

    if (!data?.success) {
      console.error('❌ La Edge Function retornó error:', data?.error);
      return { success: false, error: data?.error };
    }

    // Mostrar resultado en consola
    if (data.alreadyExists) {
      console.log(`✅ ${data.message}`);
    } else {
      console.log(`✅ ${data.message}`);
    }
    
    // Mostrar configuración del bucket
    console.log('📋 Configuración del bucket:');
    console.log(`   - Público: ${data.bucketPublic ? 'Sí' : 'No'}`);
    console.log(`   - Límite: ${data.limit ? `${(data.limit / 1048576).toFixed(0)} MB` : 'undefined'}`);
    console.log(`   - Tipos permitidos: ${data.allowedMimeTypes ? data.allowedMimeTypes.slice(0, 3).join(', ') + '...' : 'undefined'}`);
    console.log('✅ Storage inicializado correctamente');

    return { success: true, alreadyExists: data.alreadyExists };

  } catch (error) {
    console.error('❌ Error al inicializar storage:', error);
    return { success: false, error };
  }
}
