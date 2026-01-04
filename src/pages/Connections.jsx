// src/pages/Connections.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/**
 * Base64URL encode (sin padding, +/ por -_)
 * Compatible con edge functions que esperan base64.
 */
function base64UrlEncode(str) {
  const b64 = btoa(unescape(encodeURIComponent(str))); // UTF-8 safe
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export default function Connections() {
  const [loading, setLoading] = useState(false);

  // ✅ Listener para recibir respuesta desde /oauth/callback (popup)
  useEffect(() => {
    const handler = (event) => {
      if (!event?.data || event.data.type !== "OAUTH_RESULT") return;

      const { success, platform, error } = event.data;

      if (success) {
        alert(`✅ Conectado: ${platform}`);
      } else {
        alert(`❌ Error al conectar ${platform}: ${error || "unknown"}`);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // ✅ INICIO OAUTH (CLAVE) — COMPLETO
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

      /**
       * 🔥 IMPORTANTÍSIMO:
       * Tus Edge Functions están esperando state en base64.
       * Por eso lo mandamos como base64url.
       *
       * Además agregamos app_origin (para postMessage seguro)
       * y platform (por si la edge lo usa).
       */
      const stateObj = {
        user_id: userId,
        platform,
        ts: Date.now(),
        app_origin: window.location.origin, // para postMessage targetOrigin
      };

      const stateJson = JSON.stringify(stateObj);
      const stateB64Url = base64UrlEncode(stateJson);

      // Mapea tus Edge Functions reales
      const fnMap = {
        instagram: "instagram-oauth-callback",
        facebook: "facebook-oauth-callback",
        youtube: "google-oauth-callback",
        google: "google-oauth-callback",
      };

      const fnName = fnMap[platform];
      if (!fnName) {
        alert(`Platform no soportada: ${platform}`);
        return;
      }

      /**
       * Abrimos la Edge Function en popup
       * OJO: mandamos state base64url
       */
      const popupUrl =
        `${SUPABASE_URL}/functions/v1/${fnName}` +
        `?state=${encodeURIComponent(stateB64Url)}`;

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
