"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Pager from "@/components/dashboard/Pager";
import TopupButton from "@/components/dashboard/TopupButton";

export interface Transaction {
  id: string;
  created_at: string;
  type: "topup" | "deduction" | "refund";
  amount: number;
  balance_after: number;
  note: string | null;
}

export type TxFilter = "all" | "topup" | "deduction" | "refund";

const QUICK_AMOUNTS = [5, 10, 20, 50];

const FILTER_TABS: { id: TxFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "topup", label: "Top-ups" },
  { id: "deduction", label: "Purchases" },
  { id: "refund", label: "Refunds" },
];

/**
 * Balance + transactions are supplied by the server component (parent), so the
 * display works even when the client Supabase session is briefly unavailable.
 * router.refresh() (inside useTopup) re-runs the server fetch and updates props.
 */
export default function WalletClient({
  initialBalance,
  initialTransactions,
  total,
  page,
  pageSize,
  filter,
}: {
  initialBalance: number;
  initialTransactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
  filter: TxFilter;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [selectedQuick, setSelectedQuick] = useState<number | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const amountNum = parseFloat(amount);
  const validAmount = amountNum >= 5 && amountNum <= 500;
  const balance = initialBalance;
  const transactions = initialTransactions;

  // Show the success banner whenever a credit lands (balance goes up).
  const seenBalance = useRef(initialBalance);
  useEffect(() => {
    if (initialBalance > seenBalance.current) {
      seenBalance.current = initialBalance;
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 6000);
      return () => clearTimeout(t);
    }
  }, [initialBalance]);

  const handleFunded = () => {
    setAmount("");
    setSelectedQuick(null);
  };

  const handleQuick = (val: number) => {
    setSelectedQuick(val);
    setAmount(String(val));
  };

  const handleAmountChange = (val: string) => {
    setAmount(val);
    setSelectedQuick(QUICK_AMOUNTS.includes(Number(val)) ? Number(val) : null);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const badge = (type: string) => {
    if (type === "topup")
      return { bg: "#0A1F0A", color: "#00FF94", border: "rgba(0,255,148,0.32)" };
    if (type === "deduction")
      return { bg: "#1A0000", color: "#FF4444", border: "rgba(255,68,68,0.32)" };
    return { bg: "#1A1500", color: "#F5A623", border: "rgba(245,166,35,0.32)" };
  };

  // Server-side filter + pagination via the URL (survives the flaky client
  // session, and works for any number of transactions).
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const buildQuery = (next: { type?: TxFilter; page?: number }) => {
    const t = next.type ?? filter;
    const p = next.page ?? page;
    const params = new URLSearchParams();
    if (t !== "all") params.set("type", t);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/dashboard/wallet${qs ? `?${qs}` : ""}`;
  };
  const goFilter = (t: TxFilter) => router.push(buildQuery({ type: t, page: 1 }));
  const goPage = (p: number) => router.push(buildQuery({ page: p }));
  const filterLabel =
    FILTER_TABS.find((f) => f.id === filter)?.label.toLowerCase() ?? "";

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-6" style={{ color: "#F5F5F5" }}>
        Wallet
      </h1>

      {showSuccess && (
        <div
          className="mb-4 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: "#0A1F0A",
            border: "1px solid #00FF94",
            color: "#00FF94",
          }}
        >
          Payment received! Your balance has been updated.
        </div>
      )}

      {/* Balance + Top-up */}
      <div
        className="rounded-xl p-6 mb-8"
        style={{ backgroundColor: "#0F0F0F", border: "1px solid #1A1A1A" }}
      >
        <p className="text-sm mb-1" style={{ color: "#555555" }}>
          Your balance
        </p>
        <p
          className="font-mono text-5xl font-bold mb-8"
          style={{ color: "#00FF94" }}
        >
          ${balance.toFixed(2)}
        </p>

        <h2 className="text-lg font-semibold mb-4" style={{ color: "#F5F5F5" }}>
          Add funds
        </h2>

        <div className="flex gap-2 mb-4">
          {QUICK_AMOUNTS.map((val) => (
            <button
              key={val}
              onClick={() => handleQuick(val)}
              className="flex-1 py-2 rounded-lg text-sm font-mono font-medium transition-colors"
              style={{
                backgroundColor: selectedQuick === val ? "#080808" : "#1A1A1A",
                color: selectedQuick === val ? "#00FF94" : "#F5F5F5",
                border: `1px solid ${selectedQuick === val ? "#00FF94" : "#1A1A1A"}`,
              }}
            >
              ${val}
            </button>
          ))}
        </div>

        <label className="block text-xs mb-1.5" style={{ color: "#555555" }}>
          Or enter amount (min $5)
        </label>
        <input
          type="number"
          min={5}
          max={500}
          value={amount}
          onChange={(e) => handleAmountChange(e.target.value)}
          placeholder="0.00"
          className="w-full px-4 py-3 rounded-lg font-mono text-sm mb-4 outline-none transition-colors"
          style={{
            backgroundColor: "#080808",
            border: "1px solid #1A1A1A",
            color: "#F5F5F5",
          }}
          onFocus={(e) => (e.target.style.borderColor = "#00FF94")}
          onBlur={(e) => (e.target.style.borderColor = "#1A1A1A")}
        />

        <TopupButton
          amount={amountNum}
          label="Top up with Flutterwave →"
          openingLabel="Opening payment…"
          loadingLabel="Loading payment…"
          onFunded={handleFunded}
          disabled={!validAmount}
          className="w-full py-3 rounded-lg font-semibold text-sm transition-colors disabled:opacity-40"
          style={{ backgroundColor: "#00FF94", color: "#080808" }}
        />
      </div>

      {/* Transaction history — responsive card rows (no sideways scroll) */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold" style={{ color: "#F5F5F5" }}>
            Transaction history
          </h2>
          <div className="flex gap-2 flex-wrap">
            {FILTER_TABS.map((f) => {
              const active = f.id === filter;
              return (
                <button
                  key={f.id}
                  onClick={() => goFilter(f.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: active ? "#141414" : "transparent",
                    color: active ? "#00FF94" : "#888888",
                    border: `1px solid ${active ? "#00FF94" : "#1A1A1A"}`,
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {transactions.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: "#555555" }}>
            {filter === "all"
              ? "No transactions yet"
              : `No ${filterLabel} yet`}
          </p>
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid #1A1A1A" }}
          >
            {transactions.map((tx, i) => {
              const b = badge(tx.type);
              const positive = tx.type === "topup" || tx.type === "refund";
              const label =
                tx.type === "topup"
                  ? "Wallet top-up"
                  : tx.type === "refund"
                    ? "Refund"
                    : "Number purchase";
              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-3 px-4 py-3.5"
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid #1A1A1A",
                    backgroundColor: "#0F0F0F",
                  }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase"
                        style={{
                          backgroundColor: b.bg,
                          color: b.color,
                          border: `1px solid ${b.border}`,
                        }}
                      >
                        {tx.type}
                      </span>
                      <span
                        className="text-[13px] truncate"
                        style={{ color: "#F5F5F5" }}
                      >
                        {tx.note || label}
                      </span>
                    </div>
                    <div
                      className="font-mono text-[11px] mt-1"
                      style={{ color: "#555555" }}
                    >
                      {formatDate(tx.created_at)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className="font-mono text-sm"
                      style={{ color: positive ? "#00FF94" : "#FF4444" }}
                    >
                      {positive ? "+" : "-"}${Math.abs(tx.amount).toFixed(2)}
                    </div>
                    <div
                      className="font-mono text-[11px] mt-1"
                      style={{ color: "#555555" }}
                    >
                      bal ${tx.balance_after.toFixed(2)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Pager page={page} totalPages={totalPages} onPage={goPage} />
      </div>
    </div>
  );
}
