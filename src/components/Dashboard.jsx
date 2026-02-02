// src/components/Dashboard.jsx
import React, { useEffect, useState } from "react";
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
  ExternalLink,
  Wrench,
  Sparkles,
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

  const [suggestions, setSuggestions] = useState([]);
  const [businessAlerts, setBusinessAlerts] = useState([]);
  const [winningProducts, setWinningProducts] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Para evitar doble click / spam
  const [markingAll, setMarkingAll] = useState(false);
  const [markingOneId, setMarkingOneId] = useState(null);

  useEffect(() => {
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === RPC helpers (C1) ===
  async function markAllAlertsRead() {
    setMarkingAll(true);
    try {
      const { error: rpcError } = await supabase.rpc("mark_dashboard_alerts_read", {});
      if (rpcError) throw rpcError;

      await loadDashboardData();
    } catch (e) {
      console.error("markAllAlertsRead error:", e);
      setError("No se pudieron marcar las alertas como leídas. Reintenta.");
    } finally {
      setMarkingAll(false);
    }
  }

  async function markOneAlertRead(alertId) {
    setMarkingOneId(alertId);
    try {
      const { error: rpcError } = await supabase.rpc("mark_dashboard_alerts_read", {
        p_ids: [alertId],
      });
      if (rpcError) throw rpcError;

      await loadDashboardData();
    } catch (e) {
      console.error("markOneAlertRead error:", e);
      setError("No se pudo marcar la alerta como leída. Reintenta.");
    } finally {
      setMarkingOneId(null);
    }
  }

  async function loadDashboardData() {
    const timeout = setTimeout(() => {
      setError("La carga está tardando más de lo esperado. Verifica tu conexión.");
      setLoading(false);
    }, 12000);

    try {
      setError(null);
      setLoading(true);

      // ====== STATS ======
      // OJO: ahora las “alertas pendientes” vienen desde dashboard_alerts (no business_events)
      const [productsRes, contentRes, automationsRes, pendingAlertsRes] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase
          .from("generated_content")
          .select("id", { count: "exact", head: true })
          .eq("status", "scheduled"),
        supabase
          .from("automations")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true),
        supabase
          .from("dashboard_alerts")
          .select("id", { count: "exact", head: true })
          .eq("is_read", false)
          .eq("category", "business"),
      ]);

      setStats({
        totalProducts: productsRes.count || 0,
        scheduledContent: contentRes.count || 0,
        activeAutomations: automationsRes.count || 0,
        pendingBusinessAlerts: pendingAlertsRes.count || 0,
      });

      // ====== FEEDS ======
      // - Alertas de negocio: ahora vienen desde dashboard_alerts
      // - Mostramos las más recientes NO leídas (mejor UX), si no hay, muestra últimas 5 igual
      // - Ganadores: ahora vienen del detector (v_winner_products_ui)
      const [suggRes, alertsUnreadRes, alertsFallbackRes, winnersRes, logsRes] = await Promise.all([
        supabase
          .from("ai_suggestions")
          .select("*")
          .eq("is_done", false)
          .order("created_at", { ascending: false })
          .limit(5),

        supabase
          .from("dashboard_alerts")
          .select("*")
          .eq("category", "business")
          .eq("is_read", false)
          .order("created_at", { ascending: false })
          .limit(5),

        supabase
          .from("dashboard_alerts")
          .select("*")
          .eq("category", "business")
          .order("created_at", { ascending: false })
          .limit(5),

        // ✅ Detector real: 1 ganador por familia (vista UI-ready)
        supabase
          .from("v_winner_products_ui")
          .select("product_family, keloke_category, title, adjusted_winner_score, ml_ratio, url, day")
          .order("adjusted_winner_score", { ascending: false })
          .limit(5),

        supabase
          .from("system_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(3),
      ]);

      setSuggestions(suggRes.data || []);

      const unread = alertsUnreadRes.data || [];
      const fallback = alertsFallbackRes.data || [];
      setBusinessAlerts(unread.length > 0 ? unread : fallback);

      setWinningProducts(winnersRes.data || []);
      setSystemLogs(logsRes.data || []);

      clearTimeout(timeout);
    } catch (e) {
      console.error("Dashboard load error:", e);
      setError("Error al cargar el dashboard. Por favor, intenta recargar la página.");
      clearTimeout(timeout);
    } finally {
      setLoading(false);
    }
  }

  // Etiquetas bonitas por source/type
  function formatAlertTitle(a) {
    const type = a?.type || "event";
    const source = a?.source || "system";

    // Si ya viene un título, úsalo
    if (a?.title) return a.title;

    // Fallback por tipo
    if (type === "sale") return "Venta nueva";
    if (type === "message" && source === "whatsapp") return "Nuevo mensaje WhatsApp";
    if (type === "message" && source === "instagram") return "Nuevo mensaje Instagram";
    if (type === "comment" && source === "instagram") return "Nuevo comentario";
    if (type === "product") return "Productos actualizados (día)";
    return "Evento";
  }

  function formatAlertMessage(a) {
    return a?.message || "";
  }

  function formatDateCL(d) {
    try {
      return d ? new Date(d).toLocaleDateString("es-CL") : "";
    } catch {
      return "";
    }
  }

  function formatPercent(n) {
    const v = Number(n);
    if (Number.isNaN(v)) return "0%";
    return `${Math.round(v * 100)}%`;
  }

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
            onClick={() => loadDashboardData()}
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

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadDashboardData()}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-sm"
          >
            Actualizar
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-sm flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
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

      {/* Suggestions */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: "#2D5016" }}>
            <Sparkles className="w-5 h-5" style={{ color: "#D4A017" }} />
            Sugerencias IA (Copiloto)
          </h2>
          <button
            onClick={() => navigate("/ai-manager")}
            className="px-3 py-2 rounded-lg text-white text-sm flex items-center gap-2"
            style={{ backgroundColor: "#2D5016" }}
          >
            Abrir Auto-Gerente <ExternalLink className="w-4 h-4" />
          </button>
        </div>

        {suggestions.length === 0 ? (
          <p className="text-gray-600 text-sm">
            Aún no hay sugerencias guardadas. Entra al Auto-Gerente y presiona “Generar sugerencias”.
          </p>
        ) : (
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div key={s.id} className="p-3 rounded-lg border border-gray-100 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-sm" style={{ color: "#2D5016" }}>
                    {s.title}
                  </p>
                  {s.detail && <p className="text-xs text-gray-600 mt-1">{s.detail}</p>}
                </div>
                <span
                  className="text-xs px-2 py-1 rounded-full border"
                  style={{
                    backgroundColor: "#F5E6D3",
                    color: "#2D5016",
                    borderColor: "#E6D6C3",
                  }}
                >
                  {s.priority || "medium"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alerts + Winners */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Business Alerts */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold" style={{ color: "#2D5016" }}>
              Alertas Recientes (Negocio)
            </h2>

            <div className="flex items-center gap-2">
              {/* C1: Marcar todo leído */}
              <button
                onClick={() => markAllAlertsRead()}
                disabled={markingAll || stats.pendingBusinessAlerts === 0}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-sm"
                title="Marcar todas las alertas como leídas"
              >
                {markingAll ? "Marcando..." : "Marcar todo leído"}
              </button>

              <Bell className="w-5 h-5 text-gray-400" />
            </div>
          </div>

          {businessAlerts.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">
              Aún no hay alertas del negocio (ventas, mensajes, comentarios, stock, etc.)
            </p>
          ) : (
            <div className="space-y-3">
              {businessAlerts.map((a) => (
                <div key={a.id} className="p-4 rounded-lg border border-gray-100 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "#2D5016" }}>
                      {formatAlertTitle(a)}
                    </p>

                    {formatAlertMessage(a) ? (
                      <p className="text-xs text-gray-600 mt-1 break-words">{formatAlertMessage(a)}</p>
                    ) : null}

                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full border"
                        style={{ backgroundColor: "#F5E6D3", color: "#2D5016", borderColor: "#E6D6C3" }}
                        title="Fuente / tipo"
                      >
                        {a.source || "system"} • {a.type || "event"}
                      </span>

                      <p className="text-xs text-gray-500">
                        {a.created_at ? new Date(a.created_at).toLocaleString("es-CL") : ""}
                      </p>
                    </div>
                  </div>

                  {/* Marcar 1 leído */}
                  {!a.is_read ? (
                    <button
                      onClick={() => markOneAlertRead(a.id)}
                      disabled={markingOneId === a.id}
                      className="shrink-0 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-sm"
                      title="Marcar como leído"
                    >
                      {markingOneId === a.id ? "..." : "✓"}
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs text-gray-400 px-2 py-2">Leído</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Winners */}
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
                Aún no hay productos ganadores desde el detector (o faltan permisos para leer la vista).
              </p>
              <button
                onClick={() => navigate("/trends")}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-sm"
              >
                Ver módulo de Tendencias / Ganadores
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {winningProducts.map((p, idx) => (
                <div key={`${p.product_family}-${p.url || idx}`} className="p-4 rounded-lg border border-gray-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm break-words">
                        {idx + 1}. {p.title}
                      </p>

                      <div className="flex items-center flex-wrap gap-2 mt-2 text-xs text-gray-600">
                        {p.keloke_category && (
                          <span
                            className="px-2 py-1 rounded-full"
                            style={{ backgroundColor: "#F5E6D3", color: "#2D5016" }}
                            title="Categoría Keloke"
                          >
                            {p.keloke_category}
                          </span>
                        )}

                        {p.product_family && (
                          <span
                            className="px-2 py-1 rounded-full border"
                            style={{ borderColor: "#E6D6C3", color: "#2D5016" }}
                            title="Familia (anti-canibalización)"
                          >
                            {p.product_family}
                          </span>
                        )}

                        {p.day && (
                          <span className="text-xs text-gray-500" title="Día del cálculo">
                            {formatDateCL(p.day)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-500">Score</p>
                      <p className="text-lg font-bold" style={{ color: "#D4A017" }}>
                        {Number(p.adjusted_winner_score ?? 0).toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500">
                        Presión ML: {formatPercent(p.ml_ratio ?? 0)}
                      </p>

                      {p.url ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 mt-2 text-sm underline"
                          style={{ color: "#2D5016" }}
                          title="Abrir producto fuente"
                        >
                          Ver <ExternalLink className="w-4 h-4" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Technical logs (NO en negocio) */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: "#2D5016" }}>
            <Wrench className="w-5 h-5" />
            Errores Técnicos Recientes (Publicación)
          </h2>
          <button
            onClick={() => navigate("/settings")}
            className="text-sm underline"
            style={{ color: "#2D5016" }}
          >
            Ver logs
          </button>
        </div>

        {systemLogs.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">No hay errores técnicos recientes.</p>
        ) : (
          <div className="space-y-3">
            {systemLogs.map((l) => (
              <div key={l.id} className="p-4 rounded-lg border border-red-100 bg-red-50">
                <p className="text-sm font-semibold text-red-700">{l.title || "Error"}</p>
                {l.message && <pre className="text-xs text-red-700 mt-2 whitespace-pre-wrap">{l.message}</pre>}
                <p className="text-xs text-red-600 mt-2">
                  {new Date(l.created_at).toLocaleString("es-CL")} • {l.module || "general"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold mb-4" style={{ color: "#2D5016" }}>
          Acciones Rápidas
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickButton
            icon={Sparkles}
            title="Generar Contenido"
            subtitle="Crear nuevo post"
            onClick={() => navigate("/content")}
          />
          <QuickButton
            icon={Calendar}
            title="Ver Calendario"
            subtitle="Programar publicaciones"
            onClick={() => navigate("/calendar")}
          />
          <QuickButton
            icon={BarChart3}
            title="Analítica"
            subtitle="Ver métricas"
            onClick={() => navigate("/analytics")}
          />
          <QuickButton
            icon={Settings}
            title="Configuración"
            subtitle="Ajustar sistema"
            onClick={() => navigate("/settings")}
          />
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
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "#F5E6D3" }}
        >
          <Icon className="w-6 h-6" style={{ color: "#2D5016" }} />
        </div>
      </div>
    </div>
  );
}

function QuickButton({ icon: Icon, title, subtitle, onClick }) {
  return (
    <button
      onClick={onClick}
      className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left"
    >
      <Icon className="w-6 h-6 mb-2" style={{ color: "#2D5016" }} />
      <p className="font-medium text-sm">{title}</p>
      <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
    </button>
  );
}
