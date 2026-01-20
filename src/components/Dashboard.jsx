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
  CheckCircle,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalProducts: 0,
    scheduledContent: 0,
    activeAutomations: 0,
    pendingBusinessAlerts: 0,
  });

  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [businessAlerts, setBusinessAlerts] = useState([]);
  const [techErrors, setTechErrors] = useState([]);
  const [winningProducts, setWinningProducts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tableExists(tableName) {
    // “Prueba barata”: select head true, si falla con relación inexistente, asumimos que no existe
    const { error } = await supabase.from(tableName).select('id', { count: 'exact', head: true }).limit(1);
    if (!error) return true;
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('not exist')) return false;
    // si hay otro error (RLS, permisos), la tabla existe
    return true;
  }

  async function loadDashboardData() {
    const timeout = setTimeout(() => {
      setError('La carga está tardando más de lo esperado. Verifica tu conexión.');
      setLoading(false);
    }, 12000);

    try {
      setError(null);
      setLoading(true);

      const [
        hasBusinessEvents,
        hasAiSuggestions,
        hasWinningProducts,
      ] = await Promise.all([
        tableExists('business_events'),
        tableExists('ai_suggestions'),
        tableExists('winning_products'),
      ]);

      // KPI: Productos
      const productsRes = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true });

      // KPI: Contenido programado (usa content_calendar real)
      const now = new Date();
      const today = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC, pero lo usamos solo como filtro inicial)
      // Contamos “scheduled” (sin ponernos exquisitos con timezone aquí; si quieres lo afinamos con view SQL)
      const scheduledRes = await supabase
        .from('content_calendar')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'scheduled');

      // KPI: Automatizaciones activas (soporta esquema viejo y nuevo)
      // - nuevo: enabled boolean
      // - viejo: is_active boolean
      let activeAutomationsCount = 0;
      const autoEnabled = await supabase
        .from('automations')
        .select('id', { count: 'exact', head: true })
        .eq('enabled', true);

      if (!autoEnabled.error) {
        activeAutomationsCount = autoEnabled.count || 0;
      } else {
        const autoIsActive = await supabase
          .from('automations')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true);
        activeAutomationsCount = autoIsActive.count || 0;
      }

      // KPI: Alertas negocio pendientes
      let pendingBusinessAlerts = 0;
      if (hasBusinessEvents) {
        const businessCountRes = await supabase
          .from('business_events')
          .select('id', { count: 'exact', head: true })
          .eq('is_read', false);

        pendingBusinessAlerts = businessCountRes.count || 0;
      }

      setStats({
        totalProducts: productsRes.count || 0,
        scheduledContent: scheduledRes.count || 0,
        activeAutomations: activeAutomationsCount || 0,
        pendingBusinessAlerts,
      });

      // Secciones (en paralelo)
      const promises = [];

      // Sugerencias IA
      if (hasAiSuggestions) {
        promises.push(
          supabase
            .from('ai_suggestions')
            .select('*')
            .eq('is_done', false)
            .order('created_at', { ascending: false })
            .limit(5)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      // Alertas negocio recientes
      if (hasBusinessEvents) {
        promises.push(
          supabase
            .from('business_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      // Errores técnicos (publicación)
      promises.push(
        supabase
          .from('content_calendar')
          .select('id, platform, content_type, title, scheduled_date, scheduled_time, updated_at, created_at, publish_response, status')
          .in('status', ['failed'])
          .order('updated_at', { ascending: false })
          .limit(5)
      );

      // Top ganadores (si existe tabla)
      if (hasWinningProducts) {
        promises.push(
          supabase
            .from('winning_products')
            .select('*')
            .order('score', { ascending: false })
            .limit(5)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      const [aiSugRes, bizRes, techRes, winnersRes] = await Promise.all(promises);

      setAiSuggestions(aiSugRes.data || []);
      setBusinessAlerts(bizRes.data || []);
      setTechErrors(techRes.data || []);
      setWinningProducts(winnersRes.data || []);

      clearTimeout(timeout);
    } catch (e) {
      console.error('Error loading dashboard:', e);
      setError('Error al cargar el dashboard. Revisa consola y vuelve a intentar.');
      clearTimeout(timeout);
    } finally {
      setLoading(false);
    }
  }

  const suggestionColors = {
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    success: 'bg-green-50 text-green-800 border-green-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    critical: 'bg-red-50 text-red-800 border-red-200',
  };

  const businessColors = {
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    critical: 'bg-red-50 text-red-800 border-red-200',
  };

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
            onClick={loadDashboardData}
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
          onClick={loadDashboardData}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-300 bg-white"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Productos Activos" value={stats.totalProducts} icon={<ShoppingBag className="w-6 h-6" />} />
        <StatCard title="Contenido Programado" value={stats.scheduledContent} icon={<Calendar className="w-6 h-6" />} />
        <StatCard title="Automatizaciones Activas" value={stats.activeAutomations} icon={<Zap className="w-6 h-6" />} />
        <StatCard title="Alertas Pendientes (Negocio)" value={stats.pendingBusinessAlerts} icon={<Bell className="w-6 h-6" />} />
      </div>

      {/* Sugerencias IA */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold" style={{ color: '#2D5016' }}>✨ Sugerencias IA (Copiloto)</h2>
          <button
            onClick={() => navigate('/ai-manager')}
            className="text-sm inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-300"
          >
            Abrir Auto-Gerente
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>

        {aiSuggestions.length === 0 ? (
          <p className="text-gray-500 text-sm">
            Aún no hay sugerencias guardadas. En el paso siguiente conectamos el Auto-Gerente (GPT-5-mini) para que deje recomendaciones accionables.
          </p>
        ) : (
          <div className="space-y-3">
            {aiSuggestions.map((s) => (
              <div key={s.id} className={`p-4 rounded-lg border ${suggestionColors[s.severity] || suggestionColors.info}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm">{s.title}</p>
                    <p className="text-xs opacity-80 mt-1">{new Date(s.created_at).toLocaleString('es-CL')}</p>
                  </div>
                  <button
                    onClick={async () => {
                      await supabase.from('ai_suggestions').update({ is_done: true }).eq('id', s.id);
                      loadDashboardData();
                    }}
                    className="text-xs px-3 py-1 rounded-full border border-current hover:opacity-80"
                  >
                    Marcar done
                  </button>
                </div>

                {s.payload && Object.keys(s.payload).length > 0 && (
                  <pre className="text-xs mt-3 bg-white/50 p-3 rounded overflow-auto">
                    {JSON.stringify(s.payload, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grid 2 cols */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alertas negocio */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold" style={{ color: '#2D5016' }}>Alertas Recientes (Negocio)</h2>
            <Bell className="w-5 h-5 text-gray-400" />
          </div>

          {businessAlerts.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">
              Aún no hay alertas del negocio. (Ventas, mensajes, comentarios, stock, etc.)
            </p>
          ) : (
            <div className="space-y-3">
              {businessAlerts.map((a) => (
                <div key={a.id} className={`p-4 rounded-lg border ${businessColors[a.severity] || businessColors.info}`}>
                  <p className="font-semibold text-sm">{a.title}</p>
                  <p className="text-xs mt-1 opacity-80">{a.event_type} • {a.channel}</p>
                  <p className="text-xs mt-2 opacity-70">{new Date(a.created_at).toLocaleString('es-CL')}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ganadores */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold" style={{ color: '#2D5016' }}>Top Productos Ganadores (Chile)</h2>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>

          {winningProducts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">
                Aún no hay productos ganadores (la tabla <code>winning_products</code> no está alimentada).
              </p>
              <button
                onClick={() => navigate('/trends')}
                className="mt-4 px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-300"
              >
                Ver módulo de Tendencias / Ganadores
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {winningProducts.map((p, idx) => (
                <div key={p.id} className="p-4 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#D4A017' }}>
                      <span className="text-white font-bold text-sm">{idx + 1}</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{p.product_title || p.product_name}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        Score: <b>{Number(p.score ?? 0).toFixed(1)}</b>
                      </p>
                      {p.reason && <p className="text-xs text-gray-600 mt-2">{p.reason}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Errores técnicos */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: '#2D5016' }}>Errores Técnicos Recientes (Publicación)</h2>
          <button
            onClick={() => navigate('/logs')}
            className="text-sm underline text-gray-600 hover:text-gray-800"
          >
            Ver logs
          </button>
        </div>

        {techErrors.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">No hay errores técnicos recientes.</p>
        ) : (
          <div className="space-y-3">
            {techErrors.map((e) => (
              <div key={e.id} className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-800">
                <p className="font-semibold text-sm">
                  {e.title ? `⚠️ ${e.title}` : '⚠️ Error de publicación'}
                </p>
                <p className="text-xs mt-1 opacity-80">
                  {e.platform} • {e.content_type} • {e.scheduled_date} {e.scheduled_time}
                </p>
                <pre className="text-xs mt-3 bg-white/60 p-3 rounded overflow-auto">
                  {JSON.stringify(e.publish_response, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Acciones rápidas */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold mb-4" style={{ color: '#2D5016' }}>Acciones Rápidas</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickAction onClick={() => navigate('/content')} icon={<FileText className="w-6 h-6" style={{ color: '#2D5016' }} />} title="Generar Contenido" subtitle="Crear nuevo post" />
          <QuickAction onClick={() => navigate('/calendar')} icon={<Calendar className="w-6 h-6" style={{ color: '#2D5016' }} />} title="Ver Calendario" subtitle="Programar publicaciones" />
          <QuickAction onClick={() => navigate('/analytics')} icon={<BarChart3 className="w-6 h-6" style={{ color: '#2D5016' }} />} title="Analítica" subtitle="Ver métricas" />
          <QuickAction onClick={() => navigate('/settings')} icon={<Settings className="w-6 h-6" style={{ color: '#2D5016' }} />} title="Configuración" subtitle="Ajustar sistema" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-3xl font-bold mt-2" style={{ color: '#2D5016' }}>{value}</p>
        </div>
        <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F5E6D3', color: '#2D5016' }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function QuickAction({ onClick, icon, title, subtitle }) {
  return (
    <button onClick={onClick} className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left">
      {icon}
      <p className="font-medium text-sm">{title}</p>
      <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
    </button>
  );
}
