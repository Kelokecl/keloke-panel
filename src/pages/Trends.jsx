// src/pages/Trends.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { TrendingUp, RefreshCw, AlertCircle, ExternalLink } from "lucide-react";

export default function Trends() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRows, setTotalRows] = useState(0);

  const totalPages = useMemo(() => {
    const t = Math.ceil((totalRows || 0) / pageSize);
    return t <= 0 ? 1 : t;
  }, [totalRows, pageSize]);

  useEffect(() => {
    loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  async function loadPage(nextPage) {
    setLoading(true);
    setError("");
    try {
      const p = Math.max(1, nextPage);
      const from = (p - 1) * pageSize;
      const to = from + pageSize - 1;

      // ✅ CAMBIO: leer desde v_winners_top60_prod_365d (tu fuente real con señal retail)
      const { data, error: qErr, count } = await supabase
        .from("v_winners_with_pricing_ht_prod_365d")
        .select(
          [
            "page",
            "categoria",
            "title",
            "image_url",
            "product_url",
            "ml_price_clp",
            "scraped_at",
            "score",
            "best_retail_price_clp",
            "offers_7d",
            "last_retail_fetch_at",
            "signal_type",
            "signal_score",
          ].join(","),
          { count: "exact" }
        )
        .order("page", { ascending: true })
        .order("signal_score", { ascending: false, nullsFirst: false })
        .range(from, to);

      if (qErr) throw qErr;

      setItems(data || []);
      setTotalRows(count || 0);
      setPage(p);
    } catch (e) {
      console.error("loadPage error:", e);
      setError("No se pudo cargar el listado. Revisa que exista la vista v_winners_top60_prod_365d.");
      setItems([]);
      setTotalRows(0);
      setPage(1);
    } finally {
      setLoading(false);
    }
  }

  async function runScan() {
    setRunning(true);
    setError("");
    try {
      // Por ahora solo recarga (tu backfill/cron corre aparte)
      await loadPage(1);
    } catch (e) {
      console.error("runScan error:", e);
      setError("Falló el refresh. Revisa permisos.");
    } finally {
      setRunning(false);
    }
  }

  function pageButtons() {
    const max = totalPages;
    const cur = page;

    const start = Math.max(1, cur - 3);
    const end = Math.min(max, start + 6);

    const out = [];
    for (let i = start; i <= end; i++) out.push(i);
    return out;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "#2D5016" }}>
            Productos Ganadores IA
          </h1>
          <p className="text-gray-600 mt-1">
            Top 60 con retail match (señal + ofertas 7d + mejor precio retail) • paginación.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={runScan}
            disabled={running}
            className="px-4 py-2 rounded-lg text-white flex items-center gap-2 disabled:opacity-60"
            style={{ backgroundColor: "#2D5016" }}
          >
            <RefreshCw className={`w-4 h-4 ${running ? "animate-spin" : ""}`} />
            {running ? "Actualizando..." : "Actualizar ahora"}
          </button>

          <button
            onClick={() => loadPage(1)}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300"
          >
            Recargar
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <TrendingUp className="w-4 h-4" />
          <span>
            Total: <b>{totalRows}</b> • Página <b>{page}</b> / <b>{totalPages}</b>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">Por página</label>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
        </div>
      </div>

      {error ? (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <p className="text-sm text-gray-600">
            Señal retail: <b>ARBITRAJE_POSITIVO / UNDERVALUED_ML / NEUTRAL</b> • Ofertas: <b>offers_7d</b> • Mejor precio:{" "}
            <b>best_retail_price_clp</b>
          </p>
        </div>

        {loading ? (
          <div className="p-6 text-gray-600">Cargando...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-gray-600">
            No hay items. Si tu query de conteo da 60, revisa RLS/permisos del anon key o que esta vista sea accesible.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((p, idx) => (
              <WinnerRow key={`${p.product_url || idx}-${idx}`} idx={(page - 1) * pageSize + idx} item={p} />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => loadPage(Math.max(1, page - 1))}
          disabled={page <= 1 || loading}
          className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 disabled:opacity-50"
        >
          ← Anterior
        </button>

        <div className="flex items-center gap-1 flex-wrap justify-center">
          {pageButtons().map((n) => (
            <button
              key={n}
              onClick={() => loadPage(n)}
              disabled={loading}
              className={`w-10 h-10 rounded-lg border text-sm ${
                n === page ? "border-gray-400 font-semibold" : "border-gray-200 hover:border-gray-300"
              }`}
              style={n === page ? { backgroundColor: "#F5E6D3", color: "#2D5016" } : {}}
            >
              {n}
            </button>
          ))}
        </div>

        <button
          onClick={() => loadPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages || loading}
          className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 disabled:opacity-50"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}

function WinnerRow({ idx, item }) {
  const title = item?.title || "Producto";
  const cat = item?.categoria || "Sin categoría";

  const mlPrice = item?.ml_price_clp ?? null;
  const suggested = mlPrice != null ? Math.round(Number(mlPrice) * 2.5) : null;

  const bestRetail = item?.best_retail_price_clp ?? null;
  const offers7d = item?.offers_7d ?? null;
  const signalType = item?.signal_type ?? null;

  const url = item?.product_url || null;

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold break-words">
              {idx + 1}. {title}
            </p>
            {signalType ? <SignalPill type={signalType} /> : null}
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <TagPill>{cat}</TagPill>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <Box label="Precio ML" value={mlPrice !== null ? moneyCLP(mlPrice) : "—"} strong />
            <Box label="Precio sugerido (x2.5)" value={suggested !== null ? moneyCLP(suggested) : "—"} strong />
            <Box label="Mejor precio retail" value={bestRetail !== null ? moneyCLP(bestRetail) : "—"} strong />
            <Box label="Ofertas 7 días" value={offers7d !== null ? String(offers7d) : "—"} />
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2">
          <button
            onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
            disabled={!url}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-sm disabled:opacity-50"
          >
            Ver <ExternalLink className="w-4 h-4 inline-block ml-1" />
          </button>

          {item?.scraped_at ? (
            <span className="text-[11px] text-gray-400">{new Date(item.scraped_at).toLocaleString("es-CL")}</span>
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

function Box({ label, value, strong }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-sm ${strong ? "font-semibold" : "font-medium"}`} style={{ color: "#2D5016" }}>
        {value}
      </p>
    </div>
  );
}

function SignalPill({ type }) {
  const t = String(type || "").toUpperCase();
  const map = {
    ARBITRAJE_POSITIVO: { label: "ARBITRAJE +", bg: "#E9F7E7", fg: "#2D5016", bd: "#CFE8CB" },
    UNDERVALUED_ML: { label: "UNDERVALUED", bg: "#FFF6D9", fg: "#7A5A00", bd: "#F1E0A5" },
    NEUTRAL: { label: "NEUTRAL", bg: "#F3F4F6", fg: "#374151", bd: "#E5E7EB" },
  };
  const s = map[t] || { label: t || "SIGNAL", bg: "#F3F4F6", fg: "#374151", bd: "#E5E7EB" };

  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full border" style={{ backgroundColor: s.bg, color: s.fg, borderColor: s.bd }}>
      {s.label}
    </span>
  );
}

function TagPill({ children }) {
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "#F5E6D3", color: "#2D5016" }}>
      {children}
    </span>
  );
}
