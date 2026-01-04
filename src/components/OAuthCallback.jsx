// src/components/OAuthCallback.jsx
import React, { useEffect, useMemo } from "react";

/** Parse hash params like "#access_token=...&expires_in=..." */
function parseHashParams(hash) {
  const clean = (hash || "").replace(/^#/, "");
  return new URLSearchParams(clean);
}

function tryDecodeURIComponentSafe(str) {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

/**
 * Decodes base64/base64url safely.
 * - base64url uses '-' '_' and no padding.
 */
function tryBase64Decode(str) {
  if (!str || typeof str !== "string") return null;

  // Convert base64url -> base64
  let s = str.replace(/-/g, "+").replace(/_/g, "/");

  // Fix padding
  while (s.length % 4 !== 0) s += "=";

  try {
    // atob expects valid base64
    const decoded = atob(s);
    return decoded;
  } catch {
    return null;
  }
}

function tryJsonParse(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Accepts state in:
 * - raw JSON: {"user_id":"...","app_origin":"..."}
 * - urlencoded JSON: %7B%22user_id%22%3A...
 * - base64/base64url JSON: eyJ1c2VyX2lkIjoiLi4uIn0
 */
function parseState(stateRaw) {
  if (!stateRaw) return { raw: null, obj: null };

  // 1) raw JSON
  const directObj = tryJsonParse(stateRaw);
  if (directObj) return { raw: stateRaw, obj: directObj };

  // 2) URL decoded JSON
  const urlDecoded = tryDecodeURIComponentSafe(stateRaw);
  const urlObj = tryJsonParse(urlDecoded);
  if (urlObj) return { raw: stateRaw, obj: urlObj };

  // 3) base64/base64url decoded JSON
  const b64Decoded = tryBase64Decode(stateRaw);
  const b64Obj = tryJsonParse(b64Decoded);
  if (b64Obj) return { raw: stateRaw, obj: b64Obj };

  // 4) base64 of urlencoded JSON (yes, sometimes happens)
  const b64UrlDecoded = b64Decoded ? tryDecodeURIComponentSafe(b64Decoded) : null;
  const b64UrlObj = tryJsonParse(b64UrlDecoded);
  if (b64UrlObj) return { raw: stateRaw, obj: b64UrlObj };

  return { raw: stateRaw, obj: null };
}

export default function OAuthCallback() {
  const qs = useMemo(() => new URLSearchParams(window.location.search), []);
  const hs = useMemo(() => parseHashParams(window.location.hash), []);

  const payload = useMemo(() => {
    const platform =
      qs.get("platform") ||
      qs.get("p") ||
      hs.get("platform") ||
      "unknown";

    // state puede venir en query o hash según proveedor
    const stateRaw = qs.get("state") || hs.get("state") || null;
    const { obj: stateObj } = parseState(stateRaw);

    const code = qs.get("code") || null;

    // Implicit grant: token viene en hash
    const access_token = hs.get("access_token") || null;
    const expires_in = hs.get("expires_in") || null;

    const error =
      qs.get("error_description") ||
      qs.get("error") ||
      hs.get("error_description") ||
      hs.get("error") ||
      null;

    // success: si hay code o token y no hay error
    const success = (!!code || !!access_token) && !error;

    const account =
      qs.get("account") ||
      qs.get("account_name") ||
      (stateObj?.account_name ?? null);

    // Origen permitido para postMessage (si viene en state, mejor)
    const targetOrigin = stateObj?.app_origin || window.location.origin;

    // info útil para el opener
    const user_id =
      stateObj?.user_id ||
      stateObj?.uid ||
      qs.get("user_id") ||
      null;

    return {
      success,
      platform,
      account,
      error,
      code,
      access_token,
      expires_in,
      state: stateRaw,
      targetOrigin,
      user_id,
    };
  }, [qs, hs]);

  useEffect(() => {
    const message = {
      type: "OAUTH_RESULT",
      success: payload.success,
      platform: payload.platform,
      account: payload.account,
      error: payload.error,
      code: payload.code,
      access_token: payload.access_token,
      expires_in: payload.expires_in,
      state: payload.state,
      user_id: payload.user_id,
    };

    // 1) Si hay opener (popup), intentamos postMessage
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(message, payload.targetOrigin);
      } catch {
        // fallback ultra permisivo si el origin no calza (mejor que perder el mensaje)
        window.opener.postMessage(message, "*");
      }

      // cerrar popup
      setTimeout(() => {
        try {
          window.close();
        } catch {}
      }, 500);

      return;
    }

    // 2) Si no hay opener (abierto directo), intenta volver al panel
    // (mantiene compatibilidad sin romper tu flujo)
    setTimeout(() => {
      try {
        window.close();
      } catch {}
      // opcional: redirigir si no se puede cerrar
      // window.location.href = "/connections";
    }, 1500);
  }, [payload]);

  const title = payload.success ? "Conectando…" : "Error al conectar";
  const subtitle = payload.success
    ? "Estamos cerrando esta ventana automáticamente."
    : payload.error || "Error desconocido";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-pink-600">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center">
          <div className="mb-6">
            <div
              className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${
                payload.success ? "bg-green-100" : "bg-red-100"
              }`}
            >
              {payload.success ? (
                <svg
                  className="w-8 h-8 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg
                  className="w-8 h-8 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-800 mb-2">{title}</h2>
          <p className="text-gray-600 mb-6">{subtitle}</p>

          <div className="text-xs text-gray-500 mb-4">
            Plataforma: <span className="font-semibold">{payload.platform}</span>
            {payload.account ? (
              <>
                {" "}
                · Cuenta: <span className="font-semibold">{payload.account}</span>
              </>
            ) : null}
          </div>

          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            <span className="ml-3 text-gray-600">Cerrando…</span>
          </div>
        </div>
      </div>
    </div>
  );
}
