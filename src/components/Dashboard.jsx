import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();

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

  const alertTypeColors = useMemo(() => ({
    critical: 'bg-red-100 text-red-700 border-red-200',
    important: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    informational: 'bg-blue-100 text-blue-700 border-blue-200',
    report: 'bg-green-100 text-green-700 border-green-200',
  }), []);

  useEffect(() => {
    loadDashboardData();
    // refresh event (por si calendar / autogerente dispara refresh)
    const handler = () => loadDashboardData();
    window.addEventListener('dashboard:refresh', handler);
    return () => window.removeEventListener('dashboard:refresh', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function safeCount(queryPromise) {
    try {
      const res = await queryPromise;
      if (res?.error) return 0;
      return res?.count || 0;
    } catch {
      return 0;
    }
  }

  async function safeSelect(queryPromise, fallback = []) {
    try {
      const res = await queryPromise;
      if (res?.error) return fallback;
      return res?.data || fallback;
    } catch {
      return fallback;
    }
  }

  async function loadDashboardData() {
    setLoading(true);
    setError(null);

    const timeout = setTimeout(() => {
      setError('La carga está tardando más de lo esperado. Verifica tu conexión.');
      setLoading(false);
    }, 12000);

    try {
      /**
       * 1) STATS
       * - Productos: tabla products (si existe)
       * - Contenido programado: content_calendar status='scheduled'
       * - Automatizaciones: tabla automations enabled=true (fallback: is_active=true)
       * - Alertas: tabla alerts is_read=false (si existe)
       */
      const totalProductsP = safeCount(
        supabase.from('products').select('id', { count: 'exact', head: true })
      );

      // content_calendar es la tabla REAL que estás usando (confirmado por tus capturas)
      const scheduledContentP = safeCount(
        supabase
          .from('content_calendar')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'scheduled')
      );

      // automations: primero intentamos enabled=true, si falla, is_active=true
      const activeAutomationsP = (async () => {
        const c1 = await safeCount(
          supabase.from('automations').select('id', { count: 'exact', head: true }).eq('enabled', true)
        );
        if (c1 > 0) return c1;

        // Si la tabla existe pero la columna era is_active
        const c2 = await safeCount(
          supabase.from('automations').select('id', { count: 'exact', head: true }).eq('is_active', true)
        );
        return c2;
      })();

      const pendingAlertsP = safeCount(
        supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('is_read', false)
      );

      const [totalProducts, scheduledContent, activeAutomations, pendingAlerts] = await Promise.all([
        totalProductsP,
        scheduledContentP,
        activeAutomationsP,
        pendingAlertsP,
      ]);

      setStats({
        totalProducts,
        scheduledContent,
        activeAutomations,
        pendingAlerts,
      });

      /**
       * 2) LISTAS
       * - Alertas recientes (si existe)
       * - Top ganadores (si existe winning_products)
       *
       * OJO: tu winning_products en este Dashboard espera:
       *   product_name, suggested_price_clp, category, tiktok_score
       * Si tu tabla se llama distinto o columnas distintas, igual no rompe (solo muestra vacío).
       */
      const alertsListP = safeSelect(
        supabase
          .from('alerts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5),
        []
      );

      // Ganadores: intentamos status='active' y orden tiktok_score desc
      const winnersP = safeSelect(
        supabase
          .from('winning_products')
          .select('*')
          .eq('status', 'active')
          .order('tiktok_score', { ascending: false })
          .limit(3),
        []
      );

      const [alertsList, winnersList] = await Promise.all([alertsListP, winnersP]);

      setRecentAlerts(alertsList);
      setWinningProducts(winnersList);

      clearTimeout(timeout);
    } catch (e) {
      console.error('Error loading dashboard:', e);
      setError('Error al cargar el dashboard. Por favor, intenta recargar la página.');
      clearTimeout(timeout);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 mx-auto"
            style={{ borderTopColor: '#2D5016' }}
          />
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
            onClick={() => loadDashboardData()}
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
      <div>
        <h1 className="text-3xl font-bold" style={{ color: '#2D5016' }}>Dashboard General</h1>
        <p className="text-gray-600 mt-1">Resumen completo de tu sistema de automatización</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Productos Activos"
          value={stats.totalProducts}
          icon={<ShoppingBag className="w-6 h-6" style={{ color: '#2D5016' }} />}
        />
        <StatCard
          label="Contenido Programado"
          value={stats.scheduledContent}
          icon={<Calendar className="w-6 h-6" style={{ color: '#2D5016' }} />}
        />
        <StatCard
          label="Automatizaciones Activas"
          value={stats.activeAutomations}
          icon={<Zap className="w-6 h-6" style={{ color: '#2D5016' }} />}
        />
        <StatCard
          label="Alertas Pendientes"
          value={stats.pendingAlerts}
          icon={<Bell className="w-6 h-6" style={{ color: '#2D5016' }} />}
        />
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
                  className={`p-4 rounded-lg border ${alertTypeColors[alert.alert_type] || 'bg-gray-50 text-gray-700 border-gray-200'}`}
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{alert.title || 'Alerta'}</p>
                      <p className="text-xs mt-1 opacity-80">{alert.message || ''}</p>
                      {alert.created_at && (
                        <p className="text-xs mt-2 opacity-60">
                          {new Date(alert.created_at).toLocaleString('es-CL')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4">
            <button
              onClick={() => navigate('/analitica')}
              className="text-sm font-medium hover:opacity-80"
              style={{ color: '#2D5016' }}
            >
              Ver analítica →
            </button>
          </div>
        </div>

        {/* Productos Ganadores */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold" style={{ color: '#2D5016' }}>Top Productos Ganadores</h2>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>

          <div className="space-y-3">
            {winningProducts.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">No hay productos ganadores aún</p>
            ) : (
              winningProducts.map((product, index) => {
                const score = Number(product.tiktok_score ?? 0);
                const safeScore = Number.isFinite(score) ? score : 0;
                const pct = Math.max(0, Math.min(100, (safeScore / 10) * 100));

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
                        <p className="font-medium text-sm">{product.product_name || product.product_title || 'Producto'}</p>

                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                          {product.suggested_price_clp != null && (
                            <span className="font-mono" style={{ color: '#2D5016' }}>
                              ${Number(product.suggested_price_clp).toLocaleString('es-CL')}
                            </span>
                          )}

                          {product.category && (
                            <span className="px-2 py-1 rounded-full text-xs" style={{ backgroundColor: '#F5E6D3', color: '#2D5016' }}>
                              {product.category}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div
                              className="h-2 rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: '#D4A017' }}
                            />
                          </div>
                          <span className="text-xs font-medium" style={{ color: '#2D5016' }}>
                            {safeScore}/10
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4">
            <button
              onClick={() => navigate('/tendencias')}
              className="text-sm font-medium hover:opacity-80"
              style={{ color: '#2D5016' }}
            >
              Ver tendencias →
            </button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold mb-4" style={{ color: '#2D5016' }}>Acciones Rápidas</h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickAction
            icon={<FileText className="w-6 h-6 mb-2" style={{ color: '#2D5016' }} />}
            title="Generar Contenido"
            desc="Crear nuevo post"
            onClick={() => navigate('/content')}
          />
          <QuickAction
            icon={<Calendar className="w-6 h-6 mb-2" style={{ color: '#2D5016' }} />}
            title="Ver Calendario"
            desc="Programar publicaciones"
            onClick={() => navigate('/calendar')}
          />
          <QuickAction
            icon={<BarChart3 className="w-6 h-6 mb-2" style={{ color: '#2D5016' }} />}
            title="Analítica"
            desc="Ver métricas"
            onClick={() => navigate('/analitica')}
          />
          <QuickAction
            icon={<Settings className="w-6 h-6 mb-2" style={{ color: '#2D5016' }} />}
            title="Configuración"
            desc="Ajustar sistema"
            onClick={() => navigate('/configuracion')}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{label}</p>
          <p className="text-3xl font-bold mt-2" style={{ color: '#2D5016' }}>
            {value}
          </p>
        </div>
        <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F5E6D3' }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon, title, desc, onClick }) {
  return (
    <button
      onClick={onClick}
      className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left"
      type="button"
    >
      {icon}
      <p className="font-medium text-sm">{title}</p>
      <p className="text-xs text-gray-500 mt-1">{desc}</p>
    </button>
  );
}
