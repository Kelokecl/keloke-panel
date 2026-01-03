import React, { useEffect, useMemo, useState } from 'react';

function parseHashParams(hash) {
  const clean = (hash || '').replace(/^#/, '');
  return new URLSearchParams(clean);
}

function safeUUID() {
  try {
    return crypto.randomUUID();
  } catch {
    return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
  }
}

export default function OAuthCallback() {
  const [status, setStatus] = useState('processing');

  const payload = useMemo(() => {
    const qs = new URLSearchParams(window.location.search);
    const hs = parseHashParams(window.location.hash);

    const platform = qs.get('platform') || qs.get('p') || hs.get('platform') || 'unknown';
    const account = qs.get('account') || qs.get('account_name') || null;

    // Soporta:
    // - ?success=true&platform=...
    // - ?code=...&state=...
    // - #access_token=...&state=...
    const code = qs.get('code');
    const state = qs.get('state') || hs.get('state');
    const access_token = hs.get('access_token');
    const expires_in = hs.get('expires_in');

    const error =
      qs.get('error') ||
      qs.get('error_description') ||
      qs.get('error_message') ||
      hs.get('error') ||
      null;

    const explicitSuccess = qs.get('success');
    const success =
      explicitSuccess === 'true'
        ? true
        : explicitSuccess === 'false'
          ? false
          : (!!code || !!access_token) && !error;

    return {
      _id: safeUUID(),
      _ts: Date.now(),
      success: !!success && !error,
      platform,
      account,
      error,
      code,
      state,
      access_token,
      expires_in,
    };
  }, []);

  useEffect(() => {
    try {
      // ✅ Fallback robusto para COOP/Google: dispara evento en la ventana padre
      localStorage.setItem('oauth_result', JSON.stringify(payload));
    } catch (e) {
      console.warn('No se pudo escribir oauth_result en localStorage', e);
    }

    try {
      // ✅ Mejor intento: postMessage al opener si existe
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, window.location.origin);
      }
    } catch (e) {
      // Si COOP cortó el opener, esto puede fallar; el fallback de storage lo salva.
      console.warn('postMessage al opener falló (probable COOP)', e);
    }

    setStatus(payload.success ? 'success' : 'error');

    // Cierra ventana
    setTimeout(() => {
      try {
        window.close();
      } catch {
        // ignore
      }
    }, 700);
  }, [payload]);

  const title = status === 'error' ? 'Error al conectar' : 'Conectando…';
  const subtitle =
    status === 'error'
      ? (payload.error || 'Ocurrió un error en OAuth.')
      : 'Estamos cerrando esta ventana automáticamente.';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-pink-600">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center">
          <div className="mb-6">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${status === 'error' ? 'bg-red-100' : 'bg-green-100'}`}>
              {status === 'error' ? (
                <span className="text-2xl">✖</span>
              ) : (
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-800 mb-2">{title}</h2>
          <p className="text-gray-600 mb-6">{subtitle}</p>

          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            <span className="ml-3 text-gray-600">Cerrando…</span>
          </div>

          <div className="mt-6 text-xs text-gray-400">
            Plataforma: {payload.platform}
            {payload.account ? ` • Cuenta: ${payload.account}` : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
