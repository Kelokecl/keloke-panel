// src/pages/OAuthCallback.jsx

import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import supabase from "../supabaseClient"; // <-- asegúrate que tu proyecto exporta supabase acá
import {
  base64UrlDecodeToJson,
  safeDecodeURIComponent,
} from "../utils/base64url";

function getQueryParams(search) {
  const p = new URLSearchParams(search);
  const obj = {};
  for (const [k, v] of p.entries()) obj[k] = v;
  return obj;
}

function nowPlusSeconds(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export default function OAuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();

  const qp = useMemo(() => getQueryParams(location.search), [location.search]);

  const [status, setStatus] = useState("processing"); // processing | success | error
  const [message, setMessage] = useState("Conectando...");
  const [platform, setPlatform] = useState(qp.platform || "unknown");

  useEffect(() => {
    (async () => {
      try {
        const platformParam = qp.platform || "unknown";
        setPlatform(platformParam);

        // common error fields from OAuth providers / your edge functions
        const successParam = qp.success;
        const errorParam =
          qp.error ||
          qp.err ||
          qp.message ||
          qp.error_message ||
          qp.error_description;

        // ---- 1) Reconstruct user_id from state OR from localStorage fallback
        let stateObj = null;
        let userId = null;

        if (qp.state) {
          // IMPORTANT: decode as Base64URL + padding (NOT atob direct)
          stateObj = base64UrlDecodeToJson(qp.state);
          userId = stateObj?.user_id || stateObj?.u || null;
        }

        // Fallback if state is missing or could not be decoded previously
        if (!userId) {
          const ls = localStorage.getItem(`oauth_state_${platformParam}`);
          if (ls) {
            try {
              const parsed = JSON.parse(ls);
              userId = parsed?.user_id || parsed?.u || null;
              stateObj = stateObj || parsed;
            } catch {
              // ignore
            }
          }
        }

        if (!userId) {
          throw new Error("missing_user_id");
        }

        // If OAuth flow returned error => show it (still close window)
        if (
          successParam === "false" ||
          successParam === "0" ||
          (errorParam && errorParam.length > 0)
        ) {
          const msg = safeDecodeURIComponent(errorParam || "OAuth error");
          throw new Error(msg);
        }

        // ---- 2) Parse payload (tokens, etc.) - can be Base64URL or plain JSON
        // Your edge functions likely redirect with payload=BASE64URL(JSON)
        // But we support multiple formats safely.
        let payload = null;

        if (qp.payload) {
          // preferred: base64url json
          payload = base64UrlDecodeToJson(qp.payload);
        } else if (qp.data) {
          payload = base64UrlDecodeToJson(qp.data);
        } else if (qp.tokens) {
          payload = base64UrlDecodeToJson(qp.tokens);
        } else {
          // Some implementations just send "code" back to the app and the app exchanges.
          // If that's your case, you must exchange here. But your screenshots show edge
          // functions already doing / redirecting, so payload should exist.
          payload = null;
        }

        // payload may contain:
        // access_token, refresh_token, expires_in, token_expiry, account_name, account_user, etc.
        // normalize fields
        const access_token = payload?.access_token || payload?.accessToken || null;
        const refresh_token =
          payload?.refresh_token || payload?.refreshToken || null;
        const expires_in =
          payload?.expires_in || payload?.expiresIn || payload?.expires || null;

        const token_expiry =
          payload?.token_expiry ||
          payload?.tokenExpiry ||
          (expires_in ? nowPlusSeconds(Number(expires_in)) : null);

        const account_name = payload?.account_name || payload?.accountName || null;
        const account_user = payload?.account_user || payload?.accountUser || null;

        if (!access_token) {
          // If your edge function stores tokens server-side and only returns success=true,
          // then you can skip storing here. But your UI expects DB update, so we enforce it.
          throw new Error("missing_access_token");
        }

        // ---- 3) Upsert into user_social_tokens
        const upsertRow = {
          user_id: userId,
          platform: platformParam,
          access_token,
          refresh_token,
          token_expiry,
          account_name,
          account_user,
          is_active: true,
          updated_at: new Date().toISOString(),
        };

        const { error: upsertError } = await supabase
          .from("user_social_tokens")
          .upsert(upsertRow, { onConflict: "user_id,platform" });

        if (upsertError) {
          throw new Error(`db_upsert_failed: ${upsertError.message}`);
        }

        // ---- 4) Cleanup localStorage state for this platform
        localStorage.removeItem(`oauth_state_${platformParam}`);

        setStatus("success");
        setMessage("Conectado correctamente ✅");

        // Notify opener & close
        try {
          if (window.opener) {
            window.opener.postMessage(
              { type: "oauth_success", platform: platformParam },
              window.location.origin
            );
          }
        } catch {
          // ignore
        }

        setTimeout(() => {
          // If it's a popup, close; if not, go back to connections
          if (window.opener) window.close();
          else navigate("/connections");
        }, 600);
      } catch (e) {
        const msg = e?.message || "Error desconocido";
        setStatus("error");
        setMessage(msg);

        // Notify opener
        try {
          if (window.opener) {
            window.opener.postMessage(
              { type: "oauth_error", platform, error: msg },
              window.location.origin
            );
          }
        } catch {
          // ignore
        }

        setTimeout(() => {
          if (window.opener) window.close();
          else navigate("/connections?oauth_error=1");
        }, 1200);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "linear-gradient(135deg, rgba(157,65,255,1) 0%, rgba(255,60,150,1) 100%)",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: "92vw",
          background: "rgba(255,255,255,0.95)",
          borderRadius: 18,
          padding: 24,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 10 }}>
          Plataforma: <b>{platform}</b>
        </div>

        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            marginBottom: 6,
            color: status === "error" ? "#c62828" : "#1b5e20",
          }}
        >
          {status === "processing"
            ? "Conectando..."
            : status === "success"
            ? "Conectado"
            : "Error al conectar"}
        </div>

        <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 18 }}>
          {message}
        </div>

        <div style={{ fontSize: 12, opacity: 0.6 }}>
          Esta ventana se cerrará automáticamente.
        </div>
      </div>
    </div>
  );
}
