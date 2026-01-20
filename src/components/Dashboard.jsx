import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  Calendar,
  TrendingUp,
  BarChart3,
  Zap,
  Settings,
  Bell,
  ShoppingBag,
  AlertCircle,
  Bot,
  Sparkles,
  ExternalLink,
  FileWarning,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalProducts: 0,
    scheduledContent: 0,
    activeAutomations: 0,
    pendingBusinessAlerts: 0,
  });

  const [recentBusinessAlerts, setRecentBusinessAlerts] = useState([]);
  const [winningProducts, setWinningProducts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDashboardData() {
    const timeout = setTimeout(() => {
      setError("La carga está tardando más de lo esperado. Verifica tu conexión.");
      setLoading(false);
    }, 12000);

    try {
      setLoading(true);
      setError(null);

      // 1) Stats en paralelo
      const [productsRes, scheduledRes, automationsRes, businessAlertsRes] =
        await Promise.all([
          supabase.from("products").select("id", { count: "exact", head: true }),
          supabase
            .from("content_calendar")
            .select("id", { count: "exact", head: true })
            .eq("status", "scheduled"),
          supabase
            .from("automations")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true),
          supabase
            .from("business_events")
            .select("id", { count: "exact", head: true })
            .eq("is_read", false),
        ]);

      setStats({
        totalProducts: productsRes.count || 0,
        scheduledContent: scheduledRes.count || 0,
        activeAutomations: automationsRes.count || 0,
        pendingBusinessAlerts: businessAlertsRes.count || 0,
      });

      // 2) Paneles del dashboard
      const [alertsResult, productsResult, suggestionsResult] = await Promise.all([
        supabase
          .from("business_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("winning_products")
          .select("*")
          .eq("status", "active")
          .order("score", { ascending: false })
          .limit(5),
        supabase
          .from("ai_suggestions")
          .select("*")
          .eq("is_done", false)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);

      setRecentBusinessAlerts(alertsResult.data || []);
      setWinningProducts(productsResult.data || []);
      setSuggestions(suggestionsResult.data || []);

      clearTimeout(timeout);
    } catch (e) {
      console.error("Error loading dashboard:", e);
      setError("Error al cargar el dashboard. Recarga o revisa permisos/RLS en Supabase.");
      clearTimeout(timeout);
    } finally {
      setLoading(false);
    }
  }

  const severityColors = {
    critical: "bg-red-50 text-red-700 border-red-200",
    warning: "bg-yellow-50 text-yellow-700 border-yellow-200",
    info: "bg-blue-50 text-blue-700 border-blue-200",
    success: "bg-green-50 text-green-700 border-green-200",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 mx-auto"
            style={{ borderTopColor: "#2D5016" }}
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
            onClick={loadDashboardData}
            className="px-6 py-2 text-white rounded-lg hover:opacity-90"
            style={{ backgroundColor: "#2D5016" }}
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
          <h1 className="text-3xl font-bold" style={{ color: "#2D5016" }}>
            Dashboard General
          </h1>
          <p className="text-gray-600 mt-1">
            Resumen del sistema (negocio + automatización + control técnico)
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={loadDashboardData}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm"
          >
            Actualizar
          </button>
          <button
            onClick={() => navigate("/logs")}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm flex items-center gap-2"
          >
            <FileWarning className="w-4 h-4" />
            Ver logs
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Productos Activos" value={stats.totalProducts} icon={ShoppingBag} />
        <StatCard title="Contenido Programado" value={stats.scheduledContent} icon={Calendar} />
        <StatCard title="Automatizaciones Activas" value={stats.activeAutomations} icon={Zap} />
        <StatCard title="Alertas Pendientes (Negocio)" value={stats.pendingBusinessAlerts} icon={Bell} />
      </div>

      {/* Sugerencias IA */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" style={{ color: "#D4A017" }} />
            <h2 className="text-xl font-bold" style={{ color: "#2D5016" }}>
              Sugerencias IA (Copiloto)
            </h2>
          </div>

          <button
            onClick={() => navigate("/ai-manager")}
            className="px-4 py-2 rounded-lg text-sm text-white flex items-center gap-2 hover:opacity-90"
            style={{ backgroundColor: "#2D5016" }}
          >
            Abrir Auto-Gerente <ExternalLink className="w-4 h-4" />
          </button>
        </div>

        {suggestions.length === 0 ? (
          <p className="text-gray-600 text-sm">
            Aún no hay sugerencias guardadas. En el paso siguiente conectamos el Auto-Gerente (GPT-5-mini) para que deje recomendaciones accionables.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {suggestions.map((s) => (
              <div key={s.id} className="p-4 rounded-lg border border-gray-100 bg-gray-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: "#2D5016" }}>
                      {s.title || "Sugerencia"}
                    </p>
                    <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                      {s.suggestion}
                    </p>
                  </div>
                  <span
                    className="text-xs px-2 py-1 rounded-full"
                    style={{ backgroundColor: "#F5E6D3", color: "#2D5016" }}
                  >
                    {s.priority || "medium"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Negocio + Ganadores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alertas negocio */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold" style={{ color: "#2D5016" }}>
              Alertas Recientes (Negocio)
            </h2>
            <Bell className="w-5 h-5 text-gray-400" />
          </div>

          {recentBusinessAlerts.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">
              Aún no hay alertas del negocio. (Ventas, mensajes, comentarios, stock, etc.)
            </p>
          ) : (
            <div className="space-y-3">
              {recentBusinessAlerts.map((a) => (
                <div
                  key={a.id}
                  className={`p-4 rounded-lg border ${severityColors[a.severity] || severityColors.info}`}
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{a.title || a.event_type}</p>
                      <p className="text-xs mt-1 opacity-90">{a.message}</p>
                      <p className="text-xs mt-2 opacity-70">
                        {new Date(a.created_at).toLocaleString("es-CL")}
                        {a.platform ? ` · ${a.platform}` : ""}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Productos ganadores */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold" style={{ color: "#2D5016" }}>
              Top Productos Ganadores (Chile)
            </h2>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>

          {winningProducts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm mb-3">
                Aún no hay productos ganadores (la tabla winning_products no está alimentada).
              </p>
              <button
                onClick={() => navigate("/trends")}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm"
              >
                Ver módulo de Tendencias / Ganadores
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {winningProducts.map((p, idx) => (
                <div key={p.id} className="p-4 rounded-lg border border-gray-100">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: "#D4A017" }}
                    >
                      <span className="text-white font-bold text-sm">{idx + 1}</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{p.product_name}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                        {p.suggested_price_clp ? (
                          <span className="font-mono" style={{ color: "#2D5016" }}>
                            ${Number(p.suggested_price_clp).toLocaleString("es-CL")}
                          </span>
                        ) : null}
                        {p.category ? (
                          <span
                            className="px-2 py-1 rounded-full text-xs"
                            style={{ backgroundColor: "#F5E6D3", color: "#2D5016" }}
                          >
                            {p.category}
                          </span>
                        ) : null}
                        <span className="text-gray-500">Score: {Number(p.score || 0).toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={() => navigate("/trends")}
                className="w-full mt-2 px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm"
              >
                Abrir Tendencias / Escáner
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold mb-4" style={{ color: "#2D5016" }}>
          Acciones Rápidas
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickAction onClick={() => navigate("/content")} icon={Bot} title="Generar Contenido" subtitle="Crear nuevo post" />
          <QuickAction onClick={() => navigate("/calendar")} icon={Calendar} title="Ver Calendario" subtitle="Programar publicaciones" />
          <QuickAction onClick={() => navigate("/analytics")} icon={BarChart3} title="Analítica" subtitle="Ver métricas" />
          <QuickAction onClick={() => navigate("/settings")} icon={Settings} title="Configuración" subtitle="Ajustar sistema" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon }) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-3xl font-bold mt-2" style={{ color: "#2D5016" }}>
            {value}
          </p>
        </div>
        <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#F5E6D3" }}>
          <Icon className="w-6 h-6" style={{ color: "#2D5016" }} />
        </div>
      </div>
    </div>
  );
}

function QuickAction({ onClick, icon: Icon, title, subtitle }) {
  return (
    <button
      onClick={onClick}
      className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left bg-white"
    >
      <Icon className="w-6 h-6 mb-2" style={{ color: "#2D5016" }} />
      <p className="font-medium text-sm">{title}</p>
      <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
    </button>
  );
}
