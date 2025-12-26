import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Bot,
  Save,
  AlertCircle,
  CheckCircle,
  Loader,
  Clock,
  Zap,
  Settings,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

/**
 * WhatsAppAIConfig.jsx (Nivel Dios)
 * - Soporta OpenAI (gpt-5-mini) y Claude
 * - Compatible con esquema existente (ai_model)
 * - Config "single row" con id=1 por defecto
 */

const DEFAULT_CONFIG = {
  id: 1,

  // Estado
  is_enabled: false,

  // Horario
  auto_reply_when_offline: true, // "solo fuera de horario"
  business_hours_start: '09:00',
  business_hours_end: '18:00',
  working_days: [1, 2, 3, 4, 5], // Lun-Vie

  // Entrenamiento
  training_context: '',
  greeting_message:
    'Hola! Gracias por contactarnos 🙌 Un agente te responderá pronto.',

  // IA
  ia_provider: 'openai', // openai | claude
  ai_model: 'gpt-5-mini', // se mantiene por compatibilidad y como "modelo activo"
  max_tokens: 220,
  temperature: 0.7,

  // (Opcional) futuros flags
  updated_at: null,
};

const DAYS = [
  { id: 1, name: 'Lun' },
  { id: 2, name: 'Mar' },
  { id: 3, name: 'Mié' },
  { id: 4, name: 'Jue' },
  { id: 5, name: 'Vie' },
  { id: 6, name: 'Sáb' },
  { id: 7, name: 'Dom' },
];

// Modelos sugeridos (puedes ajustar la lista cuando quieras)
const OPENAI_MODELS = [
  { value: 'gpt-5-mini', label: 'GPT-5 mini (Recomendado)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o mini (rápido/barato)' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
];

const CLAUDE_MODELS = [
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Recomendado)' },
  { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Más rápido)' },
];

function normalizeConfig(raw) {
  const cfg = { ...DEFAULT_CONFIG, ...(raw || {}) };

  // Compatibilidad: si no existe ia_provider, inferimos por ai_model
  if (!cfg.ia_provider) {
    cfg.ia_provider = (cfg.ai_model || '').toLowerCase().includes('claude')
      ? 'claude'
      : 'openai';
  }

  // Si viene un modelo “viejo” de Claude por defecto, pero quieres OpenAI,
  // lo respetamos solo si provider=claude. Si provider=openai y ai_model es claude => corregimos.
  if (cfg.ia_provider === 'openai' && (cfg.ai_model || '').toLowerCase().includes('claude')) {
    cfg.ai_model = 'gpt-5-mini';
  }

  if (cfg.ia_provider === 'claude' && (cfg.ai_model || '').toLowerCase().startsWith('gpt')) {
    cfg.ai_model = 'claude-3-5-sonnet-20241022';
  }

  // Sanitizar arrays/strings
  if (!Array.isArray(cfg.working_days)) cfg.working_days = DEFAULT_CONFIG.working_days;
  cfg.working_days = [...new Set(cfg.working_days)].sort((a, b) => a - b);

  cfg.training_context = String(cfg.training_context || '');
  cfg.greeting_message = String(cfg.greeting_message || '');

  // Números
  cfg.max_tokens = Number.isFinite(Number(cfg.max_tokens)) ? Number(cfg.max_tokens) : DEFAULT_CONFIG.max_tokens;
  cfg.max_tokens = Math.max(80, Math.min(1200, cfg.max_tokens));

  cfg.temperature = Number.isFinite(Number(cfg.temperature)) ? Number(cfg.temperature) : DEFAULT_CONFIG.temperature;
  cfg.temperature = Math.max(0, Math.min(1, cfg.temperature));

  // Horas
  cfg.business_hours_start = cfg.business_hours_start || DEFAULT_CONFIG.business_hours_start;
  cfg.business_hours_end = cfg.business_hours_end || DEFAULT_CONFIG.business_hours_end;

  // ID único
  cfg.id = cfg.id || 1;

  return cfg;
}

export default function WhatsAppAIConfig({ onConfigUpdate }) {
  const [config, setConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4500);
    return () => clearTimeout(t);
  }, [message]);

  async function loadConfig() {
    try {
      setIsLoading(true);

      // ✅ maybeSingle: no revienta si no hay filas
      const { data, error } = await supabase
        .from('whatsapp_ai_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      setConfig(normalizeConfig(data));
    } catch (err) {
      console.error('Error loading config:', err);
      setConfig(normalizeConfig(null));
      setMessage({
        type: 'error',
        text:
          'No pude cargar la configuración (se aplicó una configuración por defecto). Revisa RLS/permisos si persiste.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  function validateConfig(cfg) {
    if (!cfg) return 'Config vacía';

    // working_days no vacío
    if (!cfg.working_days?.length) {
      return 'Selecciona al menos 1 día de atención.';
    }

    // validar rango de horas (simple)
    const start = String(cfg.business_hours_start || '');
    const end = String(cfg.business_hours_end || '');
    if (!start.includes(':') || !end.includes(':')) {
      return 'Horas inválidas (inicio/término).';
    }

    // modelo según proveedor
    if (cfg.ia_provider === 'openai' && !String(cfg.ai_model || '').startsWith('gpt')) {
      return 'El modelo seleccionado no parece de OpenAI.';
    }
    if (cfg.ia_provider === 'claude' && !String(cfg.ai_model || '').toLowerCase().includes('claude')) {
      return 'El modelo seleccionado no parece de Claude.';
    }

    return null;
  }

  async function saveConfig() {
    if (!config) return;

    setIsSaving(true);
    setMessage(null);

    try {
      const cfg = normalizeConfig(config);
      const validationError = validateConfig(cfg);
      if (validationError) {
        setMessage({ type: 'error', text: validationError });
        setIsSaving(false);
        return;
      }

      // ✅ Single-row config: forzamos id=1 si no existe
      const payload = {
        ...cfg,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('whatsapp_ai_config')
        .upsert(payload, { onConflict: 'id' });

      if (error) throw error;

      setConfig(cfg);
      setMessage({ type: 'success', text: 'Configuración guardada exitosamente ✅' });

      if (onConfigUpdate) onConfigUpdate();
    } catch (err) {
      console.error('Error saving config:', err);
      setMessage({
        type: 'error',
        text:
          'Error al guardar la configuración. Si te pasa siempre: revisa RLS/policies de la tabla whatsapp_ai_config.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleDayToggle(day) {
    const days = config?.working_days || [];
    const newWorkingDays = days.includes(day)
      ? days.filter((d) => d !== day)
      : [...days, day];

    setConfig({ ...config, working_days: newWorkingDays.sort((a, b) => a - b) });
  }

  function setProvider(provider) {
    // al cambiar provider, setear modelo coherente
    const next = { ...config, ia_provider: provider };
    if (provider === 'openai') next.ai_model = 'gpt-5-mini';
    if (provider === 'claude') next.ai_model = 'claude-3-5-sonnet-20241022';
    setConfig(next);
  }

  const providerLabel =
    config?.ia_provider === 'openai' ? 'OpenAI' : 'Claude (Anthropic)';

  if (isLoading || !config) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <Bot className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-1">IA para WhatsApp</h1>
            <p className="text-white/90">
              Respuestas automáticas con {providerLabel}
            </p>
          </div>
        </div>
      </div>

      {/* Message Alert */}
      {message && (
        <div
          className={`p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      {/* Estado General */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-purple-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Estado de la IA
              </h2>
              <p className="text-sm text-gray-600">
                Activar o desactivar respuestas automáticas
              </p>
            </div>
          </div>
          <button
            onClick={() => setConfig({ ...config, is_enabled: !config.is_enabled })}
            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
              config.is_enabled ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform ${
                config.is_enabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg">
          <Sparkles className="w-5 h-5 text-purple-600" />
          <p className="text-sm text-purple-700">
            {config.is_enabled
              ? '✅ La IA responderá automáticamente según las reglas configuradas'
              : '⏸️ La IA está pausada — no responderá automáticamente'}
          </p>
        </div>
      </div>

      {/* Horario */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Clock className="w-6 h-6 text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Horario de Atención
            </h2>
            <p className="text-sm text-gray-600">
              Define cuándo la IA debe responder
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                checked={!!config.auto_reply_when_offline}
                onChange={(e) =>
                  setConfig({ ...config, auto_reply_when_offline: e.target.checked })
                }
                className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Solo responder fuera del horario de atención
              </span>
            </label>
            <p className="text-xs text-gray-500 ml-6">
              Si está marcado, la IA responde cuando estás “offline” (fuera del horario/días seleccionados).
              Si no está marcado, la IA puede responder siempre (si está activada).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hora de inicio
              </label>
              <input
                type="time"
                value={config.business_hours_start}
                onChange={(e) =>
                  setConfig({ ...config, business_hours_start: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hora de término
              </label>
              <input
                type="time"
                value={config.business_hours_end}
                onChange={(e) =>
                  setConfig({ ...config, business_hours_end: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Días de atención
            </label>
            <div className="flex gap-2">
              {DAYS.map((day) => (
                <button
                  key={day.id}
                  onClick={() => handleDayToggle(day.id)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    config.working_days?.includes(day.id)
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {day.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Entrenamiento */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <MessageSquare className="w-6 h-6 text-green-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Entrenar la IA
            </h2>
            <p className="text-sm text-gray-600">
              Contexto para vender y atender “nivel dios”
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contexto de entrenamiento
            </label>
            <textarea
              value={config.training_context}
              onChange={(e) =>
                setConfig({ ...config, training_context: e.target.value })
              }
              placeholder={
                "Ejemplo:\nSomos Keloke Chile. Vendemos productos para el hogar y gadgets.\n- Envíos: 24–72h RM, 2–5 días regiones.\n- Medios de pago: ...\n- Garantía/devolución: ...\n- Preguntas clave: presupuesto, comuna, uso.\n- Estilo: chileno, cercano, directo.\n"
              }
              rows={9}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            />
            <p className="text-xs text-gray-500 mt-2">
              Mientras más claro (precios, despacho, garantías, tono y preguntas), mejor vende la IA.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mensaje de bienvenida (opcional)
            </label>
            <input
              type="text"
              value={config.greeting_message}
              onChange={(e) =>
                setConfig({ ...config, greeting_message: e.target.value })
              }
              placeholder="Hola! Gracias por contactarnos..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Se usa como mensaje inicial cuando corresponde (según tu lógica del webhook).
            </p>
          </div>
        </div>
      </div>

      {/* Configuración Avanzada */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-6 h-6 text-gray-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Configuración Avanzada
            </h2>
            <p className="text-sm text-gray-600">
              Proveedor, modelo y ajustes del motor
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Proveedor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Proveedor de IA
            </label>
            <select
              value={config.ia_provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="openai">OpenAI</option>
              <option value="claude">Claude (Anthropic)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Esto debe calzar con lo que tu webhook lee (IA_PROVIDER / ai_model).
            </p>
          </div>

          {/* Modelo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Modelo de IA
            </label>

            {config.ia_provider === 'openai' ? (
              <select
                value={config.ai_model}
                onChange={(e) => setConfig({ ...config, ai_model: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                {OPENAI_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={config.ai_model}
                onChange={(e) => setConfig({ ...config, ai_model: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}

            <p className="text-xs text-gray-500 mt-1">
              OpenAI recomendado: <b>gpt-5-mini</b> para ventas rápidas y buenas.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Tokens */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tokens máximos
              </label>
              <input
                type="number"
                value={config.max_tokens}
                onChange={(e) =>
                  setConfig({ ...config, max_tokens: parseInt(e.target.value || '0', 10) })
                }
                min="80"
                max="1200"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Largo máximo de respuesta</p>
            </div>

            {/* Temperatura */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Temperatura ({config.temperature})
              </label>
              <input
                type="range"
                value={config.temperature}
                onChange={(e) =>
                  setConfig({ ...config, temperature: parseFloat(e.target.value) })
                }
                min="0"
                max="1"
                step="0.1"
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-xs text-gray-500 mt-1">Creatividad / variación</p>
            </div>
          </div>
        </div>
      </div>

      {/* Botón Guardar */}
      <div className="sticky bottom-6">
        <button
          onClick={saveConfig}
          disabled={isSaving}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-medium rounded-xl hover:from-purple-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
        >
          {isSaving ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Guardar Configuración
            </>
          )}
        </button>
      </div>

      {/* Info Card */}
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-purple-900 mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          ¿Cómo funciona la IA?
        </h3>
        <ul className="space-y-2 text-sm text-purple-800">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              La IA responde automáticamente según <b>estado</b> + <b>horario</b> + <b>días</b>.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Usa tu <b>contexto de entrenamiento</b> para vender mejor y resolver dudas (sin inventar stock).
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Proveedor actual: <b>{providerLabel}</b> — Modelo: <b>{config.ai_model}</b>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Ojo: el webhook debe <b>leer esta config</b> para aplicar proveedor/modelo (si no, solo cambia la UI).
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
