"use client";

import { useState } from "react";
import { useToast } from "@/components/dashboard/Toast";
import { adjustBalance, money } from "@/lib/admin-api";

/**
 * Manual balance adjustment. Used from the inline row on /admin/users and from
 * a user's detail page, so it lives here rather than in either page.
 *
 * The credit is written by admin_adjust_balance, which records a transaction
 * row and an audit entry — never a direct profiles.balance write (CLAUDE.md §5).
 */
export default function AdjustBalanceForm({
  userId,
  currentBalance,
  onDone,
}: {
  userId: string;
  /** Used only to warn before submit; the RPC re-checks under a lock. */
  currentBalance: number;
  onDone: (newBalance: number) => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const parsed = parseFloat(amount);
  const valid = !isNaN(parsed) && parsed !== 0;
  // Surfaced before submit so the admin isn't guessing what the RPC will reject.
  const wouldGoNegative = valid && currentBalance + parsed < 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || wouldGoNegative) return;
    setSaving(true);
    try {
      const res = await adjustBalance(userId, parsed, note.trim());
      toast(`Balance now ${money(res.balance)}`, "success");
      setAmount("");
      setNote("");
      onDone(res.balance);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Adjustment failed", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2 sm:items-start">
      <div className="sm:w-32">
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="±0.00"
          aria-label="Adjustment amount"
          className="w-full h-[44px] px-3 font-mono text-[14px] rounded-[6px] outline-none"
          style={{ backgroundColor: "var(--field)", border: "1px solid var(--line-strong)", color: "var(--foreground)" }}
        />
        <p className="text-[10px] mt-1" style={{ color: "var(--muted)" }}>
          negative to debit
        </p>
      </div>

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reason (shown in the user's history)"
        aria-label="Reason"
        className="flex-1 h-[44px] px-3 text-[14px] rounded-[6px] outline-none"
        style={{ backgroundColor: "var(--field)", border: "1px solid var(--line-strong)", color: "var(--foreground)" }}
      />

      <button
        type="submit"
        disabled={!valid || wouldGoNegative || saving}
        className="h-[44px] px-5 rounded-[6px] text-[14px] font-bold disabled:opacity-40 shrink-0"
        style={{ backgroundColor: "var(--accent)", color: "var(--accent-ink)" }}
      >
        {saving ? "Saving…" : "Apply"}
      </button>

      {wouldGoNegative && (
        <p className="text-[11px] self-center" style={{ color: "var(--danger)" }}>
          Would take balance below zero
        </p>
      )}
    </form>
  );
}
