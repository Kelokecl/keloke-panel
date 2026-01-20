import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { TrendingUp, RefreshCw, AlertCircle } from "lucide-react";

export default function Trends() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("winning_products")
        .select("*")
        .eq("status", "active")
        .order("score", { ascending: false })
        .limit(20);

      if (error) throw error;
      setItems(data || []);
    } catch (e) {
      console.error(e);
      setError("No pude cargar winning_products. Revisa RLS/permisos.");
    } finally {
      setLoading(false);
    }
  }

  async function runScan() {
    try {
      setRunning(true);
      setError(null);
      const { data, error } = await supabase.functions.invoke("trends-scan", {
        body: { country: "CL" },
      });
      if (error) throw error;
      await load();
      return data;
    } catch (e) {
      console.error(e);
      setError("Falló el escaneo. Revisa function trends-scan y logs.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "#2D5016" }}>
            Tendencias / Productos Ganadores (Chile)
          </h1>
          <p className="text-gray-600 mt-1">
            Escanea fuentes y genera un Top semanal para agregar productos a Keloke.
          </p>
        </div>

        <button
          onClick={runScan}
          disabled={running}
          className="px-4 py-2 rounded-lg text-white flex items-center gap-2 disabled:opacity-60"
          style={{ backgroundColor: "#2D5016" }}
        >
          <RefreshCw className={`w-4 h-4 ${running ? "animate-spin" : ""}`} />
          Escanear ahora
        </button>
      </div>

      {error ? (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-gray-500" />
          <span className="font-semibold" style={{ color: "#2D5016" }}>
            Top 20 (por score)
          </span>
        </div>

        {loading ? (
          <div className="p-6 text-gray-600">Cargando...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-gray-600">
            Aún no hay productos. Presiona <b>“Escanear ahora”</b>.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((p, idx) => (
              <div key={p.id} className="p-4 flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">
                    {idx + 1}. {p.product_name}
                  </p>
                  <p className="text-sm text-gray-600">
                    {p.category || "Sin categoría"} · Score {Number(p.score || 0).toFixed(1)}
                  </p>
                </div>
                {p.suggested_price_clp ? (
                  <div className="text-sm font-mono" style={{ color: "#2D5016" }}>
                    ${Number(p.suggested_price_clp).toLocaleString("es-CL")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
