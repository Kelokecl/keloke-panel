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
  AlertCircle
} from 'lucide-react';

function safeNumber(n, fallback = 0) {
  return typeof n === 'number' && !Number.isNaN(n) ? n : fallback;
}

function getErrorTextFromPublishResponse(publish_response) {
  try {
    if (!publish_response) return null;
    if (typeof publish_response === 'string') return publish_response.slice(0, 240);
    if (typeof publish_response === 'object') {
      // Normalizamos los errores típicos
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
  // filters: [{ type: 'eq'|'gte'|'lte'|'in'|'neq', col, val }]
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
  // Intenta automations.enabled=true, si no existe la columna, prueba is_active=true
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

async function tryFetchWinningProducts(limit = 3) {
  // Soporta esquemas distintos de winning_products
  // intentamos: order by tiktok_score desc; si falla, order by score desc; si falla, order by created_at desc
  const baseSelect = 'id, product_name, product_title, title, category, suggested_price_clp, suggested_price, price_clp, tiktok_score, score, created_at, status';

  const attempts = [
    { order: { col: 'tiktok_score', ascending: false } },
    { order: { col: 'score', ascending: false } },
    { order: { col: 'created_at', ascending: false } }
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

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalProducts: 0,
    scheduledContent: 0,
    activeAutomations: 0,
    pendingAlerts: 0,
  });

  const [recentAlerts, setRecentAlerts] = useState([]);
  const [winningProducts, setWinningProducts] = useState([]);

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

      // 1) Contadores principales (en paralelo)
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [
        totalProducts,
        scheduledContent,
        activeAutomations,
        pendingAlerts
      ] = await Promise.all([
        // products
        (async () => {
          try {
            return await countTable('products');
          } catch {
            return 0;
          }
        })(),

        // content_calendar scheduled
        (async () => {
          try {
            return await countTable('content_calendar', [{ type: 'eq', col: 'status', val: 'scheduled' }]);
          } catch {
            return 0;
          }
        })(),

        // automations active (enabled o is_active)
        tryCountAutomationsActive(),

        // alertas: fallos recientes en content_calendar
        (async () => {
          try {
            return await countTable('content_calendar', [
              { type: 'eq', col: 'status', val: 'failed' },
              { type: 'gte', col: 'updated_at', val: sevenDaysAgo },
            ]);
          } catch {
            return 0;
          }
        })(),
      ]);

      setStats({
        totalProducts,
        scheduledContent,
        activeAutomations,
        pendingAlerts,
      });

      // 2) Alertas recientes: tomamos los últimos failed (sin depender de tabla alerts)
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

      const normalizedAlerts = failedItems.map((it) => {
        const errText = getErrorTextFromPublishResponse(it.publish_response);
        return {
          id: it.id,
          alert_type: 'critical',
          title: it.title || `Fallo al publicar (${it.platform || 'plataforma'})`,
          message:
            errText ||
            `Falló publicación ${it.content_type || ''} en ${it.platform || ''}. Revisa publish_response.`,
          created_at: it.updated_at || new Date().toISOString(),
        };
      });

      setRecentAlerts(normalizedAlerts);

      // 3) Productos ganadores (si existe la tabla)
      const winners = await tryFetchWinningProducts(3);
      setWinningProducts(winners);

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
    important: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    informational: 'bg-blue-100 text-blue-700 border-blue-200',
    report: 'bg-green-100 text-green-700 border-green-200',
  };

  function go(path) {
    // Evita depender de react-router (si lo tienes, lo cambias por useNavigate)
    window.location.href = path;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 mx-auto"
            style={{ borderTopColor: '#2D5016' }}
          ></div>
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

  const normalizedWinners = (winningProducts || []).map((p) => {
    const name = p.product_name || p.product_title || p.title || 'Producto';
    const category = p.category || 'Sin categoría';
    const price =
      p.suggested_price_clp ??
      p.suggested_price ??
      p.price_clp ??
      null;
    const score = p.tiktok_score ?? p.score ?? null;
    return { ...p, _name: name, _category: category, _price: price, _score: score };
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" style={{ color: '#2D5016' }}>Dashboard General</h1>
        <p className="text-gray-600 mt-1">Resumen completo de tu sistema de automatización</p>
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
              <p className="text-sm text-gray-600">Alertas Pendientes</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#2D5016' }}>{stats.pendingAlerts}</p>
            </div>
            <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F5E6D3' }}>
              <Bell className="w-6 h-6" style={{ color: '#2D5016' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alertas Recientes */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold" style={{ color: '#2D5016' }}>Alertas Recientes</h2>
            <Bell className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-3">
            {recentAlerts.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">No hay alertas recientes</p>
            ) : (
              recentAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border ${alertTypeColors[alert.alert_type] || alertTypeColors.critical}`}
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{alert.title}</p>
                      <p className="text-xs mt-1 opacity-80">{alert.message}</p>
                      <p className="text-xs mt-2 opacity-60">
                        {new Date(alert.created_at).toLocaleString('es-CL')}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Productos Ganadores */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold" style={{ color: '#2D5016' }}>Top Productos Ganadores</h2>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-3">
            {normalizedWinners.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">
                No hay productos ganadores aún (o la tabla winning_products no está configurada).
              </p>
            ) : (
              normalizedWinners.map((product, index) => {
                const score = product._score;
                const scorePct =
                  typeof score === 'number' ? Math.max(0, Math.min(100, (score / 10) * 100)) : 0;

                return (
                  <div
                    key={product.id || index}
                    className="p-4 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#D4A017' }}>
                        <span className="text-white font-bold text-sm">{index + 1}</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{product._name}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                          {product._price != null && (
                            <span className="font-mono" style={{ color: '#2D5016' }}>
                              ${Number(product._price).toLocaleString('es-CL')}
                            </span>
                          )}
                          <span className="px-2 py-1 rounded-full text-xs" style={{ backgroundColor: '#F5E6D3', color: '#2D5016' }}>
                            {product._category}
                          </span>
                        </div>

                        {typeof score === 'number' && (
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                              <div
                                className="h-2 rounded-full"
                                style={{
                                  width: `${scorePct}%`,
                                  backgroundColor: '#D4A017'
                                }}
                              ></div>
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
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold mb-4" style={{ color: '#2D5016' }}>Acciones Rápidas</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            onClick={() => go('/content')}
            className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left"
          >
            <FileText className="w-6 h-6 mb-2" style={{ color: '#2D5016' }} />
            <p className="font-medium text-sm">Generar Contenido</p>
            <p className="text-xs text-gray-500 mt-1">Crear nuevo post</p>
          </button>

          <button
            onClick={() => go('/calendar')}
            className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left"
          >
            <Calendar className="w-6 h-6 mb-2" style={{ color: '#2D5016' }} />
            <p className="font-medium text-sm">Ver Calendario</p>
            <p className="text-xs text-gray-500 mt-1">Programar publicaciones</p>
          </button>

          <button
            onClick={() => go('/analytics')}
            className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left"
          >
            <BarChart3 className="w-6 h-6 mb-2" style={{ color: '#2D5016' }} />
            <p className="font-medium text-sm">Analítica</p>
            <p className="text-xs text-gray-500 mt-1">Ver métricas</p>
          </button>

          <button
            onClick={() => go('/settings')}
            className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left"
          >
            <Settings className="w-6 h-6 mb-2" style={{ color: '#2D5016' }} />
            <p className="font-medium text-sm">Configuración</p>
            <p className="text-xs text-gray-500 mt-1">Ajustar sistema</p>
          </button>
        </div>
      </div>
    </div>
  );
}
