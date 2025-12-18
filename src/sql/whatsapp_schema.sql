-- ====================================
-- WHATSAPP BUSINESS CLOUD API SCHEMA
-- ====================================
-- Este archivo contiene el schema completo para la integración de WhatsApp Business Cloud API

-- Tabla principal de conexiones sociales
CREATE TABLE IF NOT EXISTS social_connections (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL UNIQUE,
  user_id TEXT,
  access_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ,
  username TEXT,
  is_active BOOLEAN DEFAULT true,
  last_connected TIMESTAMPTZ DEFAULT NOW(),
  
  -- Campos específicos para WhatsApp Business
  phone_number_id TEXT,
  whatsapp_business_account_id TEXT,
  webhook_verified BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de mensajes de WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id BIGSERIAL PRIMARY KEY,
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  whatsapp_message_id TEXT,
  platform_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para optimizar búsquedas
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON whatsapp_messages(phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON whatsapp_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_direction ON whatsapp_messages(direction);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_whatsapp_id ON whatsapp_messages(whatsapp_message_id);

-- Datos de ejemplo para pruebas (solo si las tablas están vacías)
INSERT INTO whatsapp_messages (phone_number, message, direction, status)
SELECT 
  '+56912345678', 
  'Hola, este es un mensaje de prueba desde Keloke WApp API', 
  'outbound', 
  'sent'
WHERE NOT EXISTS (SELECT 1 FROM whatsapp_messages LIMIT 1);

INSERT INTO whatsapp_messages (phone_number, message, direction, status)
SELECT 
  '+56912345678', 
  'Hola, gracias por tu mensaje. ¿En qué puedo ayudarte?', 
  'inbound', 
  'read'
WHERE (SELECT COUNT(*) FROM whatsapp_messages) = 1;

-- ====================================
-- MEJORAS PROFESIONALES (v2.0)
-- ====================================
-- Soporte completo de multimedia, contactos y AI

-- Actualizar tabla whatsapp_messages para soportar multimedia
ALTER TABLE whatsapp_messages 
ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text',
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_mime_type TEXT,
ADD COLUMN IF NOT EXISTS media_filename TEXT,
ADD COLUMN IF NOT EXISTS media_size INTEGER,
ADD COLUMN IF NOT EXISTS media_duration INTEGER, -- Duración en segundos (para audios)
ADD COLUMN IF NOT EXISTS caption TEXT,
ADD COLUMN IF NOT EXISTS contact_name TEXT,
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS replied_to_id BIGINT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Crear índices adicionales para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_whatsapp_phone ON whatsapp_messages(phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_created ON whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_unread ON whatsapp_messages(is_read) WHERE is_read = false;

-- Tabla de contactos/clientes de WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id BIGSERIAL PRIMARY KEY,
  phone_number TEXT UNIQUE NOT NULL,
  contact_name TEXT,
  profile_picture_url TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  tags TEXT[],
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_phone ON whatsapp_contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_last_msg ON whatsapp_contacts(last_message_at DESC);

-- Tabla de configuración de IA para respuestas automáticas
CREATE TABLE IF NOT EXISTS whatsapp_ai_config (
  id BIGSERIAL PRIMARY KEY,
  is_enabled BOOLEAN DEFAULT false,
  auto_reply_when_offline BOOLEAN DEFAULT true,
  training_context TEXT,
  greeting_message TEXT DEFAULT 'Hola! Gracias por contactarnos. Un agente te responderá pronto.',
  business_hours_start TIME DEFAULT '09:00',
  business_hours_end TIME DEFAULT '18:00',
  working_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],
  ai_model TEXT DEFAULT 'claude-3-5-sonnet-20241022',
  max_tokens INTEGER DEFAULT 500,
  temperature DECIMAL(3,2) DEFAULT 0.7,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar configuración predeterminada de IA
INSERT INTO whatsapp_ai_config (is_enabled, training_context)
VALUES (
  false,
  'Eres un asistente virtual para Keloke Chile, una tienda que vende freidoras de aire y accesorios premium para cocina. Tu objetivo es ayudar a los clientes a encontrar el producto perfecto, responder preguntas sobre características, precios y envíos, y guiarlos hacia la compra.'
)
ON CONFLICT DO NOTHING;

-- Función para actualizar last_message_at en contactos automáticamente
CREATE OR REPLACE FUNCTION update_contact_last_message()
RETURNS TRIGGER AS $
BEGIN
  INSERT INTO whatsapp_contacts (phone_number, contact_name, last_message_at, updated_at)
  VALUES (NEW.phone_number, NEW.contact_name, NEW.created_at, NOW())
  ON CONFLICT (phone_number) 
  DO UPDATE SET 
    last_message_at = NEW.created_at,
    updated_at = NOW(),
    contact_name = COALESCE(EXCLUDED.contact_name, whatsapp_contacts.contact_name);
  
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

-- Trigger para actualizar contactos automáticamente cuando llegan mensajes
DROP TRIGGER IF EXISTS trigger_update_contact_last_message ON whatsapp_messages;
CREATE TRIGGER trigger_update_contact_last_message
AFTER INSERT ON whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION update_contact_last_message();

-- Comentarios descriptivos actualizados
COMMENT ON TABLE social_connections IS 'Almacena las conexiones OAuth con redes sociales y WhatsApp Business';
COMMENT ON TABLE whatsapp_messages IS 'Historial completo de mensajes con soporte multimedia (texto, imagen, audio, video, documentos)';
COMMENT ON TABLE whatsapp_contacts IS 'Contactos/clientes de WhatsApp con datos adicionales (nombre, email, dirección, notas)';
COMMENT ON TABLE whatsapp_ai_config IS 'Configuración de IA para respuestas automáticas y horarios de atención';
COMMENT ON COLUMN social_connections.phone_number_id IS 'ID del número de teléfono de WhatsApp Business (obtenido de Meta)';
COMMENT ON COLUMN social_connections.whatsapp_business_account_id IS 'ID de la cuenta de WhatsApp Business (obtenido de Meta)';
COMMENT ON COLUMN social_connections.webhook_verified IS 'Indica si el webhook de WhatsApp fue verificado correctamente';
COMMENT ON COLUMN whatsapp_messages.direction IS 'inbound: recibido de WhatsApp, outbound: enviado a WhatsApp';
COMMENT ON COLUMN whatsapp_messages.status IS 'Estado del mensaje: pending, sent, delivered, read, failed';
COMMENT ON COLUMN whatsapp_messages.message_type IS 'Tipo de mensaje: text, image, audio, video, document, sticker';
COMMENT ON COLUMN whatsapp_messages.media_url IS 'URL del archivo multimedia (WhatsApp Media ID o URL directa)';
COMMENT ON COLUMN whatsapp_contacts.last_message_at IS 'Fecha del último mensaje (usado para ordenar conversaciones)';
COMMENT ON COLUMN whatsapp_ai_config.working_days IS 'Días de la semana activos (1=Lunes, 7=Domingo)';

-- ====================================
-- POLÍTICAS RLS (Row Level Security)
-- ====================================
-- CRÍTICO: Estas políticas permiten lectura/escritura para solucionar error 406

-- Habilitar RLS en whatsapp_messages
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Política: Permitir lectura a usuarios autenticados
CREATE POLICY "Usuarios autenticados pueden leer mensajes"
ON whatsapp_messages FOR SELECT
TO authenticated
USING (true);

-- Política: Permitir inserción a usuarios autenticados
CREATE POLICY "Usuarios autenticados pueden crear mensajes"
ON whatsapp_messages FOR INSERT
TO authenticated
WITH CHECK (true);

-- Política: Permitir actualización a usuarios autenticados
CREATE POLICY "Usuarios autenticados pueden actualizar mensajes"
ON whatsapp_messages FOR UPDATE
TO authenticated
USING (true);

-- Política: Permitir inserción desde service_role (webhook)
CREATE POLICY "Service role puede insertar mensajes"
ON whatsapp_messages FOR INSERT
TO service_role
WITH CHECK (true);

-- Habilitar RLS en whatsapp_contacts
ALTER TABLE whatsapp_contacts ENABLE ROW LEVEL SECURITY;

-- Política: Permitir lectura a usuarios autenticados
CREATE POLICY "Usuarios autenticados pueden leer contactos"
ON whatsapp_contacts FOR SELECT
TO authenticated
USING (true);

-- Política: Permitir inserción/actualización a usuarios autenticados
CREATE POLICY "Usuarios autenticados pueden crear contactos"
ON whatsapp_contacts FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar contactos"
ON whatsapp_contacts FOR UPDATE
TO authenticated
USING (true);

-- Política: Permitir operaciones desde service_role (webhook y triggers)
CREATE POLICY "Service role puede insertar contactos"
ON whatsapp_contacts FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role puede actualizar contactos"
ON whatsapp_contacts FOR UPDATE
TO service_role
USING (true);