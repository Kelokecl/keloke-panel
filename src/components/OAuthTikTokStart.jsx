// src/components/OAuthTikTokStart.jsx
import { useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function OAuthTikTokStart() {
  useEffect(() => {
    (async () => {
      try {
        const { data: sessionData, error: sErr } = await supabase.auth.getSession();
        if (sErr) throw sErr;

        const accessToken = sessionData?.session?.access_token;
        if (!accessToken) {
          throw new Error("No hay sesión activa en el popup. Inicia sesión en el panel primero.");
        }

        const startUrl =
          `${SUPABASE_URL}/functions/v1/tiktok-oauth/start` +
          `?app_origin=${encodeURIComponent(window.location.origin)}`;

        const res = await fetch(startUrl, {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        // Si la Edge Function responde con redirect 302, fetch lo sigue y termina en HTML (TikTok).
        // Para evitar webeo con redirects, la Edge Function te va a devolver JSON con {url}.
        const data = await res.json();
        if (!data?.url) throw new Error(`Respuesta inesperada: ${JSON.stringify(data)}`);

        window.location.href = data.url;
      } catch (e) {
        console.error(e);
        if (window.opener) {
          window.opener.postMessage(
            { success: false, platform: "tiktok", error: e?.message || String(e) },
            window.location.origin
          );
        }
        window.close();
      }
    })();
  }, []);

  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <h3>Conectando TikTok…</h3>
      <p>Se abrirá el login de TikTok en este popup.</p>
    </div>
  );
}
