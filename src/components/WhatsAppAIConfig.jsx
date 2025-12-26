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
  Sparkles
} from 'lucide-react';

const DEFAULT_CONFIG = {
  id: 1,
  auto_reply_enabled: false,
  reply_outside_schedule: true,
  start_time: '09:00',
  end_time: '18:00',
  days_enabled: [1, 2, 3, 4, 5],
  training_data: '',
  greeting_message: 'Hola! 🙌 Soy la asistente de Keloke. ¿Qué producto buscas y para qué uso?',
  ia_provider: 'openai',
  ai_model: 'gpt-5-mini',
  max_tokens: 220,
  temperature: 0.7,
};

export default function WhatsAppAIConfig({ onConfigUpdate }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadConfig() {
    setMessage(null);
    try {
      setIsLoading(true);

      // Intentamos cargar id=1. Si no existe, usamos default.
      const { data, error } = await supabase
        .from('whatsapp_ai_config')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;

      setConfig({ ...DEFAULT_CONFIG, ...(data || {}) });
    } catch (err) {
      console.error('Error loading config:', err);
      setMessage({ type: 'error', text: `Error al cargar configuración: ${err?.message || err}` });
      setConfig(DEFAULT_CONFIG);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveConfig() {
    setIsSaving(true);
    setMessage(null);

    try {
      const payload = {
        ...config,
        updated_at: new Date().toISOString(),
      };

      // Upsert por id=1 (clave)
      const { error } = await supabase
        .from('whatsapp_ai_config')
        .upsert(payload, { onConflict: 'id' });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Configuración guardada ✅' });
      if (onConfigUpdate) onConfigUpdate();
    } catch (err) {
      console.error('Error saving config:', err);
      setMessage({ type: 'error', text: `No se pudo guardar: ${err?.message || err}` });
    } finally {
      setIsSaving(false);
    }
  }

  function handleDayToggle(day) {
    const current = Array.isArray(config.days_enabled) ? config.days_enabled : [];
    const next = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day];

    next.sort((a, b) => a - b);
    setConfig({ ...config, days_enabled: next });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }

  const days = [
    { id: 1, name: 'Lun' },
    { id: 2, name: 'Mar' },
    { id: 3, name: 'Mié' },
    { id: 4, name: 'Jue' },
    { id: 5, name: 'Vie' },
    { id: 6, name: 'Sáb' },
    { id: 7, name: 'Dom' }
  ];

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
            <p className="text-white/90">Respuestas automáticas con IA</p>
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          message.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {message.type === 'success'
            ? <CheckCircle className="w-5 h-5 flex-shrink-0" />
            : <AlertCircle className="w-5 h-5 flex-shrink-0" />
          }
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      {/* Estado */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-purple-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Estado de la IA</h2>
              <p className="text-sm text-gray-600">Activar / desactivar respuestas automáticas</p>
            </div>
          </div>

          <button
            onClick={() => setConfig({ ...config, auto_reply_enabled: !config.auto_reply_enabled })}
            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
              config.auto_reply_enabled ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform ${
                config.auto_reply_enabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg">
          <Sparkles className="w-5 h-5 text-purple-600" />
          <p className="text-sm text-purple-700">
            {config.auto_reply_enabled
              ? '✅ La IA responderá automáticamente según reglas configuradas'
              : '⏸️ La IA está pausada — no responderá automáticamente'}
          </p>
        </div>
      </div>

      {/* Horarios */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Clock className="w-6 h-6 text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Horario de Atención</h2>
            <p className="text-sm text-gray-600">Define cuándo la IA debe responder</p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!config.reply_outside_schedule}
              onChange={(e) => setConfig({ ...config, reply_outside_schedule: e.target.checked })}
              className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Solo responder fuera del horario de atención
            </span>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Hora de inicio</label>
              <input
                type="time"
                value={config.start_time || '09:00'}
                onChange={(e) => setConfig({ ...config, start_time: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Hora de término</label>
              <input
                type="time"
                value={config.end_time || '18:00'}
                onChange={(e) => setConfig({ ...config, end_time: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Días de atención</label>
            <div className="flex gap-2">
              {days.map(day => (
                <button
                  key={day.id}
                  onClick={() => handleDayToggle(day.id)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    (config.days_enabled || []).includes(day.id)
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
            <h2 className="text-lg font-semibold text-gray-900">Entrenar la IA</h2>
            <p className="text-sm text-gray-600">Contexto para vender y atender “nivel dios”</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contexto de entrenamiento
            </label>
            <textarea
              value={config.training_data || ''}
              onChange={(e) => setConfig({ ...config, training_data: e.target.value })}
              rows={10}
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
              value={config.greeting_message || ''}
              onChange={(e) => setConfig({ ...config, greeting_message: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Config avanzada */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-6 h-6 text-gray-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Configuración Avanzada</h2>
            <p className="text-sm text-gray-600">Proveedor, modelo y ajustes</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Proveedor de IA</label>
            <select
              value={config.ia_provider || 'openai'}
              onChange={(e) => setConfig({ ...config, ia_provider: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="openai">OpenAI</option>
              <option value="claude">Claude (Anthropic)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Modelo de IA</label>
            <select
              value={config.ai_model || 'gpt-5-mini'}
              onChange={(e) => setConfig({ ...config, ai_model: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="gpt-5-mini">GPT-5 mini (Recomendado)</option>
              <option value="gpt-4.1-mini">GPT-4.1 mini</option>
              <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
              <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tokens máximos</label>
              <input
                type="number"
                value={Number.isFinite(config.max_tokens) ? config.max_tokens : 220}
                onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value || '220', 10) })}
                min="50"
                max="1200"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Recomendado WhatsApp: 180–260</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Temperatura ({Number(config.temperature ?? 0.7).toFixed(1)})
              </label>
              <input
                type="range"
                value={Number(config.temperature ?? 0.7)}
                onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                min="0"
                max="1"
                step="0.1"
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-xs text-gray-500 mt-1">0.6–0.8 recomendado</p>
            </div>
          </div>
        </div>
      </div>

      {/* Guardar */}
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
    </div>
  );
}
