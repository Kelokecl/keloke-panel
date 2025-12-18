-- ============================================
-- WHATSAPP AI - SISTEMA DE IA PARA WHATSAPP
-- ============================================

-- Tabla de configuración de IA para WhatsApp
DROP TABLE IF EXISTS whatsapp_ai_conversations CASCADE;
DROP TABLE IF EXISTS whatsapp_ai_products CASCADE;
DROP TABLE IF EXISTS whatsapp_ai_config CASCADE;

CREATE TABLE whatsapp_ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled BOOLEAN DEFAULT false,
  ai_name TEXT DEFAULT 'Asistente Virtual',
  greeting_message TEXT DEFAULT 'Hola! Soy el asistente virtual. ¿En qué puedo ayudarte?',
  business_description TEXT,
  working_hours_start TIME DEFAULT '09:00:00',
  working_hours_end TIME DEFAULT '18:00:00',
  timezone TEXT DEFAULT 'America/Santiago',
  auto_reply_outside_hours BOOLEAN DEFAULT true,
  outside_hours_message TEXT DEFAULT 'Gracias por contactarnos. Nuestro horario es de 9:00 a 18:00. Te responderemos lo antes posible.',
  max_response_time_seconds INTEGER DEFAULT 30,
  response_tone TEXT DEFAULT 'professional', -- professional, friendly, casual
  always_active BOOLEAN DEFAULT false, -- Si está en true, responde siempre, si no solo fuera de horario
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de entrenamiento de productos para la IA
CREATE TABLE whatsapp_ai_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  product_description TEXT NOT NULL,
  price TEXT,
  category TEXT,
  features TEXT[], -- Array de características
  sales_pitch TEXT, -- Mensaje de venta específico
  faqs JSONB DEFAULT '[]'::jsonb, -- Preguntas frecuentes
  stock_status TEXT DEFAULT 'available', -- available, limited, out_of_stock
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de conversaciones de IA para mantener contexto
CREATE TABLE whatsapp_ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  customer_name TEXT,
  conversation_context JSONB DEFAULT '{}'::jsonb,
  messages_history JSONB DEFAULT '[]'::jsonb,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  sentiment TEXT, -- positive, neutral, negative
  intent TEXT, -- inquiry, purchase, support, complaint
  lead_score INTEGER DEFAULT 0, -- 0-100
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para optimizar consultas
CREATE INDEX idx_whatsapp_ai_conversations_phone ON whatsapp_ai_conversations(phone_number);
CREATE INDEX idx_whatsapp_ai_conversations_active ON whatsapp_ai_conversations(is_active);
CREATE INDEX idx_whatsapp_ai_products_active ON whatsapp_ai_products(is_active);

-- Datos iniciales
INSERT INTO whatsapp_ai_config (
  is_enabled,
  ai_name,
  greeting_message,
  business_description,
  response_tone,
  always_active
) VALUES (
  false,
  'Asistente Keloke',
  '¡Hola! 👋 Soy el asistente virtual de Keloke. Estoy aquí para ayudarte con información sobre nuestros productos y servicios. ¿En qué puedo ayudarte hoy?',
  'Keloke es una empresa de automatización y marketing digital que ayuda a negocios a crecer mediante estrategias inteligentes.',
  'friendly',
  false
);

-- Productos de ejemplo
INSERT INTO whatsapp_ai_products (
  product_name,
  product_description,
  price,
  category,
  features,
  sales_pitch,
  faqs,
  stock_status
) VALUES 
(
  'Automatización de WhatsApp',
  'Sistema completo de automatización de WhatsApp Business con IA integrada para respuestas automáticas, gestión de conversaciones y cierre de ventas.',
  'Desde $99.990 CLP/mes',
  'Automatización',
  ARRAY['Respuestas automáticas 24/7', 'IA entrenada para tu negocio', 'Gestión de conversaciones', 'Reportes y analíticas', 'Integración con tu sistema'],
  'Con nuestra automatización de WhatsApp, nunca perderás una venta. La IA responde instantáneamente, califica leads y cierra ventas mientras duermes. ¿Te gustaría una demo?',
  '[{"question": "¿Cómo funciona?", "answer": "Conectas tu WhatsApp Business y nuestra IA aprende de tu negocio. Luego responde automáticamente a tus clientes con información personalizada."}, {"question": "¿Cuánto tiempo toma implementarlo?", "answer": "La implementación toma solo 24 horas. Te ayudamos con todo el proceso de configuración."}]'::jsonb,
  'available'
),
(
  'Marketing Digital Completo',
  'Servicio integral de marketing digital: gestión de redes sociales, campañas publicitarias, creación de contenido y estrategia de crecimiento.',
  'Desde $299.990 CLP/mes',
  'Marketing',
  ARRAY['Gestión de redes sociales', 'Campañas publicitarias en Meta y TikTok', 'Creación de contenido profesional', 'Estrategia personalizada', 'Reportes mensuales'],
  'Nuestro servicio de marketing digital ha ayudado a más de 100 negocios a duplicar sus ventas. Trabajamos con estrategias probadas y medimos todo. ¿Quieres conocer más?',
  '[{"question": "¿Qué incluye el servicio?", "answer": "Incluye gestión completa de redes sociales, creación de contenido, campañas publicitarias y reportes mensuales detallados."}, {"question": "¿Hay contrato a largo plazo?", "answer": "Trabajamos mes a mes. Si no ves resultados, puedes cancelar sin penalización."}]'::jsonb,
  'available'
);
