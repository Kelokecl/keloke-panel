// supabase/functions/cron-publish/index.ts
// Deno / Supabase Edge Function (GOD MODE, robusto sin romper schemas)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type CalendarRow = {
  id: string;
  platform: string;
  content_type: string;
  campaign_type: string | null;
  title: string | null;
  description: string | null;
  caption: string | null;
  hashtags: string | null;
  cta: string | null;
  scheduled_date: string; // YYYY-MM-DD
  scheduled_time: string; // HH:MM[:SS]
  product_id: string | null;
  status: string | null;
  ab_variant: string | null;
  target_age_range: string | null;
  target_interests: string | null;
  preview_url: string | null;
  asset_url: string | null;
  asset_type: string | null;
  generated_content_id?: string | null;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
  });
}

function getHeader(req: Request, name: string) {
  return req.headers.get(name) ?? req.headers.get(name.toLowerCase()) ?? "";
}

function normalizeTime(t: string) {
  const s = String(t || "").trim();
  if (!s) return "00:00:00";
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  const [hh = "00", mm = "00", ss = "00"] = s.split(":");
  return `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}:${ss.padStart(2, "0")}`;
}

// Devuelve key comparable "YYYY-MM-DD HH:MM:SS" en TZ (Chile)
function nowKeyInTZ(tz: string) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const y = get("year");
  const m = get("month");
  const d = get("day");
  const hh = get("hour");
  const mm = get("minute");
  const ss = get("second");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function scheduledKey(date: string, time: string) {
  return `${String(date).slice(0, 10)} ${normalizeTime(time)}`;
}

async function safeUpdateCalendar(
  supabase: ReturnType<typeof createClient>,
  id: string,
  patch: Record<string, unknown>
) {
  // Intento 1: update completo
  const r1 = await supabase.from("content_calendar").update(patch).eq("id", id);
  if (!r1.error) return { ok: true, mode: "full" as const };

  // Si falla por columna inexistente u otra variación de schema, hacemos fallback:
  // Intento 2: solo status (no deja pegado)
  const minimal: Record<string, unknown> = {};
  if (typeof patch.status === "string") minimal.status = patch.status;

  // Si no venía status, no hay nada mínimo que hacer
  if (!Object.keys(minimal).length) {
    return { ok: false, mode: "none" as const, error: r1.error.message };
  }

  const r2 = await supabase.from("content_calendar").update(minimal).eq("id", id);
  if (!r2.error) return { ok: true, mode: "minimal" as const };

  return { ok: false, mode: "minimal" as const, error: r2.error.message };
}

async function callPublishContent(opts: {
  supabaseUrl: string;
  serviceKey: string;
  payload: Record<string, unknown>;
}) {
  const publishUrl = `${opts.supabaseUrl}/functions/v1/publish-content`;

  const res = await fetch(publishUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Service role para que publish-content pueda operar sin depender de sesión usuario
      "Authorization": `Bearer ${opts.serviceKey}`,
      "apikey": opts.serviceKey,
    },
    body: JSON.stringify(opts.payload),
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok || (data && typeof data === "object" && (data as any).ok === false)) {
    const msg =
      (typeof data === "object" && data && "message" in data)
        ? String((data as any).message)
        : `publish-content HTTP ${res.status}`;
    throw new Error(msg);
  }

  return { http_status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true }, 200);

  try {
    // 1) Auth por secret (ideal para cron externo)
    const provided = getHeader(req, "x-cron-secret");
    const expected = Deno.env.get("CRON_SECRET") || "";


    // 2) Supabase client (Service Role)
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("SUPABASE_PROJECT_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceKey) {
      return json({ ok: false, error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const internal=req.headers.get('x-keloke-internal');
    let authorized=!!expected && provided===expected;
    if(!authorized&&internal){const {data}=await supabase.rpc('keloke_verify_internal_key',{p_key:internal});authorized=data===true;}
    if(!authorized)return json({ok:false,error:'Unauthorized'},401);
    const requestBody=await req.json().catch(()=>({}));
    // 3) TZ
    const tz = Deno.env.get("TZ") || "America/Santiago";
    const nowKey = nowKeyInTZ(tz);

    // 4) Traer batch de scheduled (ordenados) y procesar solo vencidos comparando keys
    const BATCH = 25;

    const { data: rows, error: fetchErr } = await supabase
      .from("content_calendar")
      .select(`
        id,
        platform,
        content_type,
        campaign_type,
        title,
        description,
        caption,
        hashtags,
        cta,
        scheduled_date,
        scheduled_time,
        product_id,
        status,
        ab_variant,
        target_age_range,
        target_interests,
        preview_url,
        asset_url,
        asset_type,
        generated_content_id
      `)
      .eq("status", "scheduled")
      .gte("scheduled_date",new Date(Date.now()-24*60*60*1000).toLocaleDateString("en-CA",{timeZone:tz}))
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true })
      .limit(BATCH);

    if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);

    const items = (rows || []) as CalendarRow[];
    if(requestBody.dry_run){const due=items.filter(item=>scheduledKey(item.scheduled_date,item.scheduled_time)<=nowKey).length;const health={ok:true,dry_run:true,due,checked_at:new Date().toISOString()};await supabase.from('keloke_runtime_checks').upsert({key:'publisher',payload:health,checked_at:health.checked_at});return json(health);}
    await supabase.from('keloke_runtime_checks').upsert({key:'publisher',payload:{ok:true,checked_at:new Date().toISOString()},checked_at:new Date().toISOString()});
    if (items.length === 0) {
      return json({ ok: true, processed: 0, published: 0, failed: 0, nowKey, tz });
    }

    let processed = 0;
    let published = 0;
    let failed = 0;

    const results: Array<{ id: string; outcome: string; detail?: unknown }> = [];

    for (const item of items) {
      const skey = scheduledKey(item.scheduled_date, item.scheduled_time);

      // Como viene ordenado, si el primero no corresponde, cortamos
      if (skey > nowKey) break;

      processed++;

      // 5) Lock optimista
      const { data: locked, error: lockErr } = await supabase
        .from("content_calendar")
        .update({ status: "publishing" })
        .eq("id", item.id)
        .eq("status", "scheduled")
        .select("id")
        .single();

      if (lockErr || !locked) {
        results.push({ id: item.id, outcome: "skip_lock", detail: lockErr?.message ?? "not locked" });
        continue;
      }

      // 6) Payload a publish-content
      const payload = {
        platform: item.platform,
        content_type: item.content_type,
        campaign_type: item.campaign_type ?? "organic",
        generated_content_id: item.generated_content_id ?? null,
        content: {
          title: item.title ?? "",
          body: item.description ?? "",
          caption: item.caption ?? "",
          hashtags: item.hashtags ?? "",
          cta: item.cta ?? "",
          preview_url: item.preview_url ?? null,
          asset_url: item.asset_url ?? null,
          asset_type: item.asset_type ?? null,
        },
        targeting: item.campaign_type === "paid"
          ? {
              ab_variant: item.ab_variant ?? null,
              age_range: item.target_age_range ?? null,
              interests: item.target_interests ?? null,
            }
          : null,
        calendar_item_id: item.id,
        scheduled_key: skey,
        now_key: nowKey,
        tz,
      };

      try {
        const pub = await callPublishContent({ supabaseUrl, serviceKey, payload });

        // 7) Marcar published (con safe update para no romper por schema)
        const patch = {
          status: "published",
          published_at: new Date().toISOString(),
          publish_response: { ok: true, ...pub },
          error_message: null,
          updated_at: new Date().toISOString(),
        };

        const up = await safeUpdateCalendar(supabase, item.id, patch);
        if (!up.ok) {
          failed++;
          results.push({ id: item.id, outcome: "published_but_update_failed", detail: up.error });
          continue;
        }

        published++;
        results.push({ id: item.id, outcome: "published", detail: pub });
      } catch (e) {
        const msg = String((e as Error)?.message || e);

        const patch = {
          status: "failed",
          error_message: msg,
          publish_response: { ok: false, error: msg },
          updated_at: new Date().toISOString(),
        };

        await safeUpdateCalendar(supabase, item.id, patch);

        failed++;
        results.push({ id: item.id, outcome: "failed", detail: msg });
      }
    }

    return json({
      ok: true,
      tz,
      nowKey,
      batchSize: BATCH,
      processed,
      published,
      failed,
      results,
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
