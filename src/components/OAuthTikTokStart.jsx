import { useEffect } from "react";
import { supabase } from "../supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function OAuthTikTokStart() {
  useEffect(() => {
    (async () => {
      try {
        const { data: sessionData, error: sErr } = await supabase.auth.getSession();
        if (sErr) throw sErr;

        const accessToken = sessionData?.session?.access_token;
        if (!accessToken) throw new Error("No hay sesión activa. Inicia sesión en el panel primero.");

        let appOrigin = window.location.origin;
        try {
          if (window.opener?.location?.origin) appOrigin = window.opener.location.origin;
        } catch {}

        const startUrl = `${SUPABASE_URL}/functions/v1/tiktok-oauth/start`;

        const res = await fetch(startUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ app_origin: appOrigin }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.auth_url) {
          throw new Error(data?.error || `No se recibió auth_url (${res.status})`);
        }

        window.location.href = data.auth_url;
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
