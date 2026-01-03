import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

type Platform = "facebook" | "instagram" | "youtube";

type OAuthRow = {
  platform: Platform;
  credentials: {
    client_id?: string;
    client_secret?: string;
    redirect_uri?: string;
    // por si algún día guardas app_id en vez de client_id
    app_id?: string;
  };
};

const SUPABASE_FUNCTIONS_BASE =
  import.meta.env.VITE_SUPABASE_FUNCTIONS_BASE ||
  "https://gqgsgkaeopvbsultjgvt.supabase.co/functions/v1";

function b64url(obj: unknown) {
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export default function Connections() {
  const { user } = useAuth();
  const [creds, setCreds] = useState<Record<string, OAuthRow["credentials"]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("oauth_credentials")
        .select("platform, credentials");

      if (!error && data) {
        const map: Record<string, OAuthRow["credentials"]> = {};
        for (const row of data as any[]) {
          map[row.platform] = row.credentials;
        }
        setCreds(map);
      }
      setLoading(false);
    })();
  }, []);

  const startOAuth = async (platform: Platform) => {
    if (!user?.id) {
      alert("No hay sesión iniciada.");
      return;
    }

    const c = creds[platform];
    if (!c) {
      alert(`No hay credenciales guardadas para ${platform} en oauth_credentials.`);
      return;
    }

    const clientId = c.client_id || c.app_id;
    const redirectUri = c.redirect_uri;

    if (!clientId || !redirectUri) {
      alert(`Credenciales incompletas para ${platform}. Falta client_id/app_id o redirect_uri.`);
      return;
    }

    const origin = window.location.origin;
    const state = b64url({ user_id: user.id, origin });

    // Endpoints OAuth
    let authUrl = "";
    if (platform === "facebook") {
      const scopes = [
        "public_profile",
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
        "pages_manage_metadata",
        "instagram_basic",
        "instagram_content_publish",
        "business_management",
      ].join(",");
      authUrl =
        `https://www.facebook.com/v24.0/dialog/oauth` +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&state=${encodeURIComponent(state)}`;
    }

    if (platform === "instagram") {
      // Instagram Basic Display / o IG Graph depende tu app; mantengo el mismo de FB si está integrado
      // Si tu IG está por "Facebook Login", usa el mismo flujo de Facebook. Si es IG Basic Display, cambia endpoint.
      const scopes = ["instagram_basic", "instagram_content_publish"].join(",");
      authUrl =
        `https://www.facebook.com/v24.0/dialog/oauth` +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&state=${encodeURIComponent(state)}`;
    }

    if (platform === "youtube") {
      const scopes = [
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube",
      ].join(" ");
      authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth` +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&include_granted_scopes=true` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&state=${encodeURIComponent(state)}`;
    }

    if (!authUrl) {
      alert("Plataforma no soportada.");
      return;
    }

    // Popup
    const w = 650;
    const h = 750;
    const y = window.top!.outerHeight / 2 + window.top!.screenY - h / 2;
    const x = window.top!.outerWidth / 2 + window.top!.screenX - w / 2;

    const popup = window.open(
      authUrl,
      "oauth_popup",
      `width=${w},height=${h},left=${x},top=${y}`
    );

    if (!popup) {
      alert("El navegador bloqueó el popup. Habilita popups para continuar.");
      return;
    }

    // Esperar mensaje desde /oauth/callback
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if (!ev.data || ev.data.type !== "oauth_result") return;

      window.removeEventListener("message", onMsg);

      if (ev.data.success) {
        alert(`✅ Conectado: ${platform}`);
      } else {
        alert(`❌ Error al conectar ${platform}: ${ev.data.error || "Unauthorized"}`);
      }
    };

    window.addEventListener("message", onMsg);
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Conexiones</h2>
      {loading && <p>Cargando credenciales...</p>}

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button onClick={() => startOAuth("instagram")}>Conectar Instagram</button>
        <button onClick={() => startOAuth("facebook")}>Conectar Facebook</button>
        <button onClick={() => startOAuth("youtube")}>Conectar YouTube</button>
      </div>

      <p style={{ marginTop: 16, opacity: 0.7 }}>
        Usa redirect_uri desde <b>public.oauth_credentials</b> (Edge Functions). No debe apuntar a /oauth/callback.
      </p>
    </div>
  );
}
