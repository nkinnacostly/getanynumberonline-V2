"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/api";
import { useToast } from "@/components/dashboard/Toast";
import { useCopy } from "@/hooks/useCopy";
import { useCountdown } from "@/hooks/useCountdown";
import Script from "next/script";

interface Order {
  order_id: string;
  service: string;
  country: string;
  number: string;
  cost: number;
  expires_at: string;
  status: string;
}

interface Sms {
  code: string;
  sender?: string;
  fullSms?: string;
}

interface ActiveOrderProps {
  order: Order | null;
  onOrderComplete: () => void;
  onOrderCancelled: () => void;
}

export default function ActiveOrder({
  order,
  onOrderCancelled,
}: ActiveOrderProps) {
  const { toast } = useToast();
  const { copy, isCopied } = useCopy();
  const [sms, setSms] = useState<Sms | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confettiFired = useRef(false);

  // Live countdown to expiry — runs while an order is open and no code has landed.
  const cd = useCountdown(order?.expires_at, !!order && !sms);
  const under2 = !cd.expired && cd.totalMs < 120_000;

  const doCopy = async (text: string, key: string) => {
    const ok = await copy(text, key);
    if (!ok) toast("Couldn't copy — select it manually", "error");
  };

  const fireConfetti = useCallback(() => {
    if (confettiFired.current) return;
    confettiFired.current = true;
    const w = window as unknown as {
      confetti?: (opts: Record<string, unknown>) => void;
    };
    w.confetti?.({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
  }, []);

  const handleSmsReceived = useCallback(
    (code: string, meta?: { sender?: string; fullSms?: string }) => {
      setSms({ code, sender: meta?.sender, fullSms: meta?.fullSms });
      toast("SMS received!", "success");
      fireConfetti();
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    },
    [toast, fireConfetti],
  );

  // Poll every 5s + subscribe to realtime inserts.
  useEffect(() => {
    if (!order || sms) return;

    const poll = async () => {
      try {
        const data = await callEdgeFunction("poll-sms", {
          order_id: order.order_id,
        });
        if (data.sms_code) {
          handleSmsReceived(data.sms_code, {
            sender: data.sender,
            fullSms: data.full_sms,
          });
        }
      } catch {
        // ignore transient poll errors
      }
    };
    pollRef.current = setInterval(poll, 5000);

    const supabase = createClient();
    const channel = supabase
      .channel(`sms-${order.order_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `order_id=eq.${order.order_id}`,
        },
        (payload) => {
          const row = payload.new as {
            sms_code?: string;
            code?: string;
            sender?: string;
            full_sms?: string;
          };
          const code = row.sms_code ?? row.code;
          if (code)
            handleSmsReceived(code, {
              sender: row.sender,
              fullSms: row.full_sms,
            });
        },
      )
      .subscribe();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      channel.unsubscribe();
    };
  }, [order, sms, handleSmsReceived]);

  // Reset when the order changes.
  useEffect(() => {
    setSms(null);
    setShowConfirm(false);
    confettiFired.current = false;
  }, [order?.order_id]);

  const handleCancel = async () => {
    if (!order) return;
    setIsCancelling(true);
    try {
      await callEdgeFunction("cancel-order", { order_id: order.order_id });
      toast("Order cancelled. Refund issued.", "success");
      (
        window as unknown as { __refreshBalance?: () => void }
      ).__refreshBalance?.();
      onOrderCancelled();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to cancel", "error");
    } finally {
      setIsCancelling(false);
      setShowConfirm(false);
    }
  };

  // ---- EMPTY STATE ----
  if (!order) {
    return (
      <div
        className="rounded-xl p-8 flex flex-col items-center justify-center min-h-[340px] text-center"
        style={{ backgroundColor: "#0F0F0F", border: "1px solid #1A1A1A" }}
      >
        <p className="text-[#555555] text-sm mb-1">No active order</p>
        <p className="text-[#555555] text-xs mb-6">
          Pick a service and country to get a number
        </p>
        <span className="font-mono text-[#00FF94] text-xl cursor-blink">|</span>
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js"
        strategy="lazyOnload"
      />
      <div
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: "#0F0F0F",
          border: "1px solid #1A1A1A",
          borderTopColor: "#00FF94",
          borderTopWidth: "2px",
        }}
      >
        <div className="p-5">
          {sms ? (
            /* ---- CODE RECEIVED ---- */
            <>
              <div className="flex items-center justify-between mb-4">
                <Pill tone="ok">Code received</Pill>
                <span className="font-mono text-xs" style={{ color: "#555555" }}>
                  just now
                </span>
              </div>

              <button
                onClick={() => doCopy(sms.code, "code")}
                className="w-full rounded-xl px-4 py-5 mb-3 text-center transition-colors"
                style={{
                  backgroundColor: "rgba(0,255,148,0.10)",
                  border: "1px solid rgba(0,255,148,0.32)",
                }}
              >
                <div
                  className="text-[11px] uppercase font-mono mb-1"
                  style={{ color: "#00FF94", letterSpacing: "0.12em" }}
                >
                  Your code — tap to copy
                </div>
                <div
                  className="font-mono font-bold"
                  style={{
                    fontSize: "40px",
                    lineHeight: 1.1,
                    letterSpacing: "0.16em",
                    color: "#00FF94",
                  }}
                >
                  {sms.code}
                </div>
                <div
                  className="text-[11px] font-mono mt-1"
                  style={{ color: "#00FF94", letterSpacing: "0.1em" }}
                >
                  {isCopied("code") ? "✓ COPIED" : " "}
                </div>
              </button>

              {sms.fullSms && (
                <div
                  className="rounded-lg px-4 py-3 mb-3"
                  style={{
                    backgroundColor: "#141414",
                    border: "1px solid #1A1A1A",
                  }}
                >
                  <p
                    className="text-[11px] uppercase font-mono mb-1"
                    style={{ color: "#555555", letterSpacing: "0.1em" }}
                  >
                    From {sms.sender || order.service}
                  </p>
                  <p
                    className="font-mono text-[13px]"
                    style={{ color: "#8A8A8A" }}
                  >
                    {sms.fullSms}
                  </p>
                </div>
              )}

              <div
                className="space-y-2 font-mono text-[13px] pt-3"
                style={{ borderTop: "1px solid #1A1A1A" }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[#555555] w-24 shrink-0">number</span>
                  <button
                    onClick={() => doCopy(order.number, "number")}
                    className="flex items-center gap-2"
                  >
                    <span style={{ color: "#F5F5F5" }}>{order.number}</span>
                    <span className="text-[11px]" style={{ color: "#00FF94" }}>
                      {isCopied("number") ? "copied" : "copy"}
                    </span>
                  </button>
                </div>
                <Row label="service" value={order.service} />
              </div>
            </>
          ) : (
            /* ---- WAITING ---- */
            <>
              <div className="flex items-center justify-between mb-4">
                <Pill tone={cd.expired ? "off" : "warn"} pulse={!cd.expired}>
                  {cd.expired ? "Expired" : "Waiting for SMS"}
                </Pill>
                {!cd.expired && (
                  <span
                    className="font-mono text-sm"
                    style={{ color: under2 ? "#FF4444" : "#F5A623" }}
                  >
                    {cd.label}
                  </span>
                )}
              </div>

              <p
                className="text-[11px] uppercase font-mono mb-1.5"
                style={{ color: "#555555", letterSpacing: "0.1em" }}
              >
                Your number
              </p>
              <button
                onClick={() => doCopy(order.number, "number")}
                className="w-full flex items-center justify-between rounded-lg px-4 py-3 mb-2 text-left"
                style={{
                  backgroundColor: "#141414",
                  border: "1px solid #222222",
                }}
              >
                <span
                  className="font-mono text-lg tracking-wide"
                  style={{ color: "#F5F5F5" }}
                >
                  {order.number}
                </span>
                <span
                  className="font-mono text-xs flex items-center gap-1.5"
                  style={{ color: "#00FF94" }}
                >
                  {isCopied("number") ? "✓ copied" : "copy"}
                </span>
              </button>
              <p className="text-xs mb-4" style={{ color: "#8A8A8A" }}>
                Paste this number into {order.service}, then keep this tab open —
                the code appears here automatically.
              </p>

              <div
                className="space-y-2 font-mono text-[13px] pt-3"
                style={{ borderTop: "1px solid #1A1A1A" }}
              >
                <Row label="service" value={order.service} />
                <Row label="country" value={order.country} />
                <Row
                  label="cost"
                  value={`$${order.cost.toFixed(2)}`}
                  valueColor="#00FF94"
                />
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 space-y-3">
          {sms && (
            <button
              onClick={() => doCopy(sms.code, "code")}
              className="w-full py-3 rounded-lg font-semibold text-sm transition-colors"
              style={{ backgroundColor: "#00FF94", color: "#080808" }}
            >
              {isCopied("code") ? "Copied!" : "Copy code"}
            </button>
          )}

          {!sms && !cd.expired && (
            <>
              {showConfirm ? (
                <div
                  className="rounded-lg p-3"
                  style={{
                    backgroundColor: "#1A0000",
                    border: "1px solid #FF4444",
                  }}
                >
                  <p className="text-[#FF4444] text-xs mb-2">
                    Cancel this order? You&apos;ll be refunded $
                    {order.cost.toFixed(2)}.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancel}
                      disabled={isCancelling}
                      className="flex-1 py-2 rounded text-xs font-medium disabled:opacity-50"
                      style={{ backgroundColor: "#FF4444", color: "#080808" }}
                    >
                      {isCancelling ? "Cancelling..." : "Yes, cancel"}
                    </button>
                    <button
                      onClick={() => setShowConfirm(false)}
                      className="flex-1 py-2 rounded text-xs font-medium"
                      style={{ backgroundColor: "#1A1A1A", color: "#F5F5F5" }}
                    >
                      Keep waiting
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfirm(true)}
                  className="w-full py-3 rounded-lg font-medium text-sm transition-colors"
                  style={{
                    backgroundColor: "transparent",
                    border: "1px solid rgba(255,68,68,0.35)",
                    color: "#FF4444",
                  }}
                >
                  Cancel &amp; refund ${order.cost.toFixed(2)}
                </button>
              )}
            </>
          )}

          {cd.expired && !sms && (
            <button
              onClick={onOrderCancelled}
              className="w-full py-3 rounded-lg font-semibold text-sm"
              style={{ backgroundColor: "#1A1A1A", color: "#F5F5F5" }}
            >
              Order expired — Dismiss
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function Pill({
  tone,
  pulse,
  children,
}: {
  tone: "ok" | "warn" | "err" | "off";
  pulse?: boolean;
  children: ReactNode;
}) {
  const map = {
    ok: { c: "#00FF94", b: "rgba(0,255,148,0.32)", bg: "rgba(0,255,148,0.10)" },
    warn: { c: "#F5A623", b: "rgba(245,166,35,0.32)", bg: "rgba(245,166,35,0.10)" },
    err: { c: "#FF4444", b: "rgba(255,68,68,0.32)", bg: "rgba(255,68,68,0.10)" },
    off: { c: "#555555", b: "#242424", bg: "transparent" },
  }[tone];
  return (
    <span
      className="inline-flex items-center gap-2 font-mono text-[11px] uppercase rounded-full px-2.5 py-1"
      style={{
        color: map.c,
        border: `1px solid ${map.b}`,
        backgroundColor: map.bg,
        letterSpacing: "0.06em",
      }}
    >
      <span
        className={pulse ? "status-dot" : ""}
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          backgroundColor: map.c,
          display: "inline-block",
        }}
      />
      {children}
    </span>
  );
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#555555] w-24 shrink-0">{label}</span>
      <span className="font-mono" style={{ color: valueColor || "#F5F5F5" }}>
        {value}
      </span>
    </div>
  );
}
