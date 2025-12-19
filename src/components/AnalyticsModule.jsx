import {
  AlertCircle,
  ShoppingCart,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase'; // ✅ tu supabase.jsx

export default function AnalyticsModule() {
  const [timeRange, setTimeRange] = useState('7days');
  const [selectedPlatform, setSelectedPlatform] = useState('shopify');

  const [shopifyData, setShopifyData] = useState(null);
  const [shopifyLoading, setShopifyLoading] = useState(false);
  const [shopifyError, setShopifyError] = useState(null);

  useEffect(() => {
    if (selectedPlatform === 'shopify') {
      loadShopifyData();
    }
  }, [timeRange, selectedPlatform]);

  const loadShopifyData = async () => {
  setShopifyLoading(true);
  setShopifyError(null);

  try {
    const { data, error } = await supabase.functions.invoke(
      "shopify-analytics",
      {
        body: {
          range: timeRange,
          platform: "shopify",
        },
      }
    );

    if (error) {
      setShopifyError(error.message || "Error invocando shopify-analytics");
      setShopifyData(null);
      return;
    }

    setShopifyData(data);
  } catch (e) {
    setShopifyError(e?.message || String(e));
    setShopifyData(null);
  } finally {
    setShopifyLoading(false);
  }
};


      if (error) {
        setShopifyError(error.message || 'Error en shopify-analytics');
        setShopifyData(null);
        return;
      }

      setShopifyData(data);
    } catch (e) {
      setShopifyError(String(e?.message || e));
      setShopifyData(null);
    } finally {
      setShopifyLoading(false);
    }
  };

  const sales = shopifyData?.stats?.sales ?? 0;
  const orders = shopifyData?.stats?.orders ?? 0;
  const source = shopifyData?.source ?? '—';

  const formatCurrency = (value) =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0,
    }).format(value);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#2D5016]">
            Analítica Shopify
          </h1>
          <p className="text-gray-600 mt-1">
            Datos reales desde Edge Functions
          </p>
        </div>

        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="px-4 py-2 border rounded-lg"
        >
          <option value="7days">Últimos 7 días</option>
          <option value="30days">Últimos 30 días</option>
          <option value="90days">Últimos 90 días</option>
        </select>
      </div>

      {/* Shopify */}
      {shopifyLoading ? (
        <div className="bg-white p-12 rounded-xl shadow border flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 mb-4 border-t-green-500"></div>
          <p className="text-gray-600">Cargando datos de Shopify…</p>
        </div>
      ) : shopifyError ? (
        <div className="bg-red-50 p-6 rounded-xl border border-red-200">
          <div className="flex gap-3">
            <AlertCircle className="text-red-600" />
            <div>
              <p className="font-bold text-red-800">
                Error al cargar Shopify
              </p>
              <p className="text-red-700 text-sm">{shopifyError}</p>
            </div>
          </div>
        </div>
      ) : !shopifyData ? (
        <div className="bg-white p-12 rounded-xl shadow border text-center">
          <ShoppingCart className="w-14 h-14 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-600">
            No hay datos disponibles
          </p>
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow border">
              <div className="flex justify-between mb-2">
                <p className="text-sm text-gray-600">
                  Órdenes
                </p>
                <ShoppingCart className="text-green-500" />
              </div>
              <p className="text-3xl font-bold text-[#2D5016]">
                {orders}
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow border">
              <div className="flex justify-between mb-2">
                <p className="text-sm text-gray-600">
                  Ventas Totales
                </p>
                <DollarSign className="text-yellow-500" />
              </div>
              <p className="text-3xl font-bold text-[#2D5016]">
                {formatCurrency(sales)}
              </p>
            </div>
          </div>

          {/* Info */}
          <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-600">
            Fuente: <b>{source}</b> ·
            Datos obtenidos vía Supabase Edge Function
          </div>

          {/* Aviso */}
          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg text-sm">
            ⚠️ Los dashboards avanzados (productos, órdenes, inventario)
            se habilitan cuando ampliemos la función Shopify.
          </div>
        </>
      )}
    </div>
  );
}
