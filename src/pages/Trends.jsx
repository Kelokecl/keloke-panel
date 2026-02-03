// src/pages/Trends.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  TrendingUp,
  ExternalLink,
  RefreshCw,
  Search,
  Filter,
  ArrowUpDown,
  AlertCircle,
} from "lucide-react";

export default function Trends() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // filtros
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [traffic, setTraffic] = useState("all"); // green/yellow/red/blue
  const [ht, setHt] = useState("all"); // HT1_50K / HT2_80K / HT3_100K
  const [viewMode, setViewMode] = useState("cards"); // cards | table

  // sorting
  const [sortBy, setSortBy] = useState("adjusted_winner_score"); // adjusted_winner_score | ml_price_clp | margin_pct
  const [sortDir, setSortDir] = useState("desc"); // asc | desc

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const timeout = setTimeout(() => {
      setError("La carga está tardando más de lo esperado. Revisa conexión/permisos (RLS).");
      setLoading(false);
    }, 12000);

    try {
      setError(null);
      setLoading(true);

      const { data, error: e } = await supabase
        .from("v_winners_with_pricing_ht")
        .select(
          [
            "keloke_category",
            "product_family",
            "title",
            "url",
            "ml_price_clp",
            "suggested_price_25",
            "profit_clp",
            "margin_pct",
            "traffic_light_base",
            "traffic_light_final",
            "high_ticket_tier",
            "adjusted_winner_score",
            "ml_ratio",
            "price_fetched_at",
          ].join(",")
        );

      if (e) throw e;

      setRows(data || []);
      clearTimeout(timeout);
    } catch (err) {
      console.error("Trends load error:", err);
      setError(err?.message || "Error al cargar tendencias.");
      clearTimeout(timeout);
    } finally {
      setLoading(false);
    }
  }

  const categories = useMemo(() => {
    const set = new Set();
    (rows || []).forEach((r) => {
      if (r?.keloke_category) set.add(r.keloke_category);
    });
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b, "es"))];
  }, [rows]);

  const filtered = useMemo(() => {
    const text = (q || "").trim().toLowerCase();

    let out = (rows || []).slice();

    if (cat !== "all") out = out.filter((r) => (r?.keloke_category || "") === cat);

    if (traffic !== "all") {
      out = out.filter((r) => (r?.traffic_light_final || "").toLowerCase() === traffic);
    }

    if (ht !== "all") {
      out = out.filter((r) => (r?.high_ticket_tier || "") === ht);
    }

    if (text) {
      out = out.filter((r) => {
        const hay = `${r?.title || ""} ${r?.product_family || ""} ${r?.keloke_category || ""}`.toLowerCase();
        return hay.includes(text);
      });
    }

    out.sort((a, b) => {
      const av = a?.[sortBy];
      const bv = b?.[sortBy];

      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      const na = Number(av);
      const nb = Number(bv);
      const bothNumeric = !Number.isNaN(na) && !Number.isNaN(nb);

      let cmp = 0;
      if (bothNumeric) cmp = na - nb;
      else cmp = String(av).localeCompare(String(bv), "es");

      return sortDir === "asc" ? cmp : -cmp;
    });

    return out;
  }, [rows, q, cat, traffic, ht, sortBy, sortDir]);

  function toggleSort(field) {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  }

  function fmtCLP(n) {
    if (n == null) return "—";
    const v = Number(n);
    if (Number.isNaN(v)) return "—";
    return `$${v.toLocaleString("es-CL")}`;
  }

  function fmtPct(n) {
    if (n == null) return "—";
    const v = Number(n);
    if (Number.isNaN(v)) return "—";
    return `${v.toFixed(1)}%`;
  }

  function fmtScore(n) {
    if (n == null) return "—";
    const v = Number(n);
    if (Number.isNaN(v)) return "—";
    return v.toFixed(2);
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="bg-white border border-gray-100 rounded-xl p-6 flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-gray-500" />
          <p className="text-gray-600">Cargando ganadores IA...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-white border border-red-100 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-500 mt-0.5" />
            <div>
              <p className="font-semibold text-red-700">Error</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <button
                onClick={load}
                className="mt-4 px-4 py-2 rounded-lg text-white text-sm hover:opacity-90"
                style={{ backgroundColor: "#2D5016" }}
              >
                Reintentar
              </button>
              <p className="text-xs text-gray-500 mt-3">
                Si en SQL la vista funciona, esto suele ser permisos/RLS (grant select a anon/authenticated).
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "#2D5016" }}>
            Productos Ganadores IA
          </h1>
          <p className="text-gray-600 mt-1">Top productos (Chile) + oportunidades de catálogo</p>
        </div>

        <button
          onClick={load}
          className="px-4 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-sm flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-gray-500" />
          <p className="font-semibold text-gray-800">Filtros</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por título, familia o categoría..."
                className="w-full outline-none text-sm"
              />
            </div>
          </div>

          <div className="md:col-span-3">
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === "all" ? "Todas las categorías" : c}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={traffic}
              onChange={(e) => setTraffic(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
            >
              <option value="all">Semáforo (todos)</option>
              <option value="green">Verde (Ganador)</option>
              <option value="yellow">Amarillo (Descubrimiento)</option>
              <option value="red">Rojo (Explorar)</option>
              <option value="blue">Azul (High Ticket)</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={ht}
              onChange={(e) => setHt(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
            >
              <option value="all">High Ticket (todos)</option>
              <option value="HT1_50K">HT 50K+</option>
              <option value="HT2_80K">HT 80K+</option>
              <option value="HT3_100K">HT 100K+</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("cards")}
              className="px-3 py-2 rounded-lg border text-sm"
              style={{
                borderColor: viewMode === "cards" ? "#2D5016" : "#E5E7EB",
                color: viewMode === "cards" ? "#2D5016" : "#374151",
                backgroundColor: viewMode === "cards" ? "#F5E6D3" : "white",
              }}
            >
              Cards
            </button>
            <button
              onClick={() => setViewMode("table")}
              className="px-3 py-2 rounded-lg border text-sm"
              style={{
                borderColor: viewMode === "table" ? "#2D5016" : "#E5E7EB",
                color: viewMode === "table" ? "#2D5016" : "#374151",
                backgroundColor: viewMode === "table" ? "#F5E6D3" : "white",
              }}
            >
              Tabla
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleSort("adjusted_winner_score")}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-sm flex items-center gap-2"
              title="Ordenar por score"
            >
              <ArrowUpDown className="w-4 h-4" />
              Score
            </button>
            <button
              onClick={() => toggleSort("ml_price_clp")}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-sm flex items-center gap-2"
              title="Ordenar por precio ML"
            >
              <ArrowUpDown className="w-4 h-4" />
              Precio ML
            </button>
            <button
              onClick={() => toggleSort("margin_pct")}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-sm flex items-center gap-2"
              title="Ordenar por margen"
            >
              <ArrowUpDown className="w-4 h-4" />
              Margen
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-3">
          Mostrando <span className="font-semibold">{filtered.length}</span> resultados.
        </p>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center">
          <TrendingUp className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600">No hay resultados con esos filtros.</p>
        </div>
      ) : viewMode === "cards" ? (
        <div className="space-y-3">
          {filtered.map((item, idx) => (
            <WinnerCard
              key={`${item.url || ""}-${idx}`}
              idx={idx}
              item={item}
              onOpen={() => {
                if (item?.url) window.open(item.url, "_blank", "noopener,noreferrer");
              }}
              fmtCLP={fmtCLP}
              fmtPct={fmtPct}
              fmtScore={fmtScore}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Familia</th>
                  <th className="px-4 py-3">Semáforo</th>
                  <th className="px-4 py-3">HT</th>
                  <th className="px-4 py-3">Precio ML</th>
                  <th className="px-4 py-3">Sugerido</th>
                  <th className="px-4 py-3">Ganancia</th>
                  <th className="px-4 py-3">Margen</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Link</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={`${r.url || ""}-${i}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3 font-medium">{r.title || "—"}</td>
                    <td className="px-4 py-3">{r.keloke_category || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{r.product_family || "—"}</td>
                    <td className="px-4 py-3">
                      <TrafficPill traffic={r.traffic_light_final} />
                    </td>
                    <td className="px-4 py-3">{r.high_ticket_tier ? <HighTicketPill tier={r.high_ticket_tier} /> : "—"}</td>
                    <td className="px-4 py-3">{fmtCLP(r.ml_price_clp)}</td>
                    <td className="px-4 py-3">{fmtCLP(r.suggested_price_25)}</td>
                    <td className="px-4 py-3">{fmtCLP(r.profit_clp)}</td>
                    <td className="px-4 py-3">{fmtPct(r.margin_pct)}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: "#D4A017" }}>
                      {fmtScore(r.adjusted_winner_score)}
                    </td>
                    <td className="px-4 py-3">
                      {r.url ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 underline"
                          style={{ color: "#2D5016" }}
                        >
                          Ver <ExternalLink className="w-4 h-4" />
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function WinnerCard({ idx, item, onOpen, fmtCLP, fmtPct, fmtScore }) {
  const title = item?.title || "Producto";
  const cat = item?.keloke_category || "Sin categoría";
  const fam = item?.product_family || "";
  const traffic = (item?.traffic_light_final || "yellow").toLowerCase();
  const htTier = item?.high_ticket_tier || null;

  return (
    <div className="p-4 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold truncate">
              {idx + 1}. {title}
            </p>
            <TrafficPill traffic={traffic} />
            {htTier ? <HighTicketPill tier={htTier} /> : null}
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <TagPill>{cat}</TagPill>
            {fam ? <TagPill subtle>{fam}</TagPill> : null}
            <span className="text-[11px] text-gray-500">
              Score: <span className="font-semibold">{fmtScore(item?.adjusted_winner_score)}</span>
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Precio ML" value={fmtCLP(item?.ml_price_clp)} />
            <Metric label="Sugerido x2.5" value={fmtCLP(item?.suggested_price_25)} />
            <Metric label="Ganancia" value={fmtCLP(item?.profit_clp)} accent />
            <Metric label="Margen" value={fmtPct(item?.margin_pct)} />
          </div>

          <div className="mt-3 text-xs text-gray-500">
            {item?.price_fetched_at ? (
              <>Última actualización: {new Date(item.price_fetched_at).toLocaleString("es-CL")}</>
            ) : (
              <>Sin fecha de pricing (aún).</>
            )}
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2">
          <button
            onClick={onOpen}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-sm"
            title="Abrir en MercadoLibre"
          >
            Ver <ExternalLink className="w-4 h-4 inline-block ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-sm font-semibold" style={{ color: accent ? "#D4A017" : "#2D5016" }}>
        {value}
      </p>
    </div>
  );
}

function TrafficPill({ traffic }) {
  const t = (traffic || "yellow").toLowerCase();
  const map = {
    green: { label: "Ganador", bg: "#E9F7E7", fg: "#2D5016", bd: "#CFE8CB" },
    yellow: { label: "Descubrimiento", bg: "#FFF6D9", fg: "#7A5A00", bd: "#F1E0A5" },
    red: { label: "Explorar", bg: "#FDE8E8", fg: "#7A1E1E", bd: "#F6CACA" },
    blue: { label: "High Ticket", bg: "#E8F1FF", fg: "#1E3A8A", bd: "#C7DBFF" },
  };
  const s = map[t] || map.yellow;

  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full border"
      style={{ backgroundColor: s.bg, color: s.fg, borderColor: s.bd }}
      title={`Semáforo: ${s.label}`}
    >
      {s.label}
    </span>
  );
}

function HighTicketPill({ tier }) {
  const label =
    tier === "HT3_100K" ? "HT 100K+" :
    tier === "HT2_80K" ? "HT 80K+" :
    tier === "HT1_50K" ? "HT 50K+" :
    "High Ticket";

  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full border"
      style={{ backgroundColor: "#E8F1FF", color: "#1E3A8A", borderColor: "#C7DBFF" }}
      title="Producto high ticket"
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
