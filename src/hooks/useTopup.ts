"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { closePaymentModal } from "flutterwave-react-v3";
import { useUser } from "@/hooks/useUser";
import { useToast } from "@/components/dashboard/Toast";
import { isValidTopup, TOPUP_RANGE_LABEL } from "@/lib/wallet";

interface FlutterwaveResponse {
  status?: string;
  tx_ref?: string;
  transaction_id?: number;
}
type FlutterwaveCheckoutFn = (config: Record<string, unknown>) => void;

const FLW_SCRIPT = "https://checkout.flutterwave.com/v3.js";

export interface TopupOptions {
  /** Called after a payment is verified — e.g. to refresh a balance. */
  onFunded?: () => void;
}

export interface UseTopup {
  /**
   * Open Flutterwave's inline modal to add `amount` USD. Async because it runs
   * a server-side pre-flight (first-deposit minimum) before opening; callers
   * can fire and forget — `opening` covers the wait.
   */
  open: (amount: number, opts?: TopupOptions) => Promise<void>;
  /** Clicked — waiting for the modal iframe to appear. */
  opening: boolean;
  /** Checkout script loaded and callable. */
  ready: boolean;
  /** Script blocked or failed to load. */
  scriptError: boolean;
  /** Public key configured — payments are possible at all. */
  available: boolean;
}

/**
 * Wallet top-up via Flutterwave's inline checkout, in ONE place so the wallet
 * page and the order flow can both fund without duplicating this logic.
 *
 * Calls window.FlutterwaveCheckout directly — the flutterwave-react-v3 wrapper
 * silently fails to open the modal on Next.js
 * (github.com/Flutterwave/React-v3/issues/8). The success callback runs in-page
 * (no reload), so the browser session is preserved; it verifies server-side,
 * refreshes server data, then calls onFunded.
 */
export function useTopup(): UseTopup {
  const router = useRouter();
  const user = useUser();
  const { toast } = useToast();
  const publicKey = process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY;

  const [ready, setReady] = useState(false);
  const [scriptError, setScriptError] = useState(false);
  const [opening, setOpening] = useState(false);
  const watch = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFundedRef = useRef<(() => void) | undefined>(undefined);

  const stopOpening = useCallback(() => {
    setOpening(false);
    if (watch.current) {
      clearInterval(watch.current);
      watch.current = null;
    }
    if (timeout.current) {
      clearTimeout(timeout.current);
      timeout.current = null;
    }
  }, []);

  // Preload the checkout script so the modal opens instantly and a blocked load
  // surfaces as an error rather than a dead button.
  useEffect(() => {
    const w = window as unknown as {
      FlutterwaveCheckout?: FlutterwaveCheckoutFn;
    };
    if (typeof w.FlutterwaveCheckout === "function") {
      setReady(true);
      return;
    }
    let s = document.querySelector<HTMLScriptElement>(
      `script[src="${FLW_SCRIPT}"]`,
    );
    const onLoad = () => setReady(true);
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

  useEffect(
    () => () => {
      if (watch.current) clearInterval(watch.current);
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );

  const handlePaid = useCallback(
    async (response: FlutterwaveResponse) => {
      closePaymentModal();
      stopOpening();
      const paid =
        response.status === "successful" || response.status === "completed";
      if (!paid) {
        toast("Payment was not completed", "error");
        return;
      }
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
      router.refresh();
      onFundedRef.current?.();
    },
    [router, stopOpening, toast],
  );

  const open = useCallback(
    async (amount: number, opts?: TopupOptions) => {
      if (!user || !user.email) {
        toast("Please sign in again to add funds", "error");
        return;
      }
      if (!publicKey) {
        toast("Payments are temporarily unavailable", "error");
        return;
      }
      if (!isValidTopup(amount)) {
        toast(`Amount must be ${TOPUP_RANGE_LABEL}`, "error");
        return;
      }
      const w = window as unknown as {
        FlutterwaveCheckout?: FlutterwaveCheckoutFn;
      };
      if (typeof w.FlutterwaveCheckout !== "function") {
        toast(
          "Payment window is still loading — try again in a moment",
          "error",
        );
        return;
      }

      onFundedRef.current = opts?.onFunded;
      setOpening(true);

      // Server-side pre-flight: enforces the minimum FIRST deposit before the
      // payment window opens, so an under-minimum user is told why instead of
      // paying and then finding out. Errors other than a rejection fail open —
      // this is an abuse control, and it must not block paying customers if the
      // check itself is unavailable.
      try {
        const res = await fetch("/api/create-pending-topup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount }),
        });
        // 4xx is a real decision about this top-up (under the first-deposit
        // minimum, not signed in, suspended) and must stop it. 5xx means our
        // own check broke — fail open there rather than block someone who is
        // trying to pay us over a fault on our side.
        if (!res.ok && res.status < 500) {
          const data = await res.json().catch(() => null);
          stopOpening();
          toast(
            data?.error ?? "Could not start this top-up. Please try again.",
            "error",
          );
          return;
        }
        if (!res.ok) {
          console.error("top-up pre-flight returned", res.status);
        }
      } catch (err) {
        // Network failure reaching our own API — proceed rather than strand
        // someone who is trying to pay us.
        console.error("top-up pre-flight failed:", err);
      }

      try {
        w.FlutterwaveCheckout({
          public_key: publicKey,
          // tx_ref MUST match the topup_<userId>_<ts> format verify-payment parses.
          tx_ref: `topup_${user.id}_${Date.now()}`,
          amount,
          currency: "USD",
          payment_options: "card",
          customer: { email: user.email, phone_number: "", name: user.email },
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

      // Hide the spinner once the modal iframe is on screen; safety timeout too.
      watch.current = setInterval(() => {
        if (document.getElementsByName("checkout").length > 0) stopOpening();
      }, 150);
      timeout.current = setTimeout(stopOpening, 8000);
    },
    [user, publicKey, handlePaid, stopOpening, toast],
  );

  return { open, opening, ready, scriptError, available: !!publicKey };
}
