import {
  DASHBOARD_PAGE_SIZE,
  readPage,
  readSize,
} from "@/lib/pagination";
import { fetchPage } from "@/lib/paged-query";
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
  // The page actually served. fetchPage lands an out-of-range ?page= on the
  // last real one, and the pager must show where you ended up.
  let servedPage = page;
  const pageSize = readSize(sp.size, DASHBOARD_PAGE_SIZE);

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
      const res = await fetchPage<OrderRow>(
        (f, t) => q.order("created_at", { ascending: false }).range(f, t),
        page,
        pageSize,
      );
      if (res.failed) {
        // Loud, not silent. A mistyped column answers 42703 with no rows,
        // which is indistinguishable from "you have no history" — exactly how
        // the orders tab stayed broken for months. An out-of-range page is
        // handled by fetchPage and is deliberately not counted as a failure.
        console.error(`ALERT history: orders query failed`);
        loadError = true;
      }
      orders = res.rows;
      total = res.total;
      servedPage = res.page;
    } else if (tab === "rentals") {
      let q = supabase
        .from("rentals")
        .select(
          "id, created_at, service_name, country_name, phone_number, days, status, cost",
          { count: "exact" },
        )
        .eq("user_id", user.id);
      if (status !== "all") q = q.eq("status", status);
      const res = await fetchPage<RentalRow>(
        (f, t) => q.order("created_at", { ascending: false }).range(f, t),
        page,
        pageSize,
      );
      if (res.failed) {
        // Loud, not silent. A mistyped column answers 42703 with no rows,
        // which is indistinguishable from "you have no history" — exactly how
        // the orders tab stayed broken for months. An out-of-range page is
        // handled by fetchPage and is deliberately not counted as a failure.
        console.error(`ALERT history: rentals query failed`);
        loadError = true;
      }
      rentals = res.rows;
      total = res.total;
      servedPage = res.page;
    } else {
      let q = supabase
        .from("esims")
        .select(
          "id, created_at, country_name, country, data_gb, total_bytes, iccid, duration_days, status, cost",
          { count: "exact" },
        )
        .eq("user_id", user.id);
      if (status !== "all") q = q.eq("status", status);
      const res = await fetchPage<EsimHistoryRow>(
        (f, t) => q.order("created_at", { ascending: false }).range(f, t),
        page,
        pageSize,
      );
      if (res.failed) {
        // Loud, not silent. A mistyped column answers 42703 with no rows,
        // which is indistinguishable from "you have no history" — exactly how
        // the orders tab stayed broken for months. An out-of-range page is
        // handled by fetchPage and is deliberately not counted as a failure.
        console.error(`ALERT history: esims query failed`);
        loadError = true;
      }
      esims = res.rows;
      total = res.total;
      servedPage = res.page;
    }
  }

  return (
    <HistoryClient
      tab={tab}
      status={status}
      page={servedPage}
      pageSize={pageSize}
      total={total}
      loadError={loadError}
      orders={orders}
      rentals={rentals}
      esims={esims}
    />
  );
}
