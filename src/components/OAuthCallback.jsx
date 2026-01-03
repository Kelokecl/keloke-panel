import React, { useEffect } from 'react';

function parseHashParams(hash) {
  const clean = (hash || '').replace(/^#/, '');
  return new URLSearchParams(clean);
}

export default function OAuthCallback() {
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const hs = parseHashParams(window.location.hash);

    const platform =
      qs.get('platform') ||
      qs.get('p') ||
      hs.get('platform') ||
      'unknown';

    const account = qs.get('account') || qs.get('account_name') || null;

    const code = qs.get('code');
    const state = qs.get('state') || hs.get('state');

    const access_token = hs.get('access_token');
    const expires_in = hs.get('expires_in');

    const error =
      qs.get('error') ||
      qs.get('error_description') ||
      hs.get('error') ||
      null;

    // success explícito, o inferido si viene code/token
    const success =
      qs.get('success') === 'true' ||
      (!!code || !!access_token);

    const message = {
      type: 'OAUTH_RESULT',
      success: !!success && !error,
      platform,
      account,
      error,
      code,
      access_token,
      expires_in,
      state,
    };

    // Tu app (misma origin porque /oauth/callback vive en keloke-panel.vercel.app)
    const targetOrigin = window.location.origin;

    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(message, targetOrigin);
      } catch (e) {
        // fallback por si algo raro ocurre
        window.opener.postMessage(message, '*');
      }

      // Cerrar ASAP
      setTimeout(() => window.close(), 150);
    } else {
      // si el popup se abrió directo
      setTimeout(() => window.close(), 1200);
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-pink-600">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Conectando…</h2>
          <p className="text-gray-600 mb-6">Estamos cerrando esta ventana automáticamente.</p>
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 h-8 w-8 border-b-2 border-purple-600"></div>
            <span className="ml-3 text-gray-600">Cerrando…</span>
          </div>
        </div>
      </div>
    </div>
  );
}
