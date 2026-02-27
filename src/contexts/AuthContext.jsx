// src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Trae el usuario desde public.users (no auth.users)
  const fetchUserData = useCallback(async (email) => {
    try {
      if (!email) return null;

      console.log("📊 Fetching user data for:", email);

      const { data: userData, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .eq("is_active", true)
        .maybeSingle(); // <- evita error duro si no hay fila

      if (error) {
        console.error("❌ Error fetching user data:", error);
        return null;
      }

      if (!userData) {
        console.warn("⚠️ User not found or inactive in public.users");
        return null;
      }

      console.log("✅ User data fetched successfully");
      return userData;
    } catch (error) {
      console.error("❌ Exception in fetchUserData:", error);
      return null;
    }
  }, []);

  // Sesión inicial (1 vez)
  useEffect(() => {
    let mounted = true;
    let timeoutId;

    async function checkInitialSession() {
      try {
        console.log("🔍 [INIT] Checking initial session...");

        // Timeout de seguridad
        timeoutId = setTimeout(() => {
          if (mounted && !initialized) {
            console.warn("⚠️ [TIMEOUT] Session check timeout - forcing loading to false");
            setLoading(false);
            setInitialized(true);
          }
        }, 6000);

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        clearTimeout(timeoutId);

        if (error) {
          console.error("❌ [INIT] Error getting session:", error);
          if (!mounted) return;
          setUser(null);
          setLoading(false);
          setInitialized(true);
          return;
        }

        if (!session?.user?.email) {
          console.log("ℹ️ [INIT] No session found");
          if (!mounted) return;
          setUser(null);
          setLoading(false);
          setInitialized(true);
          return;
        }

        console.log("✅ [INIT] Session found for:", session.user.email);

        const userData = await fetchUserData(session.user.email);

        if (!mounted) return;

        if (userData) {
          console.log("✅ [INIT] User data loaded:", userData.email, "Role:", userData.role);
          setUser(userData);
        } else {
          console.warn("⚠️ [INIT] User data not found or inactive -> signing out");
          await supabase.auth.signOut();
          setUser(null);
        }

        setLoading(false);
        setInitialized(true);
      } catch (error) {
        console.error("❌ [INIT] Exception in checkInitialSession:", error);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listener auth (solo después de init)
  useEffect(() => {
    if (!initialized) {
      console.log("⏳ Waiting for initialization before setting up auth listener...");
      return;
    }

    console.log("👂 Setting up auth state listener...");

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("🔔 Auth event:", event);

      if (event === "SIGNED_OUT") {
        console.log("👋 User signed out");
        setUser(null);
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        const email = session?.user?.email;
        if (!email) return;

        console.log("👤 User signed in/updated:", email);

        const userData = await fetchUserData(email);
        if (userData) {
          setUser(userData);
        } else {
          // si está inactivo o no existe en public.users
          await supabase.auth.signOut();
          setUser(null);
        }

        // ❌ IMPORTANTE: ELIMINADO el update last_login (esa columna NO existe -> 400)
        return;
      }

      if (event === "TOKEN_REFRESHED") {
        // Mantener usuario
        return;
      }
    });

    const subscription = data?.subscription;

    return () => {
      console.log("🔇 Unsubscribing from auth listener");
      subscription?.unsubscribe?.();
    };
  }, [initialized, fetchUserData]);

  async function signIn(email, password) {
    let timeoutId;

    try {
      console.log("🔐 [SIGNIN] Attempting sign in for:", email);
      setLoading(true);

      timeoutId = setTimeout(() => {
        console.warn("⚠️ [SIGNIN] Login timeout - forcing loading to false");
        setLoading(false);
      }, 10000);

      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        console.error("❌ [SIGNIN] Auth error:", error.message);
        clearTimeout(timeoutId);
        setLoading(false);
        return { success: false, error: error.message };
      }

      console.log("✅ [SIGNIN] Auth successful, fetching user data...");
      const userData = await fetchUserData(email);

      clearTimeout(timeoutId);

      if (!userData) {
        console.error("❌ [SIGNIN] User data not found or inactive");
        await supabase.auth.signOut();
        setLoading(false);
        return { success: false, error: "Usuario no encontrado o inactivo" };
      }

      console.log("✅ [SIGNIN] Sign in complete for:", userData.email);
      setUser(userData);
      setLoading(false);

      return { success: true };
    } catch (error) {
      console.error("❌ [SIGNIN] Sign in failed:", error?.message || error);
      if (timeoutId) clearTimeout(timeoutId);
      setLoading(false);
      return { success: false, error: error?.message || "Error desconocido" };
    }
  }

  async function signUp(email, password, fullName, role = "community_manager") {
    // OJO: tu tabla public.users NO tiene full_name ni password_hash según tus capturas.
    // Esto hoy te va a fallar si lo usas. Lo dejo igual pero protegido.
    try {
      const { error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) throw authError;

      const row = {
        email,
        role,
        is_active: true,
      };

      const { error: userError } = await supabase.from("users").insert([row]);
      if (userError) throw userError;

      return { success: true };
    } catch (error) {
      console.error("Sign up error:", error);
      return { success: false, error: error.message };
    }
  }

  async function signOut() {
    try {
      console.log("👋 Signing out...");
      setLoading(true);

      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setUser(null);

      console.log("✅ Sign out complete");
      setLoading(false);
      return { success: true };
    } catch (error) {
      console.error("❌ Sign out error:", error);
      setLoading(false);
      return { success: false, error: error.message };
    }
  }

  const value = { user, loading, signIn, signUp, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
