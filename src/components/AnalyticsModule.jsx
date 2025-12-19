import React, { useEffect, useState } from 'react';
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
  Zap
} from 'lucide-react';
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange, selectedPlatform]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('analytics')
        .select('*')
        .order('date', { ascending: false });

      if (
        selectedPlatform !== 'all' &&
        selectedPlatform !== 'shopify' &&
        selectedPlatform !== 'youtube'
      ) {
        query = query.eq('platform', selectedPlatform);
      }

      const { data, error } = await query;
      if (error) throw error;

      setAnalytics(data || []);
    } catch (error) {
      console.error('Error loading analytics:', error);
      setAnalytics([]);
    } finally {
      setLoading(false);
    }
  };

  // ✅ SOLO invoke() (sin fetch, sin VITE_SHOPIFY_ANALYTICS_URL, sin headers manuales)
  const loadShopifyData = async () => {
    setShopifyLoading(true);
    setShopifyError(null);

    try {
      const { data, error } = await supabase.functions.invoke('shopify-analytics', {
        body: { range: timeRange }
      });

      if (error) throw new Error(error.message);

      setShopifyData(data);
    } catch (e) {
      console.error('Shopify analytics error:', e);
      setShopifyError(e?.message || 'Error al cargar Shopify');
      setShopifyData(null);
    } finally {
      setShopifyLoading(false);
    }
  };

  const loadYouTubeData = async () => {
    setLoading(true);
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

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

      const {
        data: { session }
      } = await supabase.auth.getSession();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-analytics`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ period: timeRange })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('YouTube API Error:', errorText);
        throw new Error(`Failed to fetch YouTube data: ${response.status}`);
      }

      await response.json();

      const { data: analyticsData } = await supabase
        .from('analytics')
        .select('*')
        .eq('platform', 'youtube')
        .order('date', { ascending: false });

      setAnalytics(analyticsData || []);
      return true;
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

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(Number(value || 0));
  };

  const formatNumber = (value) => {
    return new Intl.NumberFormat('es-CL').format(Number(value || 0));
  };

  const calculateTotals = () => {
    if (!analytics || analytics.length === 0) {
      return { totalReach: 0, avgEngagement: 0, totalConversions: 0, avgROI: 0 };
    }

    const totalReach = analytics.reduce((sum, a) => sum + (a.reach || 0), 0);
    const totalImpressions = analytics.reduce((sum, a) => sum + (a.impressions || 0), 0);
    const totalEngagement = analytics.reduce((sum, a) => sum + (a.engagement || 0), 0);

    const avgEngagement =
      totalImpressions > 0 ? ((totalEngagement / totalImpressions) * 100).toFixed(1) : 0;

    const totalConversions = analytics.reduce((sum, a) => sum + (a.conversions || 0), 0);
    const avgROI = analytics.reduce((sum, a) => sum + (a.roi || 0), 0) / analytics.length;

    return {
      totalReach,
      avgEngagement,
      totalConversions,
      avgROI: Number.isFinite(avgROI) ? avgROI.toFixed(1) : '0.0'
    };
  };

  const totals = calculateTotals();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: '#2D5016' }}>
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
      {selectedPlatform === 'all' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-lg mb-4" style={{ color: '#2D5016' }}>
            Rendimiento por Plataforma
          </h3>
          <p className="text-gray-500 text-sm text-center py-8">
            Conecta tus plataformas sociales para ver métricas detalladas
          </p>
        </div>
      )}

      {/* YouTube */}
      {selectedPlatform === 'youtube' && (
        <div className="space-y-6">
          {loading ? (
            <div className="bg-white p-12 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
              <div
                className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 mb-4"
                style={{ borderTopColor: '#FF0000' }}
              />
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
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-lg" style={{ color: '#2D5016' }}>
                YouTube conectado ✅
              </h3>
              <p className="text-gray-600 text-sm mt-1">
                Ya estás trayendo datos (tabla analytics: platform=youtube).
              </p>
            </div>
          )}
        </div>
      )}

      {/* Shopify */}
      {selectedPlatform === 'shopify' && (
        <div className="space-y-6">
          {shopifyLoading ? (
            <div className="bg-white p-12 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
              <div
                className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 mb-4"
                style={{ borderTopColor: '#96BF48' }}
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
          ) : !shopifyData ? (
            <div className="bg-white p-12 rounded-xl shadow-sm border border-gray-100 text-center">
              <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="font-bold text-xl mb-2" style={{ color: '#2D5016' }}>
                No hay datos de Shopify disponibles
              </h3>
              <p className="text-gray-600 mb-4">Revisa tu Edge Function shopify-analytics.</p>
              <button
                onClick={loadShopifyData}
                className="mt-2 px-4 py-2 rounded-lg text-white"
                style={{ backgroundColor: '#2D5016' }}
              >
                Cargar Shopify
              </button>
            </div>
          ) : (
            <>
              {/* Resumen mínimo (seguro) para evitar romper si faltan campos */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-lg" style={{ color: '#2D5016' }}>
                      Analítica Shopify
                    </h3>
                    <p className="text-gray-600 text-sm">
                      Fuente: <b>shopify</b> · Datos vía Supabase Edge Function
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <div className="p-4 rounded-lg bg-gray-50 border">
                    <p className="text-sm text-gray-600">Órdenes</p>
                    <p className="text-2xl font-bold" style={{ color: '#2D5016' }}>
                      {formatNumber(shopifyData?.totalOrders)}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-gray-50 border">
                    <p className="text-sm text-gray-600">Ventas Totales</p>
                    <p className="text-2xl font-bold" style={{ color: '#2D5016' }}>
                      {formatCurrency(shopifyData?.totalRevenue)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Los dashboards avanzados (productos, órdenes, inventario) se habilitan cuando ampliemos la función Shopify.
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
