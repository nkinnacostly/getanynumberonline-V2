import { createClient } from "@/lib/supabase/server";
import HistoryClient, {
  type HistoryTab,
  type OrderRow,
  type RentalRow,
} from "./HistoryClient";

// Always render fresh — history changes and must never be cached.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 8;
const ORDER_STATUSES = ["pending", "active", "cancelled", "expired", "refunded"];
const RENTAL_STATUSES = ["active", "expired", "cancelled"];

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const tab: HistoryTab = sp.tab === "rentals" ? "rentals" : "orders";
  const allowed = tab === "orders" ? ORDER_STATUSES : RENTAL_STATUSES;
  const status = sp.status && allowed.includes(sp.status) ? sp.status : "all";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let orders: OrderRow[] = [];
  let rentals: RentalRow[] = [];
  let total = 0;

  if (user) {
    if (tab === "orders") {
      let q = supabase
        .from("orders")
        .select(
          "id, order_id, created_at, service_name, country_name, service, country, phone_number, status, cost",
          { count: "exact" },
        )
        .eq("user_id", user.id);
      if (status !== "all") q = q.eq("status", status);
      const res = await q
        .order("created_at", { ascending: false })
        .range(from, to);
      orders = (res.data as OrderRow[]) ?? [];
      total = res.count ?? 0;
    } else {
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
      rentals = (res.data as RentalRow[]) ?? [];
      total = res.count ?? 0;
    }
  }

  return (
    <HistoryClient
      tab={tab}
      status={status}
      page={page}
      pageSize={PAGE_SIZE}
      total={total}
      orders={orders}
      rentals={rentals}
    />
  );
}
