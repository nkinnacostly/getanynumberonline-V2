"use client";

import type { CSSProperties } from "react";
import { useTopup } from "@/hooks/useTopup";

/**
 * The one wallet-top-up button. Owns its own useTopup instance (safe to have
 * several on a page — the hook de-dupes the checkout script and keeps per-button
 * opening/ready state), renders the opening spinner, the base disabled logic,
 * and the two standard "payments unavailable / script blocked" messages.
 *
 * Used by the wallet page and the first-run guide. OrderForm's inline funding
 * button is deliberately NOT built on this — it sits in a horizontal panel with
 * a sibling "Wallet" button and terser copy, which this vertical layout doesn't
 * fit.
 */
export default function TopupButton({
  amount,
  label,
  onFunded,
  disabled = false,
  openingLabel = "Opening…",
  loadingLabel,
  className = "",
  style,
  spinnerColor = "#080808",
}: {
  amount: number;
  label: string;
  onFunded?: () => void;
  /** Extra disable condition on top of opening / scriptError / unavailable. */
  disabled?: boolean;
  openingLabel?: string;
  /** Shown while the checkout script is still loading (before it's callable). */
  loadingLabel?: string;
  className?: string;
  style?: CSSProperties;
  spinnerColor?: string;
}) {
  const topup = useTopup();
  const isDisabled =
    disabled || topup.opening || topup.scriptError || !topup.available;

  return (
    <>
      <button
        onClick={() => topup.open(amount, { onFunded: () => onFunded?.() })}
        disabled={isDisabled}
        className={className}
        style={style}
      >
        {topup.opening ? (
          <span className="flex items-center justify-center gap-2">
            <span
              className="auth-spinner"
              style={{ borderColor: spinnerColor, borderTopColor: "transparent" }}
            />
            {openingLabel}
          </span>
        ) : loadingLabel && !topup.ready && !isDisabled ? (
          loadingLabel
        ) : (
          label
        )}
      </button>

      {!topup.available && (
        <p className="mt-2 text-xs" style={{ color: "#FF4444" }}>
          Payments are temporarily unavailable — missing configuration.
        </p>
      )}
      {topup.scriptError && (
        <p className="mt-2 text-xs" style={{ color: "#FF4444" }}>
          Couldn&apos;t load the payment window. Disable ad-blockers / browser
          shields for this site and try again.
        </p>
      )}
    </>
  );
}
