// src/pages/OAuthTikTokStart.jsx
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
          throw new Error("No hay sesión activa. Inicia sesión en el panel y reintenta.");
        }

        // Llamamos a la Edge Function /start con Authorization
        const startUrl =
          `${SUPABASE_URL}/functions/v1/tiktok-oauth/start` +
          `?app_origin=${encodeURIComponent(window.location.origin)}`;

        const res = await fetch(startUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          redirect: "manual",
        });

        // Si el navegador bloquea leer Location por CORS, igual TikTok no debería fallar:
        // pero en Edge, al ser redirect 302, normalmente Location viene acá.
        const location = res.headers.get("Location");
        if (!location) {
          const txt = await res.text().catch(() => "");
          throw new Error(`No se recibió redirect desde /start. Status=${res.status}. ${txt}`);
        }

        // Redirige el popup a TikTok (acá recién aparece el login)
        window.location.href = location;
      } catch (e) {
        console.error(e);
        if (window.opener) {
          window.opener.postMessage(
            { type: "OAUTH_RESULT", platform: "tiktok", success: false, error: e?.message || String(e) },
            "*"
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
