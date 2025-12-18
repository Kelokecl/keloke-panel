-- Tabla para conversaciones con el Auto-Gerente IA
CREATE TABLE IF NOT EXISTS ai_conversations (
  id BIGSERIAL PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla para insights y métricas del Auto-Gerente IA
CREATE TABLE IF NOT EXISTS ai_insights (
  id BIGSERIAL PRIMARY KEY,
  active_products INTEGER DEFAULT 0,
  scheduled_content INTEGER DEFAULT 0,
  active_automations INTEGER DEFAULT 0,
  pending_alerts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar datos iniciales de insights
INSERT INTO ai_insights (active_products, scheduled_content, active_automations, pending_alerts)
VALUES (0, 0, 0, 0);

-- Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_ai_conversations_created_at ON ai_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_created_at ON ai_insights(created_at DESC);