// src/pages/Connections.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient"; // <-- AJUSTA SI TU RUTA ES OTRA

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function Connections() {
  const [loading, setLoading] = useState(false);

  // ✅ Listener para recibir respuesta desde /oauth/callback (popup)
  useEffect(() => {
    const handler = (event) => {
      if (!event?.data || event.data.type !== "OAUTH_RESULT") return;

      const { success, platform, error } = event.data;

      if (success) {
        alert(`✅ Conectado: ${platform}`);
        // aquí puedes llamar a tu refresh real si tienes algo
        // refreshConnections();
      } else {
        alert(`❌ Error al conectar ${platform}: ${error || "unknown"}`);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // ✅ INICIO OAUTH (CLAVE) — CÓDIGO COMPLETO
  const startOAuth = async (platform) => {
    try {
      setLoading(true);

      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;

      const userId = data?.user?.id;
      if (!userId) {
        alert("No hay sesión activa. Vuelve a iniciar sesión.");
        return;
      }

      // STATE va como JSON (NO base64)
      const state = JSON.stringify({
        user_id: userId,
        platform,
        ts: Date.now(),
      });

      // OJO: estos nombres deben calzar con tus Edge Functions reales
      // Si tus funciones se llaman:
      // - instagram-oauth-callback
      // - facebook-oauth-callback
      // - google-oauth-callback
      // entonces acá mapeamos:
      const fnMap = {
        instagram: "instagram-oauth-callback",
        facebook: "facebook-oauth-callback",
        youtube: "google-oauth-callback", // youtube usa google oauth
        google: "google-oauth-callback",
      };

      const fnName = fnMap[platform];
      if (!fnName) {
        alert(`Platform no soportada: ${platform}`);
        return;
      }

      // Abrimos la Edge Function en popup
      const popupUrl =
        `${SUPABASE_URL}/functions/v1/${fnName}` +
        `?state=${encodeURIComponent(state)}`;

      window.open(popupUrl, "_blank", "width=520,height=720");
    } catch (e) {
      console.error(e);
      alert(`Error iniciando OAuth: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, Arial" }}>
      <h2>Conexiones</h2>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button disabled={loading} onClick={() => startOAuth("instagram")}>
          Conectar Instagram
        </button>

        <button disabled={loading} onClick={() => startOAuth("facebook")}>
          Conectar Facebook
        </button>

        <button disabled={loading} onClick={() => startOAuth("youtube")}>
          Conectar YouTube
        </button>
      </div>

      <p style={{ marginTop: 12, opacity: 0.7 }}>
        {loading ? "Abriendo conexión..." : ""}
      </p>
    </div>
  );
}
