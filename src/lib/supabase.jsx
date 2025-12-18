import { createClient } from '@supabase/supabase-js';

// Supabase client configurado con variables de entorno de Vite
// Define en tu archivo .env.local:
// VITE_SUPABASE_URL=...
 // VITE_SUPABASE_ANON_KEY=...
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase no está configurado correctamente. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu .env.local');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
