"use client";

interface BalanceChipProps {
  balance: number;
}

export default function BalanceChip({ balance }: BalanceChipProps) {
  return (
    <div
      className="px-3 py-2 rounded-lg"
      style={{ backgroundColor: "var(--field)", border: "1px solid var(--line)" }}
    >
      <div className="text-[11px] text-muted mb-0.5">Balance</div>
      <div className="font-mono text-accent font-medium text-sm">
        ${balance.toFixed(2)}
      </div>
    </div>
  );
}
