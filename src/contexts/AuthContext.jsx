import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Función para obtener datos del usuario desde la tabla users
  const fetchUserData = useCallback(async (email) => {
    try {
      console.log('📊 Fetching user data for:', email);
      
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('is_active', true)
        .single();
      
      if (error) {
        console.error('❌ Error fetching user data:', error);
        return null;
      }
      
      console.log('✅ User data fetched successfully');
      return userData;
    } catch (error) {
      console.error('❌ Exception in fetchUserData:', error);
      return null;
    }
  }, []);

  // Verificar sesión inicial SOLO UNA VEZ
  useEffect(() => {
    let mounted = true;
    let timeoutId;

    async function checkInitialSession() {
      try {
        console.log('🔍 [INIT] Checking initial session...');
        
        // Timeout de seguridad: si tarda más de 3 segundos, forzar loading = false
        timeoutId = setTimeout(() => {
          if (mounted && !initialized) {
            console.warn('⚠️ [TIMEOUT] Session check timeout - forcing loading to false');
            setLoading(false);
            setInitialized(true);
          }
        }, 3000);

        const { data: { session }, error } = await supabase.auth.getSession();
        
        clearTimeout(timeoutId);

        if (error) {
          console.error('❌ [INIT] Error getting session:', error);
          if (mounted) {
            setUser(null);
            setLoading(false);
            setInitialized(true);
          }
          return;
        }

        if (session?.user) {
          console.log('✅ [INIT] Session found for:', session.user.email);
          const userData = await fetchUserData(session.user.email);
          
          if (mounted) {
            if (userData) {
              console.log('✅ [INIT] User data loaded:', userData.email, 'Role:', userData.role);
              setUser(userData);
            } else {
              console.warn('⚠️ [INIT] User data not found or inactive');
              // Si no hay datos del usuario, cerrar sesión
              await supabase.auth.signOut();
              setUser(null);
            }
            setLoading(false);
            setInitialized(true);
          }
        } else {
          console.log('ℹ️ [INIT] No session found');
          if (mounted) {
            setUser(null);
            setLoading(false);
            setInitialized(true);
          }
        }
      } catch (error) {
        console.error('❌ [INIT] Exception in checkInitialSession:', error);
        if (mounted) {
          setUser(null);
          setLoading(false);
          setInitialized(true);
        }
      }
    }

    checkInitialSession();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []); // Solo ejecutar UNA VEZ al montar

  // Escuchar cambios de autenticación SOLO después de inicializar
  useEffect(() => {
    if (!initialized) {
      console.log('⏳ Waiting for initialization before setting up auth listener...');
      return;
    }

    console.log('👂 Setting up auth state listener...');

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔔 Auth event:', event);

        if (event === 'SIGNED_OUT') {
          console.log('👋 User signed out');
          setUser(null);
          localStorage.removeItem('supabase.auth.token');
          return;
        }

        if (event === 'SIGNED_IN') {
          console.log('👤 User signed in');
          if (session?.user) {
            const userData = await fetchUserData(session.user.email);
            if (userData) {
              setUser(userData);
              // Actualizar último login
              await supabase
                .from('users')
                .update({ last_login: new Date().toISOString() })
                .eq('id', userData.id);
            }
          }
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          console.log('🔄 Token refreshed');
          // No hacer nada, mantener el usuario actual
          return;
        }

        if (event === 'USER_UPDATED') {
          console.log('📝 User updated');
          if (session?.user) {
            const userData = await fetchUserData(session.user.email);
            if (userData) {
              setUser(userData);
            }
          }
          return;
        }
      }
    );

    return () => {
      console.log('🔇 Unsubscribing from auth listener');
      subscription.unsubscribe();
    };
  }, [initialized, fetchUserData]);

  async function signIn(email, password) {
    let timeoutId;
    try {
      console.log('🔐 [SIGNIN] Attempting sign in for:', email);
      setLoading(true);

      // Timeout de seguridad para el login
      timeoutId = setTimeout(() => {
        console.warn('⚠️ [SIGNIN] Login timeout - forcing loading to false');
        setLoading(false);
      }, 10000); // 10 segundos máximo

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('❌ [SIGNIN] Auth error:', error.message);
        clearTimeout(timeoutId);
        setLoading(false);
        throw error;
      }

      console.log('✅ [SIGNIN] Auth successful, fetching user data...');
      const userData = await fetchUserData(email);

      clearTimeout(timeoutId);

      if (!userData) {
        console.error('❌ [SIGNIN] User data not found or inactive');
        await supabase.auth.signOut();
        setLoading(false);
        throw new Error('Usuario no encontrado o inactivo');
      }

      console.log('✅ [SIGNIN] Sign in complete for:', userData.email);
      setUser(userData);
      setLoading(false);
      
      return { success: true };
    } catch (error) {
      console.error('❌ [SIGNIN] Sign in failed:', error.message);
      if (timeoutId) clearTimeout(timeoutId);
      setLoading(false);
      return { success: false, error: error.message };
    }
  }

  async function signUp(email, password, fullName, role = 'community_manager') {
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      const { error: userError } = await supabase
        .from('users')
        .insert([
          {
            email,
            password_hash: 'handled_by_supabase_auth',
            full_name: fullName,
            role,
            is_active: true,
          },
        ]);

      if (userError) throw userError;

      return { success: true };
    } catch (error) {
      console.error('Sign up error:', error);
      return { success: false, error: error.message };
    }
  }

  async function signOut() {
    try {
      console.log('👋 Signing out...');
      setLoading(true);
      
      const { error } = await supabase.auth.signOut();
      
      if (error) throw error;

      setUser(null);
      localStorage.removeItem('supabase.auth.token');
      
      console.log('✅ Sign out complete');
      setLoading(false);
      
      return { success: true };
    } catch (error) {
      console.error('❌ Sign out error:', error);
      setLoading(false);
      return { success: false, error: error.message };
    }
  }

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
