// ============================================================
// Edge Function: admin-api
// POST /functions/v1/admin-api
// Body: { action, ...params }
//
// Single entry point for every admin operation. Admin panels read across all
// users, which RLS forbids — so this is the only place that data is reachable,
// and it runs the service role behind an is_admin check.
//
// The check is deliberately done with the SERVICE ROLE client, not the caller's
// client: reading is_admin through the caller's own RLS-scoped client would
// return whatever their policies allow, and a policy change could silently
// turn that into a bypass. Reading it as the service role means the answer is
// the actual column value, always.
//
// Actions: get_stats, list_users, list_orders, list_rentals, list_transactions,
//          adjust_balance, set_ban, smspool_balance
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Supabase = ReturnType<typeof createClient>;

/** Page sizes are clamped so a caller can't ask for the entire table. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

function paging(body: Record<string, unknown>) {
  const rawLimit = Number(body.limit ?? DEFAULT_LIMIT);
  const rawOffset = Number(body.offset ?? 0);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0;
  return { limit, offset, from: offset, to: offset + limit - 1 };
}

/**
 * Attach user emails to rows that only carry user_id.
 *
 * orders/rentals/transactions have no FK into profiles that PostgREST can
 * embed, so a join isn't available — this batches one lookup for the page
 * instead of a query per row.
 */
async function attachEmails<T extends { user_id: string | null }>(
  supabase: Supabase,
  rows: T[],
): Promise<(T & { email: string | null })[]> {
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
  if (ids.length === 0) return rows.map((r) => ({ ...r, email: null }));

  const { data } = await supabase
    .from("profiles")
    .select("id, email")
    .in("id", ids);

  const emails = new Map((data ?? []).map((p) => [p.id as string, p.email as string]));
  return rows.map((r) => ({
    ...r,
    email: r.user_id ? emails.get(r.user_id) ?? null : null,
  }));
}

// ── Actions ─────────────────────────────────────────────────

async function getStats(supabase: Supabase) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const count = (q: { count: number | null }) => q.count ?? 0;

  const [
    totalUsers,
    bannedUsers,
    ordersToday,
    totalOrders,
    activeRentals,
    topups,
    deductions,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_banned", true),
    supabase.from("orders").select("id", { count: "exact", head: true })
      .gte("created_at", startOfDay.toISOString()),
    supabase.from("orders").select("id", { count: "exact", head: true }),
    supabase.from("rentals").select("id", { count: "exact", head: true }).eq("status", "active"),
    // Revenue excludes provider='admin': a manual credit is not a sale.
    supabase.from("transactions").select("amount")
      .eq("type", "topup").eq("status", "completed")
      .or("provider.is.null,provider.neq.admin"),
    supabase.from("transactions").select("amount")
      .eq("type", "deduction").eq("status", "completed"),
  ]);

  const sum = (rows: { amount: number | string }[] | null) =>
    (rows ?? []).reduce((acc, r) => acc + Number(r.amount ?? 0), 0);

  return {
    total_users: count(totalUsers),
    banned_users: count(bannedUsers),
    total_revenue: Math.round(sum(topups.data as { amount: number }[]) * 100) / 100,
    total_spent: Math.round(sum(deductions.data as { amount: number }[]) * 100) / 100,
    orders_today: count(ordersToday),
    total_orders: count(totalOrders),
    active_rentals: count(activeRentals),
  };
}

async function listUsers(supabase: Supabase, body: Record<string, unknown>) {
  const { limit, from, to } = paging(body);
  const search = String(body.search ?? "").trim();

  let query = supabase
    .from("profiles")
    .select("id, email, balance, is_banned, is_admin, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search) {
    // Escape PostgREST's pattern metacharacters so a '%' in the box can't
    // turn into a full-table scan wildcard.
    query = query.ilike("email", `%${search.replace(/[%_,]/g, "")}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0, limit };
}

async function listOrders(supabase: Supabase, body: Record<string, unknown>) {
  const { limit, from, to } = paging(body);
  const status = String(body.status ?? "").trim();

  let query = supabase
    .from("orders")
    .select(
      "id, user_id, smspool_number, service_name, country_name, cost, status, created_at, expires_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: await attachEmails(supabase, data ?? []), total: count ?? 0, limit };
}

async function listRentals(supabase: Supabase, body: Record<string, unknown>) {
  const { limit, from, to } = paging(body);
  const status = String(body.status ?? "").trim();

  let query = supabase
    .from("rentals")
    .select(
      "id, user_id, phone_number, service_name, country_name, days, cost, status, expires_at, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: await attachEmails(supabase, data ?? []), total: count ?? 0, limit };
}

async function listTransactions(supabase: Supabase, body: Record<string, unknown>) {
  const { limit, from, to } = paging(body);
  const type = String(body.type ?? "").trim();

  let query = supabase
    .from("transactions")
    .select(
      "id, user_id, type, amount, balance_after, status, provider, note, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (type) query = query.eq("type", type);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: await attachEmails(supabase, data ?? []), total: count ?? 0, limit };
}

async function adjustBalance(
  supabase: Supabase,
  adminId: string,
  body: Record<string, unknown>,
) {
  const userId = String(body.user_id ?? "").trim();
  const amount = Number(body.amount);
  const note = String(body.note ?? "").trim() || null;

  if (!userId) return { error: "user_id is required", status: 400 };
  if (!Number.isFinite(amount) || amount === 0) {
    return { error: "amount must be a non-zero number", status: 400 };
  }

  const { data, error } = await supabase.rpc("admin_adjust_balance", {
    p_admin_id: adminId,
    p_user_id: userId,
    p_amount: amount,
    p_note: note,
  });
  if (error) return { error: error.message, status: 400 };
  return { balance: data };
}

async function setBan(
  supabase: Supabase,
  adminId: string,
  body: Record<string, unknown>,
) {
  const userId = String(body.user_id ?? "").trim();
  if (!userId) return { error: "user_id is required", status: 400 };

  const { data, error } = await supabase.rpc("admin_set_ban", {
    p_admin_id: adminId,
    p_user_id: userId,
    p_banned: body.banned === true,
  });
  if (error) return { error: error.message, status: 400 };
  return { banned: data };
}

/** Our own float at SMSPool — the operational "can we still sell" number. */
async function smspoolBalance() {
  const key = Deno.env.get("SMSPOOL_API_KEY");
  if (!key) return { error: "SMSPOOL_API_KEY is not configured", status: 500 };

  const fd = new FormData();
  fd.append("key", key);
  const res = await fetch("https://api.smspool.net/request/balance", {
    method: "POST",
    body: fd,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    console.error("request/balance failed:", json);
    return { error: "Could not read SMSPool balance", status: 502 };
  }
  const balance = Number(json.balance ?? json.amount ?? 0);
  return { balance: Number.isFinite(balance) ? balance : 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization header", 401);

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();
    if (authError || !user) return errorResponse("Unauthorized", 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Admin gate ───────────────────────────────────────────
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin, is_banned")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_admin || profile.is_banned) {
      // Logged for review: a non-admin reaching this endpoint is either a bug
      // or someone probing it.
      console.error(`admin-api denied for user ${user.id}`);
      return errorResponse("Forbidden", 403);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "").trim();

    switch (action) {
      case "get_stats":
        return jsonResponse({ success: true, ...(await getStats(supabase)) });
      case "list_users":
        return jsonResponse({ success: true, ...(await listUsers(supabase, body)) });
      case "list_orders":
        return jsonResponse({ success: true, ...(await listOrders(supabase, body)) });
      case "list_rentals":
        return jsonResponse({ success: true, ...(await listRentals(supabase, body)) });
      case "list_transactions":
        return jsonResponse({ success: true, ...(await listTransactions(supabase, body)) });
      case "adjust_balance": {
        const result = await adjustBalance(supabase, user.id, body);
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
      case "set_ban": {
        const result = await setBan(supabase, user.id, body);
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
      case "smspool_balance": {
        const result = await smspoolBalance();
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
      default:
        return errorResponse(`Unknown action: ${action || "(none)"}`, 400);
    }
  } catch (err) {
    console.error("admin-api unhandled error:", err);
    return errorResponse("Internal server error", 500);
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
