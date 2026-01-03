// src/pages/OAuthCallback.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function OAuthCallback() {
  const [status, setStatus] = useState("processing");
  const [details, setDetails] = useState("");

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const platform = params.get("platform") || "unknown";
  const success = params.get("success") === "true";
  const error = params.get("error") || params.get("message") || "";

  useEffect(() => {
    (async () => {
      try {
        // 1) Asegurar usuario logueado (sin esto no podemos asociar tokens)
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        const userId = userData?.user?.id;

        if (userErr || !userId) {
          setStatus("error");
          setDetails("not_authenticated");
          // avisar al opener igualmente
          try {
            window.opener?.postMessage(
              { type: "oauth_result", platform, success: false, error: "not_authenticated" },
              window.location.origin
            );
          } catch (_) {}
          setTimeout(() => window.close(), 800);
          return;
        }

        // 2) Mostrar resultado y notificar al opener
        if (success) {
          setStatus("success");
          setDetails("connected");
        } else {
          setStatus("error");
          setDetails(error || "oauth_failed");
        }

        try {
          window.opener?.postMessage(
            { type: "oauth_result", platform, success, error: error || null, user_id: userId },
            window.location.origin
          );
        } catch (_) {
          // si falla, no bloqueamos
        }

        // 3) Cerrar ventana (sin polling window.closed)
        setTimeout(() => window.close(), 900);
      } catch (e) {
        setStatus("error");
        setDetails(e?.message || "unexpected_error");
        setTimeout(() => window.close(), 900);
      }
    })();
  }, [platform, success, error]);

  const title =
    status === "processing" ? "Conectando..." : status === "success" ? "Conectado" : "Error al conectar";

  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: "90vw",
          background: "white",
          borderRadius: 14,
          padding: 24,
          textAlign: "center",
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>{title}</div>
        <div style={{ opacity: 0.8, marginBottom: 8 }}>
          Plataforma: <b>{platform}</b>
        </div>
        <div style={{ opacity: 0.75, fontSize: 14 }}>
          {status === "processing" ? "Estamos cerrando esta ventana automáticamente..." : details}
        </div>
      </div>
    </div>
  );
}
