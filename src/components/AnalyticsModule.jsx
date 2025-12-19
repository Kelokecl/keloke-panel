import React, { useEffect, useMemo, useState } from "react";
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
import { supabase } from "../lib/supabase";

export default function AnalyticsModule() {
  const [timeRange, setTimeRange] = useState("7days");
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(true);

  const [shopifyData, setShopifyData] = useState(null);
  const [shopifyLoading, setShopifyLoading] = useState(false);
  const [shopifyError, setShopifyError] = useState(null);

  useEffect(() => {
    loadAnalytics();
    if (selectedPlatform === "shopify") loadShopifyData();
    // si seleccionas youtube más adelante, se puede volver a enchufar loadYouTubeData
  }, [timeRange, selectedPlatform]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      let query = supabase.from("analytics").select("*").order("date", { ascending: false });

      if (selectedPlatform !== "all" && selectedPlatform !== "shopify" && selectedPlatform !== "youtube") {
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
  };

  // ✅ Shopify: SOLO invoke (sin fetch directo, sin CORS, sin URL extra)
  const loadShopifyData = async () => {
    setShopifyLoading(true);
    setShopifyError(null);

    const fnName =
      import.meta.env.VITE_SHOPIFY_FUNCTION_NAME ||
      "shopify-analytics"; // <-- si tu función se llama distinto, cambia aquí

    try {
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { range: timeRange, platform: "shopify" },
      });

      if (error) throw error;
      setShopifyData(data || null);
    } catch (e) {
      console.error("Error loading Shopify data:", e);
      setShopifyError(String(e?.message || e));
      setShopifyData(null);
    } finally {
      setShopifyLoading(false);
    }
  };

  const platforms = [
    { id: "all", name: "Todas", emoji: "📊" },
    { id: "instagram", name: "Instagram", emoji: "📸" },
    { id: "tiktok", name: "TikTok", emoji: "🎵" },
    { id: "facebook", name: "Facebook", emoji: "👥" },
    { id: "youtube", name: "YouTube", emoji: "▶️" },
    { id: "whatsapp", name: "WhatsApp", emoji: "💬" },
    { id: "shopify", name: "Shopify", emoji: "🛍️" },
  ];

  const formatCurrency = (value) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(
      Number(value || 0)
    );

  const formatNumber = (value) => new Intl.NumberFormat("es-CL").format(Number(value || 0));

  const totals = useMemo(() => {
    if (!analytics || analytics.length === 0) {
      return { totalReach: 0, avgEngagement: 0, totalConversions: 0, avgROI: "0.0" };
    }
    const totalReach = analytics.reduce((sum, a) => sum + (a.reach || 0), 0);
    const totalImpressions = analytics.reduce((sum, a) => sum + (a.impressions || 0), 0);
    const totalEngagement = analytics.reduce((sum, a) => sum + (a.engagement || 0), 0);
    const avgEngagement = totalImpressions > 0 ? ((totalEngagement / totalImpressions) * 100).toFixed(1) : "0.0";
    const totalConversions = analytics.reduce((sum, a) => sum + (a.conversions || 0), 0);
    const avgROI = (analytics.reduce((sum, a) => sum + (a.roi || 0), 0) / analytics.length).toFixed(1);

    return { totalReach, avgEngagement, totalConversions, avgROI };
  }, [analytics]);

  const shopifySummary = useMemo(() => {
    if (!shopifyData) return null;

    // soporta distintas formas que devuelva la edge function
    const orders = shopifyData.totalOrders ?? shopifyData.orders ?? shopifyData?.summary?.orders ?? 0;
    const revenue = shopifyData.totalRevenue ?? shopifyData.revenue ?? shopifyData?.summary?.revenue ?? 0;

    const storeUrl = shopifyData.storeUrl ?? shopifyData.shopUrl ?? shopifyData.store_url ?? "Keloke.cl";
    const activeProducts = shopifyData.activeProducts ?? shopifyData.active_products ?? null;
    const totalProducts = shopifyData.totalProducts ?? shopifyData.total_products ?? null;

    return { orders, revenue, storeUrl, activeProducts, totalProducts };
  }, [shopifyData]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "#2D5016" }}>
            Analítica Avanzada
          </h1>
          <p className="text-gray-600 mt-1">Métricas detalladas de rendimiento por canal</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 outline-none"
          >
            <option value="7days">Últimos 7 días</option>
            <option value="30days">Últimos 30 días</option>
            <option value="90days">Últimos 90 días</option>
          </select>
        </div>
      </div>

      {/* Tabs plataforma */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 overflow-x-auto">
          {platforms.map((platform) => (
            <button
              key={platform.id}
              onClick={() => setSelectedPlatform(platform.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                selectedPlatform === platform.id ? "text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              style={selectedPlatform === platform.id ? { backgroundColor: "#2D5016" } : {}}
            >
              <span>{platform.emoji}</span>
              <span className="text-sm">{platform.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Cards generales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Alcance Total</p>
            <Eye className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold" style={{ color: "#2D5016" }}>
            {formatNumber(totals.totalReach)}
          </p>
          <div className="flex items-center gap-1 mt-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-sm text-green-500 font-medium">+15.2%</span>
            <span className="text-xs text-gray-500">vs período anterior</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Engagement Rate</p>
            <Heart className="w-5 h-5 text-red-500" />
          </div>
          <p className="text-3xl font-bold" style={{ color: "#2D5016" }}>
            {totals.avgEngagement}%
          </p>
          <div className="flex items-center gap-1 mt-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-sm text-green-500 font-medium">+2.3%</span>
            <span className="text-xs text-gray-500">vs período anterior</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Conversiones</p>
            <ShoppingCart className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold" style={{ color: "#2D5016" }}>
            {formatNumber(totals.totalConversions)}
          </p>
          <div className="flex items-center gap-1 mt-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-sm text-green-500 font-medium">+18.7%</span>
            <span className="text-xs text-gray-500">vs período anterior</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">ROI Promedio</p>
            <DollarSign className="w-5 h-5" style={{ color: "#D4A017" }} />
          </div>
          <p className="text-3xl font-bold" style={{ color: "#2D5016" }}>
            {totals.avgROI}x
          </p>
          <div className="flex items-center gap-1 mt-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-sm text-green-500 font-medium">+0.8x</span>
            <span className="text-xs text-gray-500">vs período anterior</span>
          </div>
        </div>
      </div>

      {/* Shopify */}
      {selectedPlatform === "shopify" && (
        <div className="space-y-6">
          {shopifyLoading ? (
            <div className="bg-white p-12 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
              <div
                className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 mb-4"
                style={{ borderTopColor: "#96BF48" }}
              />
              <p className="text-gray-600">Cargando datos de Shopify...</p>
            </div>
          ) : shopifyError ? (
            <div className="bg-red-50 p-6 rounded-xl border border-red-200">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-red-900 mb-2">Error al cargar Shopify</h3>
                  <p className="text-red-700 text-sm">{shopifyError}</p>
                  <button
                    onClick={loadShopifyData}
                    className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                  >
                    Reintentar
                  </button>
                </div>
              </div>
            </div>
          ) : !shopifySummary ? (
            <div className="bg-white p-12 rounded-xl shadow-sm border border-gray-100 text-center">
              <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="font-bold text-xl mb-2" style={{ color: "#2D5016" }}>
                No hay datos de Shopify disponibles
              </h3>
              <p className="text-gray-600 mb-4">Revisa la Edge Function y vuelve a intentar</p>
            </div>
          ) : (
            <>
              <div className="bg-gradient-to-r from-green-600 to-green-500 p-6 rounded-xl text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold mb-1">🛍️ Shopify Store Dashboard</h2>
                    <p className="text-green-100">{shopifySummary.storeUrl}</p>
                  </div>

                  {shopifySummary.activeProducts != null && shopifySummary.totalProducts != null ? (
                    <div className="text-right">
                      <p className="text-sm text-green-100">Productos Activos</p>
                      <p className="text-3xl font-bold">
                        {shopifySummary.activeProducts}/{shopifySummary.totalProducts}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-600">Total de Órdenes</p>
                    <ShoppingCart className="w-5 h-5 text-green-500" />
                  </div>
                  <p className="text-3xl font-bold" style={{ color: "#2D5016" }}>
                    {formatNumber(shopifySummary.orders)}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-green-500 font-medium">+23.5%</span>
                    <span className="text-xs text-gray-500">vs mes anterior</span>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-600">Ingresos Totales</p>
                    <DollarSign className="w-5 h-5" style={{ color: "#D4A017" }} />
                  </div>
                  <p className="text-2xl font-bold" style={{ color: "#2D5016" }}>
                    {formatCurrency(shopifySummary.revenue)}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-green-500 font-medium">+18.2%</span>
                    <span className="text-xs text-gray-500">vs mes anterior</span>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-600">Ticket Promedio</p>
                    <Target className="w-5 h-5 text-purple-500" />
                  </div>
                  <p className="text-2xl font-bold" style={{ color: "#2D5016" }}>
                    {formatCurrency(
                      shopifySummary.orders ? Number(shopifySummary.revenue || 0) / Number(shopifySummary.orders || 1) : 0
                    )}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-green-500 font-medium">+5.8%</span>
                    <span className="text-xs text-gray-500">vs mes anterior</span>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-600">Estado</p>
                    <Zap className="w-5 h-5" style={{ color: "#96BF48" }} />
                  </div>
                  <p className="text-3xl font-bold" style={{ color: "#2D5016" }}>
                    OK
                  </p>
                  <p className="text-xs text-gray-500 mt-2">Fuente: Supabase Edge Function</p>
                </div>
              </div>

              <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-700 mt-0.5" />
                <div className="text-sm text-yellow-900">
                  <b>Nota:</b> Los dashboards avanzados (productos, órdenes detalladas, inventario) aparecen cuando
                  ampliemos la Edge Function de Shopify.
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Placeholder otras plataformas */}
      {selectedPlatform === "all" && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-lg mb-4" style={{ color: "#2D5016" }}>
            Rendimiento por Plataforma
          </h3>
          {loading ? (
            <p className="text-gray-500 text-sm">Cargando...</p>
          ) : (
            <p className="text-gray-500 text-sm">
              Conecta tus plataformas sociales para ver métricas detalladas (por ahora Shopify ya está funcionando).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
