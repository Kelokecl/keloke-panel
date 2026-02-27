import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "⚠️ Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu .env/.env.local"
  );
}

// ✅ Singleton global (evita múltiples GoTrueClient / comportamientos raros)
const g = globalThis;
if (!g.__keloke_supabase__) {
  g.__keloke_supabase__ = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // ✅ clave única para no chocar con otras apps supabase en el mismo browser
      storageKey: "keloke-auth",
    },
  });
}

export const supabase = g.__keloke_supabase__;

/**
 * ✅ Sync SEGURO de tu tabla public.users
 * - NO hace PATCH directo
 * - Hace UPSERT solo con columnas reales
 * - Filtra undefined/null para evitar 400 por payload inválido
 */
export async function syncPublicUser(user, extra = {}) {
  try {
    if (!user?.id) return;

    // arma solo columnas válidas
    const row = {
      id: user.id,
      email: user.email ?? null,
      // role en tu public.users es text; si no tienes uno explícito, usa "admin" o "user"
      role: extra.role ?? null,
      is_active: typeof extra.is_active === "boolean" ? extra.is_active : true,
      instance_id: extra.instance_id ?? null,
    };

    // ✅ remover keys undefined (y si quieres, también nulls)
    Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);

    // ✅ si por alguna razón quedara vacío (no debería), no escribas
    if (!row.id) return;

    // UPSERT por PK id
    const { error } = await supabase
      .from("users")
      .upsert(row, { onConflict: "id" });

    // Si esto falla, lo logueamos pero NO reventamos la app (evita loops)
    if (error) console.error("syncPublicUser upsert error:", error);
  } catch (e) {
    console.error("syncPublicUser fatal:", e);
  }
}
