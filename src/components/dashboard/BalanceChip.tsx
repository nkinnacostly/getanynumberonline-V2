"use client";

interface BalanceChipProps {
  balance: number;
}

export default function BalanceChip({ balance }: BalanceChipProps) {
  return (
    <div
      className="px-3 py-2 rounded-lg"
      style={{ backgroundColor: "#141414", border: "1px solid #1A1A1A" }}
    >
      <div className="text-[11px] text-[#555555] mb-0.5">Balance</div>
      <div className="font-mono text-[#00FF94] font-medium text-sm">
        ${balance.toFixed(2)}
      </div>
    </div>
  );
}
