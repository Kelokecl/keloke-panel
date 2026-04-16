// src/components/Dashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  ChevronLeft,
  ChevronRight,
  Target,
  Compass,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

// ======================
// Helpers anti-cuelgue
// ======================
function withTimeout(promise, ms, label = "operation") {
  let t;
  const timeoutPromise = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(t));
}

// Supabase wrapper con timeout (evita promesas colgadas)
async function sb(promise, label, ms = 9000) {
  return withTimeout(promise, ms, label);
}

// fetch JSON con AbortController + timeout
async function fetchJson(
  url,
  { method = "GET", headers, body, timeoutMs = 12000, label = "fetch" } = {}
) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    throw new Error(
      `${label}: ${
        e?.name === "AbortError" ? "aborted/timeout" : e?.message || "network error"
      }`
    );
  } finally {
    clearTimeout(id);
  }
}

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

  const [markingAll, setMarkingAll] = useState(false);
  const [markingOneId, setMarkingOneId] = useState(null);

  const [winnersPage, setWinnersPage] = useState(1);
  const winnersPageSize = 15;

  const [whyByUrl, setWhyByUrl] = useState({});
  const [whyLoadingByUrl, setWhyLoadingByUrl] = useState({});

  const loadSeqRef = useRef(0);
  const mountedRef = useRef(false);
  const whyCacheRef = useRef(new Map());
  const whyInFlightRef = useRef(new Set());

  useEffect(() => {
    mountedRef.current = true;
    loadDashboardData();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function calcProfitMargin(mlPrice, suggestedPrice) {
    if (mlPrice == null || suggestedPrice == null) return { profit: null, margin: null };
    const cost = Number(mlPrice);
    const sell = Number(suggestedPrice);
    if (!Number.isFinite(cost) || !Number.isFinite(sell) || sell <= 0) {
      return { profit: null, margin: null };
    }

    const profit = Math.round(sell - cost);
    const margin = (profit / sell) * 100;
    return { profit, margin };
  }

  // ==========================
// ✅ NUEVO: Winners desde vista SQL real
// ==========================
async function fetchWinnersV2() {
  const { data, error } = await supabase
    .from('v_winner_products_v2_dashboard')
    .select(`
      id,
      title,
      product_url,
      image_url,
      suggested_price_clp,
      profit_clp,
      margin_pct,
      winning_angle,
      intent_type,
      final_score
    `)
    .order('final_score', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching winners:', error);
    return [];
  }

  return data || [];
}

  // ==========================
  // ✅ Mapeo vista SQL -> UI
  // ==========================
  function mapWinnerV2ToUI(x, idx = 0) {
    const mlPrice = x?.ml_price_clp ?? x?.price ?? x?.ml_price ?? null;
    const suggested =
      x?.suggested_price_clp ??
      x?.suggested_price_25 ??
      (mlPrice !== null ? Math.round(Number(mlPrice) * 2.5) : null);

    const { profit, margin } = calcProfitMargin(mlPrice, suggested);

    const score =
      x?.final_score ??
      x?.score ??
      x?.adjusted_winner_score ??
      null;

    const intentType = x?.intent_type || null;
    const winningAngle = x?.winning_angle || null;
    const hookType = x?.hook_type || null;
    const hookText = x?.hook_text || null;
    const organicAngle = x?.organic_angle || null;
    const paidAngle = x?.paid_angle || null;

    const htTier =
      suggested !== null && suggested >= 100000
        ? "HT3_100K"
        : suggested !== null && suggested >= 80000
        ? "HT2_80K"
        : suggested !== null && suggested >= 50000
        ? "HT1_50K"
        : null;

    const trafficLight =
      x?.traffic_light_final ||
      x?.traffic_light ||
      (htTier ? "blue" : "green");

    const url = (x?.product_url || x?.url || "").trim();

    return {
      id: x?.id ?? idx + 1,
      title: x?.title || "Producto",
      url,
      product_url: url,
      image_url: x?.image_url || null,

      keloke_category:
        x?.keloke_category ||
        x?.categoria ||
        x?.category ||
        x?.niche ||
        "otros",

      product_family: x?.product_family || "",
      ml_price_clp: mlPrice,
      suggested_price_25: suggested,
      profit_clp: x?.profit_clp ?? profit,
      margin_pct: x?.margin_pct ?? margin,
      adjusted_winner_score: score,
      traffic_light_final: trafficLight,
      high_ticket_tier: htTier,

      signal_type: x?.signal_type ?? null,
      offers_7d: x?.offers_7d ?? null,
      best_retail_price_clp: x?.best_retail_price_clp ?? null,
      last_retail_fetch_at: x?.last_retail_fetch_at ?? null,

      winning_angle: winningAngle,
      intent_type: intentType,
      hook_type: hookType,
      hook_text: hookText,
      organic_angle: organicAngle,
      paid_angle: paidAngle,
      status: x?.status || "active",

      created_at: x?.created_at || null,
      price_fetched_at: x?.created_at || null,
      page: 1,
    };
  }

  function dedupByTitleKeepFirst(arr) {
    const seen = new Set();
    const out = [];
    for (const it of arr || []) {
      const key = `${(it?.title || "").trim()}__${(it?.winning_angle || "").trim()}`;
      if (!key.trim()) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
    return out;
  }

  // ==========================
  // ✅ IA: explicador local desde los nuevos campos
  // (sin depender de winner-why viejo)
  // ==========================
  async function fetchWinnerWhy(item, { force = false } = {}) {
    const key = String(item?.id || item?.title || "").trim();
    if (!key) return null;

    if (!force) {
      const cached = whyCacheRef.current.get(key);
      if (cached) return cached;
    }

    if (!force && whyInFlightRef.current.has(key)) return null;

    whyInFlightRef.current.add(key);
    if (mountedRef.current) {
      setWhyLoadingByUrl((m) => ({ ...m, [key]: true }));
    }

    try {
      const parts = [];

      if (item?.winning_angle) {
        parts.push(`Ángulo ganador: ${item.winning_angle}.`);
      }

      if (item?.intent_type) {
        parts.push(`Intención detectada: ${item.intent_type}.`);
      }

      if (item?.organic_angle) {
        parts.push(`Enfoque orgánico sugerido: ${item.organic_angle}.`);
      }

      if (item?.paid_angle) {
        parts.push(`Enfoque pagado sugerido: ${item.paid_angle}.`);
      }

      if (item?.hook_text) {
        parts.push(`Hook recomendado: ${item.hook_text}.`);
      }

      if (item?.profit_clp != null && item?.margin_pct != null) {
        parts.push(
          `Margen estimado: ${moneyCLP(item.profit_clp)} de ganancia y ${Number(
            item.margin_pct
          ).toFixed(1)}% de margen.`
        );
      }

      const why =
        parts.join(" ").trim() ||
        "Producto priorizado por score y ángulo ganador detectado.";

      whyCacheRef.current.set(key, why);
      if (mountedRef.current) {
        setWhyByUrl((m) => ({ ...m, [key]: why }));
      }

      return why;
    } catch (e) {
      console.error("winner-why v2 error:", e);
      return null;
    } finally {
      whyInFlightRef.current.delete(key);
      if (mountedRef.current) {
        setWhyLoadingByUrl((m) => ({ ...m, [key]: false }));
      }
    }
  }

  // === RPC helpers (C1) ===
  async function markAllAlertsRead() {
    setMarkingAll(true);
    try {
      const { error: rpcError } = await sb(
        supabase.rpc("mark_dashboard_alerts_read", {}),
        "rpc mark_dashboard_alerts_read",
        9000
      );
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
      const { error: rpcError } = await sb(
        supabase.rpc("mark_dashboard_alerts_read", { p_ids: [alertId] }),
        "rpc mark_dashboard_alerts_read(p_ids)",
        9000
      );
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
    const seq = ++loadSeqRef.current;

    const uiTimeout = setTimeout(() => {
      if (loadSeqRef.current !== seq) return;
      if (!mountedRef.current) return;
      setError("La carga está tardando más de lo esperado. Verifica tu conexión.");
      setLoading(false);
    }, 15000);

    try {
      if (!mountedRef.current) return;
      setError(null);
      setLoading(true);

      // ====== STATS ======
      const [productsRes, contentRes, automationsRes, pendingAlertsRes] =
        await Promise.all([
          sb(
            supabase.from("products").select("id", { count: "exact", head: true }),
            "count products",
            9000
          ),
          sb(
            supabase
              .from("generated_content")
              .select("id", { count: "exact", head: true })
              .eq("status", "scheduled"),
            "count generated_content scheduled",
            9000
          ),
          sb(
            supabase
              .from("automations")
              .select("id", { count: "exact", head: true })
              .eq("enabled", true),
            "count automations enabled",
            9000
          ),
          sb(
            supabase
              .from("dashboard_alerts")
              .select("id", { count: "exact", head: true })
              .eq("is_read", false)
              .eq("category", "business"),
            "count dashboard_alerts unread business",
            9000
          ),
        ]);

      if (loadSeqRef.current !== seq || !mountedRef.current) return;

      setStats({
        totalProducts: productsRes.count || 0,
        scheduledContent: contentRes.count || 0,
        activeAutomations: automationsRes.count || 0,
        pendingBusinessAlerts: pendingAlertsRes.count || 0,
      });

      // ====== FEEDS ======
      const [suggRes, alertsUnreadRes, alertsFallbackRes, logsRes] =
        await Promise.all([
          sb(
            supabase
              .from("ai_suggestions")
              .select("*")
              .eq("is_done", false)
              .order("created_at", { ascending: false })
              .limit(5),
            "fetch ai_suggestions",
            9000
          ),
          sb(
            supabase
              .from("dashboard_alerts")
              .select("*")
              .eq("category", "business")
              .eq("is_read", false)
              .order("created_at", { ascending: false })
              .limit(5),
            "fetch dashboard_alerts unread",
            9000
          ),
          sb(
            supabase
              .from("dashboard_alerts")
              .select("*")
              .eq("category", "business")
              .order("created_at", { ascending: false })
              .limit(5),
            "fetch dashboard_alerts fallback",
            9000
          ),
          sb(
            supabase
              .from("system_logs")
              .select("*")
              .order("created_at", { ascending: false })
              .limit(3),
            "fetch system_logs",
            9000
          ),
        ]);

      if (loadSeqRef.current !== seq || !mountedRef.current) return;

      setSuggestions(suggRes.data || []);

      const unread = alertsUnreadRes.data || [];
      const fallback = alertsFallbackRes.data || [];
      setBusinessAlerts(unread.length > 0 ? unread : fallback);

      // ====== NUEVO detector real ======
      let winnersData = [];
      try {
        const rows = await fetchWinnersV2();
        winnersData = dedupByTitleKeepFirst(
          rows.map((x, idx) => mapWinnerV2ToUI(x, idx))
        ).slice(0, 15);
      } catch (e) {
        console.error("v_winner_products_v2_dashboard error:", e);
        winnersData = [];
      }

      if (loadSeqRef.current !== seq || !mountedRef.current) return;

      setWinnersPage(1);
      setWinningProducts(winnersData);
      setSystemLogs(logsRes.data || []);
    } catch (e) {
      console.error("Dashboard load error:", e);
      if (loadSeqRef.current !== seq || !mountedRef.current) return;

      setError(
        e?.message?.startsWith("Timeout:")
          ? "La carga tardó demasiado. Reintenta (o revisa tu conexión)."
          : "Error al cargar el dashboard. Por favor, intenta recargar la página."
      );
    } finally {
      clearTimeout(uiTimeout);
      if (loadSeqRef.current !== seq || !mountedRef.current) return;
      setLoading(false);
    }
  }

  const winnersByPage = useMemo(() => {
    const hasPage = (winningProducts || []).some((x) => x?.page != null);
    if (hasPage) {
      const map = new Map();
      for (const w of winningProducts || []) {
        const p = Number(w?.page || 1);
        if (!map.has(p)) map.set(p, []);
        map.get(p).push(w);
      }
      const obj = {};
      [...map.keys()]
        .sort((a, b) => a - b)
        .forEach((k) => {
          obj[k] = map.get(k);
        });
      return { mode: "page_field", pages: obj };
    }

    const chunks = {};
    const arr = winningProducts || [];
    const totalPages = Math.max(1, Math.ceil(arr.length / winnersPageSize));
    for (let p = 1; p <= totalPages; p++) {
      const start = (p - 1) * winnersPageSize;
      chunks[p] = arr.slice(start, start + winnersPageSize);
    }
    return { mode: "chunk", pages: chunks };
  }, [winningProducts]);

  const winnersTotalPages = useMemo(() => {
    const keys = Object.keys(winnersByPage.pages || {});
    if (!keys.length) return 1;
    return Math.max(...keys.map((k) => Number(k)));
  }, [winnersByPage]);

  const winnersCurrentItems = useMemo(() => {
    return winnersByPage.pages?.[winnersPage] || [];
  }, [winnersByPage, winnersPage]);

  useEffect(() => {
    if (loading || error) return;

    let cancelled = false;

    async function run() {
      const items = winnersCurrentItems || [];
      if (!items.length) return;

      const targets = items.filter((it) => {
        const key = String(it?.id || it?.title || "").trim();
        if (!key) return false;
        if (whyCacheRef.current.has(key)) return false;
        if (whyInFlightRef.current.has(key)) return false;
        return true;
      });

      const maxConcurrent = 2;
      let i = 0;

      async function worker() {
        while (i < targets.length && !cancelled) {
          const it = targets[i++];
          await fetchWinnerWhy(it);
        }
      }

      await Promise.all(new Array(maxConcurrent).fill(0).map(worker));
    }

    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnersPage, winnersCurrentItems, loading, error]);

  function formatAlertTitle(a) {
    const type = a?.type || "event";
    const source = a?.source || "system";

    if (a?.title) return a.title;

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
              <div
                key={s.id}
                className="p-3 rounded-lg border border-gray-100 flex items-start justify-between gap-3"
              >
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
                <div
                  key={a.id}
                  className="p-4 rounded-lg border border-gray-100 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "#2D5016" }}>
                      {formatAlertTitle(a)}
                    </p>

                    {formatAlertMessage(a) ? (
                      <p className="text-xs text-gray-600 mt-1 break-words">
                        {formatAlertMessage(a)}
                      </p>
                    ) : null}

                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full border"
                        style={{
                          backgroundColor: "#F5E6D3",
                          color: "#2D5016",
                          borderColor: "#E6D6C3",
                        }}
                        title="Fuente / tipo"
                      >
                        {a.source || "system"} • {a.type || "event"}
                      </span>

                      <p className="text-xs text-gray-500">
                        {a.created_at ? new Date(a.created_at).toLocaleString("es-CL") : ""}
                      </p>
                    </div>
                  </div>

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
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-bold" style={{ color: "#2D5016" }}>
                Top Productos Ganadores (Chile)
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Detector real v2 • score final + ángulo ganador + intención + enfoque orgánico/pagado
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setWinnersPage((p) => Math.max(1, p - 1))}
                disabled={winnersPage <= 1}
                className="px-2 py-2 rounded-lg border border-gray-200 bg-white disabled:opacity-40"
                title="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-sm text-gray-600">
                Página <span className="font-semibold">{winnersPage}</span> /{" "}
                <span className="font-semibold">{winnersTotalPages}</span>
              </span>

              <button
                onClick={() => setWinnersPage((p) => Math.min(winnersTotalPages, p + 1))}
                disabled={winnersPage >= winnersTotalPages}
                className="px-2 py-2 rounded-lg border border-gray-200 bg-white disabled:opacity-40"
                title="Página siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <TrendingUp className="w-5 h-5 text-gray-400 ml-2" />
            </div>
          </div>

          {winnersCurrentItems.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm mb-3">Aún no hay productos ganadores.</p>
              <button
                onClick={() => navigate("/trends")}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-sm"
              >
                Ver módulo de Tendencias / Ganadores
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {winnersCurrentItems.map((p, idx) => (
                <WinnerCard
                  key={`${p.id || ""}-${winnersPage}-${idx}`}
                  idx={(winnersPage - 1) * winnersPageSize + idx}
                  item={p}
                  why={whyByUrl[String(p?.id || p?.title || "")] || null}
                  whyLoading={!!whyLoadingByUrl[String(p?.id || p?.title || "")]}
                  onWhyRefresh={() => fetchWinnerWhy(p, { force: true })}
                  onOpen={() => {
                    const url = p?.url || p?.product_url;
                    if (url) window.open(url, "_blank", "noopener,noreferrer");
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Technical logs */}
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
          <p className="text-gray-500 text-sm text-center py-6">
            No hay errores técnicos recientes.
          </p>
        ) : (
          <div className="space-y-3">
            {systemLogs.map((l) => (
              <div key={l.id} className="p-4 rounded-lg border border-red-100 bg-red-50">
                <p className="text-sm font-semibold text-red-700">{l.title || "Error"}</p>
                {l.message && (
                  <pre className="text-xs text-red-700 mt-2 whitespace-pre-wrap">{l.message}</pre>
                )}
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

// ======================
// Winners Card + UI helpers
// ======================
function WinnerCard({ idx, item, why, whyLoading, onWhyRefresh, onOpen }) {
  const title = item?.title || "Producto";
  const cat = item?.keloke_category || item?.categoria || item?.category || "Sin categoría";
  const fam = item?.product_family || "";
  const score = item?.adjusted_winner_score ?? null;

  const mlPrice = item?.ml_price_clp ?? null;
  const sellPrice = item?.suggested_price_25 ?? null;
  const profit = item?.profit_clp ?? null;
  const margin = item?.margin_pct ?? null;

  const traffic = (item?.traffic_light_final || "green").toLowerCase();
  const htTier = item?.high_ticket_tier || null;

  const hasPricing = mlPrice !== null || sellPrice !== null || profit !== null || margin !== null;
  const url = item?.url || item?.product_url;

  const signalType = item?.signal_type || null;
  const offers7d = item?.offers_7d ?? null;
  const bestRetail = item?.best_retail_price_clp ?? null;

  return (
    <div className="p-4 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 w-full">
          <div className="flex items-start gap-3">
            {item?.image_url ? (
              <img
                src={item.image_url}
                alt={title}
                className="w-14 h-14 rounded-lg border border-gray-100 object-contain bg-white"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : null}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold truncate">
                  {idx + 1}. {title}
                </p>

                <TrafficPill traffic={traffic} />
                {htTier ? <HighTicketPill tier={htTier} /> : null}
                {signalType ? <SignalPill type={signalType} /> : null}
                {item?.intent_type ? <IntentPill type={item.intent_type} /> : null}
              </div>

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <TagPill>{cat}</TagPill>
                {fam ? <TagPill subtle>{fam}</TagPill> : null}
                {score !== null ? (
                  <span className="text-[11px] text-gray-500">
                    Score: <span className="font-semibold">{Number(score).toFixed(2)}</span>
                  </span>
                ) : null}
                {item?.status ? (
                  <span className="text-[11px] text-gray-500">
                    Estado: <span className="font-semibold">{item.status}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Ángulo ganador */}
          {(item?.winning_angle || item?.organic_angle || item?.paid_angle || item?.hook_text) && (
            <div className="mt-3 grid grid-cols-1 gap-3">
              {item?.winning_angle ? (
                <AngleBox
                  icon={Target}
                  label="Ángulo ganador"
                  value={item.winning_angle}
                />
              ) : null}

              {item?.organic_angle ? (
                <AngleBox
                  icon={Compass}
                  label="Enfoque orgánico"
                  value={item.organic_angle}
                />
              ) : null}

              {item?.paid_angle ? (
                <AngleBox
                  icon={TrendingUp}
                  label="Enfoque pagado"
                  value={item.paid_angle}
                />
              ) : null}

              {item?.hook_text ? (
                <AngleBox
                  icon={Sparkles}
                  label="Hook sugerido"
                  value={item.hook_text}
                />
              ) : null}
            </div>
          )}

          {/* Pricing solo si existe */}
          {hasPricing ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Box label="Precio costo" value={mlPrice !== null ? moneyCLP(mlPrice) : "—"} strong />
              <Box label="Precio sugerido" value={sellPrice !== null ? moneyCLP(sellPrice) : "—"} strong />
              <Box label="Ganancia" value={profit !== null ? moneyCLP(profit) : "—"} accent />
              <Box label="Margen" value={margin !== null ? `${Number(margin).toFixed(1)}%` : "—"} />
              <Box label="Mejor precio retail" value={bestRetail !== null ? moneyCLP(bestRetail) : "—"} strong />
              <Box label="Ofertas 7 días" value={offers7d !== null ? String(offers7d) : "—"} />
            </div>
          ) : null}

          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-500">
                {why
                  ? why
                  : whyLoading
                  ? "Generando explicación…"
                  : "Producto priorizado por detector manual v2."}
              </p>
            </div>

            <button
              onClick={onWhyRefresh}
              className="shrink-0 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-sm"
              title="Regenerar explicación"
            >
              IA ↻
            </button>
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2">
          {url ? (
            <button
              onClick={onOpen}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-sm"
              title="Abrir producto"
            >
              Ver <ExternalLink className="w-4 h-4 inline-block ml-1" />
            </button>
          ) : null}

          {item?.created_at ? (
            <span className="text-[11px] text-gray-400">
              {new Date(item.created_at).toLocaleString("es-CL")}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function moneyCLP(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return "—";
  return `$${v.toLocaleString("es-CL")}`;
}

function Box({ label, value, strong, accent }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p
        className={`text-sm ${strong ? "font-semibold" : "font-medium"}`}
        style={
          accent
            ? { color: "#D4A017", fontWeight: 700 }
            : { color: "#2D5016", fontWeight: strong ? 700 : 600 }
        }
      >
        {value}
      </p>
    </div>
  );
}

function AngleBox({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3 bg-[#fcfcfa]">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" style={{ color: "#2D5016" }} />
        <p className="text-[11px] text-gray-500">{label}</p>
      </div>
      <p className="text-sm font-medium" style={{ color: "#2D5016" }}>
        {value}
      </p>
    </div>
  );
}

function TrafficPill({ traffic }) {
  const t = (traffic || "green").toLowerCase();
  const map = {
    green: { label: "Ganador", bg: "#E9F7E7", fg: "#2D5016", bd: "#CFE8CB" },
    yellow: { label: "Descubrimiento", bg: "#FFF6D9", fg: "#7A5A00", bd: "#F1E0A5" },
    red: { label: "Explorar", bg: "#FDE8E8", fg: "#7A1E1E", bd: "#F6CACA" },
    blue: { label: "High Ticket", bg: "#E8F1FF", fg: "#1E3A8A", bd: "#C7DBFF" },
  };
  const s = map[t] || map.green;

  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full border"
      style={{ backgroundColor: s.bg, color: s.fg, borderColor: s.bd }}
      title={`Semáforo: ${s.label}`}
    >
      {s.label}
    </span>
  );
}

function SignalPill({ type }) {
  const t = String(type || "").toUpperCase();
  const map = {
    ARBITRAJE_POSITIVO: {
      label: "ARBITRAJE +",
      bg: "#E9F7E7",
      fg: "#2D5016",
      bd: "#CFE8CB",
    },
    UNDERVALUED_ML: {
      label: "UNDERVALUED",
      bg: "#FFF6D9",
      fg: "#7A5A00",
      bd: "#F1E0A5",
    },
    NEUTRAL: {
      label: "NEUTRAL",
      bg: "#F3F4F6",
      fg: "#374151",
      bd: "#E5E7EB",
    },
  };
  const s = map[t] || {
    label: t || "SIGNAL",
    bg: "#F3F4F6",
    fg: "#374151",
    bd: "#E5E7EB",
  };

  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full border"
      style={{ backgroundColor: s.bg, color: s.fg, borderColor: s.bd }}
      title={`Signal: ${t}`}
    >
      {s.label}
    </span>
  );
}

function HighTicketPill({ tier }) {
  const label =
    tier === "HT3_100K"
      ? "HT 100K+"
      : tier === "HT2_80K"
      ? "HT 80K+"
      : tier === "HT1_50K"
      ? "HT 50K+"
      : "High Ticket";

  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full border"
      style={{ backgroundColor: "#E8F1FF", color: "#1E3A8A", borderColor: "#C7DBFF" }}
      title="Producto high ticket"
    >
      {label}
    </span>
  );
}

function IntentPill({ type }) {
  const t = String(type || "").toLowerCase();
  const label =
    t === "viaje"
      ? "INTENT: VIAJE"
      : t === "problema"
      ? "INTENT: PROBLEMA"
      : t === "regalo"
      ? "INTENT: REGALO"
      : `INTENT: ${String(type || "").toUpperCase()}`;

  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full border"
      style={{ backgroundColor: "#F5E6D3", color: "#2D5016", borderColor: "#E6D6C3" }}
      title="Intención principal detectada"
    >
      {label}
    </span>
  );
}

function TagPill({ children, subtle }) {
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full"
      style={{
        backgroundColor: subtle ? "#F3F4F6" : "#F5E6D3",
        color: subtle ? "#374151" : "#2D5016",
      }}
    >
      {children}
    </span>
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
