import React, { useEffect } from 'react';

export default function OAuthCallback() {
  useEffect(() => {
    // Leer los parámetros de la URL
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success') === 'true';
    const platform = params.get('platform');
    const account = params.get('account');
    const error = params.get('error');

    // Enviar mensaje a la ventana principal
    if (window.opener && !window.opener.closed) {
      const message = {
        success,
        platform,
        account,
        error
      };

      // Enviar mensaje con el origen correcto
      const targetOrigin = window.location.origin;
      window.opener.postMessage(message, targetOrigin);

      // Cerrar la ventana después de un breve delay
      setTimeout(() => {
        window.close();
      }, 500);
    } else {
      // Si no hay ventana principal, mostrar mensaje y cerrar
      setTimeout(() => {
        window.close();
      }, 2000);
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
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            ¡Conexión Exitosa!
          </h2>
          <p className="text-gray-600 mb-6">
            Tu cuenta ha sido conectada correctamente.
          </p>
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            <span className="ml-3 text-gray-600">Cerrando ventana...</span>
          </div>
        </div>
      </div>
    </div>
  );
}
