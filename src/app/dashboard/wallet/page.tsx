import {
  DASHBOARD_PAGE_SIZE,
  readPage,
  readSize,
} from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import { fetchPage } from "@/lib/paged-query";
import WalletClient, {
  type Transaction,
  type TxFilter,
} from "./WalletClient";

// Always render fresh — balance/transactions change and must never be cached.
export const dynamic = "force-dynamic";

const FILTERS: TxFilter[] = ["all", "topup", "deduction", "refund"];

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; size?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const filter: TxFilter = FILTERS.includes(sp.type as TxFilter)
    ? (sp.type as TxFilter)
    : "all";
  // Parsed with the same helpers the client writes them with, so a URL the
  // pager produced and a URL someone typed are read identically.
  const page = readPage(sp.page);
  const pageSize = readSize(sp.size, DASHBOARD_PAGE_SIZE);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let balance = 0;
  let transactions: Transaction[] = [];
  let total = 0;
  let servedPage = page;

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
      fetchPage<Transaction>(
        (f, t) => txQuery.order("created_at", { ascending: false }).range(f, t),
        page,
        pageSize,
      ),
    ]);

    balance = Number(profile?.balance ?? 0);
    transactions = txRes.rows;
    total = txRes.total;
    servedPage = txRes.page;
  }

  return (
    <WalletClient
      initialBalance={balance}
      initialTransactions={transactions}
      total={total}
      page={servedPage}
      pageSize={pageSize}
      filter={filter}
    />
  );
}
