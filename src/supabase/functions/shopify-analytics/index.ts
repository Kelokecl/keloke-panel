// supabase/functions/shopify-analytics/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEnv(name: string) {
  return Deno.env.get(name) ?? "";
}

function clampNumber(n: unknown, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function shopifyGraphQL(query: string, variables: Record<string, any>) {
  const store = getEnv("SHOPIFY_STORE_DOMAIN");
  const token = getEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const version = getEnv("SHOPIFY_API_VERSION") || "2024-10";

  if (!store || !token) {
    return { ok: false, error: "Missing Shopify env vars" };
  }

  const url = `https://${store}/admin/api/${version}/graphql.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await res.text();
  let payload: any = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: `Shopify GraphQL HTTP ${res.status}`,
      details: payload,
    };
  }

  if (payload?.errors?.length) {
    return { ok: false, error: "Shopify GraphQL errors", details: payload.errors };
  }

  return { ok: true, data: payload.data };
}

Deno.serve(async (req) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // days puede venir por query ?days=7 o por body {days:7}
    const url = new URL(req.url);
    const daysQ = url.searchParams.get("days");

    let bodyDays: number | null = null;
    if (req.method === "POST") {
      try {
        const b = await req.json();
        if (b && typeof b.days !== "undefined") bodyDays = Number(b.days);
      } catch {
        // ignore
      }
    }

    const days = clampNumber(bodyDays ?? daysQ ?? 7, 7);
    const since = daysAgoISO(days);

    // 1) Totales: orders count + total sales (CLP)
    // Nota: totalPriceSet presenta amounts con currency. Tomamos presentmentMoney para CLP.
    const totalsQuery = `
      query Totals($query: String!) {
        orders(first: 250, query: $query) {
          edges {
            node {
              id
              createdAt
              totalPriceSet {
                presentmentMoney { amount currencyCode }
              }
            }
          }
        }
      }
    `;

    const q = `created_at:>=${since} status:any`;
    const totalsRes = await shopifyGraphQL(totalsQuery, { query: q });

    if (!totalsRes.ok) {
      return json(totalsRes, 500);
    }

    const ordersEdges = totalsRes.data?.orders?.edges ?? [];
    const ordersCount = ordersEdges.length;

    let totalSales = 0;
    let currency = "CLP";

    for (const edge of ordersEdges) {
      const amt = edge?.node?.totalPriceSet?.presentmentMoney?.amount;
      const cur = edge?.node?.totalPriceSet?.presentmentMoney?.currencyCode;
      const n = clampNumber(amt, 0);
      totalSales += n;
      if (cur) currency = cur;
    }

    const averageOrderValue = ordersCount > 0 ? totalSales / ordersCount : 0;

    // 2) Órdenes recientes (últimas 10)
    const recentQuery = `
      query Recent($query: String!) {
        orders(first: 10, sortKey: CREATED_AT, reverse: true, query: $query) {
          edges {
            node {
              id
              name
              createdAt
              displayFinancialStatus
              totalPriceSet {
                presentmentMoney { amount currencyCode }
              }
              customer { firstName lastName email }
            }
          }
        }
      }
    `;
    const recentRes = await shopifyGraphQL(recentQuery, { query: q });
    const recentOrders =
      recentRes.ok
        ? (recentRes.data?.orders?.edges ?? []).map((e: any) => ({
            id: e?.node?.id ?? "",
            name: e?.node?.name ?? "",
            createdAt: e?.node?.createdAt ?? "",
            financialStatus: e?.node?.displayFinancialStatus ?? "",
            amount: clampNumber(e?.node?.totalPriceSet?.presentmentMoney?.amount, 0),
            currency: e?.node?.totalPriceSet?.presentmentMoney?.currencyCode ?? currency,
            customerEmail: e?.node?.customer?.email ?? "",
            customerName: `${e?.node?.customer?.firstName ?? ""} ${e?.node?.customer?.lastName ?? ""}`.trim(),
          }))
        : [];

    // 3) Top productos (por cantidad vendida) => Shopify Admin API NO trae “top vendidos” directo sin reports.
    // Hoy lo dejamos estable: array vacío (pero el dashboard no se rompe).
    const topProducts: any[] = [];

    // 4) Conversion rate real: requiere sesiones/visitas (Analytics). Hoy estable en 0.
    const conversionRate = 0;

    return json({
      source: "shopify",
      days,
      currency,
      orders: ordersCount,
      totalSales: Math.round(totalSales),
      averageOrderValue: Math.round(averageOrderValue),
      conversionRate,
      recentOrders,
      topProducts,
      generatedAt: new Date().toISOString(),
      note:
        "Conversion rate real requiere sesiones/visitas (Analytics). Base Nerd (orders/revenue/AOV) OK.",
    });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
