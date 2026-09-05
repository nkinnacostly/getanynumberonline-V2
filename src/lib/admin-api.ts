import { callEdgeFunction } from "@/lib/api";

/**
 * Client for the admin-api edge function.
 *
 * Every admin read spans all users, which RLS blocks from the browser — so
 * there is deliberately no Supabase query anywhere in the admin UI. Everything
 * goes through this one function, which is the only place holding the service
 * role, behind an is_admin check.
 */
export async function callAdminApi<T = Record<string, unknown>>(
  action: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return callEdgeFunction("admin-api", { action, ...params }) as Promise<T>;
}

// ── Shapes returned by admin-api ────────────────────────────

export interface AdminStats {
  total_users: number;
  banned_users: number;
  flagged_users: number;
  total_revenue: number;
  total_spent: number;
  orders_today: number;
  total_orders: number;
  active_rentals: number;
}

/** A user auto-flagged by evaluate_user_fraud, awaiting human review. */
export interface AdminFlaggedUser {
  id: string;
  email: string | null;
  balance: number;
  flag_reason: string | null;
  is_banned: boolean;
  created_at: string;
  flagged_at: string;
  order_count: number;
  cancel_count: number;
}

/** One configurable fraud lever from platform_settings. */
export interface AdminSetting {
  key: string;
  value: number;
  description: string | null;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  email: string | null;
  balance: number;
  is_banned: boolean;
  is_admin: boolean;
  created_at: string;
}

export interface AdminOrder {
  id: string;
  user_id: string;
  email: string | null;
  smspool_number: string | null;
  service_name: string | null;
  country_name: string | null;
  cost: number;
  status: string;
  created_at: string;
  expires_at: string | null;
}

export interface AdminRental {
  id: string;
  user_id: string;
  email: string | null;
  phone_number: string | null;
  service_name: string | null;
  country_name: string | null;
  days: number | null;
  cost: number;
  status: string;
  expires_at: string | null;
  created_at: string;
}

export interface AdminTransaction {
  id: string;
  user_id: string;
  email: string | null;
  type: "topup" | "deduction" | "refund";
  amount: number;
  balance_after: number | null;
  status: string;
  provider: string | null;
  note: string | null;
  created_at: string;
}

/**
 * One user's account, as the support desk needs to read it.
 *
 * Deliberately splits real deposits from admin credits, and spend that
 * DELIVERED from spend that bounced back — "they spent $40" is meaningless if
 * $30 of it was refunded. `orders_delivered` counts orders with an actual
 * messages row, not orders whose status says 'active'.
 */
export interface AdminUserDetail {
  found: true;
  user_id: string;
  email: string | null;
  joined: string;
  balance: number;
  is_banned: boolean;
  is_admin: boolean;
  is_flagged: boolean;
  flag_reason: string | null;
  marketing_opt_out: boolean;
  marketing_opt_out_at: string | null;
  deposited_real: number;
  credited_by_admin: number;
  deposit_count: number;
  pending_topups: number;
  total_deducted: number;
  total_refunded: number;
  orders_total: number;
  orders_delivered: number;
  spent_on_delivered: number;
  orders_by_status: Record<string, number>;
  rentals_total: number;
  spent_on_rentals: number;
  esims_total: number;
  spent_on_esims: number;
}

export interface Paged<T> {
  rows: T[];
  total: number;
  limit: number;
}

/** Filters accepted by every list_* action. `user_id` scopes to one account. */
export interface ListParams {
  offset?: number;
  limit?: number;
  user_id?: string;
}

/** Page size used by every admin table. */
export const ADMIN_PAGE_SIZE = 25;

export const getStats = () =>
  callAdminApi<AdminStats & { success: boolean }>("get_stats");

export const getSmspoolBalance = () =>
  callAdminApi<{ balance: number }>("smspool_balance");

/** Cached SimJuno reseller-wallet state (what reconcile-esims last saw). */
export interface AdminSimJunoStatus {
  balance: number;
  available: boolean;
  min_balance: number;
  note: string | null;
  checked_at: string | null;
}

export const getSimJunoStatus = () =>
  callAdminApi<AdminSimJunoStatus>("simjuno_status");

/** Live balance re-check; also persists into esim_provider_status. */
export const refreshSimJunoBalance = () =>
  callAdminApi<AdminSimJunoStatus>("simjuno_refresh");

export const listUsers = (params: ListParams & { search?: string }) =>
  callAdminApi<Paged<AdminUser>>("list_users", { limit: ADMIN_PAGE_SIZE, ...params });

export const getUser = (user_id: string) =>
  callAdminApi<{ user: AdminUserDetail }>("get_user", { user_id });

export const listOrders = (params: ListParams & { status?: string }) =>
  callAdminApi<Paged<AdminOrder>>("list_orders", { limit: ADMIN_PAGE_SIZE, ...params });

export const listRentals = (params: ListParams & { status?: string }) =>
  callAdminApi<Paged<AdminRental>>("list_rentals", { limit: ADMIN_PAGE_SIZE, ...params });

export const listTransactions = (params: ListParams & { type?: string }) =>
  callAdminApi<Paged<AdminTransaction>>("list_transactions", {
    limit: ADMIN_PAGE_SIZE,
    ...params,
  });

export const adjustBalance = (user_id: string, amount: number, note: string) =>
  callAdminApi<{ balance: number }>("adjust_balance", { user_id, amount, note });

export const setBan = (user_id: string, banned: boolean) =>
  callAdminApi<{ banned: boolean }>("set_ban", { user_id, banned });

// ── Fraud review ────────────────────────────────────────────

/**
 * Dispatched on `window` after a flag is cleared or a flagged user banned.
 *
 * The sidebar badge lives in the admin layout, which stays mounted across
 * navigations, so it has no other way to learn the count changed — and
 * re-fetching stats on every route change to catch a rare event would be the
 * expensive way round.
 */
export const FLAGS_CHANGED_EVENT = "admin:flags-changed";

export const notifyFlagsChanged = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FLAGS_CHANGED_EVENT));
  }
};

export const listFlagged = () =>
  callAdminApi<{ rows: AdminFlaggedUser[] }>("list_flagged");

export const clearFlag = (user_id: string) =>
  callAdminApi<{ cleared: boolean }>("clear_flag", { user_id });

export const getSettings = () =>
  callAdminApi<{ rows: AdminSetting[] }>("get_settings");

export const updateSetting = (key: string, value: number) =>
  callAdminApi<{ key: string; value: number }>("update_setting", { key, value });

/**
 * Presentation rules per setting key, so the flagged page, the settings page
 * and the sidebar all describe a lever the same way.
 *
 * flag_cancel_rate is stored 0-1 but is only meaningful to a human as a
 * percentage, so it is scaled on the way in and out.
 */
export const SETTING_META: Record<
  string,
  { label: string; unit: "usd" | "percent" | "count"; step: number; hint?: string }
> = {
  min_first_deposit: {
    label: "Minimum first deposit",
    unit: "usd",
    step: 0.5,
    hint: "Applies only to a user's first top-up.",
  },
  max_orders_per_hour: {
    label: "Max orders per hour",
    unit: "count",
    step: 1,
    hint: "Rolling hour, per user. Orders and rentals share this budget.",
  },
  flag_cancel_rate: {
    label: "Flag at cancel rate",
    unit: "percent",
    step: 5,
    hint: "Cancel/refund share that trips a review flag.",
  },
  flag_min_orders: {
    label: "Flag after at least",
    unit: "count",
    step: 1,
    hint: "Minimum orders before the cancel rate is judged at all.",
  },
};

/** Stored value → what the admin types. */
export const settingToDisplay = (key: string, value: number) =>
  SETTING_META[key]?.unit === "percent"
    ? Math.round(value * 100)
    : value;

/** What the admin typed → what gets stored. */
export const settingToStored = (key: string, display: number) =>
  SETTING_META[key]?.unit === "percent" ? display / 100 : display;

export const formatSetting = (key: string, value: number) => {
  const unit = SETTING_META[key]?.unit;
  if (unit === "usd") return `$${Number(value).toFixed(2)}`;
  if (unit === "percent") return `${Math.round(value * 100)}%`;
  return String(value);
};

// ── Email campaigns ─────────────────────────────────────────

/** The three layouts a campaign can be rendered into. */
export type EmailTemplate = "basic" | "promo" | "weekly" | "letter";

export const TEMPLATES: {
  id: EmailTemplate;
  label: string;
  hint: string;
  /** Whether the layout has a hero heading and a call-to-action button. */
  hero: boolean;
}[] = [
  {
    id: "promo",
    label: "Promotional",
    hint: "Dark hero band, big headline, one call-to-action button.",
    hero: true,
  },
  {
    id: "weekly",
    label: "Weekly",
    hint: "Dated eyebrow, quieter heading. Built for ## sections and - bullets.",
    hero: true,
  },
  {
    id: "basic",
    label: "Plain",
    hint: "No hero. A short note in the brand shell.",
    hero: false,
  },
  {
    id: "letter",
    label: "Letter",
    hint:
      "No images, no button, no footer band — reads like a personal email. " +
      "The layout most likely to land in Gmail's Primary tab rather than Promotions.",
    hero: false,
  },
];

/**
 * The site's own origin, because an email banner must be an absolute URL and
 * the mail is rendered in an Edge Function that has no idea where the frontend
 * is deployed. Hardcoded like the other canonical-domain references in the SEO
 * layer rather than read from an env var that only exists at build time.
 */
export const SITE_ORIGIN = "https://www.getanynumberonline.com";

/**
 * Banner images we ship in `public/images/email/`. An admin can still paste any
 * other absolute URL — these are the ones that are always there and always the
 * right crop.
 */
export const HERO_IMAGES: { label: string; file: string }[] = [
  { label: "Phone in hand", file: "hero-phone.jpg" },
  { label: "Travel", file: "hero-travel.jpg" },
  { label: "SIM card", file: "hero-sim.jpg" },
  { label: "World map", file: "hero-world.jpg" },
];

export const heroImageUrl = (file: string) =>
  `${SITE_ORIGIN}/images/email/${file}`;

export interface AdminCampaign {
  id: string;
  subject: string;
  template?: EmailTemplate;
  /** 'human' if an admin wrote it, 'ai' if the writer drafted it. */
  source?: "human" | "ai";
  scheduled_for?: string | null;
  approved_at?: string | null;
  audience: "all" | "user";
  status: "draft" | "scheduled" | "queued" | "sending" | "sent" | "failed";
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  test_sent_at: string | null;
  created_at: string;
  completed_at: string | null;
  last_error: string | null;
  target_email: string | null;
  opened_count?: number;
  bounced_count?: number;
}

export interface AudienceSize {
  /** What a broadcast would actually queue — suppressions already removed. */
  eligible: number;
  /** Opened or clicked a previous campaign. Sent first. */
  engaged: number;
  /** Previous campaign delivered but never opened. Sent second. */
  unopened: number;
  /** Never had a campaign before. Sent last. */
  fresh: number;
  /** Skipped this round because their last campaign bounced. */
  bounce_suppressed: number;
  unsubscribed: number;
  banned: number;
}

/** Everything the composer holds. Shared by create and preview. */
export interface CampaignDraft {
  subject: string;
  body: string;
  template: EmailTemplate;
  preheader?: string;
  headline?: string;
  cta_label?: string;
  cta_url?: string;
  hero_image?: string;
}

export const createCampaign = (
  params: CampaignDraft & { audience: "all" | "user"; user_id?: string },
) => callAdminApi<{ campaign_id: string }>("create_campaign", { ...params });

/**
 * The rendered HTML, straight from the same renderer the send path uses.
 *
 * Rendering server-side rather than rebuilding the markup in React is the
 * whole point: a preview that can drift from what is sent is worse than none.
 */
export const previewCampaign = (params: CampaignDraft) =>
  callAdminApi<{ html: string }>("preview_campaign", { ...params });

export const queueCampaign = (campaign_id: string) =>
  callAdminApi<{ recipient_count: number }>("queue_campaign", { campaign_id });

export const listCampaigns = (params: ListParams = {}) =>
  callAdminApi<Paged<AdminCampaign>>("list_campaigns", {
    limit: ADMIN_PAGE_SIZE,
    ...params,
  });

export interface CampaignTotals {
  recipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
  pending: number;
  /** Delivered but never opened — only meaningful against delivered. */
  unopened: number;
}

export interface CampaignRecipient {
  user_id: string;
  email: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  open_count: number;
  clicked_at: string | null;
  click_count: number;
  bounced_at: string | null;
  bounce_type: string | null;
  bounce_detail: string | null;
  complained_at: string | null;
  error: string | null;
}

export interface CampaignStats {
  found: true;
  campaign: AdminCampaign;
  totals: CampaignTotals;
  rows: CampaignRecipient[];
}

export const getCampaignStats = (campaign_id: string, filter = "all") =>
  callAdminApi<{ stats: CampaignStats }>("campaign_stats", { campaign_id, filter });

export const setMarketingOptOut = (user_id: string, opt_out: boolean) =>
  callAdminApi<{ opt_out: boolean }>("set_marketing_opt_out", { user_id, opt_out });

/** A campaign as the calendar draws it. */
export interface CalendarEntry {
  id: string;
  subject: string;
  status: AdminCampaign["status"];
  audience: "all" | "user";
  source: "human" | "ai";
  template: EmailTemplate;
  approved: boolean;
  tested: boolean;
  recipient_count?: number;
  sent_count?: number;
  failed_count?: number;
  /** The day it sits on: the scheduled date, or the day it actually went out. */
  at: string;
}

export interface CalendarBacklogEntry {
  id: string;
  subject: string;
  status: AdminCampaign["status"];
  audience: "all" | "user";
  source: "human" | "ai";
  template: EmailTemplate;
  approved: boolean;
  tested: boolean;
  created_at: string;
}

export interface CampaignCalendar {
  entries: CalendarEntry[];
  /** Drafts with no date yet, offered for placing. */
  unscheduled: CalendarBacklogEntry[];
}

export const getCampaignCalendar = (from: string, to: string) =>
  callAdminApi<CampaignCalendar>("campaign_calendar", { from, to });

/** The human gate. Nothing sends on a schedule without this. */
export const approveCampaign = (campaign_id: string, approved = true) =>
  callAdminApi<{ approved: boolean }>("approve_campaign", { campaign_id, approved });

/** Pass null to unschedule and drop it back to a draft. */
export const scheduleCampaign = (
  campaign_id: string,
  scheduled_for: string | null,
) =>
  callAdminApi<{ scheduled_for: string | null }>("schedule_campaign", {
    campaign_id,
    scheduled_for,
  });

// ── The writer ──────────────────────────────────────────────

export interface AiDraft {
  template: EmailTemplate;
  subject: string;
  preheader: string;
  headline: string;
  cta_label: string;
  cta_url: string;
  body: string;
  rationale?: string;
}

export interface AiPlanEntry {
  campaign_id: string;
  subject: string;
  proposed_for: string;
  rationale: string | null;
}

/**
 * Its own Edge Function rather than an admin-api action: it holds the DeepSeek
 * key and has a completely different latency profile from every other admin
 * read. It writes copy and nothing else — it cannot send or schedule.
 */
export const draftCampaign = (brief: string) =>
  callEdgeFunction("draft-campaign", { brief, mode: "single" }) as Promise<{
    draft: AiDraft;
  }>;

/** Saves `count` drafts carrying proposed dates. Still needs approving. */
export const planCampaigns = (brief: string, count: number, start_offset = 3) =>
  callEdgeFunction("draft-campaign", {
    brief,
    mode: "plan",
    count,
    start_offset,
  }) as Promise<{ created: AiPlanEntry[] }>;

export const deleteCampaign = (campaign_id: string) =>
  callAdminApi<{ deleted: boolean }>("delete_campaign", { campaign_id });

export const getAudienceSize = () =>
  callAdminApi<{ audience: AudienceSize }>("audience_size");

/**
 * Sending is its own Edge Function, not an admin-api action: it is a queue
 * drain with a different timeout profile, and it returns `remaining` so the
 * caller can keep going until the list is empty.
 */
export const sendCampaign = (campaign_id: string, test = false) =>
  callEdgeFunction("send-campaign", { campaign_id, test }) as Promise<{
    sent: number;
    failed: number;
    remaining: number;
    done: boolean;
    test?: boolean;
    sent_to?: string;
  }>;

// ── Formatting helpers, shared by every admin table ─────────

export const money = (n: number | null | undefined) =>
  `$${Number(n ?? 0).toFixed(2)}`;

export const shortDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "2-digit",
      })
    : "—";

export const dateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
