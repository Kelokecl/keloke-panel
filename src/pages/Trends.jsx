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

      const { data, error: qErr, count } = await supabase
        .from("v_winners_balanced_ui2")
        .select(
          [
            "keloke_category",
            "product_family",
            "title",
            "url",
            "meli_item_id",
            "ml_price_clp",
            "suggested_price_25",
            "profit_clp",
            "margin_pct",
            "traffic_light_base",
            "traffic_light_final",
            "high_ticket_level",
            "adjusted_winner_score",
            "ml_ratio",
            "price_fetched_at",
          ].join(","),
          { count: "exact" }
        )
        .order("keloke_category", { ascending: true })
        .order("adjusted_winner_score", { ascending: false, nullsFirst: false })
        .range(from, to);

      if (qErr) throw qErr;

      setItems(data || []);
      setTotalRows(count || 0);
      setPage(p);
    } catch (e) {
      console.error("loadPage error:", e);
      setError("No se pudo cargar el listado. Revisa que exista la vista v_winners_balanced_ui2.");
      setItems([]);
      setTotalRows(0);
      setPage(1);
    } finally {
      setLoading(false);
    }
  }

  // Botón “Escanear ahora” (por ahora recarga)
  async function runScan() {
    setRunning(true);
    setError("");
    try {
      // Si luego tienes Edge Function real:
      // const { error } = await supabase.functions.invoke("trends-scan", { body: { limit: 50 } });
      // if (error) throw error;

      await loadPage(1);
    } catch (e) {
      console.error("runScan error:", e);
      setError("Falló el escaneo. Revisa Edge Function o permisos.");
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
            Listado balanceado por categoría (top 2 por categoría; si falta data, usa candidatos del mapeo) + paginación.
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
            {running ? "Escaneando..." : "Escanear ahora"}
          </button>

          <button
            onClick={() => loadPage(1)}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300"
          >
            Actualizar
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
            Semáforo: <b>verde/amarillo/rojo</b> + <b>high ticket azul</b> (50k/80k/100k+).
          </p>
        </div>

        {loading ? (
          <div className="p-6 text-gray-600">Cargando...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-gray-600">
            No hay items. Si hay categorías en rules, pero aquí no aparecen, revisa que la vista v_winners_balanced_ui2 exista.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((p, idx) => (
              <WinnerRow key={`${p.url || p.meli_item_id || idx}-${idx}`} idx={(page - 1) * pageSize + idx} item={p} />
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
  const title = item?.title || item?.meli_item_id || "Producto";
  const cat = item?.keloke_category || "Sin categoría";
  const fam = item?.product_family || "";

  const score = item?.adjusted_winner_score ?? null;

  const mlPrice = item?.ml_price_clp ?? null;
  const sellPrice = item?.suggested_price_25 ?? null;
  const profit = item?.profit_clp ?? null;
  const margin = item?.margin_pct ?? null;

  const traffic = (item?.traffic_light_final || item?.traffic_light_base || "yellow").toLowerCase();

  // ✅ nombre real
  const htTier = item?.high_ticket_level || null;

  const hasPricing = mlPrice !== null && sellPrice !== null;

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold break-words">
              {idx + 1}. {title}
            </p>
            <TrafficPill traffic={traffic} />
            {htTier ? <HighTicketPill tier={htTier} /> : null}
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <TagPill>{cat}</TagPill>
            {fam ? <TagPill subtle>{fam}</TagPill> : null}
            {score !== null ? (
              <span className="text-[11px] text-gray-500">
                Score: <span className="font-semibold">{Number(score).toFixed(2)}</span>
              </span>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <Box label="Precio ML (costo)" value={mlPrice !== null ? moneyCLP(mlPrice) : "—"} strong />
            <Box label="Precio sugerido (x2.5)" value={sellPrice !== null ? moneyCLP(sellPrice) : "—"} strong />
            <Box label="Ganancia" value={profit !== null ? moneyCLP(profit) : "—"} accent />
            <Box label="Margen" value={margin !== null ? `${Number(margin).toFixed(1)}%` : "—"} />
          </div>

          <div className="mt-3">
            {!hasPricing ? (
              <p className="text-xs text-gray-500">
                Este ítem es candidato (fallback). Cuando el pricing/backfill lo complete, verás precio/ganancia/margen.
              </p>
            ) : (
              <p className="text-xs text-gray-500">(IA pronto) Aquí va mini justificación + recomendación.</p>
            )}
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2">
          <button
            onClick={() => item?.url && window.open(item.url, "_blank", "noopener,noreferrer")}
            disabled={!item?.url}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-sm disabled:opacity-50"
          >
            Ver <ExternalLink className="w-4 h-4 inline-block ml-1" />
          </button>

          {item?.price_fetched_at ? (
            <span className="text-[11px] text-gray-400">{new Date(item.price_fetched_at).toLocaleString("es-CL")}</span>
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

function Box({ label, value, strong, accent }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p
        className={`text-sm ${strong ? "font-semibold" : "font-medium"}`}
        style={accent ? { color: "#D4A017", fontWeight: 700 } : { color: "#2D5016", fontWeight: strong ? 700 : 600 }}
      >
        {value}
      </p>
    </div>
  );
}

function TrafficPill({ traffic }) {
  const map = {
    green: { label: "Ganador", bg: "#E9F7E7", fg: "#2D5016", bd: "#CFE8CB" },
    yellow: { label: "Descubrimiento", bg: "#FFF6D9", fg: "#7A5A00", bd: "#F1E0A5" },
    red: { label: "Explorar", bg: "#FDE8E8", fg: "#7A1E1E", bd: "#F6CACA" },
    blue: { label: "High Ticket", bg: "#E8F1FF", fg: "#1E3A8A", bd: "#C7DBFF" },
  };
  const s = map[traffic] || map.yellow;

  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full border" style={{ backgroundColor: s.bg, color: s.fg, borderColor: s.bd }}>
      {s.label}
    </span>
  );
}

function HighTicketPill({ tier }) {
  const t = String(tier || "").toUpperCase();
  const label =
    t.includes("100") ? "HT 100K+" : t.includes("80") ? "HT 80K+" : t.includes("50") ? "HT 50K+" : "High Ticket";

  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full border"
      style={{ backgroundColor: "#E8F1FF", color: "#1E3A8A", borderColor: "#C7DBFF" }}
    >
      {label}
    </span>
  );
}

function TagPill({ children, subtle }) {
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full"
      style={{
        backgroundColor: subtle ? "#F3F4F6" : "#F5E6D3",
        color: subtle ? "#374151" : "#2D5016",
      }}
    >
      {children}
    </span>
  );
}
