import { createClient } from "@supabase/supabase-js";

// Lee envs (Vite)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Si faltan envs, no creamos cliente (evita estados raros)
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "⚠️ Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu .env(.local)"
  );
}

/**
 * ✅ Singleton fuerte (evita múltiples instancias en el mismo browser context)
 * - Ayuda mucho cuando hay HMR / recargas / imports duplicados
 */
const globalKey = "__keloke_supabase__";

function buildStorageKey(url) {
  try {
    const host = new URL(url).hostname;
    return `${host}-auth-token`;
  } catch {
    return "supabase-auth-token";
  }
}

export const supabase =
  globalThis[globalKey] ??
  (globalThis[globalKey] =
    supabaseUrl && supabaseAnonKey
      ? createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            // ✅ clave única y estable para evitar colisiones
            storageKey: buildStorageKey(supabaseUrl),
          },
        })
      : null);
