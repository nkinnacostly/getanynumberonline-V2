"use client";

import TopupButton from "@/components/dashboard/TopupButton";
import { TOPUP_MIN, TOPUP_SUGGESTED } from "@/lib/wallet";

const STEPS = [
  {
    n: 1,
    title: "Add funds",
    body: `Top up your wallet with as little as $${TOPUP_MIN}. Pay securely by card.`,
  },
  {
    n: 2,
    title: "Pick a number",
    body: "Choose a service and country below, then buy a temporary number.",
  },
  {
    n: 3,
    title: "Get your code",
    body: "Your SMS code lands here in seconds — tap to copy and you're done.",
  },
];

/**
 * Shown once, to a brand-new user (no balance, no activity yet), so the empty
 * dashboard explains the flow and points at the one action that unblocks it:
 * funding. Disappears the moment they fund or place an order.
 */
export default function FirstRunGuide({ onFunded }: { onFunded: () => void }) {
  return (
    <div
      className="rounded-xl p-6 mb-6"
      style={{ backgroundColor: "#0F0F0F", border: "1px solid #1A1A1A" }}
    >
      <h2 className="text-lg font-bold mb-1" style={{ color: "#F5F5F5" }}>
        Welcome to GetAnyNumberOnline
      </h2>
      <p className="text-sm mb-5" style={{ color: "#888888" }}>
        Get a temporary number and receive SMS codes in three steps.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {STEPS.map((s) => (
          <div
            key={s.n}
            className="rounded-lg p-4"
            style={{ backgroundColor: "#141414", border: "1px solid #1A1A1A" }}
          >
            <span
              className="font-mono text-sm font-bold mb-3 inline-flex items-center justify-center w-7 h-7 rounded-full"
              style={{
                color: "#00FF94",
                border: "1px solid rgba(0,255,148,0.32)",
                backgroundColor: "rgba(0,255,148,0.08)",
              }}
            >
              {s.n}
            </span>
            <p
              className="text-[13px] font-semibold mb-1"
              style={{ color: "#F5F5F5" }}
            >
              {s.title}
            </p>
            <p
              className="text-xs leading-relaxed"
              style={{ color: "#888888" }}
            >
              {s.body}
            </p>
          </div>
        ))}
      </div>

      <TopupButton
        amount={TOPUP_SUGGESTED}
        label="Add funds to get started →"
        onFunded={onFunded}
        className="w-full sm:w-auto sm:px-6 py-3 rounded-lg font-semibold text-sm transition-colors disabled:opacity-40 flex items-center justify-center"
        style={{ backgroundColor: "#00FF94", color: "#080808" }}
      />
      <p className="text-xs mt-3" style={{ color: "#555555" }}>
        Or scroll down to browse available numbers first.
      </p>
    </div>
  );
}
