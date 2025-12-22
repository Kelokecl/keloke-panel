import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  AlertCircle,
  BarChart3,
  Calendar,
  DollarSign,
  Eye,
  Heart,
  ShoppingCart,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { supabase } from "../lib/supabase"; // ajusta si tu ruta es distinta

export default function Analytics() {
  const [timeRange, setTimeRange] = useState("7days");
  const [selectedPlatform, setSelectedPlatform] = useState("shopify");

  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(false);

  const [shopifyData, setShopifyData] = useState(null);
  const [shopifyLoading, setShopifyLoading] = useState(false);
  const [shopifyError, setShopifyError] = useState(null);

  const platforms = useMemo(
    () => [
      { id: "all", name: "Todas", emoji: "📊" },
      { id: "instagram", name: "Instagram", emoji: "📸" },
      { id: "tiktok", name: "TikTok", emoji: "🎵" },
      { id: "facebook", name: "Facebook", emoji: "👥" },
      { id: "youtube", name: "YouTube", emoji: "▶️" },
      { id: "whatsapp", name: "WhatsApp", emoji: "💬" },
      { id: "shopify", name: "Shopify", emoji: "🛍️" },
    ],
    []
  );

  const formatCurrency = (value) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(Number(value || 0));

  const formatNumber = (value) =>
    new Intl.NumberFormat("es-CL").format(Number(value || 0));

  // --- Loader genérico (DB) para plataformas sociales (si la tabla existe)
  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("analytics")
        .select("*")
        .order("date", { ascending: false });

      if (
        selectedPlatform !== "all" &&
        selectedPlatform !== "shopify" &&
        selectedPlatform !== "youtube"
      ) {
        query = query.eq("platform", selectedPlatform);
      }

      const { data, error } = await query;
      if (error) throw error;

      setAnalytics(data || []);
    } catch (e) {
      console.error("Error loading analytics:", e);
      setAnalytics([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPlatform]);

  // --- Shopify: invoca Edge Function
  const loadShopifyData = useCallback(() => {
    setShopifyLoading(true);
    setShopifyError(null);

    const FN = "shopify-analytics";

    supabase.functions
      .invoke(FN, {
        body: {
          range: timeRange, // "7days" | "30days" | "90days"
          platform: "shopify",
        },
      })
      .then(({ data, error }) => {
        if (error) {
          setShopifyError(error.message || "Error invocando shopify-analytics");
          setShopifyData(null);
          return;
        }

        const orders = Number(data?.orders ?? 0);
        const totalRevenue = Number(data?.totalSales ?? 0);
        const averageOrderValue = Number(
          data?.averageOrderValue ?? (orders > 0 ? totalRevenue / orders : 0)
        );

        const conversionRate = Number(data?.conversionRate ?? 0);

        setShopifyData((prev) => ({
          ...(prev || {}),
          totalOrders: orders,
          totalRevenue: totalRevenue,
          averageOrderValue: Math.round(averageOrderValue),
          conversionRate: conversionRate,

          currency: data?.currency ?? "CLP",

          storeUrl: data?.storeUrl ?? "Keloke.cl",
          activeProducts: Number(data?.activeProducts ?? 0),
          totalProducts: Number(data?.totalProducts ?? 0),

          topProducts: Array.isArray(data?.topProducts) ? data.topProducts : [],
          recentOrders: Array.isArray(data?.recentOrders) ? data.recentOrders : [],
          salesByCategory: Array.isArray(data?.salesByCategory) ? data.salesByCategory : [],
          weeklyRevenue: Array.isArray(data?.weeklyRevenue) ? data.weeklyRevenue : [],
          lowStock: Array.isArray(data?.lowStock) ? data.lowStock : [],
          insights: Array.isArray(data?.insights) ? data.insights : [],

          generatedAt: data?.generatedAt || null,
          note: data?.note || "",
          source: data?.source || "shopify",
        }));
      })
      .catch((e) => {
        setShopifyError(String(e?.message || e));
        setShopifyData(null);
      })
      .finally(() => {
        setShopifyLoading(false);
      });
  }, [timeRange]);

  // --- YouTube (placeholder estable)
  const loadYouTubeData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: analyticsData } = await supabase
        .from("analytics")
        .select("*")
        .eq("platform", "youtube")
        .order("date", { ascending: false });

      setAnalytics(analyticsData || []);
    } catch (e) {
      console.error("Error loading YouTube data:", e);
      setAnalytics([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 1) carga inmediata cuando cambia plataforma o rango
  useEffect(() => {
    if (selectedPlatform === "shopify") {
      loadShopifyData();
      return;
    }
    if (selectedPlatform === "youtube") {
      loadYouTubeData();
      return;
    }
    loadAnalytics();
  }, [selectedPlatform, timeRange, loadShopifyData, loadYouTubeData, loadAnalytics]);

  // 2) auto-refresh (cada 2 minutos)
  useEffect(() => {
    const intervalMs = 2 * 60 * 1000;
    const id = setInterval(() => {
      if (selectedPlatform === "shopify") loadShopifyData();
      else if (selectedPlatform === "youtube") loadYouTubeData();
      else loadAnalytics();
    }, intervalMs);

    return () => clearInterval(id);
  }, [selectedPlatform, timeRange, loadShopifyData, loadYouTubeData, loadAnalytics]);

  const totals = useMemo(() => {
    if (!analytics?.length) {
      return { totalReach: 0, avgEngagement: "0.0", totalConversions: 0, avgROI: "0.0" };
    }

    const totalReach = analytics.reduce((sum, a) => sum + (a.reach || 0), 0);
    const totalImpressions = analytics.reduce((sum, a) => sum + (a.impressions || 0), 0);
    const totalEngagement = analytics.reduce((sum, a) => sum + (a.engagement || 0), 0);

    const avgEngagement =
      totalImpressions > 0 ? ((totalEngagement / totalImpressions) * 100).toFixed(1) : "0.0";

    const totalConversions = analytics.reduce((sum, a) => sum + (a.conversions || 0), 0);

    const avgROI =
      (analytics.reduce((sum, a) => sum + (a.roi || 0), 0) / analytics.length).toFixed(1) || "0.0";

    return { totalReach, avgEngagement, totalConversions, avgROI };
  }, [analytics]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: "#2D5016" }}>
            Analítica Avanzada
          </h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Métricas detalladas de rendimiento por canal
          </p>
        </div>

        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg outline-none bg-white"
        >
          <option value="7days">Últimos 7 días</option>
          <option value="30days">Últimos 30 días</option>
          <option value="90days">Últimos 90 días</option>
        </select>
      </div>

      {/* Filtros de Plataforma */}
      <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {platforms.map((platform) => (
            <button
              key={platform.id}
              onClick={() => setSelectedPlatform(platform.id)}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-2 text-sm ${
                selectedPlatform === platform.id
                  ? "text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              style={selectedPlatform === platform.id ? { backgroundColor: "#2D5016" } : {}}
            >
              <span>{platform.emoji}</span>
              <span>{platform.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Métricas Principales (multicanal) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
        <CardMetric
          title="Alcance Total"
          value={formatNumber(totals.totalReach)}
          icon={<Eye className="w-5 h-5 text-blue-500" />}
        />
        <CardMetric
          title="Engagement Rate"
          value={`${totals.avgEngagement}%`}
          icon={<Heart className="w-5 h-5 text-red-500" />}
        />
        <CardMetric
          title="Conversiones"
          value={formatNumber(totals.totalConversions)}
          icon={<ShoppingCart className="w-5 h-5 text-purple-500" />}
        />
        <CardMetric
          title="ROI Promedio"
          value={`${totals.avgROI}x`}
          icon={<DollarSign className="w-5 h-5" style={{ color: "#D4A017" }} />}
        />
      </div>

      {/* Shopify Dashboard */}
      {selectedPlatform === "shopify" && (
        <div className="space-y-6">
          {shopifyLoading ? (
            <LoadingCard color="#96BF48" text="Cargando datos de Shopify..." />
          ) : shopifyError ? (
            <div className="bg-red-50 p-4 sm:p-6 rounded-xl border border-red-200">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                <div className="min-w-0">
                  <h3 className="font-bold text-red-900 mb-2">Error al cargar datos de Shopify</h3>
                  <p className="text-red-700 text-sm break-words">{shopifyError}</p>
                  <button
                    onClick={loadShopifyData}
                    className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                  >
                    Reintentar
                  </button>
                </div>
              </div>
            </div>
          ) : !shopifyData ? (
            <div className="bg-white p-10 sm:p-12 rounded-xl shadow-sm border border-gray-100 text-center">
              <ShoppingCart className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="font-bold text-xl mb-2" style={{ color: "#2D5016" }}>
                No hay datos de Shopify disponibles
              </h3>
              <p className="text-gray-600 mb-4 text-sm sm:text-base">
                Configura la integración con Shopify para ver tus métricas
              </p>
            </div>
          ) : (
            <>
              {/* Overview */}
              <div className="bg-gradient-to-r from-green-600 to-green-500 p-4 sm:p-6 rounded-xl text-white">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-xl sm:text-2xl font-bold mb-1">🛍️ Shopify Store Dashboard</h2>
                    <p className="text-green-100 text-xs sm:text-sm break-words">
                      {shopifyData.storeUrl}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs sm:text-sm text-green-100">Productos Activos</p>
                    <p className="text-2xl sm:text-3xl font-bold">
                      {formatNumber(shopifyData.activeProducts)}/{formatNumber(shopifyData.totalProducts)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
                <CardMetric
                  title="Total de Órdenes"
                  value={formatNumber(shopifyData.totalOrders)}
                  icon={<ShoppingCart className="w-5 h-5 text-green-500" />}
                />
                <CardMetric
                  title="Ingresos Totales"
                  value={formatCurrency(shopifyData.totalRevenue)}
                  icon={<DollarSign className="w-5 h-5" style={{ color: "#D4A017" }} />}
                />
                <CardMetric
                  title="Ticket Promedio"
                  value={formatCurrency(shopifyData.averageOrderValue)}
                  icon={<Target className="w-5 h-5 text-purple-500" />}
                />
                <CardMetric
                  title="Tasa de Conversión"
                  value={`${Number(shopifyData.conversionRate ?? 0).toFixed(2)}%`}
                  icon={<TrendingUp className="w-5 h-5 text-blue-500" />}
                />
              </div>

              {/* Top products / Recent orders */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
                <Panel title="Top Productos" icon={<Target className="w-5 h-5 text-gray-400" />}>
                  {shopifyData.topProducts?.length ? (
                    <div className="space-y-3">
                      {shopifyData.topProducts.map((product, index) => (
                        <div
                          key={product.id || `${product.name}-${index}`}
                          className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                              style={{ backgroundColor: "#96BF48" }}
                            >
                              {index + 1}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm leading-snug text-gray-900 break-words">
                                {product.name || "Producto"}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5 break-words">
                                SKU: {product.sku || "-"}
                              </p>
                            </div>

                            <div className="text-right flex-shrink-0 pl-2">
                              <p className="font-bold text-sm whitespace-nowrap" style={{ color: "#2D5016" }}>
                                {formatCurrency(product.revenue)}
                              </p>
                              <p className="text-xs text-gray-500 whitespace-nowrap">
                                {formatNumber(product.sold)} vendidos
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyText text="Aún no hay datos de productos top." />
                  )}
                </Panel>

                <Panel title="Órdenes Recientes" icon={<ShoppingCart className="w-5 h-5 text-gray-400" />}>
                  {shopifyData.recentOrders?.length ? (
                    <div className="space-y-3">
                      {shopifyData.recentOrders.map((order, idx) => (
                        <div
                          key={order.id || idx}
                          className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1 min-w-0 flex-wrap">
                                <p
                                  className="font-mono font-bold text-sm whitespace-nowrap"
                                  style={{ color: "#2D5016" }}
                                >
                                  {order.id || "—"}
                                </p>

                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                                    order.status === "fulfilled"
                                      ? "bg-green-100 text-green-700"
                                      : order.status === "shipped"
                                      ? "bg-blue-100 text-blue-700"
                                      : "bg-yellow-100 text-yellow-700"
                                  }`}
                                >
                                  {order.status || "pending"}
                                </span>
                              </div>

                              <p className="text-xs text-gray-600 break-words">
                                {order.customer || "Cliente"}
                              </p>

                              <p className="text-xs text-gray-500 break-words">
                                {order.date ? new Date(order.date).toLocaleString("es-CL") : ""}
                              </p>
                            </div>

                            <div className="text-right flex-shrink-0">
                              <p className="font-bold text-sm whitespace-nowrap" style={{ color: "#2D5016" }}>
                                {formatCurrency(order.total)}
                              </p>
                              <p className="text-xs text-gray-500 whitespace-nowrap">
                                {formatNumber(order.items)} items
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyText text="Aún no hay órdenes recientes." />
                  )}
                </Panel>
              </div>

              {/* Categorías / Weekly */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
                <Panel title="Ventas por Categoría" icon={<BarChart3 className="w-5 h-5 text-gray-400" />}>
                  {shopifyData.salesByCategory?.length ? (
                    <div className="space-y-4">
                      {shopifyData.salesByCategory.map((cat, index) => (
                        <div key={index} className="min-w-0">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <span className="font-medium text-sm min-w-0 break-words">
                              {cat.category || "Categoría"}
                            </span>
                            <span className="text-sm font-bold whitespace-nowrap" style={{ color: "#2D5016" }}>
                              {formatCurrency(cat.revenue)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                            <div
                              className="h-2 rounded-full transition-all"
                              style={{
                                backgroundColor: "#96BF48",
                                width: `${Math.min(100, Number(cat.percentage || 0))}%`,
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span className="whitespace-nowrap">{formatNumber(cat.sales)} ventas</span>
                            <span className="whitespace-nowrap">{Math.min(100, Number(cat.percentage || 0))}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyText text="Aún no hay datos por categoría." />
                  )}
                </Panel>

                <Panel title="Ingresos Semanales" icon={<Calendar className="w-5 h-5 text-gray-400" />}>
                  {shopifyData.weeklyRevenue?.length ? (
                    <div className="space-y-3">
                      {shopifyData.weeklyRevenue.map((week, index) => (
                        <div key={index} className="space-y-2">
                          <div className="flex items-start justify-between gap-3 text-sm">
                            <span className="font-medium min-w-0 break-words">
                              {week.week || "Semana"}
                            </span>
                            <div className="text-right flex-shrink-0">
                              <span className="font-bold whitespace-nowrap" style={{ color: "#2D5016" }}>
                                {formatCurrency(week.revenue)}
                              </span>
                              <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">
                                ({formatNumber(week.orders)} órdenes)
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className="h-2 rounded-full transition-all"
                              style={{
                                backgroundColor: "#96BF48",
                                width: `${Math.min(100, (Number(week.revenue || 0) / 5500000) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyText text="Aún no hay tendencia semanal." />
                  )}
                </Panel>
              </div>

              {/* Low stock */}
              {shopifyData.lowStock?.length ? (
                <div className="bg-gradient-to-r from-orange-50 to-red-50 p-4 sm:p-6 rounded-xl border border-orange-200">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-orange-500 flex-shrink-0">
                      <AlertCircle className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg mb-3 text-orange-900">
                        ⚠️ Alerta de Inventario Bajo
                      </h3>
                      <div className="space-y-2">
                        {shopifyData.lowStock.map((item, index) => (
                          <div
                            key={index}
                            className="flex items-start sm:items-center justify-between gap-3 p-3 bg-white rounded-lg"
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-sm break-words">{item.name || "Producto"}</p>
                              <p className="text-xs text-gray-500 break-words">SKU: {item.sku || "-"}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm whitespace-nowrap">
                                <span className="font-bold text-orange-600">{formatNumber(item.stock)}</span>
                                <span className="text-gray-500"> / {formatNumber(item.threshold)} unidades</span>
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Insights */}
              {shopifyData.insights?.length ? (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 sm:p-6 rounded-xl border border-green-100">
                  <div className="flex items-start gap-4">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: "#96BF48" }}
                    >
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg mb-2" style={{ color: "#2D5016" }}>
                        Insights de Shopify
                      </h3>
                      <ul className="space-y-2 text-sm text-gray-700">
                        {shopifyData.insights.map((insight, index) => (
                          <li key={index} className="flex items-start gap-2 min-w-0">
                            <span
                              className={`${
                                insight.type === "warning" ? "text-orange-500" : "text-green-500"
                              } font-bold flex-shrink-0`}
                            >
                              •
                            </span>
                            <span className="break-words">{insight.message || String(insight)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 text-sm text-yellow-800">
                <strong>Fuente:</strong> Shopify · Datos obtenidos vía Supabase Edge Function
              </div>
            </>
          )}
        </div>
      )}

      {/* Placeholder para otros */}
      {selectedPlatform !== "shopify" && (
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-lg mb-2" style={{ color: "#2D5016" }}>
            {selectedPlatform === "all"
              ? "Rendimiento por Plataforma"
              : `Analítica: ${selectedPlatform}`}
          </h3>
          {loading ? (
            <LoadingCard text="Cargando..." />
          ) : (
            <p className="text-gray-500 text-sm">
              Aquí se muestran métricas cuando conectemos/llenemos datos de esa plataforma.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------- Helpers UI ----------------- */

function Panel({ title, icon, children }) {
  return (
    <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h3 className="font-bold text-lg min-w-0" style={{ color: "#2D5016" }}>
          <span className="break-words">{title}</span>
        </h3>
        <div className="flex-shrink-0">{icon}</div>
      </div>
      {children}
    </div>
  );
}

function EmptyText({ text }) {
  return <p className="text-gray-500 text-sm">{text}</p>;
}

function LoadingCard({ text = "Cargando...", color = "#2D5016" }) {
  return (
    <div className="bg-white p-10 sm:p-12 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
      <div
        className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 mb-4"
        style={{ borderTopColor: color }}
      />
      <p className="text-gray-600">{text}</p>
    </div>
  );
}

function CardMetric({ title, value, icon }) {
  return (
    <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-2 gap-3">
        <p className="text-sm text-gray-600 min-w-0 break-words">{title}</p>
        <div className="flex-shrink-0">{icon}</div>
      </div>
      <p className="text-2xl sm:text-3xl font-bold" style={{ color: "#2D5016" }}>
        {value}
      </p>
      <div className="flex items-center gap-1 mt-2">
        <TrendingUp className="w-4 h-4 text-green-500" />
        <span className="text-sm text-green-500 font-medium">+—</span>
        <span className="text-xs text-gray-500">vs período anterior</span>
      </div>
    </div>
  );
}
