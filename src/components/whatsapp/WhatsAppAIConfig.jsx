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

const DEFAULTS = {
  is_enabled: false,
  auto_reply_when_offline: true,
  training_context: '',
  greeting_message: 'Hola! Gracias por contactarnos 👋 ¿Qué producto buscas y para qué uso?',
  business_hours_start: '09:00',
  business_hours_end: '18:00',
  working_days: [1, 2, 3, 4, 5],
  ai_provider: 'openai',
  ai_model: 'gpt-5-mini',
  max_tokens: 220,
  temperature: 0.7,
};

export default function WhatsAppAIConfig({ onConfigUpdate }) {
  const [config, setConfig] = useState(null);
  const [rowId, setRowId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadConfig() {
    try {
      setIsLoading(true);
      setMessage(null);

      // Traer la primera fila (modo singleton)
      const { data, error } = await supabase
        .from('whatsapp_ai_config')
        .select('*')
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setConfig({ ...DEFAULTS });
        setRowId(null);
        return;
      }

      // Normalizaciones por si viene days_enabled (text[]) o working_days (int[])
      const workingDaysFromDb = Array.isArray(data.working_days)
        ? data.working_days
        : Array.isArray(data.days_enabled)
        ? data.days_enabled.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n))
        : DEFAULTS.working_days;

      setRowId(data.id ?? null);

      setConfig({
        ...DEFAULTS,
        // nuevas
        is_enabled: data.is_enabled ?? data.auto_reply_enabled ?? DEFAULTS.is_enabled,
        auto_reply_when_offline: data.auto_reply_when_offline ?? data.reply_outside_schedule ?? DEFAULTS.auto_reply_when_offline,
        training_context: data.training_context ?? data.training_data ?? DEFAULTS.training_context,
        greeting_message: data.greeting_message ?? DEFAULTS.greeting_message,
        business_hours_start: data.business_hours_start ?? data.start_time ?? DEFAULTS.business_hours_start,
        business_hours_end: data.business_hours_end ?? data.end_time ?? DEFAULTS.business_hours_end,
        working_days: workingDaysFromDb.length ? workingDaysFromDb : DEFAULTS.working_days,

        ai_provider: data.ai_provider ?? DEFAULTS.ai_provider,
        ai_model: data.ai_model ?? DEFAULTS.ai_model,
        max_tokens: data.max_tokens ?? DEFAULTS.max_tokens,
        temperature: typeof data.temperature === 'number' ? data.temperature : DEFAULTS.temperature,
      });
    } catch (err) {
      console.error('Error loading config:', err);
      setMessage({ type: 'error', text: 'Error al cargar la configuración (revisa consola).' });
      setConfig({ ...DEFAULTS });
      setRowId(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveConfig() {
    if (!config) return;

    setIsSaving(true);
    setMessage(null);

    try {
      const payload = {
        ...config,
        updated_at: new Date().toISOString(),
      };

      // Si ya existe fila, hacemos update por id
      if (rowId) {
        const { error } = await supabase
          .from('whatsapp_ai_config')
          .update(payload)
          .eq('id', rowId);

        if (error) throw error;
      } else {
        // Si no existe, insert (SIN id)
        const { data, error } = await supabase
          .from('whatsapp_ai_config')
          .insert(payload)
          .select('id')
          .maybeSingle();

        if (error) throw error;
        setRowId(data?.id ?? null);
      }

      setMessage({ type: 'success', text: 'Configuración guardada ✅' });

      if (onConfigUpdate) onConfigUpdate();
    } catch (err) {
      console.error('Error saving config:', err);
      setMessage({
        type: 'error',
        text:
          'Error al guardar. Si persiste: revisa que existan las columnas en whatsapp_ai_config y/o políticas RLS.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleDayToggle(day) {
    const exists = config.working_days?.includes(day);
    const newWorkingDays = exists
      ? config.working_days.filter((d) => d !== day)
      : [...(config.working_days || []), day];

    setConfig({ ...config, working_days: newWorkingDays.sort((a, b) => a - b) });
  }

  if (isLoading || !config) {
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
    { id: 7, name: 'Dom' },
  ];

  const isDaySelected = (d) => (config.working_days || []).includes(d);

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
              Respuestas automáticas con {config.ai_provider === 'openai' ? 'OpenAI' : 'Claude'}
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
              <h2 className="text-lg font-semibold text-gray-900">Estado de la IA</h2>
              <p className="text-sm text-gray-600">Activar o desactivar respuestas automáticas</p>
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
              ? '✅ La IA responderá automáticamente según tus reglas'
              : '⏸️ La IA está pausada — no responderá'}
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
                onChange={(e) => setConfig({ ...config, business_hours_start: e.target.value })}
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
                onChange={(e) => setConfig({ ...config, business_hours_end: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Días de atención</label>
            <div className="flex gap-2">
              {days.map((day) => (
                <button
                  key={day.id}
                  onClick={() => handleDayToggle(day.id)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    isDaySelected(day.id)
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
              value={config.training_context}
              onChange={(e) => setConfig({ ...config, training_context: e.target.value })}
              rows={10}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              placeholder={`Ejemplo:
- Somos Keloke.cl (Chile). Vendemos gadgets/hogar.
- Envíos: RM 24-72h, regiones 2-5 días.
- Preguntas clave: presupuesto, comuna, uso.
- Estilo: chileno, directo, breve.
- Cierra con CTA (link / “te mando opciones”).`}
            />
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
            <p className="text-sm text-gray-600">Proveedor, modelo y ajuste del motor</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Proveedor</label>
              <select
                value={config.ai_provider}
                onChange={(e) => setConfig({ ...config, ai_provider: e.target.value })}
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
                {config.ai_provider === 'openai' ? (
                  <>
                    <option value="gpt-5-mini">GPT-5 mini (Recomendado)</option>
                    <option value="gpt-4o-mini">GPT-4o mini (alternativa)</option>
                  </>
                ) : (
                  <>
                    <option value="claude-3-5-sonnet-20240620">Claude 3.5 Sonnet</option>
                    <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tokens máximos</label>
              <input
                type="number"
                value={config.max_tokens}
                onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value || '220', 10) })}
                min="80"
                max="1000"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Para ventas: 180–260 recomendado</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Temperatura ({config.temperature})
              </label>
              <input
                type="range"
                value={config.temperature}
                onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                min="0"
                max="1"
                step="0.1"
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-xs text-gray-500 mt-1">0.4–0.7 suele vender mejor</p>
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

      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-purple-900 mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Nota importante
        </h3>
        <p className="text-sm text-purple-800">
          Esto guarda la config en <b>whatsapp_ai_config</b>. El webhook (Edge Function) debe leer esta tabla
          para decidir si responde y con qué modelo (OpenAI/Claude).
        </p>
      </div>
    </div>
  );
}
