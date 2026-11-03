// supabase/functions/instagram-admin/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action =
  | "list_conversations"
  | "list_messages"
  | "mark_read"
  | "send"
  | "ai_draft";

type SocialCreds = {
  access_token: string | null; // (no lo usamos para DMs, pero sirve para metadata)
  user_id: string | null;
  username: string | null;
};

type OpsLog = {
  level?: "info" | "error" | "warn";
  action?: string;
  conversation_id?: string | null;
  message_id?: string | null;
  status_code?: number | null;
  error_text?: string | null;
  payload?: any;
};

Deno.serve(async (req) => {
  let supabaseAdmin: any = null;
  let action: string | null = null;

  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
      return json(
        {
          ok: false,
          error:
            "Missing env vars (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)",
        },
        500
      );
    }

    // JWT caller
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return json({ ok: false, error: "Missing Authorization Bearer token" }, 401);

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // identify caller
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Invalid session" }, 401);
    const callerId = userData.user.id;

    // admin gate (active admin in public.users)
    const { data: callerProfile, error: profErr } = await supabaseAdmin
      .from("users")
      .select("id,role,is_active")
      .eq("id", callerId)
      .maybeSingle();

    if (profErr) return json({ ok: false, error: profErr.message }, 500);
    if (!callerProfile || !callerProfile.is_active || callerProfile.role !== "admin") {
      return json({ ok: false, error: "Forbidden (admin only)" }, 403);
    }

    // parse body
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, 400);
    }

    action = body?.action as Action;
    if (!action) return json({ ok: false, error: "Missing action" }, 400);

    // =========================
    // LIST CONVERSATIONS
    // =========================
    if (action === "list_conversations") {
      const limit = clampInt(body?.limit, 1, 200, 50);

      const { data, error } = await supabaseAdmin
        .from("instagram_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(3000);

      if (error) throw error;

      const map = new Map<string, any>();

      for (const m of data || []) {
        const convId = String(m.conversation_id ?? m.sender_id ?? m.ig_user_id ?? "").trim();
        if (!convId) continue;

        const senderId = String(m.sender_id ?? m.ig_user_id ?? "").trim() || null;
        const senderUsername = m.sender_username ?? m.username ?? "Usuario Instagram";

        const text = m.message_text ?? m.message_content ?? null;
        const lastMessage = text || "(Multimedia)";
        const lastTime = m.created_at ?? m.timestamp ?? null;

        const msgType = String(m.message_type ?? "message");
        const kind = msgType === "comment" ? "comment" : "dm";

        if (!map.has(convId)) {
          map.set(convId, {
            conversation_id: convId,
            sender_id: senderId,
            sender_username: senderUsername,
            last_message: lastMessage,
            last_message_time: lastTime,
            last_message_type: msgType,
            unread_count: 0,
            kind,
          });
        }

        const isFromBiz =
          m.is_from_business ??
          (typeof m.direction === "string"
            ? ["out", "sent", "business"].includes(m.direction.toLowerCase())
            : false) ??
          false;

        const isRead = m.is_read ?? false;

        if (!isFromBiz && isRead === false) {
          const obj = map.get(convId);
          obj.unread_count = (obj.unread_count || 0) + 1;
        }
      }

      const list = [...map.values()]
        .sort(
          (a, b) =>
            new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime()
        )
        .slice(0, limit);

      return json({ ok: true, conversations: list });
    }

    // =========================
    // LIST MESSAGES
    // =========================
    if (action === "list_messages") {
      const conversation_id = String(body?.conversation_id || "").trim();
      if (!conversation_id) return json({ ok: false, error: "Missing conversation_id" }, 400);

      const limit = clampInt(body?.limit, 1, 500, 200);

      const { data, error } = await supabaseAdmin
        .from("instagram_messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      const normalized = (data || []).reverse().map((m: any) => ({
        ...m,
        message_text: m.message_text ?? m.message_content ?? "",
        sender_username: m.sender_username ?? m.username ?? "Usuario Instagram",
        sender_id: m.sender_id ?? m.ig_user_id ?? null,
        created_at: m.created_at ?? m.timestamp ?? m.created_at,
        timestamp: m.timestamp ?? m.created_at ?? m.timestamp,
        media_url: m.media_url ?? null,
        is_from_business:
          m.is_from_business ??
          (typeof m.direction === "string"
            ? ["out", "sent", "business"].includes(m.direction.toLowerCase())
            : false) ??
          false,
        is_read: m.is_read ?? false,
      }));

      return json({ ok: true, messages: normalized });
    }

    // =========================
    // MARK READ (inbound only)
    // =========================
    if (action === "mark_read") {
      const conversation_id = String(body?.conversation_id || "").trim();
      if (!conversation_id) return json({ ok: false, error: "Missing conversation_id" }, 400);

      const { error } = await supabaseAdmin
        .from("instagram_messages")
        .update({ is_read: true })
        .eq("conversation_id", conversation_id)
        .eq("is_from_business", false)
        .eq("is_read", false);

      if (error) throw error;
      return json({ ok: true });
    }

    // =========================
    // SEND (Graph) + persist
    // =========================
    if (action === "send") {
      const conversation_id = String(body?.conversation_id || "").trim();
      const message_text = String(body?.message_text || "").trim();

      if (!conversation_id) return json({ ok: false, error: "Missing conversation_id" }, 400);
      if (!message_text) return json({ ok: false, error: "Missing message_text" }, 400);

      const { data: lastMsg, error: lastErr } = await supabaseAdmin
        .from("instagram_messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastErr) throw lastErr;

      const lastType = String(lastMsg?.message_type ?? "message");
      const isCommentThread = lastType === "comment";

      const graphVersion = "v24.0";

      // ✅ PAGE token real para IG Messaging
      const { pageId, pageAccessToken, debug } = await getMessagingPageToken(
        supabaseAdmin,
        graphVersion
      );

      if (isCommentThread) {
        const commentId = String(lastMsg?.message_id ?? "").trim();
        if (!commentId)
          return json({ ok: false, error: "Falta message_id del comentario para responder" }, 400);

        const url = `https://graph.facebook.com/${graphVersion}/${commentId}/replies?access_token=${encodeURIComponent(
          pageAccessToken
        )}`;

        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `message=${encodeURIComponent(message_text)}`,
        });

        const respJson = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          await logOps(supabaseAdmin, {
            level: "error",
            action: "send_comment_reply",
            conversation_id,
            message_id: commentId,
            status_code: resp.status,
            error_text: respJson?.error?.message || "Graph error",
            payload: { respJson, debug },
          });
          return json(
            { ok: false, error: respJson?.error?.message || `Graph error (${resp.status})` },
            502
          );
        }
      } else {
        // recipient id: debe ser el sender_id/ig_user_id del último mensaje entrante
        const recipientId =
          String(lastMsg?.sender_id ?? lastMsg?.ig_user_id ?? "").trim() || conversation_id;

        const url = `https://graph.facebook.com/${graphVersion}/${pageId}/messages?access_token=${encodeURIComponent(
          pageAccessToken
        )}`;

        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_type: "RESPONSE",
            recipient: { id: recipientId },
            message: { text: message_text },
          }),
        });

        const respJson = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          await logOps(supabaseAdmin, {
            level: "error",
            action: "send_dm",
            conversation_id,
            status_code: resp.status,
            error_text: respJson?.error?.message || "Graph error",
            payload: { respJson, debug, pageId, recipientId },
          });
          return json(
            { ok: false, error: respJson?.error?.message || `Graph error (${resp.status})` },
            502
          );
        }
      }

      // Persist outgoing
      const now = new Date().toISOString();
      const creds = await getInstagramCreds(supabaseAdmin).catch(() => ({
        access_token: null,
        user_id: null,
        username: null,
      }));

      const row: any = {
        conversation_id,
        sender_id: creds.user_id || "kelokecl",
        sender_username: creds.username || "kelokecl",
        message_type: isCommentThread ? "comment_reply" : "message",
        message_text,
        is_from_business: true,
        is_read: true,
        created_at: now,
        timestamp: now,
        direction: "out",
      };

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("instagram_messages")
        .insert(row)
        .select("*")
        .single();

      if (insErr) throw insErr;

      await logOps(supabaseAdmin, {
        level: "info",
        action: "send",
        conversation_id,
        status_code: 200,
        payload: { kind: isCommentThread ? "comment" : "dm", pageId },
      });

      return json({ ok: true, message: inserted });
    }

    // =========================
    // AI DRAFT
    // =========================
    if(action==='ai_draft')return json({ok:false,error:'Los borradores con conversaciones privadas requieren habilitación específica.'},409);

    return json({ ok: false, error: "Unknown action" }, 400);
  } catch (err: any) {
    try {
      if (supabaseAdmin) {
        await logOps(supabaseAdmin, {
          level: "error",
          action: action || "unknown",
          status_code: 500,
          error_text: err?.message || "Server error",
          payload: { stack: String(err?.stack || "") },
        });
      }
    } catch {
      // ignore
    }
    return json({ ok: false, error: err?.message || "Server error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampInt(v: any, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

async function getInstagramCreds(supabaseAdmin: any): Promise<SocialCreds> {
  // ✅ Preferir user_social_tokens (tu esquema real) y fallback a social_connections por compat
  try {
    const { data, error } = await supabaseAdmin
      .from("user_social_tokens")
      .select("access_token,account_user,account_name,is_active,updated_at")
      .eq("platform", "instagram")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.access_token) {
      return {
        access_token: data.access_token ?? null,
        user_id: data.account_user ?? null,
        username: data.account_name ?? null,
      };
    }
  } catch {
    // ignore
  }

  const { data, error } = await supabaseAdmin
    .from("social_connections")
    .select("access_token,user_id,username")
    .eq("platform", "instagram")
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;

  return {
    access_token: data?.access_token ?? null,
    user_id: data?.user_id ?? null,
    username: data?.username ?? null,
  };
}

async function getMessagingPageToken(supabaseAdmin: any, graphVersion: string) {
  // 1) PAGE_ID desde publish_connections (facebook)
  const { data: pubRows, error: pubErr } = await supabaseAdmin
    .from("publish_connections")
    .select("platform,facebook_page_id,instagram_business_id,is_active,updated_at")
    .eq("is_active", true);

  if (pubErr) throw pubErr;

  const fbConn = (pubRows || []).find((r: any) => r.platform === "facebook" && r.facebook_page_id);
  const pageId = String(fbConn?.facebook_page_id || "").trim();
  if (!pageId) {
    throw new Error("Falta facebook_page_id en publish_connections (conexión Facebook activa).");
  }

  // 2) Facebook USER access token (user_social_tokens platform='facebook')
  const { data: fbTokenRow, error: tErr } = await supabaseAdmin
    .from("user_social_tokens")
    .select("access_token,is_active,updated_at,token_expire")
    .in("platform", ["instagram", "facebook"])
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tErr) throw tErr;

  const userToken = String(fbTokenRow?.access_token || "").trim();
  if (!userToken) {
    throw new Error(
      "No hay token activo de Facebook en user_social_tokens (platform='facebook'). Re-conecta Facebook."
    );
  }

  const debug: any = {
    pageId,
    fbTokenUpdatedAt: fbTokenRow?.updated_at ?? null,
    fbTokenExpire: fbTokenRow?.token_expire ?? null,
    tried: [],
  };

  // 3a) Primero /me/accounts
  {
    const url = `https://graph.facebook.com/${graphVersion}/me/accounts?fields=id,name,access_token,tasks&limit=200&access_token=${encodeURIComponent(
      userToken
    )}`;

    debug.tried.push({ step: "me_accounts", url: safeUrl(url) });

    const resp = await fetch(url);
    const j = await resp.json().catch(() => ({}));

    if (resp.ok) {
      const pages = Array.isArray(j?.data) ? j.data : [];
      const match = pages.find((p: any) => String(p?.id || "") === pageId);
      if (match?.access_token) {
        return { pageId, pageAccessToken: String(match.access_token), debug };
      }
      debug.me_accounts_pages_count = pages.length;
      debug.me_accounts_found_page = !!match;
      debug.me_accounts_page_tasks = match?.tasks ?? null;
    } else {
      debug.me_accounts_error = j?.error ?? j;
    }
  }

  // 3b) Fallback: /{pageId}?fields=access_token
  // (Esto suele funcionar cuando el usuario tiene permisos, y evita depender del array completo)
  {
    const url = `https://graph.facebook.com/${graphVersion}/${pageId}?fields=access_token&access_token=${encodeURIComponent(
      userToken
    )}`;

    debug.tried.push({ step: "page_fields_access_token", url: safeUrl(url) });

    const resp = await fetch(url);
    const j = await resp.json().catch(() => ({}));

    if (resp.ok && j?.access_token) {
      return { pageId, pageAccessToken: String(j.access_token), debug };
    }
    debug.page_fields_access_token_error = resp.ok ? j : j?.error ?? j;
  }

  // 3c) Último fallback: listar /me?fields=id,name + error de permisos más claro
  {
    const url = `https://graph.facebook.com/${graphVersion}/me?fields=id,name&access_token=${encodeURIComponent(
      userToken
    )}`;
    debug.tried.push({ step: "me_debug", url: safeUrl(url) });

    const resp = await fetch(url);
    const j = await resp.json().catch(() => ({}));
    debug.me_debug = resp.ok ? j : j?.error ?? j;
  }

  throw new Error(
    `No encontré PAGE access token para esa página. ` +
      `Esto casi siempre es porque el Facebook token se conectó sin scopes de mensajería. ` +
      `Re-conecta Facebook agregando: pages_messaging + instagram_manage_messages. ` +
      `Debug: ${JSON.stringify(debug)}`
  );
}

function safeUrl(u: string) {
  // evita loggear tokens completos
  try {
    const url = new URL(u);
    if (url.searchParams.has("access_token")) url.searchParams.set("access_token", "***");
    return url.toString();
  } catch {
    return u;
  }
}

async function logOps(supabaseAdmin: any, row: OpsLog) {
  try {
    await supabaseAdmin.from("instagram_ops_logs").insert({
      level: row.level || "info",
      action: row.action || "unknown",
      conversation_id: row.conversation_id ?? null,
      message_id: row.message_id ?? null,
      status_code: row.status_code ?? null,
      error_text: row.error_text ?? null,
      payload: row.payload ?? {},
    });
  } catch {
    // no romper la edge por logs
  }
}

