import React, { useState, useEffect } from 'react';
import { Instagram, Facebook, Youtube, Music2, MessageCircle, ShoppingBag, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

const APP_ORIGIN = window.location.origin;
const META_OAUTH_VERSION = 'v24.0'; // unificado

export default function SocialConnections() {
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

  // ✅ opcional: track de la ventana y si se cierra sin responder
  const [oauthWindow, setOauthWindow] = useState(null);

  useEffect(() => {
    loadConnections();

    const handleMessage = (event) => {
      // ✅ seguridad: solo aceptar mensajes desde TU dominio (callback hosteado en tu app)
      if (event.origin !== APP_ORIGIN) return;

      let data = event.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return; }
      }

      if (data?.success === true) {
        alert(`✅ ${data.platform} conectado exitosamente${data.account ? ': ' + data.account : ''}`);
        loadConnections();
        return;
      }

      if (data?.success === false) {
        alert(`❌ Error al conectar ${data.platform}: ${data.error || 'Error desconocido'}`);
        return;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ si el popup se cerró sin completar
  useEffect(() => {
    if (!oauthWindow) return;
    const t = setInterval(() => {
      if (oauthWindow.closed) {
        clearInterval(t);
        setOauthWindow(null);
        // No alert obligatorio; si quieres:
        // alert('OAuth cerrado. Si cancelaste el permiso, vuelve a intentar.');
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

      const { data: tokens } = await supabase
        .from('user_social_tokens')
        .select('*')
        .eq('user_id', user.id);

      // ✅ importante: partir desde “default”, no desde state viejo
      const base = {
        instagram: { connected: false, username: null, expires: null, lastConnection: null },
        facebook: { connected: false, username: null, expires: null, lastConnection: null },
        youtube: { connected: false, username: null, expires: null, lastConnection: null },
        tiktok: { connected: false, username: null, expires: null, lastConnection: null },
        whatsapp: { connected: false, phone: null, expires: null, lastConnection: null },
        shopify: { connected: false, store: null, expires: null, lastConnection: null },
      };

      const newConnections = { ...base };

      if (tokens) {
        tokens.forEach(token => {
          newConnections[token.platform] = {
            connected: !!token.is_active,
            username: token.account_username || token.account_name,
            expires: token.token_expires_at,
            lastConnection: token.created_at,
          };
        });
      }

      // WhatsApp (tabla distinta)
      const { data: whatsappConnection } = await supabase
        .from('social_connections')
        .select('*')
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
          phone: whatsappConnection.username,
          lastConnection: whatsappConnection.last_connected,
          lastMessageReceived: lastMessage?.created_at || null,
        };
      }

      // Shopify (siempre “conectado” por tu lógica actual)
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
      if (!user) return alert('Debes iniciar sesión primero');

      const { data: creds } = await supabase
        .from('oauth_credentials')
        .select('credentials')
        .eq('platform', platform)
        .single();

      if (!creds?.credentials) return alert('Credenciales no configuradas para esta plataforma');

      const credentials = creds.credentials;
      const state = user.id;

      let authUrl = '';

      // ✅ fallback de appId/clientId
      const metaAppId = credentials.client_id || credentials.app_id;

      switch (platform) {
        case 'instagram': {
          const igScopes =
            'instagram_basic,instagram_manage_messages,instagram_manage_comments,pages_show_list,pages_read_engagement,business_management';
          authUrl =
            `https://www.facebook.com/${META_OAUTH_VERSION}/dialog/oauth` +
            `?client_id=${metaAppId}` +
            `&redirect_uri=${encodeURIComponent(credentials.redirect_uri)}` +
            `&scope=${encodeURIComponent(igScopes)}` +
            `&response_type=code` +
            `&state=${encodeURIComponent(state)}`;
          break;
        }

        case 'facebook': {
          const fbScopes = 'public_profile,pages_read_engagement,business_management';
          authUrl =
            `https://www.facebook.com/${META_OAUTH_VERSION}/dialog/oauth` +
            `?client_id=${metaAppId}` +
            `&redirect_uri=${encodeURIComponent(credentials.redirect_uri)}` +
            `&scope=${encodeURIComponent(fbScopes)}` +
            `&response_type=code` +
            `&state=${encodeURIComponent(state)}`;
          break;
        }

        case 'youtube': {
          const scopes = encodeURIComponent(
            'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl'
          );
          authUrl =
            `https://accounts.google.com/o/oauth2/v2/auth?client_id=${credentials.client_id}` +
            `&redirect_uri=${encodeURIComponent(credentials.redirect_uri)}` +
            `&scope=${scopes}` +
            `&response_type=code&access_type=offline&prompt=select_account&state=${encodeURIComponent(state)}`;
          break;
        }

        case 'tiktok': {
          authUrl =
            `https://www.tiktok.com/auth/authorize/?client_key=${credentials.client_key}` +
            `&redirect_uri=${encodeURIComponent(credentials.redirect_uri)}` +
            `&scope=user.info.basic,video.publish,video.list` +
            `&response_type=code&state=${encodeURIComponent(state)}`;
          break;
        }

        case 'whatsapp': {
          // 👇 lo dejo igual que lo tenías (token) para no meterte mano si ya te funciona.
          // Si mañana quieres hacerlo “pro”: cambiar a response_type=code y hacer exchange server-side.
          const whatsappScopes = 'whatsapp_business_management,whatsapp_business_messaging';
          authUrl =
            `https://www.facebook.com/${META_OAUTH_VERSION}/dialog/oauth` +
            `?client_id=${metaAppId}` +
            `&redirect_uri=${encodeURIComponent(credentials.redirect_uri)}` +
            `&scope=${encodeURIComponent(whatsappScopes)}` +
            `&response_type=token` +
            `&state=${encodeURIComponent(state)}`;
          break;
        }

        case 'shopify':
          return alert('Shopify ya está conectado con tu tienda mediante API');

        default:
          return alert('Plataforma no soportada');
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

  // ... el resto de tu archivo queda igual (refreshWhatsAppToken, disconnect, render, etc.)
  // IMPORTANTE: tu disconnect hoy solo borra user_social_tokens.
  // WhatsApp está en social_connections, así que desconectar WhatsApp requiere otro delete/update ahí.

  return (/* TU JSX ORIGINAL AQUÍ, sin cambios */);
}
