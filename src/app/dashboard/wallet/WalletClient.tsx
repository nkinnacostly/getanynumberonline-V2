"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { closePaymentModal } from "flutterwave-react-v3";
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

interface FlutterwaveResponse {
  status?: string;
  tx_ref?: string;
  transaction_id?: number;
}

// Flutterwave's inline checkout, loaded from https://checkout.flutterwave.com/v3.js.
// We call this global directly instead of the flutterwave-react-v3 wrapper,
// whose <FlutterWaveButton>/useFlutterwave silently fail to open the modal on
// Next.js (known issue: github.com/Flutterwave/React-v3/issues/8).
type FlutterwaveCheckoutFn = (config: Record<string, unknown>) => void;

const QUICK_AMOUNTS = [5, 10, 20, 50];
const FLW_SCRIPT = "https://checkout.flutterwave.com/v3.js";

/**
 * Balance + transactions are supplied by the server component (parent), so the
 * display works even when the client Supabase session is briefly unavailable —
 * e.g. right after a payment. router.refresh() re-runs the server fetch and
 * updates these props.
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
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptError, setScriptError] = useState(false);
  // "opening" = clicked, waiting for the Flutterwave modal to actually appear.
  const [opening, setOpening] = useState(false);
  const openWatch = useRef<ReturnType<typeof setInterval> | null>(null);
  const openTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopOpening = () => {
    setOpening(false);
    if (openWatch.current) {
      clearInterval(openWatch.current);
      openWatch.current = null;
    }
    if (openTimeout.current) {
      clearTimeout(openTimeout.current);
      openTimeout.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (openWatch.current) clearInterval(openWatch.current);
      if (openTimeout.current) clearTimeout(openTimeout.current);
    };
  }, []);

  const publicKey = process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY;
  const amountNum = parseFloat(amount);
  const validAmount = amountNum >= 1 && amountNum <= 500;

  const balance = initialBalance;
  const transactions = initialTransactions;

  // Load Flutterwave's checkout script up front so the modal opens instantly on
  // click, and so a blocked/failed load surfaces as an error, never a dead button.
  useEffect(() => {
    const w = window as unknown as { FlutterwaveCheckout?: FlutterwaveCheckoutFn };
    if (typeof w.FlutterwaveCheckout === "function") {
      setScriptReady(true);
      return;
    }
    let s = document.querySelector<HTMLScriptElement>(
      `script[src="${FLW_SCRIPT}"]`,
    );
    const onLoad = () => setScriptReady(true);
    const onError = () => setScriptError(true);
    if (!s) {
      s = document.createElement("script");
      s.src = FLW_SCRIPT;
      s.async = true;
      document.body.appendChild(s);
    }
    s.addEventListener("load", onLoad);
    s.addEventListener("error", onError);
    return () => {
      s?.removeEventListener("load", onLoad);
      s?.removeEventListener("error", onError);
    };
  }, []);

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

  // Fires in-page when the modal completes — no reload, so the browser session
  // stays intact (this is what the old redirect broke).
  const handlePaid = async (response: FlutterwaveResponse) => {
    // Dismiss the Flutterwave modal — when calling FlutterwaveCheckout directly
    // it does not auto-close on completion.
    closePaymentModal();
    stopOpening();

    const paid =
      response.status === "successful" || response.status === "completed";
    if (!paid) {
      toast("Payment was not completed", "error");
      return;
    }

    // Reset the input now that the payment went through.
    setAmount("");
    setSelectedQuick(null);
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

  const openCheckout = () => {
    if (!user || !user.email) {
      toast("Please sign in again to add funds", "error");
      return;
    }
    if (!publicKey) {
      toast("Payments are temporarily unavailable", "error");
      return;
    }
    if (!validAmount) {
      toast("Enter an amount between $1 and $500", "error");
      return;
    }
    const w = window as unknown as {
      FlutterwaveCheckout?: FlutterwaveCheckoutFn;
    };
    if (typeof w.FlutterwaveCheckout !== "function") {
      toast("Payment window is still loading — try again in a moment", "error");
      return;
    }

    setOpening(true);
    try {
      w.FlutterwaveCheckout({
        public_key: publicKey,
        // tx_ref MUST match the topup_<userId>_<ts> format verify-payment parses.
        tx_ref: `topup_${user.id}_${Date.now()}`,
        amount: amountNum,
        currency: "USD",
        payment_options: "card",
        customer: {
          email: user.email,
          phone_number: "",
          name: user.email,
        },
        customizations: {
          title: "Wallet Top-up",
          description: "Add funds to your SMS verification wallet",
          logo: "",
        },
        meta: { user_id: user.id },
        callback: handlePaid,
        onclose: stopOpening,
      });
    } catch (err) {
      console.error("Flutterwave open failed:", err);
      stopOpening();
      toast("Couldn't open the payment window. Please try again.", "error");
      return;
    }

    // Hide the button spinner the moment the modal iframe is on screen; keep a
    // safety timeout in case it never appears.
    openWatch.current = setInterval(() => {
      if (document.getElementsByName("checkout").length > 0) stopOpening();
    }, 150);
    openTimeout.current = setTimeout(stopOpening, 8000);
  };

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

  const disabled = !validAmount || scriptError || !publicKey || opening;

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

        <button
          onClick={openCheckout}
          disabled={disabled}
          className="w-full py-3 rounded-lg font-semibold text-sm transition-colors disabled:opacity-40"
          style={{ backgroundColor: "#00FF94", color: "#080808" }}
        >
          {opening ? (
            <span className="flex items-center justify-center gap-2">
              <span
                className="auth-spinner"
                style={{
                  borderColor: "#080808",
                  borderTopColor: "transparent",
                }}
              />
              Opening payment…
            </span>
          ) : !scriptReady && validAmount ? (
            "Loading payment…"
          ) : (
            "Top up with Flutterwave →"
          )}
        </button>

        {!publicKey && (
          <p className="mt-2 text-xs" style={{ color: "#FF4444" }}>
            Payments are temporarily unavailable — missing configuration.
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
