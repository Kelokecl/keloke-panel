// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "⚠️ Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY."
  );
}

// ✅ Singleton: evita crear múltiples GoTrueClient en el mismo navegador
const globalKey = "__KELOKE_SUPABASE__";

export const supabase =
  globalThis[globalKey] ||
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "keloke-auth", // ✅ clave única
    },
  });

if (!globalThis[globalKey]) globalThis[globalKey] = supabase;
