// src/pages/Connections.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function popupCenter(url, title, w = 520, h = 720) {
  const dualScreenLeft = window.screenLeft ?? window.screenX;
  const dualScreenTop = window.screenTop ?? window.screenY;
  const width = window.innerWidth ?? document.documentElement.clientWidth ?? screen.width;
  const height = window.innerHeight ?? document.documentElement.clientHeight ?? screen.height;

  const left = width / 2 - w / 2 + dualScreenLeft;
  const top = height / 2 - h / 2 + dualScreenTop;

  return window.open(
    url,
    title,
    `scrollbars=yes,width=${w},height=${h},top=${top},left=${left}`
  );
}

export default function Connections() {
  const [userId, setUserId] = useState(null);
  const [connecting, setConnecting] = useState(null);
  const [tokensByPlatform, setTokensByPlatform] = useState({});

  const origin = useMemo(() => window.location.origin, []);

  const loadUser = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setUserId(data?.user?.id || null);
  }, []);

  const loadTokens = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return;

    const { data, error } = await supabase
      .from("user_social_tokens")
      .select("platform,is_active,token_expires,account_name,account_user,updated_at")
      .eq("user_id", uid);

    if (!error && Array.isArray(data)) {
      const map = {};
      for (const row of data) map[row.platform] = row;
      setTokensByPlatform(map);
    }
  }, []);

  useEffect(() => {
    loadUser().then(loadTokens);
  }, [loadUser, loadTokens]);

  useEffect(() => {
    // Recibe resultado del popup (OAuthCallback.jsx)
    const onMsg = (e) => {
      if (e.origin !== origin) return;
      if (!e.data || e.data.type !== "oauth_result") return;
      setConnecting(null);
      // refrescar tokens guardados por Edge Function
      loadTokens();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [origin, loadTokens]);

  async function getCredentials(platform) {
    const { data, error } = await supabase
      .from("auth_credentials")
      .select("credentials")
      .eq("platform", platform)
      .single();
    if (error) throw new Error(error.message);
    return data.credentials;
  }

  function buildAuthUrl(platform, creds) {
    const state = base64UrlEncode({
      user_id: userId,
      platform,
      ts: Date.now(),
      nonce: crypto.randomUUID(),
      return_to: `${origin}/oauth/callback`, // donde termina el flujo en el front
    });

    // OJO: tu redirect_uri real es el Edge Function (como en tu tabla)
    const redirectUri = creds.redirect_uri;

    if (platform === "youtube") {
      const scope = encodeURIComponent(
        [
          "https://www.googleapis.com/auth/youtube.readonly",
          "https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube",
        ].join(" ")
      );

      const url =
        "https://accounts.google.com/o/oauth2/v2/auth" +
        `?client_id=${encodeURIComponent(creds.client_id)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&include_granted_scopes=true` +
        `&scope=${scope}` +
        `&state=${encodeURIComponent(state)}`;

      return url;
    }

    if (platform === "facebook") {
      const scope = encodeURIComponent(
        [
          "public_profile",
          "pages_show_list",
          "pages_read_engagement",
          "pages_manage_posts",
          "pages_manage_metadata",
        ].join(",")
      );

      const url =
        "https://www.facebook.com/v24.0/dialog/oauth" +
        `?client_id=${encodeURIComponent(creds.client_id)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${scope}` +
        `&state=${encodeURIComponent(state)}`;

      return url;
    }

    if (platform === "instagram") {
      // Para IG profesional vía Graph normalmente se usa Facebook OAuth + scopes ig_*
      const scope = encodeURIComponent(
        [
          "public_profile",
          "pages_show_list",
          "instagram_basic",
          "instagram_manage_insights",
          "instagram_content_publish",
        ].join(",")
      );

      const url =
        "https://www.facebook.com/v24.0/dialog/oauth" +
        `?client_id=${encodeURIComponent(creds.client_id)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${scope}` +
        `&state=${encodeURIComponent(state)}`;

      return url;
    }

    throw new Error(`Unsupported platform: ${platform}`);
  }

  const connect = async (platform) => {
    try {
      setConnecting(platform);
      if (!userId) {
        await loadUser();
        if (!userId) throw new Error("not_authenticated");
      }
      const creds = await getCredentials(platform);
      const authUrl = buildAuthUrl(platform, creds);
      popupCenter(authUrl, `Connect ${platform}`);
    } catch (e) {
      console.error(e);
      alert(`Error al conectar ${platform}: ${e.message || e}`);
      setConnecting(null);
    }
  };

  const statusChip = (platform) => {
    const row = tokensByPlatform[platform];
    const ok = row?.is_active;
    return (
      <span style={{ fontWeight: 700, color: ok ? "#16a34a" : "#dc2626" }}>
        {ok ? "Conectado" : "Desconectado"}
      </span>
    );
  };

  return (
    <div style={{ padding: 18 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Conexiones</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(220px, 1fr))", gap: 12 }}>
        {["instagram", "facebook", "youtube"].map((p) => (
          <div key={p} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 800, textTransform: "capitalize" }}>{p}</div>
              {statusChip(p)}
            </div>

            <button
              onClick={() => connect(p)}
              disabled={connecting === p}
              style={{
                marginTop: 12,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "0",
                cursor: "pointer",
                fontWeight: 800,
                background: connecting === p ? "#9ca3af" : "#111827",
                color: "white",
              }}
            >
              {connecting === p ? "Conectando..." : `Conectar ${p}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
