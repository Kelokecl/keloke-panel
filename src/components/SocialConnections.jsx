import React, { useState, useEffect } from 'react';
import { Instagram, Facebook, Youtube, Music2, MessageCircle, ShoppingBag, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Meta OAuth unificado
const META_OAUTH_VERSION = 'v24.0';

export default function SocialConnections() {
  const APP_ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';

  const [connections, setConnections] = useState({
    instagram: { connected: false, username: null, expires: null, lastConnection: null },
    facebook: { connected: false, username: null, expires: null, lastConnection: null },
    youtube: { connected: false, username: null, expires: null, lastConnection: null },
    tiktok: { connected: false, username: null, expires: null, lastConnection: null },
    whatsapp: { connected: false, phone: null, expires: null, lastConnection: null },
    shopify: { connected: false, store: null, expires: null, lastConnection: null },
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(null);
  const [oauthWindow, setOauthWindow] = useState(null);

  // Log de versión
  console.log('🚀 SocialConnections OK - Meta OAuth v24.0');

  useEffect(() => {
    loadConnections();

    const handleMessage = (event) => {
      // Seguridad: solo aceptar mensajes desde TU dominio (la página /oauth-callback de tu app)
      if (APP_ORIGIN && event.origin !== APP_ORIGIN) return;

      let data = event.data;

      // Si viene como string, intenta parsear
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          console.error('Error al parsear mensaje postMessage:', e);
          return;
        }
      }

      if (data && data.success === true) {
        console.log(`${data.platform} conectado exitosamente`);
        alert(`✅ ${data.platform} conectado exitosamente${data.account ? ': ' + data.account : ''}`);
        loadConnections();
        return;
      }

      if (data && data.success === false) {
        console.error(`Error de ${data.platform}:`, data.error);
        alert(`❌ Error al conectar ${data.platform}: ${data.error || 'Error desconocido'}`);
        return;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si el popup se cierra sin completar (opcional)
  useEffect(() => {
    if (!oauthWindow) return;
    const t = setInterval(() => {
      if (oauthWindow.closed) {
        clearInterval(t);
        setOauthWindow(null);
      }
    }, 500);
    return () => clearInterval(t);
  }, [oauthWindow]);

  const loadConnections = async () => {
    const timeout = setTimeout(() => {
      setError('La carga está tardando más de lo esperado. Verifica tu conexión.');
      setLoading(false);
    }, 8000);

    try {
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        clearTimeout(timeout);
        setLoading(false);
        return;
      }

      const { data: tokens, error: tokensErr } = await supabase
        .from('user_social_tokens')
        .select('*')
        .eq('user_id', user.id);

      if (tokensErr) {
        console.error('Error user_social_tokens:', tokensErr);
      }

      // Base limpia (no reusar state viejo)
      const base = {
        instagram: { connected: false, username: null, expires: null, lastConnection: null },
        facebook: { connected: false, username: null, expires: null, lastConnection: null },
        youtube: { connected: false, username: null, expires: null, lastConnection: null },
        tiktok: { connected: false, username: null, expires: null, lastConnection: null },
        whatsapp: { connected: false, phone: null, expires: null, lastConnection: null },
        shopify: { connected: false, store: null, expires: null, lastConnection: null },
      };

      const newConnections = { ...base };

      if (tokens && Array.isArray(tokens)) {
        tokens.forEach((token) => {
          newConnections[token.platform] = {
            connected: !!token.is_active,
            username: token.account_username || token.account_name,
            expires: token.token_expires_at,
            lastConnection: token.created_at,
          };
        });
      }

      // WhatsApp: tabla distinta
      const { data: whatsappConnection, error: waErr } = await supabase
        .from('social_connections')
        .select('*')
        .eq('platform', 'whatsapp')
        .eq('is_active', true)
        .maybeSingle();

      if (waErr) console.error('Error social_connections whatsapp:', waErr);

      if (whatsappConnection) {
        const { data: lastMessage, error: lastMsgErr } = await supabase
          .from('whatsapp_messages')
          .select('created_at, direction')
          .eq('direction', 'inbound')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastMsgErr) console.error('Error whatsapp_messages last:', lastMsgErr);

        newConnections.whatsapp = {
          connected: true,
          username: whatsappConnection.username || 'WhatsApp Business',
          phone: whatsappConnection.username,
          lastConnection: whatsappConnection.last_connected,
          lastMessageReceived: lastMessage?.created_at || null,
        };
      }

      // Shopify: por tu lógica actual, marcar como conectado
      newConnections.shopify = {
        connected: true,
        username: 'csn703-10',
        expires: null,
        lastConnection: new Date().toISOString(),
      };

      setConnections(newConnections);
      clearTimeout(timeout);
    } catch (e) {
      console.error('Error loading connections:', e);
      setError('Error al cargar las conexiones. Por favor, intenta recargar la página.');
      clearTimeout(timeout);
    } finally {
      setLoading(false);
    }
  };

  const connectPlatform = async (platform) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Debes iniciar sesión primero');
        return;
      }

      const { data: row, error: credErr } = await supabase
        .from('oauth_credentials')
        .select('credentials')
        .eq('platform', platform)
        .maybeSingle();

      if (credErr) {
        console.error('Error oauth_credentials:', credErr);
        alert('Error leyendo credenciales en Supabase (oauth_credentials). Revisa consola.');
        return;
      }

      const credentials = row?.credentials;

      // Validaciones mínimas
      if (!credentials || !credentials.redirect_uri) {
        alert('Credenciales no configuradas para esta plataforma');
        return;
      }

      const state = user.id;
      let authUrl = '';

      // Meta: a veces guardas app_id, a veces client_id
      const metaAppId = credentials.client_id || credentials.app_id;

      switch (platform) {
        case 'instagram': {
          if (!metaAppId) return alert('Falta client_id/app_id en oauth_credentials (instagram)');
          const igScopes =
            'instagram_basic,instagram_manage_messages,instagram_manage_comments,pages_show_list,pages_read_engagement,business_management';
          authUrl =
            `https://www.facebook.com/${META_OAUTH_VERSION}/dialog/oauth` +
            `?client_id=${encodeURIComponent(metaAppId)}` +
            `&redirect_uri=${encodeURIComponent(credentials.redirect_uri)}` +
            `&scope=${encodeURIComponent(igScopes)}` +
            `&response_type=code` +
            `&state=${encodeURIComponent(state)}`;
          break;
        }

        case 'facebook': {
          if (!metaAppId) return alert('Falta client_id/app_id en oauth_credentials (facebook)');
          const fbScopes = 'public_profile,pages_read_engagement,business_management';
          authUrl =
            `https://www.facebook.com/${META_OAUTH_VERSION}/dialog/oauth` +
            `?client_id=${encodeURIComponent(metaAppId)}` +
            `&redirect_uri=${encodeURIComponent(credentials.redirect_uri)}` +
            `&scope=${encodeURIComponent(fbScopes)}` +
            `&response_type=code` +
            `&state=${encodeURIComponent(state)}`;
          break;
        }

        case 'youtube': {
          if (!credentials.client_id) return alert('Falta client_id en oauth_credentials (youtube)');
          const scopes = encodeURIComponent(
            'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl'
          );
          authUrl =
            `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(credentials.client_id)}` +
            `&redirect_uri=${encodeURIComponent(credentials.redirect_uri)}` +
            `&scope=${scopes}` +
            `&response_type=code&access_type=offline&prompt=select_account&state=${encodeURIComponent(state)}`;
          break;
        }

        case 'tiktok': {
          if (!credentials.client_key) return alert('Falta client_key en oauth_credentials (tiktok)');
          authUrl =
            `https://www.tiktok.com/auth/authorize/?client_key=${encodeURIComponent(credentials.client_key)}` +
            `&redirect_uri=${encodeURIComponent(credentials.redirect_uri)}` +
            `&scope=user.info.basic,video.publish,video.list` +
            `&response_type=code&state=${encodeURIComponent(state)}`;
          break;
        }

        case 'whatsapp': {
          if (!metaAppId) return alert('Falta client_id/app_id en oauth_credentials (whatsapp)');
          const whatsappScopes = 'whatsapp_business_management,whatsapp_business_messaging';
          authUrl =
            `https://www.facebook.com/${META_OAUTH_VERSION}/dialog/oauth` +
            `?client_id=${encodeURIComponent(metaAppId)}` +
            `&redirect_uri=${encodeURIComponent(credentials.redirect_uri)}` +
            `&scope=${encodeURIComponent(whatsappScopes)}` +
            `&response_type=token` +
            `&state=${encodeURIComponent(state)}`;
          break;
        }

        case 'shopify':
          alert('Shopify ya está conectado con tu tienda mediante API');
          return;

        default:
          alert('Plataforma no soportada');
          return;
      }

      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const win = window.open(authUrl, 'oauth', `width=${width},height=${height},left=${left},top=${top}`);
      setOauthWindow(win);
    } catch (e) {
      console.error('Error connecting platform:', e);
      alert('Error al conectar la plataforma');
    }
  };

  const refreshWhatsAppToken = async () => {
    setRefreshing('whatsapp');
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/whatsapp-token-refresh`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (result.success) {
        alert('✅ Token de WhatsApp renovado exitosamente');
        await loadConnections();
      } else {
        alert('❌ Error al renovar token: ' + result.error);
      }
    } catch (error) {
      console.error('Error refreshing WhatsApp token:', error);
      alert('❌ Error al renovar token de WhatsApp');
    } finally {
      setRefreshing(null);
    }
  };

  const disconnectPlatform = async (platform) => {
    if (!window.confirm(`¿Estás seguro de que deseas desconectar ${platform}? Tendrás que volver a conectar para usar esta plataforma.`)) {
      return;
    }

    try {
      setRefreshing(platform);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Nota: Esto borra user_social_tokens. (WhatsApp real está en social_connections)
      const { error } = await supabase
        .from('user_social_tokens')
        .delete()
        .eq('user_id', user.id)
        .eq('platform', platform);

      if (error) throw error;

      alert(`✅ ${platform} desconectado exitosamente`);
      await loadConnections();
    } catch (error) {
      console.error('Error disconnecting platform:', error);
      alert(`❌ Error al desconectar ${platform}`);
    } finally {
      setRefreshing(null);
    }
  };

  const platforms = [
    { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'from-purple-500 to-pink-500', account: '@kelokecl' },
    { id: 'facebook', name: 'Facebook', icon: Facebook, color: 'from-blue-600 to-blue-400', account: 'keloke.cl' },
    { id: 'youtube', name: 'YouTube', icon: Youtube, color: 'from-red-600 to-red-400', account: '@keloke-cl' },
    { id: 'tiktok', name: 'TikTok', icon: Music2, color: 'from-black to-gray-700', account: '@keloke.cl' },
    { id: 'whatsapp', name: 'WhatsApp', icon: MessageCircle, color: 'from-green-600 to-green-400', account: '+56 9 7747 2779' },
    { id: 'shopify', name: 'Shopify', icon: ShoppingBag, color: 'from-green-700 to-green-500', account: 'csn703-10.myshopify.com' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Cargando conexiones...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-2xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error al cargar</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              setError(null);
              loadConnections();
            }}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Conexiones de Redes Sociales</h2>
        <p className="text-purple-100">
          Conecta tus cuentas para que el Auto-Gerente IA pueda publicar contenido automáticamente
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {platforms.map((platform) => {
          const connection = connections[platform.id];
          const Icon = platform.icon;
          const isConnected = connection.connected;
          const expiresAt = connection.expires ? new Date(connection.expires) : null;
          const isExpiringSoon = expiresAt && (expiresAt - new Date()) < 2 * 60 * 60 * 1000;

          return (
            <div
              key={platform.id}
              className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
            >
              <div className={`bg-gradient-to-r ${platform.color} p-6 text-white`}>
                <div className="flex items-center justify-between mb-4">
                  <Icon className="w-12 h-12" />
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                    <span className="text-xs font-semibold">{isConnected ? 'Conectado' : 'Desconectado'}</span>
                  </div>
                </div>
                <h3 className="text-xl font-bold">{platform.name}</h3>
                <p className="text-sm opacity-90">{platform.account}</p>
              </div>

              <div className="p-6">
                {isConnected ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="font-semibold text-green-600">Conectado</span>
                    </div>

                    {connection.username && (
                      <p className="text-sm text-gray-600">
                        Usuario: <span className="font-semibold">{connection.username}</span>
                      </p>
                    )}

                    {connection.lastConnection && (
                      <p className="text-xs text-gray-500">
                        Última conexión: {new Date(connection.lastConnection).toLocaleString('es-CL')}
                      </p>
                    )}

                    {platform.id === 'whatsapp' && connection.lastMessageReceived && (
                      <p className="text-xs text-gray-500">
                        Último mensaje: {new Date(connection.lastMessageReceived).toLocaleString('es-CL')}
                      </p>
                    )}

                    {expiresAt && (
                      <div className={`text-sm ${isExpiringSoon ? 'text-red-600' : 'text-gray-600'}`}>
                        {isExpiringSoon && '⚠️ '}
                        Expira: {expiresAt.toLocaleString('es-CL')}
                      </div>
                    )}

                    <div className="flex gap-2 mt-4">
                      {platform.id === 'whatsapp' && (
                        <button
                          onClick={refreshWhatsAppToken}
                          disabled={refreshing === 'whatsapp'}
                          className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center disabled:opacity-50 text-sm"
                        >
                          {refreshing === 'whatsapp' ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              Renovando...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Renovar
                            </>
                          )}
                        </button>
                      )}

                      <button
                        onClick={() => disconnectPlatform(platform.id)}
                        disabled={refreshing === platform.id}
                        className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 text-sm"
                      >
                        {refreshing === platform.id ? 'Desconectando...' : 'Desconectar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <span className="font-semibold text-red-600">Desconectado</span>
                    </div>
                    <button
                      onClick={() => connectPlatform(platform.id)}
                      className={`w-full bg-gradient-to-r ${platform.color} text-white py-2 px-4 rounded-lg hover:opacity-90 transition-opacity`}
                    >
                      Conectar {platform.name}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-lg font-bold text-blue-900 mb-3">ℹ️ Información Importante</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span><strong>WhatsApp:</strong> Ahora puedes conectar y desconectar manualmente. El token se renueva automáticamente cada 22 horas.</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span><strong>Instagram/Facebook:</strong> Usa las mismas credenciales de Meta. Conecta ambas para publicar en ambas plataformas.</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span><strong>YouTube:</strong> Requiere cuenta de Google Cloud con YouTube Data API v3 habilitada.</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span><strong>TikTok:</strong> Requiere cuenta de TikTok for Business con permisos de publicación.</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span><strong>Shopify:</strong> Conectado mediante API para sincronización automática de productos, órdenes e inventario.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
