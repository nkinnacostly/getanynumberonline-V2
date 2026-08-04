"use client";

import { useRouter } from "next/navigation";
import { useTopup } from "@/hooks/useTopup";

/**
 * The inline "you're short — top up and continue" panel shown in place of a
 * buy button when the wallet can't cover the selected item.
 *
 * This is the horizontal panel variant (fund button + sibling "Wallet" link,
 * terser copy) that TopupButton's vertical layout deliberately doesn't cover.
 * Used by OrderForm and the eSIM buy flow; both previously carried their own
 * copy of this markup and of the shortfall arithmetic.
 */
export default function FundShortfall({
  price,
  balance,
  itemLabel,
  onFunded,
}: {
  price: number;
  balance: number;
  /** Slotted into "This {itemLabel} costs $X." — e.g. "number", "eSIM". */
  itemLabel: string;
  onFunded?: () => void;
}) {
  const router = useRouter();
  const topup = useTopup();

  // Smallest allowed top-up (min $5, max $500) that covers the shortfall.
  const fundAmount = Math.min(500, Math.max(5, Math.ceil(price - balance)));
  const disabled = topup.opening || topup.scriptError || !topup.available;

  return (
    <div
      className="rounded-[6px] p-3"
      style={{
        backgroundColor: "#141414",
        border: "1px solid rgba(245,166,35,0.35)",
      }}
    >
      <p className="text-[13px] mb-3" style={{ color: "#cdd2cf" }}>
        This {itemLabel} costs{" "}
        <span className="font-mono" style={{ color: "#F5F5F5" }}>
          ${price.toFixed(2)}
        </span>
        . You have{" "}
        <span className="font-mono" style={{ color: "#F5A623" }}>
          ${balance.toFixed(2)}
        </span>
        .
      </p>

      <div className="flex gap-2">
        <button
          onClick={() => topup.open(fundAmount, { onFunded })}
          disabled={disabled}
          className="flex-1 h-[44px] rounded-[6px] text-[14px] font-bold flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ backgroundColor: "#00FF94", color: "#080808" }}
        >
          {topup.opening ? (
            <>
              <span
                className="auth-spinner"
                style={{ borderColor: "#080808", borderTopColor: "transparent" }}
              />
              Opening…
            </>
          ) : (
            `Add $${fundAmount} & continue`
          )}
        </button>
        <button
          onClick={() => router.push("/dashboard/wallet")}
          className="h-[44px] px-4 rounded-[6px] text-[14px] font-medium"
          style={{
            backgroundColor: "transparent",
            border: "1px solid #333333",
            color: "#F5F5F5",
          }}
        >
          Wallet
        </button>
      </div>

      {!topup.available && (
        <p className="text-[11px] mt-2" style={{ color: "#FF4444" }}>
          Payments are temporarily unavailable.
        </p>
      )}
      {topup.scriptError && (
        <p className="text-[11px] mt-2" style={{ color: "#FF4444" }}>
          Couldn&apos;t load the payment window. Disable shields and retry.
        </p>
      )}
    </div>
  );
}
