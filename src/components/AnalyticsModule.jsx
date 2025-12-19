import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  DollarSign,
  Eye,
  Heart,
  ShoppingCart,
  Target,
  TrendingUp
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

  const loadAnalytics = () => {
    setLoading(true);

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

    return query
      .then(({ data, error }) => {
        if (error) throw error;
        setAnalytics(data || []);
      })
      .catch((err) => {
        console.error('Error loading analytics:', err);
        setAnalytics([]);
      })
      .finally(() => setLoading(false));
  };

  // ✅ SOLO invoke() y sin try/catch (para evitar el error de build)
  const loadShopifyData = () => {
    setShopifyLoading(true);
    setShopifyError(null);

    return supabase.functions
      .invoke('shopify-analytics', { body: { range: timeRange } })
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        setShopifyData(data);
      })
      .catch((e) => {
        console.error('Shopify analytics error:', e);
        setShopifyError(e?.message || 'Error al cargar Shopify');
        setShopifyData(null);
      })
      .finally(() => {
        setShopifyLoading(false);
      });
  };

  const loadYouTubeData = () => {
    setLoading(true);

    return supabase.auth
      .getUser()
      .then(({ data: userData }) => {
        const user = userData?.user;
        if (!user) {
          setAnalytics([]);
          return null;
        }

        return supabase
          .from('user_social_tokens')
          .select('*')
          .eq('user_id', user.id)
          .eq('platform', 'youtube')
          .single();
      })
      .then((tokenRes) => {
        if (!tokenRes) return null;

        const tokenData = tokenRes.data;
        if (!tokenData || !tokenData.is_active) {
          setAnalytics([]);
          return null;
        }

        return supabase.auth.getSession();
      })
      .then((sessionRes) => {
        if (!sessionRes) return null;

        const session = sessionRes.data?.session;

        return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-analytics`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ period: timeRange })
        });
      })
      .then((resp) => {
        if (!resp) return null;
        if (!resp.ok) return resp.text().then((t) => { throw new Error(t || `YouTube error ${resp.status}`); });
        return resp.json();
      })
      .then(() => {
        return supabase
          .from('analytics')
          .select('*')
          .eq('platform', 'youtube')
          .order('date', { ascending: false });
      })
      .then(({ data }) => {
        setAnalytics(data || []);
      })
      .catch((err) => {
        console.error('Error loading YouTube data:', err);
        setAnalytics([]);
      })
      .finally(() => setLoading(false));
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

  const formatCurrency = (value) =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(Number(value || 0));

  const formatNumber = (value) => new Intl.NumberFormat('es-CL').format(Number(value || 0));

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: '#2D5016' }}>
            Analítica Avanzada
          </h1>
          <p className="text-gray-600 mt-1">Métricas detalladas de rendimiento por canal</p>
        </div>

        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg outline-none"
        >
          <option value="7days">Últimos 7 días</option>
          <option value="30days">Últimos 30 días</option>
          <option value="90days">Últimos 90 días</option>
        </select>
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Alcance Total</p>
            <Eye className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold" style={{ color: '#2D5016' }}>
            {formatNumber(totals.totalReach)}
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Engagement Rate</p>
            <Heart className="w-5 h-5 text-red-500" />
          </div>
          <p className="text-3xl font-bold" style={{ color: '#2D5016' }}>
            {totals.avgEngagement}%
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Conversiones</p>
            <ShoppingCart className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold" style={{ color: '#2D5016' }}>
            {formatNumber(totals.totalConversions)}
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">ROI Promedio</p>
            <DollarSign className="w-5 h-5" style={{ color: '#D4A017' }} />
          </div>
          <p className="text-3xl font-bold" style={{ color: '#2D5016' }}>
            {totals.avgROI}x
          </p>
        </div>
      </div>

      {selectedPlatform === 'shopify' && (
        <div className="space-y-4">
          {shopifyLoading ? (
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
              Cargando Shopify...
            </div>
          ) : shopifyError ? (
            <div className="bg-red-50 p-6 rounded-xl border border-red-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-red-600 mt-1" />
                <div>
                  <p className="font-bold text-red-900">Error Shopify</p>
                  <p className="text-red-700 text-sm">{shopifyError}</p>
                  <button
                    onClick={loadShopifyData}
                    className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg"
                  >
                    Reintentar
                  </button>
                </div>
              </div>
            </div>
          ) : !shopifyData ? (
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
              Sin datos de Shopify.
              <button
                onClick={loadShopifyData}
                className="ml-3 px-4 py-2 rounded-lg text-white"
                style={{ backgroundColor: '#2D5016' }}
              >
                Cargar
              </button>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Órdenes</p>
                  <p className="text-2xl font-bold" style={{ color: '#2D5016' }}>
                    {formatNumber(shopifyData.totalOrders)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Ventas</p>
                  <p className="text-2xl font-bold" style={{ color: '#2D5016' }}>
                    {formatCurrency(shopifyData.totalRevenue)}
                  </p>
                </div>
              </div>
              <div className="mt-4 text-xs text-gray-500">
                Fuente: shopify · vía Supabase Edge Function (invoke)
              </div>
            </div>
          )}
        </div>
      )}

      {selectedPlatform === 'youtube' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-red-500" />
            <p className="font-bold" style={{ color: '#2D5016' }}>
              YouTube
            </p>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {loading ? 'Cargando...' : analytics.length ? 'Conectado ✅' : 'No conectado'}
          </p>
        </div>
      )}

      {selectedPlatform === 'all' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-gray-400" />
            <h3 className="font-bold" style={{ color: '#2D5016' }}>
              Rendimiento por Plataforma
            </h3>
          </div>
          <p className="text-gray-500 text-sm text-center py-6">
            Conecta tus plataformas sociales para ver métricas detalladas
          </p>
        </div>
      )}
    </div>
  );
}
