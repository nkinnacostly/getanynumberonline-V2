"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/api";
import { useToast } from "@/components/dashboard/Toast";
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

interface ActiveOrderProps {
  order: Order | null;
  onOrderComplete: () => void;
  onOrderCancelled: () => void;
}

export default function ActiveOrder({
  order,
  onOrderComplete,
  onOrderCancelled,
}: ActiveOrderProps) {
  const { toast } = useToast();
  const [smsCode, setSmsCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<"number" | "code" | null>(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [isExpired, setIsExpired] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeRef = useRef<ReturnType<typeof createClient> | null>(null);
  const confettiFired = useRef(false);

  // Countdown timer
  useEffect(() => {
    if (!order || smsCode) return;
    const tick = () => {
      const now = Date.now();
      const exp = new Date(order.expires_at).getTime();
      const diff = exp - now;
      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft("00:00");
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(
        `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
      );
      setIsExpired(false);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [order, smsCode]);

  const isUnder2Min = (() => {
    if (!timeLeft || timeLeft === "00:00") return true;
    const [m] = timeLeft.split(":").map(Number);
    return m < 2;
  })();

  // Fire confetti
  const fireConfetti = useCallback(() => {
    if (confettiFired.current) return;
    confettiFired.current = true;
    const w = window as unknown as {
      confetti?: (opts: Record<string, unknown>) => void;
    };
    if (w.confetti) {
      w.confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    }
  }, []);

  // Handle SMS received
  const handleSmsReceived = useCallback(
    (code: string) => {
      setSmsCode(code);
      toast("SMS received!", "success");
      fireConfetti();
      // Clean up polling
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    },
    [toast, fireConfetti],
  );

  // Polling + Realtime
  useEffect(() => {
    if (!order || smsCode) return;

    // Poll every 5s
    const poll = async () => {
      try {
        const data = await callEdgeFunction("poll-sms", {
          order_id: order.order_id,
        });
        if (data.sms_code) {
          handleSmsReceived(data.sms_code);
        }
      } catch {
        // ignore poll errors silently
      }
    };
    pollRef.current = setInterval(poll, 5000);

    // Realtime subscription
    const supabase = createClient();
    realtimeRef.current = supabase;
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
          const code = (payload.new as { sms_code?: string }).sms_code;
          if (code) handleSmsReceived(code);
        },
      )
      .subscribe();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      channel.unsubscribe();
    };
  }, [order, smsCode, handleSmsReceived]);

  // Reset state when order changes
  useEffect(() => {
    setSmsCode(null);
    setCopied(null);
    setShowConfirm(false);
    confettiFired.current = false;
  }, [order?.order_id]);

  const copyToClipboard = async (text: string, type: "number" | "code") => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleCancel = async () => {
    if (!order) return;
    setIsCancelling(true);
    try {
      await callEdgeFunction("cancel-order", { order_id: order.order_id });
      toast("Order cancelled. Refund issued.", "success");
      if (
        typeof (window as unknown as { __refreshBalance?: () => void })
          .__refreshBalance === "function"
      ) {
        (window as unknown as { __refreshBalance?: () => void })
          .__refreshBalance!();
      }
      onOrderCancelled();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to cancel", "error");
    } finally {
      setIsCancelling(false);
      setShowConfirm(false);
    }
  };

  // EMPTY STATE
  if (!order) {
    return (
      <div
        className="rounded-xl p-8 flex flex-col items-center justify-center min-h-[340px] text-center"
        style={{ backgroundColor: "#0F0F0F", border: "1px solid #1A1A1A" }}
      >
        <p className="text-[#555555] text-sm mb-1">No active order</p>
        <p className="text-[#555555] text-xs mb-6">
          Select a service and country to get started
        </p>
        <span className="font-mono text-[#00FF94] text-xl cursor-blink">|</span>
      </div>
    );
  }

  const statusLabel = smsCode
    ? "sms received"
    : isExpired
      ? "expired"
      : "waiting for sms...";
  const statusColor = smsCode ? "#00FF94" : isExpired ? "#555555" : "#F5A623";

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
        {/* Terminal rows */}
        <div className="p-5 space-y-3 font-mono text-[13px]">
          <Row label="service" value={order.service} />
          <Row label="country" value={order.country} />
          <div className="flex items-center justify-between">
            <span className="text-[#555555] w-24 shrink-0">number</span>
            <div className="flex items-center gap-2">
              <span className="text-[#F5F5F5] text-lg font-mono tracking-wide">
                {order.number}
              </span>
              <button
                onClick={() => copyToClipboard(order.number, "number")}
                className="text-[10px] px-2 py-0.5 rounded"
                style={{
                  backgroundColor: copied === "number" ? "#00FF94" : "#1A1A1A",
                  color: copied === "number" ? "#080808" : "#F5F5F5",
                }}
              >
                {copied === "number" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-[#555555] w-24 shrink-0">status</span>
            <span
              className="flex items-center gap-2"
              style={{ color: statusColor }}
            >
              <span
                className="status-dot inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: statusColor }}
              />
              {statusLabel}
            </span>
          </div>

          {/* Countdown */}
          {!smsCode && (
            <div className="flex items-center justify-between">
              <span className="text-[#555555] w-24 shrink-0">expires</span>
              <span style={{ color: isUnder2Min ? "#FF4444" : "#F5F5F5" }}>
                {timeLeft}
              </span>
            </div>
          )}

          <Row
            label="cost"
            value={`$${order.cost.toFixed(2)}`}
            valueColor="#00FF94"
          />

          {/* SMS Code */}
          {smsCode && (
            <div
              className="flex items-center justify-between pt-2 border-t"
              style={{ borderColor: "#1A1A1A" }}
            >
              <span className="text-[#555555] w-24 shrink-0">code</span>
              <span
                className="font-mono text-[36px] leading-tight"
                style={{ color: "#00FF94" }}
              >
                {smsCode}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 space-y-3">
          {smsCode && (
            <button
              onClick={() => copyToClipboard(smsCode, "code")}
              className="w-full py-3 rounded-lg font-semibold text-sm transition-colors"
              style={{ backgroundColor: "#00FF94", color: "#080808" }}
            >
              {copied === "code" ? "Copied!" : "Copy code"}
            </button>
          )}

          {!smsCode && !isExpired && (
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
                    Cancel this order? You will be refunded $
                    {order.cost.toFixed(2)}.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancel}
                      disabled={isCancelling}
                      className="flex-1 py-2 rounded text-xs font-medium"
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
                  className="text-xs w-full text-center py-2 transition-colors"
                  style={{ color: "#FF4444" }}
                >
                  Cancel order
                </button>
              )}
            </>
          )}

          {isExpired && !smsCode && (
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
