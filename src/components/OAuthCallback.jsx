import React, { useEffect, useMemo } from "react";

function parseHashParams(hash) {
  const clean = (hash || "").replace(/^#/, "");
  return new URLSearchParams(clean);
}

function safeParseState(state) {
  if (!state) return null;
  try {
    return JSON.parse(state);
  } catch {
    return null;
  }
}

export default function OAuthCallback() {
  const qs = useMemo(() => new URLSearchParams(window.location.search), []);
  const hs = useMemo(() => parseHashParams(window.location.hash), []);

  const payload = useMemo(() => {
    const platform =
      qs.get("platform") || qs.get("p") || hs.get("platform") || "unknown";

    const success =
      qs.get("success") === "true" ||
      Boolean(hs.get("access_token")) ||
      Boolean(qs.get("code"));

    const account =
      qs.get("account") || qs.get("account_name") || null;

    const code = qs.get("code");
    const stateRaw = qs.get("state") || hs.get("state");
    const stateObj = safeParseState(stateRaw);

    const access_token = hs.get("access_token");
    const expires_in = hs.get("expires_in");

    const error =
      qs.get("error") ||
      qs.get("error_description") ||
      hs.get("error") ||
      null;

    const targetOrigin =
      stateObj?.app_origin || window.location.origin;

    return {
      success: Boolean(success && !error),
      platform,
      account,
      error,
      code,
      access_token,
      expires_in,
      state: stateRaw,
      targetOrigin,
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
    };

    // ✅ Enviar mensaje al opener (Connections.jsx)
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(message, "*");
      setTimeout(() => window.close(), 500);
      return;
    }

    // fallback si no hay opener
    setTimeout(() => window.close(), 1500);
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

          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {title}
          </h2>
          <p className="text-gray-600 mb-6">
            {subtitle}
          </p>

          <div className="text-xs text-gray-500 mb-4">
            Plataforma:{" "}
            <span className="font-semibold">{payload.platform}</span>
            {payload.account && (
              <>
                {" "}
                · Cuenta:{" "}
                <span className="font-semibold">
                  {payload.account}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            <span className="ml-3 text-gray-600">
              Cerrando…
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
