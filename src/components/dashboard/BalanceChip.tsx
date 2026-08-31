"use client";

interface BalanceChipProps {
  balance: number;
  /** Inline form for the mobile account bar, where a stacked card won't fit. */
  compact?: boolean;
}

export default function BalanceChip({ balance, compact }: BalanceChipProps) {
  if (compact) {
    return (
      <span
        className="inline-flex items-baseline gap-1.5 px-2.5 h-[32px] rounded-md shrink-0"
        style={{
          backgroundColor: "var(--field)",
          border: "1px solid var(--line)",
        }}
      >
        <span className="text-[10px] text-muted self-center">Bal</span>
        <span className="font-mono text-accent font-medium text-[13px] self-center">
          ${balance.toFixed(2)}
        </span>
      </span>
    );
  }

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
