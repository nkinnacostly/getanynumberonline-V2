import { createClient } from "@/lib/supabase/server";
import WalletClient, { type Transaction } from "./WalletClient";

// Always render fresh — balance/transactions change and must never be cached.
export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let balance = 0;
  let transactions: Transaction[] = [];

  if (user) {
    const [{ data: profile }, { data: txs }] = await Promise.all([
      supabase.from("profiles").select("balance").eq("id", user.id).single(),
      supabase
        .from("transactions")
        .select("id, created_at, type, amount, balance_after, note")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    balance = Number(profile?.balance ?? 0);
    transactions = (txs as Transaction[]) ?? [];
  }

  return (
    <WalletClient initialBalance={balance} initialTransactions={transactions} />
  );
}
