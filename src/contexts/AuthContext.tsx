import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type AppUser = {
  id: string;
  email: string | null;
  role: string | null;
};

type AuthCtx = {
  user: AppUser | null;
  loading: boolean;
  refreshUserProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUserProfile = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const u = auth?.user;
    if (!u) {
      setUser(null);
      return;
    }

    // 1) leer perfil en public.users
    const { data: existing, error: selErr } = await supabase
      .from("users")
      .select("id,email,role")
      .eq("id", u.id)
      .maybeSingle();

    if (selErr) {
      // No rompas la app por esto
      setUser({ id: u.id, email: u.email ?? null, role: null });
      return;
    }

    // 2) si no existe, insert MINIMO (evita PATCH con columnas que no existen)
    if (!existing) {
      const payload = {
        id: u.id,
        email: u.email ?? null,
        role: "admin",
      };

      const { data: inserted } = await supabase
        .from("users")
        .insert(payload)
        .select("id,email,role")
        .single();

      setUser(inserted ?? { id: u.id, email: u.email ?? null, role: "admin" });
      return;
    }

    setUser(existing);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refreshUserProfile();
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      await refreshUserProfile();
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ user, loading, refreshUserProfile }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
