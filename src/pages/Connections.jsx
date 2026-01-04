// src/pages/Connections.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function Connections() {
  const [loading, setLoading] = useState(false);

  // Listener global para OAuth popup
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

  // INICIO OAUTH (NO TOCAR IG / FB / YT)
  const startOAuth = async (platform) => {
    try {
      setLoading(true);

      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;

      const userId = data?.user?.id;
      if (!userId) {
        alert("No hay sesión activa.");
        return;
      }

      // SOLO para TikTok usamos state JSON simple
      let popupUrl = "";

      if (platform === "tiktok") {
        popupUrl = `${SUPABASE_URL}/functions/v1/tiktok-oauth/start`;
      } else {
        // MAPEO EXISTENTE (NO MODIFICADO)
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

        popupUrl = `${SUPABASE_URL}/functions/v1/${fnName}`;
      }

      window.open(popupUrl, "_blank", "width=520,height=720");
    } catch (e) {
      console.error(e);
      alert(`Error iniciando OAuth: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Conexiones</h2>

      <button disabled={loading} onClick={() => startOAuth("instagram")}>
        Conectar Instagram
      </button>

      <button disabled={loading} onClick={() => startOAuth("facebook")}>
        Conectar Facebook
      </button>

      <button disabled={loading} onClick={() => startOAuth("youtube")}>
        Conectar YouTube
      </button>

      <button disabled={loading} onClick={() => startOAuth("tiktok")}>
        Conectar TikTok
      </button>

      {loading && <p>Abriendo conexión…</p>}
    </div>
  );
}
