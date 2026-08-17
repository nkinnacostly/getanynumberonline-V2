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
  total_revenue: number;
  total_spent: number;
  orders_today: number;
  total_orders: number;
  active_rentals: number;
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

export interface Paged<T> {
  rows: T[];
  total: number;
  limit: number;
}

/** Page size used by every admin table. */
export const ADMIN_PAGE_SIZE = 25;

export const getStats = () =>
  callAdminApi<AdminStats & { success: boolean }>("get_stats");

export const getSmspoolBalance = () =>
  callAdminApi<{ balance: number }>("smspool_balance");

export const listUsers = (params: { search?: string; offset?: number; limit?: number }) =>
  callAdminApi<Paged<AdminUser>>("list_users", { limit: ADMIN_PAGE_SIZE, ...params });

export const listOrders = (params: { status?: string; offset?: number; limit?: number }) =>
  callAdminApi<Paged<AdminOrder>>("list_orders", { limit: ADMIN_PAGE_SIZE, ...params });

export const listRentals = (params: { status?: string; offset?: number; limit?: number }) =>
  callAdminApi<Paged<AdminRental>>("list_rentals", { limit: ADMIN_PAGE_SIZE, ...params });

export const listTransactions = (params: { type?: string; offset?: number; limit?: number }) =>
  callAdminApi<Paged<AdminTransaction>>("list_transactions", {
    limit: ADMIN_PAGE_SIZE,
    ...params,
  });

export const adjustBalance = (user_id: string, amount: number, note: string) =>
  callAdminApi<{ balance: number }>("adjust_balance", { user_id, amount, note });

export const setBan = (user_id: string, banned: boolean) =>
  callAdminApi<{ banned: boolean }>("set_ban", { user_id, banned });

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
