import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  LayoutDashboard, 
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
  Clock
} from 'lucide-react';

export default function Dashboard() {
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

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    const timeout = setTimeout(() => {
      setError('La carga está tardando más de lo esperado. Verifica tu conexión.');
      setLoading(false);
    }, 10000); // 10 segundos timeout

    try {
      setError(null);
      
      // Cargar estadísticas en paralelo
      const [productsRes, contentRes, automationsRes, alertsRes] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('generated_content').select('id', { count: 'exact', head: true }).eq('status', 'scheduled'),
        supabase.from('automations').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('is_read', false),
      ]);

      setStats({
        totalProducts: productsRes.count || 0,
        scheduledContent: contentRes.count || 0,
        activeAutomations: automationsRes.count || 0,
        pendingAlerts: alertsRes.count || 0,
      });

      // Cargar alertas y productos en paralelo
      const [alertsResult, productsResult] = await Promise.all([
        supabase
          .from('alerts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('winning_products')
          .select('*')
          .eq('status', 'active')
          .order('tiktok_score', { ascending: false })
          .limit(3)
      ]);

      setRecentAlerts(alertsResult.data || []);
      setWinningProducts(productsResult.data || []);
      
      clearTimeout(timeout);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setError('Error al cargar el dashboard. Por favor, intenta recargar la página.');
      clearTimeout(timeout);
    } finally {
      setLoading(false);
    }
  }

  const alertTypeColors = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    important: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    informational: 'bg-blue-100 text-blue-700 border-blue-200',
    report: 'bg-green-100 text-green-700 border-green-200',
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
            onClick={() => {
              setLoading(true);
              setError(null);
              loadDashboardData();
            }}
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
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Productos Activos</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#2D5016' }}>{stats.totalProducts}</p>
            </div>
            <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F5E6D3' }}>
              <ShoppingBag className="w-6 h-6" style={{ color: '#2D5016' }} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Contenido Programado</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#2D5016' }}>{stats.scheduledContent}</p>
            </div>
            <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F5E6D3' }}>
              <Calendar className="w-6 h-6" style={{ color: '#2D5016' }} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Automatizaciones Activas</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#2D5016' }}>{stats.activeAutomations}</p>
            </div>
            <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F5E6D3' }}>
              <Zap className="w-6 h-6" style={{ color: '#2D5016' }} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Alertas Pendientes</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#2D5016' }}>{stats.pendingAlerts}</p>
            </div>
            <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F5E6D3' }}>
              <Bell className="w-6 h-6" style={{ color: '#2D5016' }} />
            </div>
          </div>
        </div>
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
                  className={`p-4 rounded-lg border ${alertTypeColors[alert.alert_type]}`}
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{alert.title}</p>
                      <p className="text-xs mt-1 opacity-80">{alert.message}</p>
                      <p className="text-xs mt-2 opacity-60">
                        {new Date(alert.created_at).toLocaleString('es-CL')}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
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
              winningProducts.map((product, index) => (
                <div
                  key={product.id}
                  className="p-4 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#D4A017' }}>
                      <span className="text-white font-bold text-sm">{index + 1}</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{product.product_name}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                        <span className="font-mono" style={{ color: '#2D5016' }}>
                          ${product.suggested_price_clp.toLocaleString('es-CL')}
                        </span>
                        <span className="px-2 py-1 rounded-full text-xs" style={{ backgroundColor: '#F5E6D3', color: '#2D5016' }}>
                          {product.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className="h-2 rounded-full"
                            style={{ 
                              width: `${(product.tiktok_score / 10) * 100}%`,
                              backgroundColor: '#D4A017'
                            }}
                          ></div>
                        </div>
                        <span className="text-xs font-medium" style={{ color: '#2D5016' }}>
                          {product.tiktok_score}/10
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold mb-4" style={{ color: '#2D5016' }}>Acciones Rápidas</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left">
            <FileText className="w-6 h-6 mb-2" style={{ color: '#2D5016' }} />
            <p className="font-medium text-sm">Generar Contenido</p>
            <p className="text-xs text-gray-500 mt-1">Crear nuevo post</p>
          </button>
          <button className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left">
            <Calendar className="w-6 h-6 mb-2" style={{ color: '#2D5016' }} />
            <p className="font-medium text-sm">Ver Calendario</p>
            <p className="text-xs text-gray-500 mt-1">Programar publicaciones</p>
          </button>
          <button className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left">
            <BarChart3 className="w-6 h-6 mb-2" style={{ color: '#2D5016' }} />
            <p className="font-medium text-sm">Analítica</p>
            <p className="text-xs text-gray-500 mt-1">Ver métricas</p>
          </button>
          <button className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left">
            <Settings className="w-6 h-6 mb-2" style={{ color: '#2D5016' }} />
            <p className="font-medium text-sm">Configuración</p>
            <p className="text-xs text-gray-500 mt-1">Ajustar sistema</p>
          </button>
        </div>
      </div>
    </div>
  );
}