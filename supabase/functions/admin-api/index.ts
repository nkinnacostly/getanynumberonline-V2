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
// Actions: get_stats, list_users, get_user, list_orders, list_rentals,
//          list_transactions, adjust_balance, set_ban, smspool_balance,
//          simjuno_status, simjuno_refresh,
//          list_flagged, clear_flag, get_settings, update_setting,
//          create_campaign, queue_campaign, list_campaigns, audience_size,
//          delete_campaign, set_marketing_opt_out, campaign_stats
//
// The three list_* actions take an optional user_id, which is what the user
// detail page is built on — same query, same paging, scoped to one account.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { queryBalance as querySimJunoBalance } from "../_shared/simjuno.ts";
import { type EmailContent, renderEmail } from "../_shared/email.ts";

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Optional user_id scope shared by the three list actions.
 *
 * Validated here rather than handed straight to PostgREST: a non-uuid string
 * comes back as a Postgres cast error, which the admin UI can only show as an
 * opaque failure. Throwing a typed error keeps the message useful.
 */
function userScope(body: Record<string, unknown>): string | null {
  const raw = String(body.user_id ?? "").trim();
  if (!raw) return null;
  if (!UUID_RE.test(raw)) throw new BadRequest("user_id must be a UUID");
  return raw;
}

class BadRequest extends Error {}

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
    flaggedUsers,
    ordersToday,
    totalOrders,
    activeRentals,
    topups,
    deductions,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_banned", true),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_flagged", true),
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
    flagged_users: count(flaggedUsers),
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

/**
 * One user's profile plus the money summary the support question actually
 * needs — deposited vs credited, spent vs refunded, and how many orders
 * genuinely delivered a code. The maths lives in the RPC so the panel and any
 * ad-hoc SQL report cannot disagree.
 */
async function getUser(supabase: Supabase, body: Record<string, unknown>) {
  const userId = userScope(body);
  if (!userId) return { error: "user_id is required", status: 400 };

  const { data, error } = await supabase.rpc("admin_user_summary_by_id", {
    p_user_id: userId,
  });
  if (error) return { error: error.message, status: 400 };

  const summary = data as { found?: boolean } | null;
  if (!summary?.found) return { error: "User not found", status: 404 };

  return { user: summary };
}

async function listOrders(supabase: Supabase, body: Record<string, unknown>) {
  const { limit, from, to } = paging(body);
  const status = String(body.status ?? "").trim();
  const userId = userScope(body);

  let query = supabase
    .from("orders")
    .select(
      "id, user_id, smspool_number, service_name, country_name, cost, status, created_at, expires_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);
  if (userId) query = query.eq("user_id", userId);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: await attachEmails(supabase, data ?? []), total: count ?? 0, limit };
}

async function listRentals(supabase: Supabase, body: Record<string, unknown>) {
  const { limit, from, to } = paging(body);
  const status = String(body.status ?? "").trim();
  const userId = userScope(body);

  let query = supabase
    .from("rentals")
    .select(
      "id, user_id, phone_number, service_name, country_name, days, cost, status, expires_at, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);
  if (userId) query = query.eq("user_id", userId);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: await attachEmails(supabase, data ?? []), total: count ?? 0, limit };
}

async function listTransactions(supabase: Supabase, body: Record<string, unknown>) {
  const { limit, from, to } = paging(body);
  const type = String(body.type ?? "").trim();
  const userId = userScope(body);

  let query = supabase
    .from("transactions")
    .select(
      "id, user_id, type, amount, balance_after, status, provider, note, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (type) query = query.eq("type", type);
  if (userId) query = query.eq("user_id", userId);

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

// ── Fraud review ────────────────────────────────────────────

/**
 * The flagged-user review queue. Order and cancel counts come back with each
 * row because judging a flag without them is guesswork.
 */
async function listFlagged(supabase: Supabase, adminId: string) {
  const { data, error } = await supabase.rpc("admin_list_flagged", {
    p_admin_id: adminId,
  });
  if (error) return { error: error.message, status: 400 };
  return { rows: data ?? [] };
}

/**
 * Mark a flag reviewed. Deliberately separate from banning — clearing says
 * "looked at it, not fraud", and the RPC records who decided that.
 */
async function clearFlag(
  supabase: Supabase,
  adminId: string,
  body: Record<string, unknown>,
) {
  const userId = userScope(body);
  if (!userId) return { error: "user_id is required", status: 400 };

  const { error } = await supabase.rpc("admin_clear_flag", {
    p_admin_id: adminId,
    p_user_id: userId,
  });
  if (error) return { error: error.message, status: 400 };
  return { cleared: true };
}

// ── Platform settings ───────────────────────────────────────

async function getSettings(supabase: Supabase, adminId: string) {
  const { data, error } = await supabase.rpc("admin_get_settings", {
    p_admin_id: adminId,
  });
  if (error) return { error: error.message, status: 400 };
  return { rows: data ?? [] };
}

/**
 * Write one lever. Bounds and the allowed key list are enforced by the RPC,
 * not here — these values gate ordering and money, so the guarantee belongs in
 * the database where nothing can route around it.
 */
async function updateSetting(
  supabase: Supabase,
  adminId: string,
  body: Record<string, unknown>,
) {
  const key = String(body.key ?? "").trim();
  const value = Number(body.value);

  if (!key) return { error: "key is required", status: 400 };
  if (!Number.isFinite(value)) {
    return { error: "value must be a number", status: 400 };
  }

  const { data, error } = await supabase.rpc("admin_update_setting", {
    p_admin_id: adminId,
    p_key: key,
    p_value: value,
  });
  if (error) return { error: error.message, status: 400 };
  return { key, value: Number(data) };
}

// ── Email campaigns ─────────────────────────────────────────
// Composition and queueing live here; the actual sending is send-campaign,
// which is a queue drain with its own timeout profile and does not belong
// behind a request/response admin action.

async function createCampaign(
  supabase: Supabase,
  adminId: string,
  body: Record<string, unknown>,
) {
  const audience = String(body.audience ?? "").trim();
  if (audience !== "all" && audience !== "user") {
    return { error: "audience must be 'all' or 'user'", status: 400 };
  }

  let targetUserId: string | null = null;
  if (audience === "user") {
    targetUserId = userScope(body);
    if (!targetUserId) {
      return { error: "user_id is required for a single-user send", status: 400 };
    }
  }

  const { data, error } = await supabase.rpc("admin_create_campaign", {
    p_admin_id: adminId,
    p_subject: String(body.subject ?? ""),
    p_body: String(body.body ?? ""),
    p_audience: audience,
    p_target_user_id: targetUserId,
    p_template: String(body.template ?? "basic"),
    p_preheader: optionalText(body.preheader),
    p_headline: optionalText(body.headline),
    p_cta_label: optionalText(body.cta_label),
    p_cta_url: optionalText(body.cta_url),
    p_hero_image: optionalText(body.hero_image),
  });
  if (error) return { error: error.message, status: 400 };
  return { campaign_id: data };
}

/** Empty strings from an untouched input are absence, not a value. */
function optionalText(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

/**
 * Render a campaign exactly as it would be sent, without sending it.
 *
 * Deliberately server-side through the same renderEmail the send path uses:
 * a preview built from a second copy of the markup in the React app would
 * drift, and the whole point of a preview is that it cannot.
 */
function previewCampaign(adminEmail: string | null, body: Record<string, unknown>) {
  const subject = String(body.subject ?? "").trim();
  const text = String(body.body ?? "");
  if (!subject && !text.trim()) {
    return { error: "Nothing to preview", status: 400 };
  }

  const content: EmailContent = {
    subject: subject || "(no subject)",
    body: text.trim() || "Your message will appear here.",
    template: (String(body.template ?? "basic") as EmailContent["template"]),
    preheader: optionalText(body.preheader),
    headline: optionalText(body.headline),
    ctaLabel: optionalText(body.cta_label),
    ctaUrl: optionalText(body.cta_url),
    heroImage: optionalText(body.hero_image),
  };

  // A dead link, not a signed one: a preview must never mint a token that
  // could unsubscribe someone by being clicked in the admin panel.
  const html = renderEmail(content, {
    unsubUrl: "#preview",
    to: adminEmail ?? "you@example.com",
  });
  return { html };
}

async function approveCampaign(
  supabase: Supabase,
  adminId: string,
  body: Record<string, unknown>,
) {
  const id = String(body.campaign_id ?? "").trim();
  if (!id) return { error: "campaign_id is required", status: 400 };

  const { data, error } = await supabase.rpc("admin_approve_campaign", {
    p_admin_id: adminId,
    p_campaign_id: id,
    p_approved: body.approved !== false,
  });
  if (error) return { error: error.message, status: 400 };
  return data as Record<string, unknown>;
}

async function scheduleCampaign(
  supabase: Supabase,
  adminId: string,
  body: Record<string, unknown>,
) {
  const id = String(body.campaign_id ?? "").trim();
  if (!id) return { error: "campaign_id is required", status: 400 };

  // null is meaningful — it unschedules — so absence and null differ here.
  const when = body.scheduled_for == null
    ? null
    : String(body.scheduled_for);

  const { data, error } = await supabase.rpc("admin_schedule_campaign", {
    p_admin_id: adminId,
    p_campaign_id: id,
    p_when: when,
  });
  if (error) return { error: error.message, status: 400 };
  return data as Record<string, unknown>;
}

async function campaignCalendar(
  supabase: Supabase,
  adminId: string,
  body: Record<string, unknown>,
) {
  const from = String(body.from ?? "");
  const to = String(body.to ?? "");
  if (!from || !to) return { error: "from and to are required", status: 400 };

  const { data, error } = await supabase.rpc("admin_campaign_calendar", {
    p_admin_id: adminId,
    p_from: from,
    p_to: to,
  });
  if (error) return { error: error.message, status: 400 };
  return data as Record<string, unknown>;
}

async function queueCampaign(
  supabase: Supabase,
  adminId: string,
  body: Record<string, unknown>,
) {
  const id = String(body.campaign_id ?? "").trim();
  if (!id) return { error: "campaign_id is required", status: 400 };

  const { data, error } = await supabase.rpc("admin_queue_campaign", {
    p_admin_id: adminId,
    p_campaign_id: id,
  });
  if (error) return { error: error.message, status: 400 };
  return { recipient_count: Number(data) };
}

async function listCampaigns(
  supabase: Supabase,
  adminId: string,
  body: Record<string, unknown>,
) {
  const { limit, offset } = paging(body);
  const { data, error } = await supabase.rpc("admin_list_campaigns", {
    p_admin_id: adminId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return { error: error.message, status: 400 };
  const out = data as { rows?: unknown[]; total?: number } | null;
  return { rows: out?.rows ?? [], total: out?.total ?? 0, limit };
}

/**
 * Change a user's marketing subscription. The resubscribe direction reinstates
 * consent the person withdrew, so the RPC records who did it — this is the one
 * admin action where the audit entry is the point, not a side effect.
 */
async function setMarketingOptOut(
  supabase: Supabase,
  adminId: string,
  body: Record<string, unknown>,
) {
  const userId = userScope(body);
  if (!userId) return { error: "user_id is required", status: 400 };

  const { data, error } = await supabase.rpc("admin_set_marketing_opt_out", {
    p_admin_id: adminId,
    p_user_id: userId,
    p_opt_out: body.opt_out === true,
  });
  if (error) return { error: error.message, status: 400 };
  return { opt_out: data === true };
}

/** Headline numbers plus the per-recipient rows behind them, in one call. */
async function campaignStats(
  supabase: Supabase,
  adminId: string,
  body: Record<string, unknown>,
) {
  const id = String(body.campaign_id ?? "").trim();
  if (!id) return { error: "campaign_id is required", status: 400 };

  const { data, error } = await supabase.rpc("admin_campaign_stats", {
    p_admin_id: adminId,
    p_campaign_id: id,
    p_filter: String(body.filter ?? "all"),
    p_limit: 200,
  });
  if (error) return { error: error.message, status: 400 };

  const out = data as { found?: boolean } | null;
  if (!out?.found) return { error: "Campaign not found", status: 404 };
  return { stats: out };
}

async function deleteCampaign(
  supabase: Supabase,
  adminId: string,
  body: Record<string, unknown>,
) {
  const id = String(body.campaign_id ?? "").trim();
  if (!id) return { error: "campaign_id is required", status: 400 };

  const { error } = await supabase.rpc("admin_delete_campaign", {
    p_admin_id: adminId,
    p_campaign_id: id,
  });
  if (error) return { error: error.message, status: 400 };
  return { deleted: true };
}

async function audienceSize(supabase: Supabase, adminId: string) {
  const { data, error } = await supabase.rpc("admin_audience_size", {
    p_admin_id: adminId,
  });
  if (error) return { error: error.message, status: 400 };
  return { audience: data };
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

interface SimJunoStatus {
  balance: number;
  available: boolean;
  min_balance: number;
  note: string | null;
  checked_at: string | null;
}

/**
 * Cached eSIM supplier state — whatever the reconcile cron (or the last
 * refresh) saw. No provider call, so opening the panel never burns rate limit.
 */
async function simJunoStatus(supabase: Supabase): Promise<SimJunoStatus> {
  const { data, error } = await supabase
    .from("esim_provider_status")
    .select("balance, available, min_balance, note, checked_at")
    .eq("provider", "simjuno")
    .maybeSingle();
  if (error) throw error;

  return {
    balance: Number(data?.balance ?? 0),
    // A missing row must not show the supplier as down.
    available: data?.available ?? true,
    min_balance: Number(data?.min_balance ?? 20),
    note: (data?.note as string | null) ?? null,
    checked_at: (data?.checked_at as string | null) ?? null,
  };
}

/**
 * Live re-check of the reseller wallet. Persists exactly what reconcile-esims
 * would write, so the storefront's back-soon gate reacts immediately instead
 * of waiting for the next cron tick.
 */
async function simJunoRefresh(supabase: Supabase): Promise<SimJunoStatus | { error: string; status: number }> {
  let balance: number;
  try {
    balance = await querySimJunoBalance();
  } catch (err) {
    console.error("simjuno refresh failed:", err);
    return { error: "Could not read SimJuno balance", status: 502 };
  }

  const { data } = await supabase
    .from("esim_provider_status")
    .select("min_balance")
    .eq("provider", "simjuno")
    .maybeSingle();
  const minBalance = Number(data?.min_balance ?? 20);
  const available = balance >= minBalance;
  const now = new Date().toISOString();
  const note = available ? null : "balance below minimum";

  const { error } = await supabase
    .from("esim_provider_status")
    .update({
      balance,
      available,
      note,
      checked_at: now,
      updated_at: now,
    })
    .eq("provider", "simjuno");
  if (error) {
    console.error("simjuno refresh persist failed:", error);
    return { error: "Read the balance but could not save it", status: 500 };
  }

  return { balance, available, min_balance: minBalance, note, checked_at: now };
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
      .select("is_admin, is_banned, email")
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
      case "get_user": {
        const result = await getUser(supabase, body);
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
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
      case "list_flagged": {
        const result = await listFlagged(supabase, user.id);
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
      case "clear_flag": {
        const result = await clearFlag(supabase, user.id, body);
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
      case "get_settings": {
        const result = await getSettings(supabase, user.id);
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
      case "update_setting": {
        const result = await updateSetting(supabase, user.id, body);
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
      case "create_campaign": {
        const result = await createCampaign(supabase, user.id, body);
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
      case "preview_campaign": {
        const result = previewCampaign(profile.email as string | null, body);
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
      case "approve_campaign": {
        const result = await approveCampaign(supabase, user.id, body);
        if ("error" in result) return errorResponse(result.error as string, result.status as number);
        return jsonResponse({ success: true, ...result });
      }
      case "schedule_campaign": {
        const result = await scheduleCampaign(supabase, user.id, body);
        if ("error" in result) return errorResponse(result.error as string, result.status as number);
        return jsonResponse({ success: true, ...result });
      }
      case "campaign_calendar": {
        const result = await campaignCalendar(supabase, user.id, body);
        if ("error" in result) return errorResponse(result.error as string, result.status as number);
        return jsonResponse({ success: true, ...result });
      }
      case "queue_campaign": {
        const result = await queueCampaign(supabase, user.id, body);
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
      case "list_campaigns": {
        const result = await listCampaigns(supabase, user.id, body);
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
      case "set_marketing_opt_out": {
        const result = await setMarketingOptOut(supabase, user.id, body);
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
      case "campaign_stats": {
        const result = await campaignStats(supabase, user.id, body);
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
      case "delete_campaign": {
        const result = await deleteCampaign(supabase, user.id, body);
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
      case "audience_size": {
        const result = await audienceSize(supabase, user.id);
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
      case "smspool_balance": {
        const result = await smspoolBalance();
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
      case "simjuno_status":
        return jsonResponse({ success: true, ...(await simJunoStatus(supabase)) });
      case "simjuno_refresh": {
        const result = await simJunoRefresh(supabase);
        if ("error" in result) return errorResponse(result.error!, result.status!);
        return jsonResponse({ success: true, ...result });
      }
      default:
        return errorResponse(`Unknown action: ${action || "(none)"}`, 400);
    }
  } catch (err) {
    // A malformed user_id is the caller's mistake, not ours — say so instead of
    // returning a 500 the admin can do nothing with.
    if (err instanceof BadRequest) return errorResponse(err.message, 400);
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
