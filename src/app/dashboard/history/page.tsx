import {
  DASHBOARD_PAGE_SIZE,
  pageRange,
  readPage,
  readSize,
} from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import HistoryClient, {
  type HistoryTab,
  type OrderRow,
  type RentalRow,
  type EsimHistoryRow,
} from "./HistoryClient";

// Always render fresh — history changes and must never be cached.
export const dynamic = "force-dynamic";

const ORDER_STATUSES = ["pending", "active", "cancelled", "expired", "refunded"];
const RENTAL_STATUSES = ["active", "expired", "cancelled"];
const ESIM_STATUSES = [
  "active",
  "expired",
  "cancelled",
  "archived",
  "failed",
];

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    status?: string;
    page?: string;
    size?: string;
  }>;
}) {
  const sp = await searchParams;
  const tab: HistoryTab =
    sp.tab === "rentals" ? "rentals" : sp.tab === "esims" ? "esims" : "orders";
  const allowed =
    tab === "orders"
      ? ORDER_STATUSES
      : tab === "rentals"
        ? RENTAL_STATUSES
        : ESIM_STATUSES;
  const status = sp.status && allowed.includes(sp.status) ? sp.status : "all";
  // Parsed with the same helpers the client writes them with, so a URL the
  // pager produced and a URL someone typed are read identically.
  const page = readPage(sp.page);
  const pageSize = readSize(sp.size, DASHBOARD_PAGE_SIZE);
  const { from, to } = pageRange(page, pageSize);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let orders: OrderRow[] = [];
  let rentals: RentalRow[] = [];
  let esims: EsimHistoryRow[] = [];
  let total = 0;
  /** The query itself failed — tell the reader, don't show them "no history". */
  let loadError = false;

  if (user) {
    if (tab === "orders") {
      let q = supabase
        .from("orders")
        // The columns are smspool_order_id / smspool_number; selecting
        // order_id and phone_number raised 42703 and PostgREST returned no
        // rows, which is why this tab sat empty. Aliased rather than renamed
        // so the row shape the client renders stays the same.
        .select(
          "id, created_at, service_name, country_name, phone_number:smspool_number, status, cost",
          { count: "exact" },
        )
        .eq("user_id", user.id);
      if (status !== "all") q = q.eq("status", status);
      const res = await q
        .order("created_at", { ascending: false })
        .range(from, to);
      if (res.error) {
        // Loud, not silent. A mistyped column answers 42703 with no rows,
        // which is indistinguishable from "you have no history" — exactly how
        // the orders tab stayed broken for months.
        console.error(`ALERT history: orders query failed`, res.error.message);
        loadError = true;
      }
      orders = (res.data as OrderRow[]) ?? [];
      total = res.count ?? 0;
    } else if (tab === "rentals") {
      let q = supabase
        .from("rentals")
        .select(
          "id, created_at, service_name, country_name, phone_number, days, status, cost",
          { count: "exact" },
        )
        .eq("user_id", user.id);
      if (status !== "all") q = q.eq("status", status);
      const res = await q
        .order("created_at", { ascending: false })
        .range(from, to);
      if (res.error) {
        // Loud, not silent. A mistyped column answers 42703 with no rows,
        // which is indistinguishable from "you have no history" — exactly how
        // the orders tab stayed broken for months.
        console.error(`ALERT history: rentals query failed`, res.error.message);
        loadError = true;
      }
      rentals = (res.data as RentalRow[]) ?? [];
      total = res.count ?? 0;
    } else {
      let q = supabase
        .from("esims")
        .select(
          "id, created_at, country_name, country, data_gb, total_bytes, iccid, duration_days, status, cost",
          { count: "exact" },
        )
        .eq("user_id", user.id);
      if (status !== "all") q = q.eq("status", status);
      const res = await q
        .order("created_at", { ascending: false })
        .range(from, to);
      if (res.error) {
        // Loud, not silent. A mistyped column answers 42703 with no rows,
        // which is indistinguishable from "you have no history" — exactly how
        // the orders tab stayed broken for months.
        console.error(`ALERT history: esims query failed`, res.error.message);
        loadError = true;
      }
      esims = (res.data as EsimHistoryRow[]) ?? [];
      total = res.count ?? 0;
    }
  }

  return (
    <HistoryClient
      tab={tab}
      status={status}
      page={page}
      pageSize={pageSize}
      total={total}
      loadError={loadError}
      orders={orders}
      rentals={rentals}
      esims={esims}
    />
  );
}
