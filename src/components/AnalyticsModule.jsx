import { AlertCircle, BarChart3, Calendar, DollarSign, Eye, Heart, ShoppingCart, Target, TrendingUp, Zap } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AnalyticsModule() {
  const [timeRange, setTimeRange] = useState('7days');
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shopifyData, setShopifyData] = useState(null);
  const [shopifyLoading, setShopifyLoading] = useState(false);
  const [shopifyError, setShopifyError] = useState(null);

  useEffect(() => {
    loadAnalytics();
    if (selectedPlatform === 'shopify') {
      loadShopifyData();
    } else if (selectedPlatform === 'youtube') {
      loadYouTubeData();
    }
  }, [timeRange, selectedPlatform]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('analytics')
        .select('*')
        .order('date', { ascending: false });

      if (selectedPlatform !== 'all' && selectedPlatform !== 'shopify' && selectedPlatform !== 'youtube') {
        query = query.eq('platform', selectedPlatform);
      }

      const { data, error } = await query;
      if (error) throw error;
      setAnalytics(data || []);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadShopifyData = async () => {
    setShopifyLoading(true);
    setShopifyError(null);
    try {
      // If you disabled "Verify JWT" for this Edge Function, you can call it publicly.
   
          // Invoke Supabase Edge Function for Shopify analytics
    const { data: shopifyDataResponse, error: shopifyInvokeError } = await supabase.functions.invoke("shopify-analytics", {
      body: {
        range: timeRange,
        platform: "shopify",
      },
    });
    if (shopifyInvokeError) {
      setShopifyError(shopifyInvokeError.message || "Error invocando shopify-analytics");
      setShopifyData(null);
      return;
    }
    setShopifyData(shopifyDataResponse);
    // Return early to skip old fetch logic
    return;
// Recommended: set VITE_SHOPIFY_ANALYTICS_URL to the full function URL.
      // Example: https://<project-ref>.supabase.co/functions/v1/Shopify-Analytics
      const baseUrl = import.meta.env.VITE_SHOPIFY_ANALYTICS_URL
        || `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/Shopify-Analytics`;

      // Let the function decide defaults; but we pass limits for consistency.
      const url = `${baseUrl}?productsFirst=50&ordersFirst=50`;

      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

let token = null;
try {
  const { data: { session } } = await supabase.auth.getSession();
  token = session?.access_token ?? null;
} catch (_) {
  // ignore
}

const response = await fetch(url, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    apikey: anon,
    Authorization: `Bearer ${token ?? anon}`,
  },
});


      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.ok === false) {
        const msg = data?.error || 'Failed to fetch Shopify data';
        throw new Error(msg);
      }

      setShopifyData(data);
    } catch (error) {
      console.error('Error loading Shopify data:', error);
      setShopifyError(error.message);
    } finally {
      setShopifyLoading(false);
    }
  };

  const loadYouTubeData = async () => {
    setLoading(true);
    try {
      // First check if YouTube is connected
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('User not authenticated');
        setAnalytics([]);
        return null;
      }

      const { data: tokenData } = await supabase
        .from('user_social_tokens')
        .select('*')
        .eq('user_id', user.id)
        .eq('platform', 'youtube')
        .single();

      if (!tokenData || !tokenData.is_active) {
        console.log('YouTube not connected');
        setAnalytics([]);
        return null;
      }

      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-analytics`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ period: timeRange })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('YouTube API Error:', errorText);
        throw new Error(`Failed to fetch YouTube data: ${response.status}`);
      }

      const data = await response.json();
      console.log('YouTube data received:', data);
      
      // Load analytics from database
      const { data: analyticsData } = await supabase
        .from('analytics')
        .select('*')
        .eq('platform', 'youtube')
        .order('date', { ascending: false });
      
      console.log('YouTube analytics from DB:', analyticsData);
      setAnalytics(analyticsData || []);
      
      return data;
    } catch (error) {
      console.error('Error loading YouTube data:', error);
      setAnalytics([]);
      return null;
    } finally {
      setLoading(false);
    }
  };


  const platforms = [
    { id: 'all', name: 'Todas', emoji: '📊' },
    { id: 'instagram', name: 'Instagram', emoji: '📸' },
    { id: 'tiktok', name: 'TikTok', emoji: '🎵' },
    { id: 'facebook', name: 'Facebook', emoji: '👥' },
    { id: 'youtube', name: 'YouTube', emoji: '▶️' },
    { id: 'whatsapp', name: 'WhatsApp', emoji: '💬' },
    { id: 'shopify', name: 'Shopify', emoji: '🛍️' }
  ];

  const getPlatformColor = (platform) => {
    const colors = {
      instagram: '#E4405F',
      tiktok: '#000000',
      facebook: '#1877F2',
      youtube: '#FF0000',
      whatsapp: '#25D366',
      shopify: '#96BF48'
    };
    return colors[platform] || '#2D5016';
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const formatNumber = (value) => {
    return new Intl.NumberFormat('es-CL').format(value);
  };

  const calculateTotals = () => {
    if (!analytics || analytics.length === 0) {
      return {
        totalReach: 0,
        avgEngagement: 0,
        totalConversions: 0,
        avgROI: 0
      };
    }

    const totalReach = analytics.reduce((sum, a) => sum + (a.reach || 0), 0);
    const totalImpressions = analytics.reduce((sum, a) => sum + (a.impressions || 0), 0);
    const totalEngagement = analytics.reduce((sum, a) => sum + (a.engagement || 0), 0);
    const avgEngagement = totalImpressions > 0 ? ((totalEngagement / totalImpressions) * 100).toFixed(1) : 0;
    const totalConversions = analytics.reduce((sum, a) => sum + (a.conversions || 0), 0);
    const totalRevenue = analytics.reduce((sum, a) => sum + (a.revenue_clp || 0), 0);
    const avgROI = analytics.reduce((sum, a) => sum + (a.roi || 0), 0) / analytics.length;

    return {
      totalReach,
      avgEngagement,
      totalConversions,
      avgROI: avgROI.toFixed(1)
    };
  };

  const totals = calculateTotals();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: '#2D5016' }}>Analítica Avanzada</h1>
          <p className="text-gray-600 mt-1">Métricas detalladas de rendimiento por canal</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 outline-none"
            style={{ focusRingColor: '#2D5016' }}
          >
            <option value="7days">Últimos 7 días</option>
            <option value="30days">Últimos 30 días</option>
            <option value="90days">Últimos 90 días</option>
          </select>
        </div>
      </div>

      {/* Filtros de Plataforma */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 overflow-x-auto">
          {platforms.map((platform) => (
            <button
              key={platform.id}
              onClick={() => setSelectedPlatform(platform.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                selectedPlatform === platform.id
                  ? 'text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              style={selectedPlatform === platform.id ? { backgroundColor: '#2D5016' } : {}}
            >
              <span>{platform.emoji}</span>
              <span className="text-sm">{platform.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Métricas Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Alcance Total</p>
            <Eye className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold" style={{ color: '#2D5016' }}>
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
          <p className="text-3xl font-bold" style={{ color: '#2D5016' }}>
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
          <p className="text-3xl font-bold" style={{ color: '#2D5016' }}>
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
            <DollarSign className="w-5 h-5" style={{ color: '#D4A017' }} />
          </div>
          <p className="text-3xl font-bold" style={{ color: '#2D5016' }}>
            {totals.avgROI}x
          </p>
          <div className="flex items-center gap-1 mt-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-sm text-green-500 font-medium">+0.8x</span>
            <span className="text-xs text-gray-500">vs período anterior</span>
          </div>
        </div>
      </div>

      {/* Rendimiento por Plataforma */}
      {selectedPlatform === 'all' && analytics.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-lg mb-4" style={{ color: '#2D5016' }}>
            Rendimiento por Plataforma
          </h3>
          <p className="text-gray-500 text-sm text-center py-8">
            Conecta tus plataformas sociales para ver métricas detalladas
          </p>
        </div>
      )}

      {/* YouTube Dashboard */}
      {selectedPlatform === 'youtube' && (
        <div className="space-y-6">
          {loading ? (
            <div className="bg-white p-12 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 mb-4" style={{ borderTopColor: '#FF0000' }}></div>
              <p className="text-gray-600">Cargando datos de YouTube...</p>
            </div>
          ) : analytics.length === 0 ? (
            <div className="bg-white p-12 rounded-xl shadow-sm border border-gray-100 text-center">
              <div className="text-6xl mb-4">▶️</div>
              <h3 className="font-bold text-xl mb-2" style={{ color: '#2D5016' }}>
                YouTube no está conectado
              </h3>
              <p className="text-gray-600 mb-4">
                Conecta tu cuenta de YouTube en la sección de "Conexiones" para ver tus métricas
              </p>
            </div>
          ) : (
            <>
          {/* YouTube Overview */}
          <div className="bg-gradient-to-r from-red-600 to-red-500 p-6 rounded-xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-1">▶️ YouTube Analytics</h2>
                <p className="text-red-100">Rendimiento de tu canal</p>
              </div>
            </div>
          </div>

          {/* YouTube Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Total de Vistas</p>
                <Eye className="w-5 h-5 text-red-500" />
              </div>
              <p className="text-3xl font-bold" style={{ color: '#2D5016' }}>
                {formatNumber(analytics.reduce((sum, a) => sum + (a.impressions || 0), 0))}
              </p>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-500 font-medium">+12.3%</span>
                <span className="text-xs text-gray-500">vs período anterior</span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Me Gusta</p>
                <Heart className="w-5 h-5 text-red-500" />
              </div>
              <p className="text-3xl font-bold" style={{ color: '#2D5016' }}>
                {formatNumber(analytics.reduce((sum, a) => sum + (a.likes || 0), 0))}
              </p>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-500 font-medium">+8.1%</span>
                <span className="text-xs text-gray-500">vs período anterior</span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Comentarios</p>
                <Target className="w-5 h-5 text-purple-500" />
              </div>
              <p className="text-3xl font-bold" style={{ color: '#2D5016' }}>
                {formatNumber(analytics.reduce((sum, a) => sum + (a.comments || 0), 0))}
              </p>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-500 font-medium">+15.7%</span>
                <span className="text-xs text-gray-500">vs período anterior</span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Compartidos</p>
                <TrendingUp className="w-5 h-5 text-blue-500" />
              </div>
              <p className="text-3xl font-bold" style={{ color: '#2D5016' }}>
                {formatNumber(analytics.reduce((sum, a) => sum + (a.shares || 0), 0))}
              </p>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-500 font-medium">+6.2%</span>
                <span className="text-xs text-gray-500">vs período anterior</span>
              </div>
            </div>
          </div>

          {/* Daily Performance Chart */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg" style={{ color: '#2D5016' }}>
                Rendimiento Diario
              </h3>
              <BarChart3 className="w-5 h-5 text-gray-400" />
            </div>
            <div className="space-y-3">
              {analytics.slice(0, 7).map((day, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{new Date(day.date).toLocaleDateString('es-CL')}</span>
                    <div className="text-right">
                      <span className="font-bold" style={{ color: '#2D5016' }}>
                        {formatNumber(day.impressions)} vistas
                      </span>
                      <span className="text-xs text-gray-500 ml-2">({day.likes} likes)</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        backgroundColor: '#FF0000',
                        width: `${(day.impressions / Math.max(...analytics.map(a => a.impressions))) * 100}%`
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          </>
          )}
        </div>
      )}

      {/* Shopify Dashboard */}
      {selectedPlatform === 'shopify' && (
        <div className="space-y-6">
          {shopifyLoading ? (
            <div className="bg-white p-12 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 mb-4" style={{ borderTopColor: '#96BF48' }}></div>
              <p className="text-gray-600">Cargando datos de Shopify...</p>
            </div>
          ) : shopifyError ? (
            <div className="bg-red-50 p-6 rounded-xl border border-red-200">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-red-900 mb-2">Error al cargar datos de Shopify</h3>
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
          ) : !shopifyData ? (
            <div className="bg-white p-12 rounded-xl shadow-sm border border-gray-100 text-center">
              <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="font-bold text-xl mb-2" style={{ color: '#2D5016' }}>
                No hay datos de Shopify disponibles
              </h3>
              <p className="text-gray-600 mb-4">
                Configura la integración con Shopify para ver tus métricas de tienda
              </p>
            </div>
          ) : (
            <>
              {/* Shopify Store Overview */}
              <div className="bg-gradient-to-r from-green-600 to-green-500 p-6 rounded-xl text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold mb-1">🛍️ Shopify Store Dashboard</h2>
                    <p className="text-green-100">{shopifyData.storeUrl}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-green-100">Productos Activos</p>
                    <p className="text-3xl font-bold">{shopifyData.activeProducts}/{shopifyData.totalProducts}</p>
                  </div>
                </div>
              </div>

          {/* Shopify Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Total de Órdenes</p>
                <ShoppingCart className="w-5 h-5 text-green-500" />
              </div>
              <p className="text-3xl font-bold" style={{ color: '#2D5016' }}>
                {formatNumber(shopifyData.totalOrders)}
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
                <DollarSign className="w-5 h-5" style={{ color: '#D4A017' }} />
              </div>
              <p className="text-2xl font-bold" style={{ color: '#2D5016' }}>
                {formatCurrency(shopifyData.totalRevenue)}
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
              <p className="text-2xl font-bold" style={{ color: '#2D5016' }}>
                {formatCurrency(shopifyData.averageOrderValue)}
              </p>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-500 font-medium">+5.8%</span>
                <span className="text-xs text-gray-500">vs mes anterior</span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Tasa de Conversión</p>
                <TrendingUp className="w-5 h-5 text-blue-500" />
              </div>
              <p className="text-3xl font-bold" style={{ color: '#2D5016' }}>
                {shopifyData.conversionRate}%
              </p>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-500 font-medium">+0.4%</span>
                <span className="text-xs text-gray-500">vs mes anterior</span>
              </div>
            </div>
          </div>

          {/* Top Products & Recent Orders */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Selling Products */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg" style={{ color: '#2D5016' }}>
                  Top Productos
                </h3>
                <Target className="w-5 h-5 text-gray-400" />
              </div>
              <div className="space-y-3">
                {shopifyData.topProducts.map((product, index) => (
                  <div key={product.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3 flex-1">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                        style={{ backgroundColor: '#96BF48' }}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{product.name}</p>
                        <p className="text-xs text-gray-500">SKU: {product.sku}</p>
                      </div>
                    </div>
                    <div className="text-right ml-3">
                      <p className="font-bold text-sm" style={{ color: '#2D5016' }}>
                        {formatCurrency(product.revenue)}
                      </p>
                      <p className="text-xs text-gray-500">{product.sold} vendidos</p>
                    </div>
                  </div>
                ))}
                  </div>
                </div>

            {/* Recent Orders */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg" style={{ color: '#2D5016' }}>
                  Órdenes Recientes
                </h3>
                <ShoppingCart className="w-5 h-5 text-gray-400" />
              </div>
              <div className="space-y-3">
                {shopifyData.recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-mono font-bold text-sm" style={{ color: '#2D5016' }}>
                          {order.id}
                        </p>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          order.status === 'fulfilled' ? 'bg-green-100 text-green-700' :
                          order.status === 'shipped' ? 'bg-blue-100 text-blue-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {order.status}
                        </span>
                  </div>
                      <p className="text-xs text-gray-600">{order.customer}</p>
                      <p className="text-xs text-gray-500">{new Date(order.date).toLocaleString('es-CL')}</p>
                  </div>
                    <div className="text-right">
                      <p className="font-bold text-sm" style={{ color: '#2D5016' }}>
                        {formatCurrency(order.total)}
                      </p>
                      <p className="text-xs text-gray-500">{order.items} items</p>
                  </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sales by Category & Weekly Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales by Category */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg" style={{ color: '#2D5016' }}>
                  Ventas por Categoría
            </h3>
            <BarChart3 className="w-5 h-5 text-gray-400" />
          </div>
              <div className="space-y-4">
                {shopifyData.salesByCategory.map((cat, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{cat.category}</span>
                      <span className="text-sm font-bold" style={{ color: '#2D5016' }}>
                        {formatCurrency(cat.revenue)}
                      </span>
                </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                          backgroundColor: '#96BF48',
                          width: `${cat.percentage}%`
                    }}
                  />
                </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{cat.sales} ventas</span>
                      <span>{cat.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

            {/* Weekly Revenue Trend */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg" style={{ color: '#2D5016' }}>
                  Ingresos Semanales
            </h3>
                <Calendar className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-3">
                {shopifyData.weeklyRevenue.map((week, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{week.week}</span>
                      <div className="text-right">
                        <span className="font-bold" style={{ color: '#2D5016' }}>
                          {formatCurrency(week.revenue)}
                    </span>
                        <span className="text-xs text-gray-500 ml-2">({week.orders} órdenes)</span>
                  </div>
                </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          backgroundColor: '#96BF48',
                          width: `${(week.revenue / 5500000) * 100}%`
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Low Stock Alert */}
          <div className="bg-gradient-to-r from-orange-50 to-red-50 p-6 rounded-xl border border-orange-200">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-orange-500">
                <AlertCircle className="w-5 h-5 text-white" />
        </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg mb-3 text-orange-900">
                  ⚠️ Alerta de Inventario Bajo
          </h3>
                <div className="space-y-2">
                  {shopifyData.lowStock.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{item.name}</p>
                        <p className="text-xs text-gray-500">SKU: {item.sku}</p>
        </div>
                      <div className="text-right">
                        <p className="text-sm">
                          <span className="font-bold text-orange-600">{item.stock}</span>
                          <span className="text-gray-500"> / {item.threshold} unidades</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
        </div>
      </div>

              {/* Shopify Insights */}
              {shopifyData.insights && shopifyData.insights.length > 0 && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-xl border border-green-100">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#96BF48' }}>
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg mb-2" style={{ color: '#2D5016' }}>
                        Insights de Shopify
                      </h3>
                      <ul className="space-y-2 text-sm text-gray-700">
                        {shopifyData.insights.map((insight, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className={`${insight.type === 'warning' ? 'text-orange-500' : 'text-green-500'} font-bold`}>•</span>
                            <span>{insight.message}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
