-- ============================================
-- CONFIGURACIÓN OAUTH PARA TIKTOK
-- ============================================

-- Actualizar credenciales de TikTok en oauth_credentials
UPDATE oauth_credentials
SET credentials = jsonb_build_object(
  'client_key', 'awmczkyyablg1am5',
  'client_secret', 'Aphes5RfyQu8FqY1HRkarrvF6sejihRc',
  'redirect_uri', 'https://yfqxqxqxqxqxqxqxqxqx.supabase.co/functions/v1/tiktok-oauth-callback'
)
WHERE platform = 'tiktok';

-- Si no existe, insertar
INSERT INTO oauth_credentials (platform, credentials)
VALUES (
  'tiktok',
  jsonb_build_object(
    'client_key', 'awmczkyyablg1am5',
    'client_secret', 'Aphes5RfyQu8FqY1HRkarrvF6sejihRc',
    'redirect_uri', 'https://yfqxqxqxqxqxqxqxqxqx.supabase.co/functions/v1/tiktok-oauth-callback'
  )
)
ON CONFLICT (platform) DO NOTHING;

-- ============================================
-- NOTAS DE CONFIGURACIÓN
-- ============================================

/*
CONFIGURACIÓN EN TIKTOK FOR DEVELOPERS:
1. Ve a https://developers.tiktok.com/
2. Crea una aplicación o usa una existente
3. Configura la Redirect URI:
   https://yfqxqxqxqxqxqxqxqxqx.supabase.co/functions/v1/tiktok-oauth-callback

PERMISOS REQUERIDOS (SCOPES):
- user.info.basic: Información básica del usuario
- video.publish: Publicar videos
- video.list: Listar videos del usuario

FLUJO DE AUTENTICACIÓN:
1. Usuario hace clic en "Conectar TikTok"
2. Se abre ventana con URL de autorización de TikTok
3. Usuario autoriza la aplicación
4. TikTok redirige al Edge Function con el código
5. Edge Function intercambia código por access_token
6. Se guarda el token en user_social_tokens
7. Se redirige al callback de éxito

EDGE FUNCTION DESPLEGADA:
- Nombre: tiktok-oauth-callback
- URL: https://yfqxqxqxqxqxqxqxqxqx.supabase.co/functions/v1/tiktok-oauth-callback
- Maneja el intercambio de código por token
- Guarda tokens en la base de datos
- Redirige al usuario con resultado

TOKENS:
- Access Token: Válido por tiempo limitado (verificar expires_in)
- Refresh Token: Para renovar el access token cuando expire
- Se guardan en la tabla user_social_tokens

RENOVACIÓN DE TOKENS:
- TikTok proporciona refresh_token
- Implementar lógica de renovación automática antes de expiración
- Actualizar token_expires_at después de renovar
*/
