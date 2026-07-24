"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  FlutterWaveButton,
  closePaymentModal,
  FlutterWaveTypes,
} from "flutterwave-react-v3";
import { useToast } from "@/components/dashboard/Toast";
import { useUser } from "@/hooks/useUser";

export interface Transaction {
  id: string;
  created_at: string;
  type: "topup" | "deduction" | "refund";
  amount: number;
  balance_after: number;
  note: string | null;
}

const QUICK_AMOUNTS = [5, 10, 20, 50];

/**
 * Balance + transactions are supplied by the server component (parent), so the
 * display works even when the client Supabase session is briefly unavailable —
 * e.g. right after the full-page redirect back from Flutterwave, when the
 * browser can't yet read the session but the server (via middleware) can.
 * router.refresh() re-runs the server fetch and updates these props.
 */
export default function WalletClient({
  initialBalance,
  initialTransactions,
}: {
  initialBalance: number;
  initialTransactions: Transaction[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const user = useUser();
  const [amount, setAmount] = useState("");
  const [selectedQuick, setSelectedQuick] = useState<number | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  // Bumped after each payment attempt so the next one gets a fresh tx_ref.
  const [payNonce, setPayNonce] = useState(0);

  const publicKey = process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY;
  const amountNum = parseFloat(amount);
  const canPay = !!user && !!publicKey && amountNum >= 1 && amountNum <= 500;

  // Preload Flutterwave's checkout script so the modal opens instantly (the SDK
  // otherwise lazy-downloads it on first click — that's the "takes time" delay)
  // and so a blocked/failed script surfaces as an error instead of doing nothing.
  const [scriptError, setScriptError] = useState(false);
  useEffect(() => {
    const w = window as unknown as { FlutterwaveCheckout?: unknown };
    if (w.FlutterwaveCheckout) return;
    const SRC = "https://checkout.flutterwave.com/v3.js";
    if (document.querySelector(`script[src="${SRC}"]`)) return;
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onerror = () => setScriptError(true);
    document.body.appendChild(s);
  }, []);

  // tx_ref MUST match the `topup_<userId>_<ts>` format the webhook /
  // verify-payment parse. Regenerated when the amount changes or after an
  // attempt, so each charge is unique.
  const txRef = useMemo(
    () => (user ? `topup_${user.id}_${Date.now()}` : ""),
    [user, amount, payNonce],
  );

  const flwConfig: FlutterWaveTypes.FlutterwaveConfig = {
    public_key: publicKey ?? "",
    tx_ref: txRef,
    amount: amountNum || 0,
    currency: "USD",
    payment_options: "card",
    customer: {
      email: user?.email ?? "",
      phone_number: "",
      name: user?.email ?? "",
    },
    customizations: {
      title: "Wallet Top-up",
      description: "Add funds to your SMS verification wallet",
      logo: "",
    },
    meta: { user_id: user?.id ?? "" },
  };

  // Fires in-page when the Flutterwave modal completes — no page reload, so the
  // browser session stays intact (this is what the old redirect broke).
  const handlePaid = async (response: FlutterWaveTypes.FlutterWaveResponse) => {
    closePaymentModal();
    setPayNonce((n) => n + 1);

    const paid =
      response.status === "successful" || response.status === "completed";
    if (!paid) {
      toast("Payment was not completed", "error");
      return;
    }

    // Server-side verify + credit (never trust the client-reported status).
    try {
      await fetch("/api/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: response.transaction_id,
          tx_ref: response.tx_ref,
        }),
      });
    } catch (err) {
      console.error("verify-payment call failed:", err);
    }

    // Re-fetch server-rendered balance + transactions (in-page).
    router.refresh();
  };

  const balance = initialBalance;
  const transactions = initialTransactions;

  // Show the success banner whenever a credit lands (balance goes up after a
  // refresh), covering both the instant verify and the delayed webhook.
  const seenBalance = useRef(initialBalance);
  useEffect(() => {
    if (initialBalance > seenBalance.current) {
      seenBalance.current = initialBalance;
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 6000);
      return () => clearTimeout(t);
    }
  }, [initialBalance]);

  // On return from Flutterwave: run the server-side verify (instant credit),
  // then refresh the server data. The webhook credit can land a moment later,
  // so keep refreshing for a bit until the new balance shows.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("topup") !== "success" ||
      params.get("status") !== "successful"
    ) {
      return;
    }
    const transaction_id = params.get("transaction_id");
    const tx_ref = params.get("tx_ref");
    // Clean the URL so a manual refresh doesn't re-trigger this flow.
    window.history.replaceState({}, "", "/dashboard/wallet");

    let cancelled = false;

    const confirmTopUp = async () => {
      if (transaction_id && tx_ref) {
        try {
          const res = await fetch("/api/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transaction_id, tx_ref }),
          });
          const data = await res.json();
          if (data.success && !cancelled) {
            router.refresh(); // pull fresh balance + transactions from the server
            return;
          }
        } catch (err) {
          console.error("verify-payment call failed:", err);
        }
      }

      // Fallback: poll for the webhook credit to reflect (up to ~60s).
      for (let i = 0; i < 20 && !cancelled; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        if (!cancelled) router.refresh();
      }
    };

    confirmTopUp();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleQuick = (val: number) => {
    setSelectedQuick(val);
    setAmount(String(val));
  };

  const handleAmountChange = (val: string) => {
    setAmount(val);
    setSelectedQuick(QUICK_AMOUNTS.includes(Number(val)) ? Number(val) : null);
  };

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const badgeColor = (type: string) => {
    if (type === "topup")
      return { bg: "#0A1F0A", color: "#00FF94", border: "#00FF94" };
    if (type === "deduction")
      return { bg: "#1A0000", color: "#FF4444", border: "#FF4444" };
    return { bg: "#1A1500", color: "#F5A623", border: "#F5A623" }; // refund
  };

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

        {/* Quick amounts */}
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

        {/* Manual input */}
        <label className="block text-xs mb-1.5" style={{ color: "#555555" }}>
          Or enter amount
        </label>
        <input
          type="number"
          min={1}
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

        {canPay ? (
          <FlutterWaveButton
            {...flwConfig}
            text="Top up with Flutterwave →"
            className="w-full py-3 rounded-lg font-semibold text-sm bg-[#00FF94] text-[#080808]"
            callback={handlePaid}
            onClose={() => {}}
          />
        ) : (
          <button
            disabled
            className="w-full py-3 rounded-lg font-semibold text-sm opacity-40"
            style={{ backgroundColor: "#00FF94", color: "#080808" }}
          >
            Top up with Flutterwave →
          </button>
        )}

        {!publicKey && (
          <p className="mt-2 text-xs" style={{ color: "#FF4444" }}>
            Payments are temporarily unavailable — missing configuration. Please
            try again shortly.
          </p>
        )}
        {scriptError && (
          <p className="mt-2 text-xs" style={{ color: "#FF4444" }}>
            Couldn&apos;t load the payment window. Disable ad-blockers / browser
            shields for this site and try again.
          </p>
        )}
      </div>

      {/* Transaction History */}
      <div>
        <h2 className="text-lg font-semibold mb-4" style={{ color: "#F5F5F5" }}>
          Transaction history
        </h2>

        {transactions.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: "#555555" }}>
            No transactions yet
          </p>
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid #1A1A1A" }}
          >
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ backgroundColor: "#0F0F0F" }}>
                  <th
                    className="text-left py-3 px-4 font-medium"
                    style={{ color: "#555555" }}
                  >
                    Date
                  </th>
                  <th
                    className="text-left py-3 px-4 font-medium"
                    style={{ color: "#555555" }}
                  >
                    Type
                  </th>
                  <th
                    className="text-right py-3 px-4 font-medium"
                    style={{ color: "#555555" }}
                  >
                    Amount
                  </th>
                  <th
                    className="text-right py-3 px-4 font-medium hidden sm:table-cell"
                    style={{ color: "#555555" }}
                  >
                    Balance
                  </th>
                  <th
                    className="text-left py-3 px-4 font-medium hidden md:table-cell"
                    style={{ color: "#555555" }}
                  >
                    Note
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const badge = badgeColor(tx.type);
                  const isPositive =
                    tx.type === "topup" || tx.type === "refund";
                  return (
                    <tr key={tx.id} style={{ borderTop: "1px solid #1A1A1A" }}>
                      <td
                        className="py-3 px-4 font-mono"
                        style={{ color: "#F5F5F5" }}
                      >
                        {formatDate(tx.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-[11px] font-mono font-medium"
                          style={{
                            backgroundColor: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                          }}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td
                        className="py-3 px-4 text-right font-mono"
                        style={{ color: isPositive ? "#00FF94" : "#FF4444" }}
                      >
                        {isPositive ? "+" : "-"}$
                        {Math.abs(tx.amount).toFixed(2)}
                      </td>
                      <td
                        className="py-3 px-4 text-right font-mono hidden sm:table-cell"
                        style={{ color: "#F5F5F5" }}
                      >
                        ${tx.balance_after.toFixed(2)}
                      </td>
                      <td
                        className="py-3 px-4 hidden md:table-cell"
                        style={{ color: "#555555" }}
                      >
                        {tx.note || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
