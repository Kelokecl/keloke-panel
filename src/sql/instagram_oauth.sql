-- ============================================
-- CONFIGURACIÓN OAUTH PARA INSTAGRAM
-- ============================================

-- Crear tabla para credenciales OAuth si no existe
CREATE TABLE IF NOT EXISTS oauth_credentials (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT UNIQUE NOT NULL,
  credentials JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crear tabla para tokens de usuarios si no existe
CREATE TABLE IF NOT EXISTS user_social_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  platform TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  instagram_user_id TEXT,
  instagram_username TEXT,
  profile_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- Crear tabla para mensajes de Instagram
CREATE TABLE IF NOT EXISTS instagram_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  instagram_user_id TEXT NOT NULL,
  instagram_username TEXT,
  message_id TEXT UNIQUE NOT NULL,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_username TEXT,
  message_type TEXT NOT NULL, -- 'text', 'image', 'video', 'audio', 'story_reply', 'story_mention'
  message_text TEXT,
  media_url TEXT,
  media_type TEXT, -- 'image', 'video', 'audio'
  timestamp TIMESTAMPTZ NOT NULL,
  is_from_business BOOLEAN DEFAULT false,
  is_read BOOLEAN DEFAULT false,
  reply_to_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crear índices para búsqueda eficiente
CREATE INDEX IF NOT EXISTS idx_instagram_messages_conversation ON instagram_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_timestamp ON instagram_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_user ON instagram_messages(user_id);

-- Insertar/actualizar credenciales de Instagram
INSERT INTO oauth_credentials (platform, credentials)
VALUES (
  'instagram',
  jsonb_build_object(
    'client_id', '877128444983976',
    'client_secret', 'de49065a8b11fcfa748e11f8ceb9e87f',
    'redirect_uri', 'https://nffeqekvvqsqwbjrmkjs.supabase.co/functions/v1/instagram-oauth-callback',
    'webhook_verify_token', 'keloke_instagram_webhook_2024',
    'webhook_url', 'https://nffeqekvvqsqwbjrmkjs.supabase.co/functions/v1/instagram-webhook'
  )
)
ON CONFLICT (platform) 
DO UPDATE SET 
  credentials = EXCLUDED.credentials,
  updated_at = NOW();

-- ============================================
-- CONFIGURACIÓN DE WEBHOOK EN META
-- ============================================

/*
DATOS PARA CONFIGURAR EN META DEVELOPERS:

1. URL DE CALLBACK (Redirect URI para OAuth):
   https://nffeqekvvqsqwbjrmkjs.supabase.co/functions/v1/instagram-oauth-callback

2. URL DEL WEBHOOK:
   https://nffeqekvvqsqwbjrmkjs.supabase.co/functions/v1/instagram-webhook

3. TOKEN DE VERIFICACIÓN:
   keloke_instagram_webhook_2024

4. CAMPOS/EVENTOS A SUSCRIBIR:
   ✅ messages - Mensajes directos entrantes y salientes
   ✅ messaging_postbacks - Respuestas a botones
   ✅ messaging_optins - Cuando un usuario acepta recibir mensajes
   ✅ comments - Comentarios en posts

5. PERMISOS REQUERIDOS (SCOPES) - INSTAGRAM BUSINESS:
   - instagram_basic: Información básica del perfil
   - instagram_manage_messages: Leer y enviar mensajes
   - instagram_manage_comments: Gestionar comentarios
   - pages_show_list: Listar páginas de Facebook
   - pages_read_engagement: Leer interacciones de páginas
   - business_management: Gestionar cuentas de negocio

IMPORTANTE: Instagram Business usa el flujo OAuth de Facebook Graph API
URL correcta: https://www.facebook.com/v24.0/dialog/oauth
NO usar: https://www.instagram.com/oauth/authorize (eso es para Basic Display)

PASOS EN META DEVELOPERS:
1. Ve a: Casos de uso → API de Instagram → Configuración de la API con inicio → Paso 3
2. Pega la URL del webhook: https://nffeqekvvqsqwbjrmkjs.supabase.co/functions/v1/instagram-webhook
3. Pega el token de verificación: keloke_instagram_webhook_2024
4. Haz clic en "Verificar y guardar"
5. Una vez verificado, suscríbete a los campos: messages, messaging_postbacks, messaging_optins, message_echoes, comments, mentions
*/

-- ============================================
-- NOTAS DE IMPLEMENTACIÓN
-- ============================================

/*
FLUJO DE AUTENTICACIÓN OAUTH:
1. Usuario hace clic en "Conectar Instagram"
2. Se abre ventana con URL de autorización de Instagram
3. Usuario autoriza la aplicación
4. Instagram redirige al Edge Function con el código
5. Edge Function intercambia código por access_token
6. Se guarda el token en user_social_tokens
7. Se obtiene el ID de usuario de Instagram y username
8. Se redirige al callback de éxito

FLUJO DE MENSAJES ENTRANTES (WEBHOOK):
1. Usuario envía mensaje DM a @kelokecl
2. Meta envía notificación al webhook de Nerd
3. Edge Function recibe el mensaje y lo procesa
4. Se guarda en instagram_messages
5. Se actualiza el UI en tiempo real

EDGE FUNCTIONS NECESARIAS:
1. instagram-oauth-callback: Maneja OAuth y guarda tokens
2. instagram-webhook: Recibe mensajes y eventos de Instagram
3. instagram-send-message: Envía mensajes desde el panel

RENOVACIÓN DE TOKENS:
- Instagram tokens de larga duración: válidos por 60 días
- Se pueden renovar antes de expirar
- Implementar lógica de renovación automática
*/
