// src/contexts/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

// Timeout helper (evita requests colgadas)
function withTimeout(promise, ms, label = "operation") {
  let t;
  const timeoutPromise = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(t));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // perfil desde public.users
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Guards anti-race
  const mountedRef = useRef(false);
  const inFlightRef = useRef(false);
  const signingOutRef = useRef(false);

  // ✅ Lee SOLO columnas existentes en public.users
  const fetchUserData = useCallback(async (email) => {
    try {
      if (!email) return null;

      const q = supabase
        .from("users")
        .select("id,email,role,is_active,created_at")
        .eq("email", email)
        .eq("is_active", true)
        .maybeSingle();

      // Importante: timeout para evitar cuelgue infinito
      const { data, error } = await withTimeout(q, 8000, "fetchUserData(public.users)");

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

  // SignOut seguro (evita loops y deja estado consistente)
  const safeSignOut = useCallback(async () => {
    try {
      if (signingOutRef.current) return;
      signingOutRef.current = true;

      await withTimeout(supabase.auth.signOut(), 8000, "supabase.auth.signOut");

      if (mountedRef.current) setUser(null);
    } catch (err) {
      console.error("❌ safeSignOut error:", err);
      // aunque falle, deja el estado local consistente
      if (mountedRef.current) setUser(null);
    } finally {
      signingOutRef.current = false;
    }
  }, []);

  // ✅ sesión inicial (solo una vez)
  useEffect(() => {
    mountedRef.current = true;

    let timeoutId;

    async function checkInitialSession() {
      // evita dobles ejecuciones si React re-monta en dev o hay race
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        // si el init tarda demasiado, liberamos loading sí o sí
        timeoutId = setTimeout(() => {
          if (mountedRef.current && !initialized) {
            console.warn("⚠️ [TIMEOUT] init session check -> forcing loading=false");
            setLoading(false);
            setInitialized(true);
          }
        }, 7000);

        const getSessionPromise = supabase.auth.getSession();
        const { data, error } = await withTimeout(getSessionPromise, 7000, "supabase.auth.getSession");
        clearTimeout(timeoutId);

        if (!mountedRef.current) return;

        if (error) {
          console.error("❌ [INIT] getSession error:", error);
          setUser(null);
          setLoading(false);
          setInitialized(true);
          return;
        }

        const session = data?.session;
        const email = session?.user?.email || null;

        if (!email) {
          setUser(null);
          setLoading(false);
          setInitialized(true);
          return;
        }

        const profile = await fetchUserData(email);

        if (!mountedRef.current) return;

        if (!profile) {
          // si no existe/inactivo -> cerrar sesión (sin colgar)
          await safeSignOut();
          setUser(null);
        } else {
          setUser(profile);
        }

        setLoading(false);
        setInitialized(true);
      } catch (err) {
        console.error("❌ [INIT] Exception:", err);
        if (!mountedRef.current) return;

        // nunca dejes loading colgado
        setUser(null);
        setLoading(false);
        setInitialized(true);
      } finally {
        inFlightRef.current = false;
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    checkInitialSession();

    return () => {
      mountedRef.current = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
    // OJO: intencionalmente NO depende de `initialized`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUserData, safeSignOut]);

  // ✅ listener auth (después de init)
  useEffect(() => {
    if (!initialized) return;

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (!mountedRef.current) return;

        if (event === "SIGNED_OUT") {
          setUser(null);
          return;
        }

        if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
          const email = session?.user?.email || null;

          // si no hay email, limpia
          if (!email) {
            setUser(null);
            return;
          }

          const profile = await fetchUserData(email);

          if (!mountedRef.current) return;

          if (!profile) {
            // si el perfil no existe/inactivo, fuera
            await safeSignOut();
            setUser(null);
            return;
          }

          setUser(profile);
        }
      } catch (err) {
        console.error("❌ [AUTH LISTENER] error:", err);
        // no congeles la app por un listener fallido
      }
    });

    return () => {
      data?.subscription?.unsubscribe?.();
    };
  }, [initialized, fetchUserData, safeSignOut]);

  async function signIn(email, password) {
    let timeoutId;
    try {
      setLoading(true);

      timeoutId = setTimeout(() => {
        console.warn("⚠️ [SIGNIN] timeout -> forcing loading=false");
        if (mountedRef.current) setLoading(false);
      }, 15000);

      const signInPromise = supabase.auth.signInWithPassword({ email, password });
      const { error } = await withTimeout(signInPromise, 12000, "supabase.auth.signInWithPassword");
      if (error) throw error;

      const profile = await fetchUserData(email);

      if (timeoutId) clearTimeout(timeoutId);

      if (!profile) {
        await safeSignOut();
        if (mountedRef.current) setLoading(false);
        return { success: false, error: "Usuario no encontrado o inactivo" };
      }

      if (mountedRef.current) {
        setUser(profile);
        setLoading(false);
      }
      return { success: true };
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      if (mountedRef.current) setLoading(false);
      return { success: false, error: err?.message || "Error de login" };
    }
  }

  async function signOut() {
    try {
      setLoading(true);
      await safeSignOut();
      if (mountedRef.current) {
        setUser(null);
        setLoading(false);
      }
      return { success: true };
    } catch (err) {
      if (mountedRef.current) setLoading(false);
      return { success: false, error: err?.message || "Error al cerrar sesión" };
    }
  }

  const value = useMemo(() => ({ user, loading, signIn, signOut }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
