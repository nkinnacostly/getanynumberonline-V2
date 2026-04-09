"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/api";
import { useToast } from "@/components/dashboard/Toast";

export interface RentalRow {
  id: string;
  service_name: string;
  country_name: string;
  phone_number: string | null;
  expires_at: string;
  status: string;
  cost: number;
  days: number;
}

export interface RentalMessageRow {
  id: string;
  sender: string | null;
  full_sms: string;
  code: string | null;
  received_at: string;
}

interface RentalCardProps {
  rental: RentalRow;
  onCancelRental: () => void | Promise<void>;
  cancelling: boolean;
}

function formatReceivedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DetailRow({
  label,
  value,
  valueClassName,
  valueStyle,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  valueStyle?: CSSProperties;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-[#555555] w-24 shrink-0 pt-0.5">{label}</span>
      <span
        className={`font-mono text-[13px] text-right min-w-0 flex-1 ${valueClassName ?? ""}`}
        style={valueStyle ?? { color: "#F5F5F5" }}
      >
        {value}
      </span>
    </div>
  );
}

export default function RentalCard({
  rental,
  onCancelRental,
  cancelling,
}: RentalCardProps) {
  const { toast } = useToast();
  const [messagesOpen, setMessagesOpen] = useState(false);
  /** null = not loaded yet; [] = loaded empty */
  const [messages, setMessages] = useState<RentalMessageRow[] | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const { daysLeft, expiresLabel } = useMemo(() => {
    const exp = new Date(rental.expires_at).getTime();
    const now = Date.now();
    const d = Math.max(0, Math.ceil((exp - now) / 86400000));
    const dateStr = new Date(rental.expires_at).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return { daysLeft: d, expiresLabel: dateStr };
  }, [rental.expires_at]);

  const phone = rental.phone_number ?? "—";
  const statusColor = "#00FF94";

  const loadMessagesFromDb = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("rental_messages")
      .select("id, sender, full_sms, code, received_at")
      .eq("rental_id", rental.id)
      .order("received_at", { ascending: true });
    if (error) throw error;
    setMessages((data as RentalMessageRow[]) ?? []);
  }, [rental.id]);

  useEffect(() => {
    if (!messagesOpen) return;
    if (messages !== null) return;

    let cancelled = false;
    setMessagesLoading(true);
    loadMessagesFromDb()
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) {
          setMessagesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [messagesOpen, messages, loadMessagesFromDb]);

  const handleToggleMessages = () => {
    setMessagesOpen((o) => !o);
  };

  const handleRefreshMessages = async () => {
    setRefreshing(true);
    try {
      await callEdgeFunction("poll-rental-sms", { rental_id: rental.id });
      await loadMessagesFromDb();
      toast("Messages updated", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Refresh failed", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const copyNumber = async () => {
    if (!rental.phone_number) return;
    await navigator.clipboard.writeText(rental.phone_number);
    setCopiedNumber(true);
    setTimeout(() => setCopiedNumber(false), 2000);
  };

  const copyCode = async (messageId: string, code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCodeId(messageId);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: "#0F0F0F",
        border: "1px solid #1A1A1A",
        borderTopColor: "#00FF94",
        borderTopWidth: "2px",
      }}
    >
      <div className="p-5 space-y-3 font-mono text-[13px]">
        <DetailRow label="service" value={rental.service_name} />
        <DetailRow label="country" value={rental.country_name} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[#555555] w-24 shrink-0">number</span>
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="text-[#F5F5F5] text-lg font-mono tracking-wide truncate"
              title={phone}
            >
              {phone}
            </span>
            {rental.phone_number && (
              <button
                type="button"
                onClick={copyNumber}
                className="text-[10px] px-2 py-0.5 rounded shrink-0"
                style={{
                  backgroundColor: copiedNumber ? "#00FF94" : "#1A1A1A",
                  color: copiedNumber ? "#080808" : "#F5F5F5",
                }}
              >
                {copiedNumber ? "Copied!" : "Copy"}
              </button>
            )}
          </div>
        </div>

        <DetailRow
          label="expires"
          value={`${daysLeft} days (${expiresLabel})`}
          valueStyle={{ color: "#F5F5F5" }}
        />

        <div className="flex items-center justify-between">
          <span className="text-[#555555] w-24 shrink-0">status</span>
          <span
            className="flex items-center gap-2 font-mono"
            style={{ color: statusColor }}
          >
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: statusColor }}
            />
            active
          </span>
        </div>

        <DetailRow
          label="cost"
          value={`$${rental.cost.toFixed(2)}`}
          valueStyle={{ color: "#00FF94" }}
        />
      </div>

      <div className="px-5 pb-5 space-y-3">
        <button
          type="button"
          onClick={handleToggleMessages}
          className="w-full py-2.5 rounded-[6px] text-[13px] font-semibold transition-colors"
          style={{ backgroundColor: "#1A1A1A", color: "#F5F5F5" }}
        >
          {messagesOpen ? "Hide messages" : "View messages"}
        </button>

        {messagesOpen && (
          <div
            className="rounded-[6px] p-3 space-y-3"
            style={{ backgroundColor: "#141414", border: "1px solid #1A1A1A" }}
          >
            <button
              type="button"
              onClick={handleRefreshMessages}
              disabled={refreshing || messagesLoading}
              className="w-full py-2 rounded-[6px] text-[12px] font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
              style={{ backgroundColor: "#00FF94", color: "#080808" }}
            >
              {refreshing ? (
                <>
                  <span
                    className="auth-spinner"
                    style={{
                      borderColor: "#080808",
                      borderTopColor: "transparent",
                      width: 14,
                      height: 14,
                    }}
                  />
                  Refreshing…
                </>
              ) : (
                "Refresh messages"
              )}
            </button>

            {messagesLoading ? (
              <div className="flex items-center justify-center gap-2 py-6">
                <span
                  className="auth-spinner"
                  style={{
                    borderColor: "#00FF94",
                    borderTopColor: "transparent",
                    width: 20,
                    height: 20,
                  }}
                />
                <span className="text-[12px] text-[#555555]">Loading…</span>
              </div>
            ) : messages && messages.length === 0 ? (
              <p className="text-[12px] text-[#555555] text-center py-4 leading-relaxed">
                No messages yet. Use your number on a service and click
                refresh.
              </p>
            ) : (
              <div className="space-y-4">
                {messages?.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-[6px] p-3 space-y-2"
                    style={{
                      backgroundColor: "#0F0F0F",
                      border: "1px solid #1A1A1A",
                    }}
                  >
                    <DetailRow
                      label="received"
                      value={formatReceivedAt(m.received_at)}
                    />
                    <DetailRow
                      label="sender"
                      value={m.sender?.trim() ? m.sender : "—"}
                    />
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
                      <span className="text-[#555555] w-24 shrink-0 text-[13px]">
                        message
                      </span>
                      <span className="font-mono text-[13px] text-[#F5F5F5] whitespace-pre-wrap break-words flex-1 min-w-0 text-left">
                        {m.full_sms || "—"}
                      </span>
                    </div>
                    {m.code ? (
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#1A1A1A]">
                        <span className="text-[#555555] w-24 shrink-0 text-[13px]">
                          code
                        </span>
                        <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                          <span
                            className="font-mono text-2xl font-bold tracking-wide truncate"
                            style={{ color: "#00FF94" }}
                          >
                            {m.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyCode(m.id, m.code!)}
                            className="text-[10px] px-2 py-1 rounded shrink-0"
                            style={{
                              backgroundColor:
                                copiedCodeId === m.id ? "#00FF94" : "#1A1A1A",
                              color:
                                copiedCodeId === m.id ? "#080808" : "#F5F5F5",
                            }}
                          >
                            {copiedCodeId === m.id ? "Copied!" : "Copy"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showConfirm ? (
          <div
            className="rounded-lg p-3"
            style={{
              backgroundColor: "#1A0000",
              border: "1px solid #FF4444",
            }}
          >
            <p className="text-[#FF4444] text-xs mb-2">
              Cancel this rental? If SMSPool accepts the refund, your balance
              will be credited.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await Promise.resolve(onCancelRental());
                    setShowConfirm(false);
                  } catch {
                    /* parent surfaces error */
                  }
                }}
                disabled={cancelling}
                className="flex-1 py-2 rounded text-xs font-medium"
                style={{ backgroundColor: "#FF4444", color: "#080808" }}
              >
                {cancelling ? "Cancelling…" : "Yes, cancel"}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2 rounded text-xs font-medium"
                style={{ backgroundColor: "#1A1A1A", color: "#F5F5F5" }}
              >
                Keep rental
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="text-xs w-full text-center py-2 transition-colors"
            style={{ color: "#FF4444" }}
          >
            Cancel rental
          </button>
        )}
      </div>
    </div>
  );
}
