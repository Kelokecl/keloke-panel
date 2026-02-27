// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ✅ No sigas si faltan envs (evita requests sin apikey y errores raros/intermitentes)
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env(.local)."
  );
}

// ✅ Singleton real (evita múltiples GoTrueClient en el mismo browser y loops)
const GLOBAL_KEY = "__KELOKE_SUPABASE__";

export const supabase =
  globalThis[GLOBAL_KEY] ??
  (globalThis[GLOBAL_KEY] = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,

      // ✅ clave única del storage para ESTE panel (evita conflicto con otros proyectos/apps)
      storageKey: "keloke-panel-auth",
    },
    global: {
      headers: {
        "X-Client-Info": "keloke-panel",
      },
    },
  }));
