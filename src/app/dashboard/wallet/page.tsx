import { createClient } from "@/lib/supabase/server";
import WalletClient, {
  type Transaction,
  type TxFilter,
} from "./WalletClient";

// Always render fresh — balance/transactions change and must never be cached.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 8;
const FILTERS: TxFilter[] = ["all", "topup", "deduction", "refund"];

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const filter: TxFilter = FILTERS.includes(sp.type as TxFilter)
    ? (sp.type as TxFilter)
    : "all";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let balance = 0;
  let transactions: Transaction[] = [];
  let total = 0;

  if (user) {
    let txQuery = supabase
      .from("transactions")
      .select("id, created_at, type, amount, balance_after, note", {
        count: "exact",
      })
      .eq("user_id", user.id);
    if (filter !== "all") txQuery = txQuery.eq("type", filter);

    const [{ data: profile }, txRes] = await Promise.all([
      supabase.from("profiles").select("balance").eq("id", user.id).single(),
      txQuery.order("created_at", { ascending: false }).range(from, to),
    ]);

    balance = Number(profile?.balance ?? 0);
    transactions = (txRes.data as Transaction[]) ?? [];
    total = txRes.count ?? 0;
  }

  return (
    <WalletClient
      initialBalance={balance}
      initialTransactions={transactions}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      filter={filter}
    />
  );
}
