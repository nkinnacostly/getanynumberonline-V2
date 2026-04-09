"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useFlutterwave, closePaymentModal } from "flutterwave-react-v3";
import { useToast } from "@/components/dashboard/Toast";

interface Transaction {
  id: string;
  created_at: string;
  type: "topup" | "deduction" | "refund";
  amount: number;
  balance_after: number;
  note: string | null;
}

const QUICK_AMOUNTS = [5, 10, 20, 50];

export default function WalletPage() {
  const { toast } = useToast();
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState("");
  const [selectedQuick, setSelectedQuick] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const txRef = useRef(`topup_${Date.now()}`);

  // Fetch user, balance + transactions
  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      setUser({ id: authUser.id, email: authUser.email ?? "" });
      txRef.current = `topup_${authUser.id}_${Date.now()}`;

      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", authUser.id)
        .single();
      if (profile) setBalance(profile.balance);

      const { data: txs } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (txs) setTransactions(txs as Transaction[]);
      setLoadingTx(false);
    };
    load();
  }, []);

  // Remove old redirect-based verification
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("topup") === "success") {
      window.history.replaceState({}, "", "/dashboard/wallet");
    }
  }, []);

  const handleQuick = (val: number) => {
    setSelectedQuick(val);
    setAmount(String(val));
  };

  const handleAmountChange = (val: string) => {
    setAmount(val);
    setSelectedQuick(QUICK_AMOUNTS.includes(Number(val)) ? Number(val) : null);
    setError(null);
  };

  // Flutterwave inline payment
  const flutterwaveConfig = {
    public_key: process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY!,
    tx_ref: txRef.current,
    amount: parseFloat(amount) || 0,
    currency: "USD",
    payment_options: "card, mobilemoney, ussd",
    customer: {
      email: user?.email ?? "",
      phone_number: "",
      name: "",
    },
    customizations: {
      title: "Wallet Top-up",
      description: "Add funds to your SMS verification wallet",
      logo: "",
    },
  };

  const handleFlutterPayment = useFlutterwave(flutterwaveConfig);

  const handleTopup = () => {
    if (!amount || parseFloat(amount) < 1) {
      setError("Minimum top-up is $1");
      return;
    }
    if (parseFloat(amount) > 500) {
      setError("Maximum top-up is $500");
      return;
    }

    handleFlutterPayment({
      callback: async (response: any) => {
        closePaymentModal();
        if (response.status === "successful") {
          setLoading(true);
          try {
            const res = await fetch("/api/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                transaction_id: response.transaction_id,
                tx_ref: response.tx_ref,
              }),
            });
            const data = await res.json();
            if (data.success) {
              setShowSuccess(true);
              fetchBalance();
              txRef.current = `topup_${user?.id}_${Date.now()}`;
            } else {
              setError("Payment received but balance update failed. Contact support.");
            }
          } catch {
            setError("Failed to verify payment. Contact support.");
          } finally {
            setLoading(false);
          }
        }
      },
      onClose: () => {},
    });
  };

  const fetchBalance = async () => {
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const { data } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", authUser.id)
      .single();
    if (data) setBalance(data.balance);
    if (
      typeof (window as unknown as { __refreshBalance?: () => void })
        .__refreshBalance === "function"
    ) {
      (window as unknown as { __refreshBalance?: () => void }).__refreshBalance!();
    }
    // Refresh transactions
    const { data: txs } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", authUser.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (txs) setTransactions(txs as Transaction[]);
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

        <button
          onClick={handleTopup}
          disabled={!amount}
          className="w-full py-3 rounded-lg font-semibold text-sm transition-colors disabled:opacity-40"
          style={{ backgroundColor: "#00FF94", color: "#080808" }}
        >
          Top up with Flutterwave →
        </button>

        {error && (
          <div
            className="mt-3 px-3 py-3 rounded-[6px] text-[13px]"
            style={{
              backgroundColor: "#1A0000",
              border: "1px solid #FF4444",
              color: "#FF4444",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div>
        <h2 className="text-lg font-semibold mb-4" style={{ color: "#F5F5F5" }}>
          Transaction history
        </h2>

        {loadingTx ? (
          <div className="flex justify-center py-12">
            <span
              className="auth-spinner"
              style={{
                width: 24,
                height: 24,
                borderColor: "#00FF94",
                borderTopColor: "transparent",
              }}
            />
          </div>
        ) : transactions.length === 0 ? (
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
                        {tx.note || "\u2014"}
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
