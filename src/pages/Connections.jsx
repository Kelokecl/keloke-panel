// src/pages/Connections.jsx

import React, { useCallback, useEffect, useState } from "react";
import supabase from "../supabaseClient"; // <-- tu cliente supabase
import { base64UrlEncode } from "../utils/base64url";

function openPopup(url, title = "oauth", w = 520, h = 720) {
  const dualScreenLeft = window.screenLeft ?? window.screenX;
  const dualScreenTop = window.screenTop ?? window.screenY;

  const width = window.innerWidth ?? document.documentElement.clientWidth ?? screen.width;
  const height = window.innerHeight ?? document.documentElement.clientHeight ?? screen.height;

  const left = width / 2 - w / 2 + dualScreenLeft;
  const top = height / 2 - h / 2 + dualScreenTop;

  const popup = window.open(
    url,
    title,
    `scrollbars=yes,width=${w},height=${h},top=${top},left=${left}`
  );

  if (popup && popup.focus) popup.focus();
  return popup;
}

export default function Connections() {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Listen oauth callback results
 useEffect(() => {
  const handler = (event) => {
    if (event.data?.type !== "OAUTH_RESULT") return;

    if (event.data.success) {
      refreshConnections(); // 🔁 vuelve a consultar user_social_tokens
    } else {
      alert(`Error al conectar ${event.data.platform}: ${event.data.error}`);
    }
  };

  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}, []);


  const connect = useCallback(async (platform) => {
    setLoading(true);
    try {
      // 1) Ensure logged user
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userData?.user;
      if (!user?.id) throw new Error("no_session");

      // 2) Load oauth credentials for platform
      const { data: credRow, error: credErr } = await supabase
        .from("oauth_credentials")
        .select("credentials")
        .eq("platform", platform)
        .single();

      if (credErr) throw credErr;
      const creds = credRow?.credentials;
      if (!creds?.client_id || !creds?.redirect_uri) {
        throw new Error("missing_client_id_or_redirect_uri");
      }

      // 3) Build state (MUST include user_id)
      const stateObj = {
        user_id: user.id,
        platform,
        ts: Date.now(),
        nonce: (crypto?.randomUUID?.() || String(Math.random())).replace(/\./g, ""),
      };

      // store fallback
      localStorage.setItem(`oauth_state_${platform}`, JSON.stringify(stateObj));

      const state = base64UrlEncode(stateObj);

      // 4) Build provider auth URL
      let authUrl = "";

      if (platform === "youtube") {
        const scope = encodeURIComponent(
          [
            "https://www.googleapis.com/auth/youtube.readonly",
            "https://www.googleapis.com/auth/youtube.upload",
            "https://www.googleapis.com/auth/youtube",
          ].join(" ")
        );

        authUrl =
          "https://accounts.google.com/o/oauth2/v2/auth" +
          `?client_id=${encodeURIComponent(creds.client_id)}` +
          `&redirect_uri=${encodeURIComponent(creds.redirect_uri)}` +
          `&response_type=code` +
          `&access_type=offline` +
          `&prompt=consent` +
          `&scope=${scope}` +
          `&include_granted_scopes=true` +
          `&state=${encodeURIComponent(state)}`;
      } else if (platform === "facebook") {
        // Uses Meta OAuth dialog
        // Make sure your app has correct Valid OAuth Redirect URIs set to creds.redirect_uri
        const scope = encodeURIComponent(
          ["public_profile", "pages_show_list", "pages_read_engagement"].join(",")
        );

        authUrl =
          `https://www.facebook.com/v24.0/dialog/oauth` +
          `?client_id=${encodeURIComponent(creds.client_id)}` +
          `&redirect_uri=${encodeURIComponent(creds.redirect_uri)}` +
          `&response_type=code` +
          `&scope=${scope}` +
          `&state=${encodeURIComponent(state)}`;
      } else if (platform === "instagram") {
        // For IG you often use same Meta app; depending on your flow you may use Facebook login
        // Keep it consistent with your edge function expectations.
        const scope = encodeURIComponent(
          ["instagram_basic", "pages_show_list", "instagram_content_publish"].join(",")
        );

        authUrl =
          `https://www.facebook.com/v24.0/dialog/oauth` +
          `?client_id=${encodeURIComponent(creds.client_id)}` +
          `&redirect_uri=${encodeURIComponent(creds.redirect_uri)}` +
          `&response_type=code` +
          `&scope=${scope}` +
          `&state=${encodeURIComponent(state)}`;
      } else {
        throw new Error("unsupported_platform");
      }

      openPopup(authUrl, `oauth_${platform}`);
      showToast(`Abriendo login de ${platform}...`);
    } catch (e) {
      showToast(`❌ ${e?.message || "Error"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div style={{ padding: 18 }}>
      <h2 style={{ margin: 0, marginBottom: 12 }}>Conexiones</h2>

      {toast && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "#111",
            color: "#fff",
            marginBottom: 12,
            width: "fit-content",
          }}
        >
          {toast}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button disabled={loading} onClick={() => connect("instagram")}>
          Conectar Instagram
        </button>
        <button disabled={loading} onClick={() => connect("facebook")}>
          Conectar Facebook
        </button>
        <button disabled={loading} onClick={() => connect("youtube")}>
          Conectar YouTube
        </button>
      </div>

      <div style={{ marginTop: 14, opacity: 0.7, fontSize: 13 }}>
        {loading ? "Procesando..." : "Listo."}
      </div>
    </div>
  );
}
