import { useEffect, useMemo, useState } from 'react';
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

const DEFAULTS = {
  auto_reply_enabled: false,
  reply_outside_schedule: true,
  start_time: '09:00',
  end_time: '18:00',
  days_enabled: ['1', '2', '3', '4', '5'],
  training_data: '',
  greeting_message: 'Hola! Gracias por contactarnos 🙌 ¿Qué producto buscas y para qué uso?',
  provider: 'openai',
  ai_model: 'gpt-5-mini',
  max_tokens: 220,
  temperature: 0.7,
};

export default function WhatsAppAIConfig({ onConfigUpdate }) {
  const [rowId, setRowId] = useState(null); // id existente (si hay fila)
  const [config, setConfig] = useState(DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const days = useMemo(
    () => [
      { id: '1', name: 'Lun' },
      { id: '2', name: 'Mar' },
      { id: '3', name: 'Mié' },
      { id: '4', name: 'Jue' },
      { id: '5', name: 'Vie' },
      { id: '6', name: 'Sáb' },
      { id: '7', name: 'Dom' },
    ],
    []
  );

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadConfig() {
    setMessage(null);
    setIsLoading(true);

    try {
      // Tomamos la PRIMERA fila (singleton pattern)
      const { data, error } = await supabase
        .from('whatsapp_ai_config')
        .select('*')
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // no hay fila: usamos defaults
        setRowId(null);
        setConfig(DEFAULTS);
      } else {
        setRowId(data.id ?? null);

        setConfig({
          auto_reply_enabled: data.auto_reply_enabled ?? DEFAULTS.auto_reply_enabled,
          reply_outside_schedule:
            data.reply_outside_schedule ?? DEFAULTS.reply_outside_schedule,
          start_time: data.start_time ?? DEFAULTS.start_time,
          end_time: data.end_time ?? DEFAULTS.end_time,
          days_enabled: Array.isArray(data.days_enabled) ? data.days_enabled : DEFAULTS.days_enabled,
          training_data: data.training_data ?? DEFAULTS.training_data,
          greeting_message: data.greeting_message ?? DEFAULTS.greeting_message,
          provider: data.provider ?? DEFAULTS.provider,
          ai_model: data.ai_model ?? DEFAULTS.ai_model,
          max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : DEFAULTS.max_tokens,
          temperature:
            typeof data.temperature === 'number' ? data.temperature : DEFAULTS.temperature,
        });
      }
    } catch (err) {
      console.error('Error loading config:', err);
      setMessage({ type: 'error', text: 'Error al cargar la configuración (ver consola).' });
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

      let res;
      if (rowId) {
        // ✅ UPDATE (no toca id)
        res = await supabase
          .from('whatsapp_ai_config')
          .update(payload)
          .eq('id', rowId)
          .select()
          .maybeSingle();
      } else {
        // ✅ INSERT (no manda id)
        res = await supabase
          .from('whatsapp_ai_config')
          .insert(payload)
          .select()
          .maybeSingle();
      }

      const { data, error } = res;
      if (error) throw error;

      // Si insertó, guardamos el id
      if (data?.id) setRowId(data.id);

      setMessage({ type: 'success', text: 'Configuración guardada exitosamente ✅' });

      if (onConfigUpdate) onConfigUpdate();
    } catch (err) {
      console.error('Error saving config:', err);
      setMessage({
        type: 'error',
        text:
          'Error al guardar la configuración. Si persiste: revisa que corriste el SQL y luego revisa RLS/policies.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleDayToggle(dayId) {
    const current = Array.isArray(config.days_enabled) ? config.days_enabled : [];
    const next = current.includes(dayId)
      ? current.filter((d) => d !== dayId)
      : [...current, dayId];
    next.sort((a, b) => Number(a) - Number(b));
    setConfig({ ...config, days_enabled: next });
  }

  if (isLoading) {
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
            <p className="text-white/90">Respuestas automáticas con OpenAI (gpt-5-mini)</p>
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
              <h2 className="text-lg font-semibold text-gray-900">Estado de la IA</h2>
              <p className="text-sm text-gray-600">Activar o desactivar respuestas automáticas</p>
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
            <h2 className="text-lg font-semibold text-gray-900">Horario de Atención</h2>
            <p className="text-sm text-gray-600">Define cuándo la IA debe responder</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                checked={config.reply_outside_schedule}
                onChange={(e) =>
                  setConfig({ ...config, reply_outside_schedule: e.target.checked })
                }
                className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Solo responder fuera del horario de atención
              </span>
            </label>
            <p className="text-xs text-gray-500 ml-6">
              Si está marcado, la IA solo responde cuando estás “offline” (fuera del horario/días).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hora de inicio
              </label>
              <input
                type="time"
                value={config.start_time}
                onChange={(e) => setConfig({ ...config, start_time: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hora de término
              </label>
              <input
                type="time"
                value={config.end_time}
                onChange={(e) => setConfig({ ...config, end_time: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Días de atención
            </label>
            <div className="flex gap-2">
              {days.map((d) => (
                <button
                  key={d.id}
                  onClick={() => handleDayToggle(d.id)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    config.days_enabled?.includes(d.id)
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {d.name}
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
              value={config.training_data}
              onChange={(e) => setConfig({ ...config, training_data: e.target.value })}
              rows={10}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              placeholder="Describe tu negocio, despacho, garantías, objeciones, tono, etc."
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
              onChange={(e) => setConfig({ ...config, greeting_message: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Avanzado */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-6 h-6 text-gray-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Configuración Avanzada</h2>
            <p className="text-sm text-gray-600">Proveedor/modelo y ajustes</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Proveedor</label>
            <select
              value={config.provider}
              onChange={(e) => setConfig({ ...config, provider: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="openai">OpenAI</option>
              <option value="claude">Claude (Anthropic)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Modelo</label>
            <select
              value={config.ai_model}
              onChange={(e) => setConfig({ ...config, ai_model: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {config.provider === 'openai' ? (
                <>
                  <option value="gpt-5-mini">GPT-5 mini (Recomendado)</option>
                  <option value="gpt-4.1-mini">GPT-4.1 mini</option>
                </>
              ) : (
                <>
                  <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                  <option value="claude-3-5-haiku">Claude 3.5 Haiku</option>
                </>
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tokens máximos
              </label>
              <input
                type="number"
                value={config.max_tokens}
                onChange={(e) => setConfig({ ...config, max_tokens: Number(e.target.value) })}
                min="80"
                max="800"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Largo máximo de respuesta</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Temperatura ({config.temperature})
              </label>
              <input
                type="range"
                value={config.temperature}
                onChange={(e) =>
                  setConfig({ ...config, temperature: Number(e.target.value) })
                }
                min="0"
                max="1"
                step="0.1"
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-xs text-gray-500 mt-1">Creatividad/variación</p>
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
