// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

// Vite envs
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Si faltan envs, avisamos (y en DEV lanzamos error para no “quedar colgado”)
if (!supabaseUrl || !supabaseAnonKey) {
  const msg =
    "⚠️ Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu .env(.local).";
  console.warn(msg);

  // En DEV conviene fallar rápido para que no quede la app en “loading infinito”
  if (import.meta.env.DEV) {
    throw new Error(msg);
  }
}

// ✅ Singleton global para evitar múltiples GoTrueClient en el mismo browser context
const GLOBAL_KEY = "__KELOKE_SUPABASE__";

function makeClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Mantén sesión estable y evita comportamiento raro por duplicados
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,

      // ✅ clave explícita para aislar storage y evitar conflictos si hay otros proyectos/apps
      storageKey: "keloke-auth",
    },
    global: {
      // opcional: timeout/fetch custom si quieres
    },
  });
}

export const supabase =
  globalThis[GLOBAL_KEY] ?? (globalThis[GLOBAL_KEY] = makeClient());
