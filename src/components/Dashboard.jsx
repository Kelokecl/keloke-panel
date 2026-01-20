import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  FileText,
  Calendar,
  TrendingUp,
  BarChart3,
  Zap,
  Settings,
  Bell,
  ShoppingBag,
  AlertCircle,
  Sparkles,
  Wrench
} from 'lucide-react';

function safeNumber(n, fallback = 0) {
  return typeof n === 'number' && !Number.isNaN(n) ? n : fallback;
}

function getErrorTextFromPublishResponse(publish_response) {
  try {
    if (!publish_response) return null;
    if (typeof publish_response === 'string') return publish_response.slice(0, 240);
    if (typeof publish_response === 'object') {
      const err =
        publish_response.error ||
        publish_response.message ||
        publish_response.detail ||
        (publish_response.response && JSON.stringify(publish_response.response)) ||
        JSON.stringify(publish_response);
      return String(err).slice(0, 240);
    }
    return String(publish_response).slice(0, 240);
  } catch {
    return null;
  }
}

async function countTable(table, filters = []) {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  for (const f of filters) {
    if (f.type === 'eq') q = q.eq(f.col, f.val);
    if (f.type === 'neq') q = q.neq(f.col, f.val);
    if (f.type === 'gte') q = q.gte(f.col, f.val);
    if (f.type === 'lte') q = q.lte(f.col, f.val);
    if (f.type === 'in') q = q.in(f.col, f.val);
  }
  const res = await q;
  if (res.error) throw res.error;
  return safeNumber(res.count, 0);
}

async function tryCountAutomationsActive() {
  try {
    return await countTable('automations', [{ type: 'eq', col: 'enabled', val: true }]);
  } catch {
    try {
      return await countTable('automations', [{ type: 'eq', col: 'is_active', val: true }]);
    } catch {
      return 0;
    }
  }
}

async function tryFetchWinningProducts(limit = 5) {
  // Si no existe la tabla, devolvemos []
  const baseSelect =
    'id, product_name, product_title, title, category, suggested_price_clp, suggested_price, price_clp, tiktok_score, score, created_at, status, source';

  const attempts = [
    { order: { col: 'tiktok_score', ascending: false } },
    { order: { col: 'score', ascending: false } },
    { order: { col: 'created_at', ascending: false } },
  ];

  for (const a of attempts) {
    try {
      const { data, error } = await supabase
        .from('winning_products')
        .select(baseSelect)
        .eq('status', 'active')
        .order(a.order.col, { ascending: a.order.ascending })
        .limit(limit);

      if (!error) return data || [];
    } catch {
      // sigue intentando
    }
  }
  return [];
}

async function tryFetchAISuggestions(limit = 3) {
  // Opcional: si existe ai_suggestions, mostramos las últimas.
  try {
    const { data, error } = await supabase
      .from('ai_suggestions')
      .select('id, created_at, title, suggestion, priority')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalProducts: 0,
    scheduledContent: 0,
    activeAutomations: 0,
    pendingAlerts: 0,
  });

  const [businessAlerts, setBusinessAlerts] = useState([]);
  const [techErrors, setTechErrors] = useState([]);
  const [winningProducts, setWinningProducts] = useState([]);
  const [aiSuggestions, setAiSuggestions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDashboardData() {
    const timeout = setTimeout(() => {
      setError('La carga está tardando más de lo esperado. Verifica tu conexión.');
      setLoading(false);
    }, 12000);

    try {
      setError(null);

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Contadores
      const [totalProducts, scheduledContent, activeAutomations, pendingAlerts] = await Promise.all([
        (async () => {
          try { return await countTable('products'); } catch { return 0; }
        })(),
        (async () => {
          try {
            return await countTable('content_calendar', [{ type: 'eq', col: 'status', val: 'scheduled' }]);
          } catch {
            return 0;
          }
        })(),
        tryCountAutomationsActive(),
        // ALERTAS PENDIENTES = dashboard_alerts sin leer (negocio)
        (async () => {
          try {
            return await countTable('dashboard_alerts', [{ type: 'eq', col: 'is_read', val: false }]);
          } catch {
            return 0;
          }
        })(),
      ]);

      setStats({ totalProducts, scheduledContent, activeAutomations, pendingAlerts });

      // Alertas de negocio (dashboard_alerts)
      let alerts = [];
      try {
        const { data } = await supabase
          .from('dashboard_alerts')
          .select('id, created_at, alert_type, category, title, message, is_read, source, entity_id')
          .order('created_at', { ascending: false })
          .limit(5);

        alerts = data || [];
      } catch {
        alerts = [];
      }
      setBusinessAlerts(alerts);

      // Errores técnicos (content_calendar failed)
      let failedItems = [];
      try {
        const { data } = await supabase
          .from('content_calendar')
          .select('id, platform, content_type, title, updated_at, publish_response, status')
          .eq('status', 'failed')
          .order('updated_at', { ascending: false })
          .limit(5);

        failedItems = data || [];
      } catch {
        failedItems = [];
      }

      const normalizedTech = failedItems.map((it) => ({
        id: it.id,
        title: it.title || `Fallo (${it.platform || 'plataforma'})`,
        message:
          getErrorTextFromPublishResponse(it.publish_response) ||
          `Falló publicación ${it.content_type || ''} en ${it.platform || ''}.`,
        created_at: it.updated_at || new Date().toISOString(),
        platform: it.platform || null,
      }));

      setTechErrors(normalizedTech);

      // Productos ganadores (si existe)
      const winners = await tryFetchWinningProducts(5);
      setWinningProducts(winners);

      // Sugerencias IA (si existe)
      const suggestions = await tryFetchAISuggestions(3);
      setAiSuggestions(suggestions);

      clearTimeout(timeout);
    } catch (e) {
      console.error('Error loading dashboard:', e);
      setError('Error al cargar el dashboard. Por favor, intenta recargar la página.');
      clearTimeout(timeout);
    } finally {
      setLoading(false);
    }
  }

  const alertTypeColors = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    warning: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    info: 'bg-blue-100 text-blue-700 border-blue-200',
    success: 'bg-green-100 text-green-700 border-green-200',
  };

  function go(path) {
    window.location.href = path;
  }

  const normalizedWinners = (winningProducts || []).map((p) => {
    const name = p.product_name || p.product_title || p.title || 'Producto';
    const category = p.category || 'Chile';
    const price = p.suggested_price_clp ?? p.suggested_price ?? p.price_clp ?? null;
    const score = p.tiktok_score ?? p.score ?? null;
    const source = p.source || 'web';
    return { ...p, _name: name, _category: category, _price: price, _score: score, _source: source };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 mx-auto" style={{ borderTopColor: '#2D5016' }}></div>
          <p className="text-gray-600 mt-4">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md mx-auto p-6">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error al cargar</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              setError(null);
              loadDashboardData();
            }}
            className="px-6 py-2 text-white rounded-lg hover:opacity-90"
            style={{ backgroundColor: '#2D5016' }}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: '#2D5016' }}>Dashboard General</h1>
          <p className="text-gray-600 mt-1">Resumen del sistema (negocio + automatización + control técnico)</p>
        </div>

        <button
          onClick={() => loadDashboardData()}
          className="px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-300 text-sm"
        >
          Actualizar
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Productos Activos</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#2D5016' }}>{stats.totalProducts}</p>
            </div>
            <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F5E6D3' }}>
              <ShoppingBag className="w-6 h-6" style={{ color: '#2D5016' }} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Contenido Programado</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#2D5016' }}>{stats.scheduledContent}</p>
            </div>
            <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F5E6D3' }}>
              <Calendar className="w-6 h-6" style={{ color: '#2D5016' }} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Automatizaciones Activas</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#2D5016' }}>{stats.activeAutomations}</p>
            </div>
            <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F5E6D3' }}>
              <Zap className="w-6 h-6" style={{ color: '#2D5016' }} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Alertas Pendientes (Negocio)</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#2D5016' }}>{stats.pendingAlerts}</p>
            </div>
            <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F5E6D3' }}>
              <Bell className="w-6 h-6" style={{ color: '#2D5016' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Sugerencias IA */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: '#2D5016' }}>
            <Sparkles className="w-5 h-5" style={{ color: '#D4A017' }} />
            Sugerencias IA (Copiloto)
          </h2>
          <button
            onClick={() => go('/ai-manager')}
            className="text-sm underline"
            style={{ color: '#2D5016' }}
          >
            Abrir Auto-Gerente
          </button>
        </div>

        {aiSuggestions.length === 0 ? (
          <p className="text-gray-600 text-sm">
            Aún no hay sugerencias guardadas. En el paso 3 conectamos esto al Auto-Gerente (GPT-5-mini) para que te deje recomendaciones accionables.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {aiSuggestions.map((s) => (
              <div key={s.id} className="border border-gray-100 rounded-lg p-4">
                <p className="text-xs text-gray-500">
                  {new Date(s.created_at).toLocaleString('es-CL')} · prioridad: {s.priority || 'normal'}
                </p>
                <p className="font-semibold mt-1" style={{ color: '#2D5016' }}>{s.title}</p>
                <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{s.suggestion}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alertas de negocio */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold" style={{ color: '#2D5016' }}>Alertas Recientes (Negocio)</h2>
            <Bell className="w-5 h-5 text-gray-400" />
          </div>

          <div className="space-y-3">
            {businessAlerts.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">
                Aún no hay alertas del negocio. (Ventas, mensajes, comentarios, stock, etc.)
              </p>
            ) : (
              businessAlerts.map((a) => (
                <div
                  key={a.id}
                  className={`p-4 rounded-lg border ${alertTypeColors[a.alert_type] || alertTypeColors.info}`}
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{a.title}</p>
                      <p className="text-xs mt-1 opacity-80 whitespace-pre-wrap">{a.message}</p>
                      <p className="text-xs mt-2 opacity-60">
                        {new Date(a.created_at).toLocaleString('es-CL')} · {a.category} · {a.source || 'system'}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Productos ganadores */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold" style={{ color: '#2D5016' }}>Top Productos Ganadores (Chile)</h2>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>

          <div className="space-y-3">
            {normalizedWinners.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">
                Aún no hay productos ganadores (o la tabla winning_products no está alimentada).
              </p>
            ) : (
              normalizedWinners.map((p, idx) => {
                const score = p._score;
                const scorePct =
                  typeof score === 'number' ? Math.max(0, Math.min(100, (score / 10) * 100)) : 0;

                return (
                  <div key={p.id || idx} className="p-4 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#D4A017' }}>
                        <span className="text-white font-bold text-sm">{idx + 1}</span>
                      </div>

                      <div className="flex-1">
                        <p className="font-medium text-sm">{p._name}</p>

                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                          <span className="px-2 py-1 rounded-full text-xs" style={{ backgroundColor: '#F5E6D3', color: '#2D5016' }}>
                            {p._category}
                          </span>
                          <span className="text-xs text-gray-500">
                            fuente: {p._source}
                          </span>
                          {p._price != null && (
                            <span className="font-mono" style={{ color: '#2D5016' }}>
                              ${Number(p._price).toLocaleString('es-CL')}
                            </span>
                          )}
                        </div>

                        {typeof score === 'number' && (
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                              <div className="h-2 rounded-full" style={{ width: `${scorePct}%`, backgroundColor: '#D4A017' }}></div>
                            </div>
                            <span className="text-xs font-medium" style={{ color: '#2D5016' }}>
                              {score}/10
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            <button
              onClick={() => go('/trends')}
              className="w-full mt-2 px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-300 text-sm"
            >
              Ver módulo de Tendencias / Ganadores
            </button>
          </div>
        </div>
      </div>

      {/* Errores técnicos */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: '#2D5016' }}>
            <Wrench className="w-5 h-5 text-gray-400" />
            Errores Técnicos Recientes (Publicación)
          </h2>
          <button onClick={() => go('/logs')} className="text-sm underline" style={{ color: '#2D5016' }}>
            Ver logs
          </button>
        </div>

        {techErrors.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">Sin errores recientes ✅</p>
        ) : (
          <div className="space-y-3">
            {techErrors.map((t) => (
              <div key={t.id} className="p-4 rounded-lg border bg-red-50 text-red-700 border-red-200">
                <p className="text-sm font-semibold">{t.title}</p>
                <p className="text-xs mt-1 opacity-90 whitespace-pre-wrap">{t.message}</p>
                <p className="text-xs mt-2 opacity-70">
                  {new Date(t.created_at).toLocaleString('es-CL')} {t.platform ? `· ${t.platform}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold mb-4" style={{ color: '#2D5016' }}>Acciones Rápidas</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button onClick={() => go('/content')} className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left">
            <FileText className="w-6 h-6 mb-2" style={{ color: '#2D5016' }} />
            <p className="font-medium text-sm">Generar Contenido</p>
            <p className="text-xs text-gray-500 mt-1">Crear nuevo post</p>
          </button>

          <button onClick={() => go('/calendar')} className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left">
            <Calendar className="w-6 h-6 mb-2" style={{ color: '#2D5016' }} />
            <p className="font-medium text-sm">Ver Calendario</p>
            <p className="text-xs text-gray-500 mt-1">Programar publicaciones</p>
          </button>

          <button onClick={() => go('/analytics')} className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left">
            <BarChart3 className="w-6 h-6 mb-2" style={{ color: '#2D5016' }} />
            <p className="font-medium text-sm">Analítica</p>
            <p className="text-xs text-gray-500 mt-1">Ver métricas</p>
          </button>

          <button onClick={() => go('/settings')} className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left">
            <Settings className="w-6 h-6 mb-2" style={{ color: '#2D5016' }} />
            <p className="font-medium text-sm">Configuración</p>
            <p className="text-xs text-gray-500 mt-1">Ajustar sistema</p>
          </button>
        </div>
      </div>
    </div>
  );
}
