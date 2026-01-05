// src/pages/Connections.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function Connections() {
  const [loading, setLoading] = useState(false);

  // ✅ Listener para recibir respuesta desde el popup (Edge callback)
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

  const startOAuth = async (platform) => {
    try {
      setLoading(true);

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        alert("No hay sesión activa. Vuelve a iniciar sesión.");
        return;
      }

      // ✅ TikTok: SIEMPRE inicia desde la Edge Function /start
      if (platform === "tiktok") {
        const startUrl = `${SUPABASE_URL}/functions/v1/tiktok-oauth/start`;

        const res = await fetch(startUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            app_origin: window.location.origin, // para postMessage seguro
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.auth_url) {
          throw new Error(
            data?.error ||
              `TikTok start failed (${res.status}). Revisa Edge Function logs.`
          );
        }

        window.open(data.auth_url, "_blank", "width=520,height=720");
        return;
      }

      // ✅ Resto de plataformas (igual como lo tenías)
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

      const popupUrl = `${SUPABASE_URL}/functions/v1/${fnName}`;
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

        <button disabled={loading} onClick={() => startOAuth("tiktok")}>
          Conectar TikTok
        </button>
      </div>

      <p style={{ marginTop: 12, opacity: 0.7 }}>
        {loading ? "Abriendo conexión..." : ""}
      </p>
    </div>
  );
}
