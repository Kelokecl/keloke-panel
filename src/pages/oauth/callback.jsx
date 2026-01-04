// src/pages/oauth/callback.jsx
import { useEffect } from "react";

export default function OAuthCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const success = params.get("success") === "true";
    const platform = params.get("platform") || "unknown";
    const error = params.get("error") || null;

    // Le avisamos al window padre (Connections) el resultado
    try {
      window.opener?.postMessage(
        {
          type: "OAUTH_RESULT",
          success,
          platform,
          error,
        },
        "*"
      );
    } catch (e) {
      // nada
    }

    // cerrar popup
    setTimeout(() => window.close(), 400);
  }, []);

  return (
    <div style={{ height: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ fontFamily: "system-ui, Arial", textAlign: "center" }}>
        <h2>Conectando…</h2>
        <p>Esta ventana se cerrará automáticamente.</p>
      </div>
    </div>
  );
}
