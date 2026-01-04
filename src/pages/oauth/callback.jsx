import { useEffect } from "react";

export default function OAuthCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const success = params.get("success") === "true";
    const platform = params.get("platform");
    const error = params.get("error");

    // 🔑 ENVIAR RESULTADO AL PADRE
    window.opener?.postMessage(
      {
        type: "OAUTH_RESULT",
        success,
        platform,
        error,
      },
      "*"
    );

    // ⏱️ cerrar popup
    setTimeout(() => {
      window.close();
    }, 500);
  }, []);

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "sans-serif"
    }}>
      <div>
        <h2>{`Conectando...`}</h2>
        <p>Estamos cerrando esta ventana automáticamente</p>
      </div>
    </div>
  );
}
