// src/pages/Connections.jsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient"; // ✅ este es el correcto en tu repo

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
        // aquí normalmente refrescas estado (fetch tokens/connections)
      } else {
        alert(`❌ Error al conectar ${platform}: ${error || "unknown"}`);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // ✅ INICIO OAUTH — PARA REDES QUE YA TIENES
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

      const stateObj = {
        user_id: userId,
        platform,
        ts: Date.now(),
        app_origin: window.location.origin,
      };

      const stateJson = JSON.stringify(stateObj);
      const stateB64Url = base64UrlEncode(stateJson);

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

  // ✅ TIKTOK: SIEMPRE abrir la ruta interna (NO TikTok directo)
  // Esta ruta /oauth/tiktok-start es pública (en App.jsx) y ahí se hace el fetch a la edge /start con Authorization.
  const startTikTokOAuth = async () => {
    try {
      setLoading(true);

      // Solo validamos que exista sesión antes de abrir el popup (para no abrirlo en vano)
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const accessToken = data?.session?.access_token;
      if (!accessToken) {
        alert("No hay sesión activa. Inicia sesión en el panel y vuelve a intentar.");
        return;
      }

      // ✅ abrir popup a tu app, NO a tiktok.com
      window.open(
        `${window.location.origin}/oauth/tiktok-start`,
        "tiktok_oauth",
        "width=520,height=720"
      );
    } catch (e) {
      console.error(e);
      alert(`Error iniciando TikTok OAuth: ${e?.message || e}`);
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

        {/* ✅ TikTok */}
        <button disabled={loading} onClick={startTikTokOAuth}>
          Conectar TikTok
        </button>
      </div>

      <p style={{ marginTop: 12, opacity: 0.7 }}>
        {loading ? "Abriendo conexión..." : ""}
      </p>
    </div>
  );
}
