import React, { useEffect, useMemo, useState } from 'react';

const FRONTEND_ORIGIN_FALLBACK = 'https://keloke-panel.vercel.app';

function parseHashParams() {
  // Meta/WhatsApp a veces devuelve #access_token=...&expires_in=...&state=...
  const raw = (window.location.hash || '').replace(/^#/, '');
  return new URLSearchParams(raw);
}

export default function OAuthCallback() {
  const [status, setStatus] = useState({ success: null, platform: null, account: null, error: null });

  const computed = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    const h = parseHashParams();

    // Soportar ambos formatos (query o hash)
    const successQ = q.get('success');
    const success =
      successQ === 'true' ? true :
      successQ === 'false' ? false :
      null;

    const platform = q.get('platform') || h.get('platform') || q.get('state_platform') || null;
    const account = q.get('account') || h.get('account') || null;

    // Errores típicos
    const error = q.get('error') || h.get('error') || q.get('error_description') || h.get('error_description') || null;

    // Tokens si vienen por hash (no los guardamos aquí; esto solo notifica a la ventana principal)
    const accessToken = h.get('access_token') || null;
    const expiresIn = h.get('expires_in') || null;
    const tokenType = h.get('token_type') || null;

    // Permitir que el backend pase target_origin explícito si quiere (opcional)
    const targetOrigin =
      q.get('target_origin') ||
      q.get('origin') ||
      FRONTEND_ORIGIN_FALLBACK;

    // Si no venía success explícito, inferir:
    // - si hay error => false
    // - si hay access_token => true (solo para flujos implicit)
    const inferredSuccess = success !== null ? success : (error ? false : (accessToken ? true : null));

    return {
      success: inferredSuccess,
      platform,
      account,
      error,
      accessToken,
      expiresIn,
      tokenType,
      targetOrigin,
    };
  }, []);

  useEffect(() => {
    setStatus({
      success: computed.success,
      platform: computed.platform,
      account: computed.account,
      error: computed.error,
    });

    // Enviar mensaje a la ventana principal (si existe)
    if (window.opener && !window.opener.closed) {
      const message = {
        success: computed.success === true,
        platform: computed.platform,
        account: computed.account,
        error: computed.error,
        // 👇 por si tu ventana principal quiere capturar tokens (solo aplica a response_type=token)
        access_token: computed.accessToken,
        expires_in: computed.expiresIn,
        token_type: computed.tokenType,
      };

      // ✅ targetOrigin: idealmente el ORIGIN del front (Vercel)
      // Si tu callback está en Vercel, window.location.origin coincide y esto igual funciona.
      const targetOrigin = computed.targetOrigin || window.location.origin || FRONTEND_ORIGIN_FALLBACK;

      window.opener.postMessage(message, targetOrigin);

      setTimeout(() => window.close(), 500);
      return;
    }

    // Si no hay opener, cerramos igual
    const t = setTimeout(() => window.close(), 2000);
    return () => clearTimeout(t);
  }, [computed]);

  const isOk = status.success === true && !status.error;
  const isBad = status.success === false || !!status.error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-pink-600">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center">
          <div className="mb-6">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${isOk ? 'bg-green-100' : 'bg-red-100'}`}>
              {isOk ? (
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {isOk ? '¡Conexión Exitosa!' : isBad ? 'Conexión Fallida' : 'Procesando conexión...'}
          </h2>

          <p className="text-gray-600 mb-4">
            {isOk && 'Tu cuenta ha sido conectada correctamente.'}
            {isBad && (status.error ? `Error: ${status.error}` : 'No se pudo completar la conexión.')}
            {!isOk && !isBad && 'Estamos terminando de validar la conexión.'}
          </p>

          {(status.platform || status.account) && (
            <div className="text-sm text-gray-500 mb-4">
              {status.platform && <div>Plataforma: <span className="font-semibold">{status.platform}</span></div>}
              {status.account && <div>Cuenta: <span className="font-semibold">{status.account}</span></div>}
            </div>
          )}

          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            <span className="ml-3 text-gray-600">Cerrando ventana...</span>
          </div>

          {!window.opener && (
            <a
              className="mt-6 inline-block text-purple-700 underline"
              href={FRONTEND_ORIGIN_FALLBACK}
            >
              Volver al panel
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
