"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Pager from "@/components/dashboard/Pager";
import TopupButton from "@/components/dashboard/TopupButton";
import {
  isValidTopup,
  QUICK_AMOUNTS as WALLET_QUICK_AMOUNTS,
  TOPUP_MAX,
  TOPUP_MIN,
} from "@/lib/wallet";

export interface Transaction {
  id: string;
  created_at: string;
  type: "topup" | "deduction" | "refund";
  amount: number;
  balance_after: number;
  note: string | null;
}

export type TxFilter = "all" | "topup" | "deduction" | "refund";

const QUICK_AMOUNTS = [...WALLET_QUICK_AMOUNTS];

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
  const validAmount = isValidTopup(amountNum);
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
      return { bg: "color-mix(in srgb, var(--accent) 10%, transparent)", color: "var(--accent)", border: "color-mix(in srgb, var(--accent) 32%, transparent)" };
    if (type === "deduction")
      return { bg: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", border: "color-mix(in srgb, var(--danger) 32%, transparent)" };
    return { bg: "color-mix(in srgb, var(--warning) 12%, transparent)", color: "var(--warning)", border: "color-mix(in srgb, var(--warning) 32%, transparent)" };
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
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--foreground)" }}>
        Wallet
      </h1>

      {showSuccess && (
        <div
          className="mb-4 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: "color-mix(in srgb, var(--accent) 10%, transparent)",
            border: "1px solid var(--accent)",
            color: "var(--accent)",
          }}
        >
          Payment received! Your balance has been updated.
        </div>
      )}

      {/* Balance + Top-up */}
      <div
        className="rounded-xl p-6 mb-8"
        style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)" }}
      >
        <p className="text-sm mb-1" style={{ color: "var(--muted)" }}>
          Your balance
        </p>
        <p
          className="font-mono text-5xl font-bold mb-8"
          style={{ color: "var(--accent)" }}
        >
          ${balance.toFixed(2)}
        </p>

        <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--foreground)" }}>
          Add funds
        </h2>

        <div className="flex gap-2 mb-4">
          {QUICK_AMOUNTS.map((val) => (
            <button
              key={val}
              onClick={() => handleQuick(val)}
              className="flex-1 py-2 rounded-lg text-sm font-mono font-medium transition-colors"
              style={{
                backgroundColor: selectedQuick === val ? "var(--accent)" : "var(--field)",
                color: selectedQuick === val ? "var(--accent-ink)" : "var(--foreground)",
                border: `1px solid ${selectedQuick === val ? "var(--accent)" : "var(--line)"}`,
              }}
            >
              ${val}
            </button>
          ))}
        </div>

        <label className="block text-xs mb-1.5" style={{ color: "var(--muted)" }}>
          Or enter amount (min ${TOPUP_MIN})
        </label>
        <input
          type="number"
          min={TOPUP_MIN}
          max={TOPUP_MAX}
          value={amount}
          onChange={(e) => handleAmountChange(e.target.value)}
          placeholder="0.00"
          className="w-full px-4 py-3 rounded-lg font-mono text-sm mb-4 outline-none transition-colors"
          style={{
            backgroundColor: "var(--background)",
            border: "1px solid var(--line)",
            color: "var(--foreground)",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
        />

        <TopupButton
          amount={amountNum}
          label="Top up with Flutterwave →"
          openingLabel="Opening payment…"
          loadingLabel="Loading payment…"
          onFunded={handleFunded}
          disabled={!validAmount}
          className="w-full py-3 rounded-lg font-semibold text-sm transition-colors disabled:opacity-40"
          style={{ backgroundColor: "var(--accent)", color: "var(--accent-ink)" }}
        />
      </div>

      {/* Transaction history — responsive card rows (no sideways scroll) */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
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
                    backgroundColor: active ? "var(--field)" : "transparent",
                    color: active ? "var(--accent)" : "var(--muted)",
                    border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {transactions.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: "var(--muted)" }}>
            {filter === "all"
              ? "No transactions yet"
              : `No ${filterLabel} yet`}
          </p>
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--line)" }}
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
                    borderTop: i === 0 ? "none" : "1px solid var(--line)",
                    backgroundColor: "var(--surface)",
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
                        style={{ color: "var(--foreground)" }}
                      >
                        {tx.note || label}
                      </span>
                    </div>
                    <div
                      className="font-mono text-[11px] mt-1"
                      style={{ color: "var(--muted)" }}
                    >
                      {formatDate(tx.created_at)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className="font-mono text-sm"
                      style={{ color: positive ? "var(--accent)" : "var(--danger)" }}
                    >
                      {positive ? "+" : "-"}${Math.abs(tx.amount).toFixed(2)}
                    </div>
                    <div
                      className="font-mono text-[11px] mt-1"
                      style={{ color: "var(--muted)" }}
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
