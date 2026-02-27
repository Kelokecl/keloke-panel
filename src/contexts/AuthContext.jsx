// src/contexts/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext({});
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // perfil desde public.users
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // ✅ Lee SOLO columnas existentes en public.users
  const fetchUserData = useCallback(async (email) => {
    try {
      if (!email) return null;

      const { data, error } = await supabase
        .from("users")
        .select("id,email,role,is_active,created_at")
        .eq("email", email)
        .eq("is_active", true)
        .maybeSingle();

      if (error) {
        console.error("❌ Error fetching user data:", error);
        return null;
      }
      return data || null;
    } catch (err) {
      console.error("❌ Exception in fetchUserData:", err);
      return null;
    }
  }, []);

  // ✅ sesión inicial (una vez)
  useEffect(() => {
    let mounted = true;
    let timeoutId;

    async function checkInitialSession() {
      try {
        timeoutId = setTimeout(() => {
          if (mounted && !initialized) {
            console.warn("⚠️ [TIMEOUT] Session check timeout - forcing loading=false");
            setLoading(false);
            setInitialized(true);
          }
        }, 5000);

        const { data, error } = await supabase.auth.getSession();
        clearTimeout(timeoutId);

        if (error) {
          console.error("❌ [INIT] getSession error:", error);
          if (!mounted) return;
          setUser(null);
          setLoading(false);
          setInitialized(true);
          return;
        }

        const session = data?.session;
        if (!session?.user?.email) {
          if (!mounted) return;
          setUser(null);
          setLoading(false);
          setInitialized(true);
          return;
        }

        const profile = await fetchUserData(session.user.email);

        if (!mounted) return;
        if (!profile) {
          // si no existe/inactivo -> cerrar sesión
          await supabase.auth.signOut();
          setUser(null);
        } else {
          setUser(profile);
        }

        setLoading(false);
        setInitialized(true);
      } catch (err) {
        console.error("❌ [INIT] Exception:", err);
        if (!mounted) return;
        setUser(null);
        setLoading(false);
        setInitialized(true);
      }
    }

    checkInitialSession();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [fetchUserData, initialized]);

  // ✅ listener auth (después de init)
  useEffect(() => {
    if (!initialized) return;

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        const email = session?.user?.email || null;
        if (!email) {
          setUser(null);
          return;
        }
        const profile = await fetchUserData(email);
        if (!profile) {
          await supabase.auth.signOut();
          setUser(null);
          return;
        }
        setUser(profile);
      }
    });

    return () => data.subscription.unsubscribe();
  }, [initialized, fetchUserData]);

  async function signIn(email, password) {
    let timeoutId;
    try {
      setLoading(true);

      timeoutId = setTimeout(() => {
        console.warn("⚠️ [SIGNIN] timeout - forcing loading=false");
        setLoading(false);
      }, 15000);

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const profile = await fetchUserData(email);
      clearTimeout(timeoutId);

      if (!profile) {
        await supabase.auth.signOut();
        setLoading(false);
        return { success: false, error: "Usuario no encontrado o inactivo" };
      }

      setUser(profile);
      setLoading(false);
      return { success: true };
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      setLoading(false);
      return { success: false, error: err?.message || "Error de login" };
    }
  }

  async function signOut() {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setLoading(false);
      return { success: true };
    } catch (err) {
      setLoading(false);
      return { success: false, error: err?.message || "Error al cerrar sesión" };
    }
  }

  const value = { user, loading, signIn, signOut };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
