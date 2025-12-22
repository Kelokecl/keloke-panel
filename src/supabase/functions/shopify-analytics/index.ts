// supabase/functions/shopify-analytics/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function json(data: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: req ? corsHeaders(req) : { "Content-Type": "application/json" },
  });
}

function moneyToCLP(value: any): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  try {
    const SHOPIFY_STORE_URL = Deno.env.get("SHOPIFY_STORE_URL") ?? "";
    const SHOPIFY_ADMIN_ACCESS_TOKEN =
      Deno.env.get("SHOPIFY_ADMIN_ACCESS_TOKEN") ?? "";

    if (!SHOPIFY_STORE_URL || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
      return json({ error: "Missing Shopify env vars" }, 500, req);
    }

    const url = new URL(req.url);
    const daysParam = url.searchParams.get("days");

    let days = 7;
    if (daysParam) {
      const d = Number(daysParam);
      if (Number.isFinite(d) && d > 0 && d <= 90) days = d;
    } else if (req.method === "POST") {
      // opcional: permitir body { days: 7 }
      try {
        const body = await req.json();
        const d = Number(body?.days);
        if (Number.isFinite(d) && d > 0 && d <= 90) days = d;
      } catch (_) {}
    }

    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Shopify Admin REST (Orders)
    const shop = SHOPIFY_STORE_URL.replace(/^https?:\/\//, "");
    const base = `https://${shop}/admin/api/2024-10`;
    const created_at_min = since.toISOString();

    // Traemos órdenes desde fecha mínima (paginación simple por limit 250; para algo pro después)
    const ordersUrl =
      `${base}/orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(created_at_min)}`;

    const r = await fetch(ordersUrl, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return json(
        { error: "Shopify request failed", status: r.status, details: text },
        500,
        req
      );
    }

    const data = await r.json().catch(() => ({}));
    const orders: any[] = Array.isArray(data?.orders) ? data.orders : [];

    const ordersCount = orders.length;
    const totalSales = orders.reduce((sum, o) => sum + moneyToCLP(o?.total_price), 0);

    return json(
      {
        source: "shopify",
        days,
        orders: ordersCount,
        totalSales,
        currency: "CLP",
        generatedAt: new Date().toISOString(),
      },
      200,
      req
    );
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500, req);
  }
});
