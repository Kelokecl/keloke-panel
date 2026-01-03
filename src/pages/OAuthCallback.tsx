import React, { useEffect } from "react";

export default function OAuthCallback() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const success = url.searchParams.get("success") === "true";
    const platform = url.searchParams.get("platform") || "unknown";
    const error = url.searchParams.get("error") || "";

    // notificar al opener
    try {
      window.opener?.postMessage(
        { type: "oauth_result", success, platform, error },
        window.location.origin
      );
    } catch {
      // ignore
    }

    // cerrar
    setTimeout(() => {
      try {
        window.close();
      } catch {
        // ignore
      }
    }, 300);
  }, []);

  return (
    <div style={{ fontFamily: "system-ui", padding: 24 }}>
      <h3>Conectando…</h3>
      <p>Esta ventana se cerrará automáticamente.</p>
    </div>
  );
}
