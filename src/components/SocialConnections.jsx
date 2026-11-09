// src/components/SocialConnections.jsx
import React, { useEffect, useState, useRef } from 'react';
import { Instagram, Facebook, Youtube, Music2, MessageCircle, ShoppingBag, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

const META_OAUTH_VERSION = 'v24.0';

const DEFAULT_CONNECTIONS = {
  instagram: { connected: false, username: null, expires: null, lastConnection: null },
  facebook: { connected: false, username: null, expires: null, lastConnection: null },
  youtube: { connected: false, username: null, expires: null, lastConnection: null },
  tiktok: { connected: false, username: null, expires: null, lastConnection: null },
  whatsapp: { connected: false, phone: null, expires: null, lastConnection: null },
  shopify: { connected: false, store: null, expires: null, lastConnection: null },
};

function safeParseJson(maybeJson) {
  if (!maybeJson) return null;
  if (typeof maybeJson === 'object') return maybeJson;
  if (typeof maybeJson !== 'string') return null;
  try {
    return JSON.parse(maybeJson);
  } catch {
    return null;
  }
}

export default function SocialConnections() {
  const [connections, setConnections] = useState(DEFAULT_CONNECTIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(null);

  const oauthWindowRef = useRef(null);
  const APP_ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';

  console.log('🚀 SocialConnections OK — Meta OAuth', META_OAUTH_VERSION);

  useEffect(() => {
    loadConnections();

    const handleMessage = (event) => {
      if (APP_ORIGIN && event.origin !== APP_ORIGIN) return;

      const data = safeParseJson(event.data) ?? event.data;
      if (!data || typeof data !== 'object') return;

      if (data?.success === true) {
        alert(`✅ ${data.platform} conectado exitosamente${data.account ? ': ' + data.account : ''}`);

        try {
          if (oauthWindowRef.current && !oauthWindowRef.current.closed) oauthWindowRef.current.close();
        } catch {
          // ignore
        } finally {
          oauthWindowRef.current = null;
        }

        loadConnections();
        return;
      }

      if (data?.success === false) {
        alert(`❌ Error al conectar ${data.platform}: ${data.error || 'Error desconocido'}`);

        try {
          if (oauthWindowRef.current && !oauthWindowRef.current.closed) oauthWindowRef.current.close();
        } catch {
          // ignore
        } finally {
          oauthWindowRef.current = null;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        .select('platform,is_active,account_username,account_name,token_expires_at,token_expire,created_at')
        .eq('user_id', user.id);

      if (tokensErr) console.error('user_social_tokens error:', tokensErr);

      const newConnections = { ...DEFAULT_CONNECTIONS };

      if (tokens && Array.isArray(tokens)) {
        tokens.forEach((token) => {
          newConnections[token.platform] = {
            connected: !!token.is_active && !(token.token_expires_at || token.token_expire ? new Date(token.token_expires_at || token.token_expire).getTime() <= Date.now() : false),
            username: token.account_username || token.account_name || null,
            expires: token.token_expires_at || token.token_expire,
            lastConnection: token.created_at,
          };
        });
      }

      const { data: whatsappConnection } = await supabase
        .from('social_connections')
        .select('id,platform,is_active,phone_number_id,waba_id,updated_at')
        .eq('platform', 'whatsapp')
        .eq('is_active', true)
        .single();

      if (whatsappConnection) {
        const { data: lastMessage } = await supabase
          .from('whatsapp_messages')
          .select('created_at, direction')
          .eq('direction', 'inbound')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        newConnections.whatsapp = {
          connected: true,
          username: whatsappConnection.username || 'WhatsApp Business',
          phone: whatsappConnection.phone_number_id,
          lastConnection: whatsappConnection.updated_at,
          lastMessageReceived: lastMessage?.created_at || null,
        };
      }

      newConnections.shopify = {
        connected: true,
        username: 'csn703-10',
        expires: null,
        lastConnection: new Date().toISOString(),
      };

      setConnections(newConnections);
      setError(null);
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
    const preparedPopup=['instagram','tiktok'].includes(platform)?window.open('about:blank',`oauth_${platform}`,'width=600,height=760'):null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        preparedPopup?.close();
        alert('Debes iniciar sesión primero');
        return;
      }

      if(platform==='instagram'){
        const popup=preparedPopup;oauthWindowRef.current=popup;
        if(!popup){alert('Permite las ventanas emergentes para conectar Instagram.');return;}
        const {data,error}=await supabase.functions.invoke('social-oauth-start',{body:{platform:'instagram'}});
        if(error||!data?.url){popup.close();alert(data?.error||'No pudimos preparar la conexión de Instagram. Revisa tu sesión.');return;}
        popup.location.href=data.url;return;
      }
      // ✅ TikTok: NO abrir TikTok directo (ESO ES LO QUE TE ROMPE)
      if (platform === 'tiktok') {
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const win=preparedPopup;
        if(!win){alert('Permite las ventanas emergentes para conectar TikTok.');return;}
        win.location.href=`${window.location.origin}/oauth/tiktok-start`;

        oauthWindowRef.current = win;
        return;
      }

      const { data: config, error: credErr } = await supabase.rpc('keloke_oauth_public_config', {p_platform: platform});

      if (credErr || !config?.client_id || !config?.redirect_uri) {
        console.error('oauth_credentials error:', credErr);
        alert('Credenciales no configuradas para esta plataforma');
        return;
      }

      const credentials = config;
      const state = JSON.stringify({ user_id: user.id, app_origin: window.location.origin });
      let authUrl = '';

      const metaAppId =
        credentials.client_id ||
        credentials.app_id ||
        credentials.appId ||
        credentials.META_APP_ID;

      switch (platform) {
        case 'instagram': {
          if (!metaAppId) {
            alert('❌ Falta App ID de Meta en oauth_credentials (instagram).');
            return;
          }
          const igScopes = 'instagram_basic,instagram_manage_messages,instagram_manage_comments,pages_show_list,pages_read_engagement,pages_manage_metadata';
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
          if (!metaAppId) {
            alert('❌ Falta App ID de Meta en oauth_credentials (facebook).');
            return;
          }
          const fbScopes = 'public_profile,pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging,instagram_basic,instagram_manage_messages,instagram_manage_comments';
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
          if (!credentials.client_id) {
            alert('❌ Falta GOOGLE client_id en oauth_credentials (youtube).');
            return;
          }
          const scopes = encodeURIComponent(
            'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl'
          );
          authUrl =
            `https://accounts.google.com/o/oauth2/v2/auth` +
            `?client_id=${encodeURIComponent(credentials.client_id)}` +
            `&redirect_uri=${encodeURIComponent(credentials.redirect_uri)}` +
            `&scope=${scopes}` +
            `&response_type=code` +
            `&access_type=offline` +
            `&prompt=consent` +
            `&include_granted_scopes=true` +
            `&state=${encodeURIComponent(state)}`;
          break;
        }

        case 'whatsapp': {
          if (!metaAppId) {
            alert('❌ Falta App ID de Meta en oauth_credentials (whatsapp).');
            return;
          }
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
      oauthWindowRef.current = win;
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
            Authorization: `Bearer ${session.access_token}`,
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
    } catch (e) {
      console.error('Error refreshing WhatsApp token:', e);
      alert('❌ Error al renovar token de WhatsApp');
    } finally {
      setRefreshing(null);
    }
  };

  const disconnectPlatform = async (platform) => {
    const ok = window.confirm(`¿Estás seguro de que deseas desconectar ${platform}? Tendrás que volver a conectar para usar esta plataforma.`);
    if (!ok) return;

    try {
      setRefreshing(platform);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (platform === 'whatsapp') {
        const { error: werr } = await supabase
          .from('social_connections')
          .update({ is_active: false })
          .eq('platform', 'whatsapp');

        if (werr) throw werr;

        alert('✅ whatsapp desconectado exitosamente');
        await loadConnections();
        return;
      }

      const { error: derr } = await supabase
        .from('user_social_tokens')
        .delete()
        .eq('user_id', user.id)
        .eq('platform', platform);

      if (derr) throw derr;

      alert(`✅ ${platform} desconectado exitosamente`);
      await loadConnections();
    } catch (e) {
      console.error('Error disconnecting platform:', e);
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

  // (resto del render igual que tu archivo)
  // ... NO CAMBIADO ...
  // Por brevedad, deja el resto tal cual lo tienes.
  // -------------------------------------------------

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
    <div className="page-wrap space-y-6">
      <div className="bg-[#173d31] rounded-2xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Conexiones de Redes Sociales</h2>
        <p className="text-[#b9d1c0]">
          Administra los accesos de tus canales y comprueba sus permisos antes de publicar.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {platforms.map((platform) => {
          const connection = connections[platform.id] || DEFAULT_CONNECTIONS[platform.id];
          const Icon = platform.icon;
          const isConnected = !!connection.connected;
          const expiresAt = connection.expires ? new Date(connection.expires) : null;
          const isExpiringSoon = expiresAt && (expiresAt - new Date()) < 2 * 60 * 60 * 1000;

          return (
            <div key={platform.id} className="bg-white rounded-2xl border border-[#e2e9e6] overflow-hidden">
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

                      {platform.id === 'instagram' && (
                        <button
                          type="button"
                          onClick={() => connectPlatform('instagram')}
                          className="flex-1 rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
                        >
                          Renovar acceso de Instagram
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
            <span><strong>Instagram/Facebook:</strong> Usa las mismas credenciales de Meta (App ID + App Secret). Conecta ambas para publicar en ambas plataformas.</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span><strong>YouTube:</strong> Requiere Google Cloud con YouTube Data API v3 habilitada y OAuth funcionando.</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span><strong>TikTok:</strong> Se activa cuando tengas client_key y redirect_uri listos.</span>
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
