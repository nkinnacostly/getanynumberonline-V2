"use client";

import { useEffect, useState } from "react";

export interface Countdown {
  /** mm:ss remaining, "00:00" once expired */
  label: string;
  /** milliseconds remaining (0 when expired) */
  totalMs: number;
  expired: boolean;
}

function compute(target: string | number | null | undefined): Countdown {
  if (target == null) return { label: "00:00", totalMs: 0, expired: true };
  const exp = typeof target === "number" ? target : new Date(target).getTime();
  const diff = exp - Date.now();
  if (diff <= 0) return { label: "00:00", totalMs: 0, expired: true };
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return {
    label: `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
    totalMs: diff,
    expired: false,
  };
}

/**
 * A live mm:ss countdown to an expiry timestamp. Ticks once per second while
 * `active`. Reused by the active order and (later) rental expiry.
 */
export function useCountdown(
  target: string | number | null | undefined,
  active = true,
): Countdown {
  const [state, setState] = useState<Countdown>(() => compute(target));

  useEffect(() => {
    if (!target || !active) {
      setState(compute(target));
      return;
    }
    setState(compute(target));
    const iv = setInterval(() => setState(compute(target)), 1000);
    return () => clearInterval(iv);
  }, [target, active]);

  return state;
}
