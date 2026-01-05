import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function OAuthTikTokStart() {
  const [msg, setMsg] = useState("Conectando TikTok…");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;

        if (!token) {
          setMsg("No hay sesión activa. Cierra esta ventana e inicia sesión nuevamente.");
          return;
        }

        setMsg("Abriendo login de TikTok…");

        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/tiktok-oauth/start?app_origin=${encodeURIComponent(window.location.origin)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        const json = await res.json();

        if (!res.ok || !json?.url) {
          console.error("TikTok start error:", json);
          setMsg("Error iniciando TikTok OAuth. Revisa consola.");
          return;
        }

        // redirige el popup al login de TikTok
        window.location.href = json.url;
      } catch (e) {
        console.error(e);
        setMsg(`Error: ${e?.message || e}`);
      }
    })();
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, Arial" }}>
      <h3>{msg}</h3>
      <p style={{ opacity: 0.7 }}>
        Esta ventana se cerrará automáticamente cuando TikTok termine el proceso.
      </p>
    </div>
  );
}
