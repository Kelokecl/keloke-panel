import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function AnalyticsModule() {
  const [timeRange, setTimeRange] = useState("7days");
  const [shopifyData, setShopifyData] = useState(null);
  const [shopifyLoading, setShopifyLoading] = useState(false);
  const [shopifyError, setShopifyError] = useState(null);

  useEffect(() => {
    loadShopifyData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]);

  // 🚫 SIN try / catch (para que Vite NO falle)
  const loadShopifyData = () => {
    setShopifyLoading(true);
    setShopifyError(null);

    supabase.functions
      .invoke("shopify-analytics", {
        body: { range: timeRange },
      })
      .then(({ data, error }) => {
        if (error) {
          setShopifyError(error.message || "Error invocando shopify-analytics");
          setShopifyData(null);
          return;
        }
        setShopifyData(data);
      })
      .catch((e) => {
        setShopifyError(String(e?.message || e));
        setShopifyData(null);
      })
      .finally(() => {
        setShopifyLoading(false);
      });
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>Analítica Shopify</h1>

      <select
        value={timeRange}
        onChange={(e) => setTimeRange(e.target.value)}
      >
        <option value="7days">Últimos 7 días</option>
        <option value="30days">Últimos 30 días</option>
        <option value="90days">Últimos 90 días</option>
      </select>

      {shopifyLoading && <p>Cargando datos de Shopify…</p>}

      {shopifyError && (
        <p style={{ color: "red" }}>
          Error Shopify: {shopifyError}
        </p>
      )}

      {shopifyData && (
        <div style={{ marginTop: 16 }}>
          <p><b>Órdenes:</b> {shopifyData?.stats?.orders ?? 0}</p>
          <p><b>Ventas:</b> ${shopifyData?.stats?.sales ?? 0}</p>
          <p style={{ fontSize: 12, opacity: 0.7 }}>
            Fuente: Supabase Edge Function
          </p>
        </div>
      )}
    </div>
  );
}
