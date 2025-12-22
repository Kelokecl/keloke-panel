// supabase/functions/shopify-analytics/index.ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-requested-with",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function daysFromRange(range: string): number {
  if (range === "30days") return 30;
  if (range === "90days") return 90;
  return 7;
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function weekKey(dateISO: string) {
  const d = new Date(dateISO);
  // lunes como inicio aproximado (simple)
  const day = d.getDay(); // 0 domingo
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function shopifyFetch(path: string, storeUrl: string, token: string) {
  const url = `${storeUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  if (!res.ok) {
    throw new Error(`Shopify ${res.status}: ${text}`);
  }
  return json;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const storeUrl = Deno.env.get("SHOPIFY_STORE_URL") || "";
    const token = Deno.env.get("SHOPIFY_ADMIN_ACCESS_TOKEN") || "";

    if (!storeUrl || !token) {
      return new Response(JSON.stringify({ error: "Missing Shopify env vars" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const range = String(body?.range || "7days");
    const days = daysFromRange(range);
    const created_at_min = isoDaysAgo(days);

    // 1) Productos activos / total
    // (Si la API version en tu app es otra, ajusta 2024-10 por la que uses)
    const apiBase = "/admin/api/2024-10";

    const totalProductsJson = await shopifyFetch(
      `${apiBase}/products/count.json`,
      storeUrl,
      token
    );
    const activeProductsJson = await shopifyFetch(
      `${apiBase}/products/count.json?status=active`,
      storeUrl,
      token
    );

    const totalProducts = Number(totalProductsJson?.count ?? 0);
    const activeProducts = Number(activeProductsJson?.count ?? 0);

    // 2) Órdenes (traemos lista limitada y sumamos)
    // OJO: Shopify pagina. Para hoy, hacemos simple: 250. Si quieres 100% completo con paginación por Link,
    // lo armamos después. Para 7/30/90 en tienda chica suele bastar.
    const ordersJson = await shopifyFetch(
      `${apiBase}/orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(created_at_min)}&fields=id,name,created_at,total_price,currency,financial_status,fulfillment_status,email,customer,line_items`,
      storeUrl,
      token
    );

    const ordersArr = Array.isArray(ordersJson?.orders) ? ordersJson.orders : [];
    const orders = ordersArr.length;

    let totalSales = 0;
    const currency = ordersArr?.[0]?.currency || "CLP";

    // topProducts aggregation
    const productAgg = new Map<string, { name: string; sku: string; sold: number; revenue: number }>();

    // recentOrders
    const recentOrders = ordersArr
      .slice(0, 10)
      .map((o: any) => ({
        id: o?.name || String(o?.id || ""),
        status: o?.fulfillment_status || "pending",
        customer:
          o?.customer?.first_name || o?.customer?.last_name
            ? `${o?.customer?.first_name || ""} ${o?.customer?.last_name || ""}`.trim()
            : o?.email || "Cliente",
        date: o?.created_at,
        total: Number(o?.total_price || 0),
        items: Array.isArray(o?.line_items) ? o.line_items.reduce((s: number, li: any) => s + Number(li?.quantity || 0), 0) : 0,
      }));

    // weeklyRevenue aggregation
    const weeklyMap = new Map<string, { week: string; revenue: number; orders: number }>();

    for (const o of ordersArr) {
      const price = Number(o?.total_price || 0);
      totalSales += price;

      const wk = weekKey(String(o?.created_at || new Date().toISOString()));
      const prev = weeklyMap.get(wk) || { week: wk, revenue: 0, orders: 0 };
      prev.revenue += price;
      prev.orders += 1;
      weeklyMap.set(wk, prev);

      const lineItems = Array.isArray(o?.line_items) ? o.line_items : [];
      for (const li of lineItems) {
        const name = String(li?.name || "Producto");
        const sku = String(li?.sku || "-");
        const quantity = Number(li?.quantity || 0);
        const linePrice = Number(li?.price || 0) * quantity;

        const key = `${name}::${sku}`;
        const cur = productAgg.get(key) || { name, sku, sold: 0, revenue: 0 };
        cur.sold += quantity;
        cur.revenue += linePrice;
        productAgg.set(key, cur);
      }
    }

    const averageOrderValue = orders > 0 ? Math.round(totalSales / orders) : 0;

    // topProducts: ordenamos por revenue
    const topProducts = Array.from(productAgg.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((p) => ({
        name: p.name,
        sku: p.sku,
        sold: p.sold,
        revenue: Math.round(p.revenue),
      }));

    // weeklyRevenue: ordenamos por semana asc
    const weeklyRevenue = Array.from(weeklyMap.values())
      .sort((a, b) => (a.week > b.week ? 1 : -1))
      .map((w) => ({
        week: w.week,
        revenue: Math.round(w.revenue),
        orders: w.orders,
      }));

    // Conversion rate real requiere sesiones/visitas → lo dejamos 0 estable
    const conversionRate = 0;

    return new Response(
      JSON.stringify({
        source: "shopify",
        range,
        days,
        storeUrl,
        currency,
        orders,
        totalSales: Math.round(totalSales),
        averageOrderValue,
        conversionRate,

        totalProducts,
        activeProducts,

        topProducts,
        recentOrders,
        weeklyRevenue,

        generatedAt: new Date().toISOString(),
        note:
          "Conversion rate real requiere sesiones/visitas (Shopify Analytics). Orders/revenue/AOV/products OK.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
