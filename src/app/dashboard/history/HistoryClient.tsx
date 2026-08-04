"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Pager from "@/components/dashboard/Pager";
import { formatBytes } from "@/lib/esim-api";

export type HistoryTab = "orders" | "rentals" | "esims";

export interface OrderRow {
  id: string;
  order_id: string;
  created_at: string;
  service_name: string | null;
  country_name: string | null;
  phone_number: string | null;
  status: string;
  cost: number;
}

export interface RentalRow {
  id: string;
  created_at: string;
  service_name: string | null;
  country_name: string | null;
  phone_number: string | null;
  days: number;
  status: string;
  cost: number;
}

export interface EsimHistoryRow {
  id: string;
  created_at: string;
  country_name: string | null;
  country: string | null;
  data_gb: number | null;
  /** Authoritative volume from the provider; data_gb is the display fallback. */
  total_bytes: number | null;
  iccid: string | null;
  duration_days: number | null;
  status: string;
  cost: number;
}

interface Message {
  sms_code: string;
  full_text: string | null;
}

const STATUS_TABS: Record<HistoryTab, { id: string; label: string }[]> = {
  orders: [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "cancelled", label: "Cancelled" },
    { id: "expired", label: "Expired" },
    { id: "refunded", label: "Refunded" },
  ],
  rentals: [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "expired", label: "Expired" },
    { id: "cancelled", label: "Cancelled" },
  ],
  esims: [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "expired", label: "Expired" },
    { id: "cancelled", label: "Cancelled" },
    { id: "archived", label: "Archived" },
    { id: "failed", label: "Failed" },
  ],
};

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    pending: { bg: "#1A1500", color: "#F5A623", border: "rgba(245,166,35,0.32)" },
    active: { bg: "#0A1F0A", color: "#00FF94", border: "rgba(0,255,148,0.32)" },
    completed: { bg: "#0A1F0A", color: "#00FF94", border: "rgba(0,255,148,0.32)" },
    cancelled: { bg: "#1A0000", color: "#FF4444", border: "rgba(255,68,68,0.32)" },
    failed: { bg: "#1A0000", color: "#FF4444", border: "rgba(255,68,68,0.32)" },
    expired: { bg: "#141414", color: "#555555", border: "#242424" },
    archived: { bg: "#141414", color: "#555555", border: "#242424" },
    refunded: { bg: "#1A1500", color: "#F5A623", border: "rgba(245,166,35,0.32)" },
  };
  const s = map[status] || map.expired;
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase"
      style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {status}
    </span>
  );
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function HistoryClient({
  tab,
  status,
  page,
  pageSize,
  total,
  orders,
  rentals,
  esims,
}: {
  tab: HistoryTab;
  status: string;
  page: number;
  pageSize: number;
  total: number;
  orders: OrderRow[];
  rentals: RentalRow[];
  esims: EsimHistoryRow[];
}) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, Message | null>>({});

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const buildQuery = (next: {
    tab?: HistoryTab;
    status?: string;
    page?: number;
  }) => {
    const t = next.tab ?? tab;
    const s = next.status ?? status;
    const p = next.page ?? page;
    const params = new URLSearchParams();
    if (t !== "orders") params.set("tab", t);
    if (s !== "all") params.set("status", s);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/dashboard/history${qs ? `?${qs}` : ""}`;
  };
  const goTab = (t: HistoryTab) =>
    router.push(buildQuery({ tab: t, status: "all", page: 1 }));
  const goStatus = (s: string) =>
    router.push(buildQuery({ status: s, page: 1 }));
  const goPage = (p: number) => router.push(buildQuery({ page: p }));

  const toggleRow = async (order: OrderRow) => {
    if (expandedId === order.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(order.id);
    if (messages[order.id] === undefined) {
      const supabase = createClient();
      const { data } = await supabase
        .from("messages")
        .select("sms_code, full_text")
        .eq("order_id", order.order_id)
        .limit(1)
        .single();
      setMessages((prev) => ({ ...prev, [order.id]: data as Message | null }));
    }
  };

  const chip = (id: string, label: string, active: boolean, onClick: () => void) => (
    <button
      key={id}
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
      style={{
        backgroundColor: active ? "#141414" : "transparent",
        color: active ? "#00FF94" : "#888888",
        border: `1px solid ${active ? "#00FF94" : "#1A1A1A"}`,
      }}
    >
      {label}
    </button>
  );

  const rows =
    tab === "orders" ? orders : tab === "rentals" ? rentals : esims;

  return (
    <div>
      {/* Header + tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold" style={{ color: "#F5F5F5" }}>
          History
        </h1>
        <div className="flex gap-2">
          {chip("orders", "One-time orders", tab === "orders", () => goTab("orders"))}
          {chip("rentals", "Rentals", tab === "rentals", () => goTab("rentals"))}
          {chip("esims", "eSIMs", tab === "esims", () => goTab("esims"))}
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap mb-5">
        {STATUS_TABS[tab].map((f) =>
          chip(f.id, f.label, f.id === status, () => goStatus(f.id)),
        )}
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm mb-2" style={{ color: "#555555" }}>
            {status === "all" ? `No ${tab} yet.` : `No ${status} ${tab}.`}
          </p>
          <Link
            href={
              tab === "orders"
                ? "/dashboard"
                : tab === "rentals"
                  ? "/dashboard/rentals"
                  : "/dashboard/esim"
            }
            className="text-sm font-medium hover:underline"
            style={{ color: "#00FF94" }}
          >
            {tab === "orders"
              ? "Get a number →"
              : tab === "rentals"
                ? "Rent a number →"
                : "Buy an eSIM →"}
          </Link>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid #1A1A1A" }}
        >
          {tab === "orders"
            ? orders.map((o, i) => (
                <div
                  key={o.id}
                  style={{ borderTop: i === 0 ? "none" : "1px solid #1A1A1A" }}
                >
                  <button
                    onClick={() => toggleRow(o)}
                    className="w-full text-left px-4 py-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusBadge(o.status)}
                        <span className="text-[13px]" style={{ color: "#F5F5F5" }}>
                          {o.service_name || "—"}
                        </span>
                      </div>
                      <div
                        className="font-mono text-[11px] mt-1 truncate"
                        style={{ color: "#555555" }}
                      >
                        {formatDate(o.created_at)} · {o.country_name || "—"}
                        {o.phone_number ? ` · ${o.phone_number}` : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-sm" style={{ color: "#00FF94" }}>
                        ${o.cost.toFixed(2)}
                      </div>
                      <div className="text-[10px] mt-1" style={{ color: "#555555" }}>
                        {expandedId === o.id ? "▲ hide" : "▼ code"}
                      </div>
                    </div>
                  </button>

                  {expandedId === o.id && (
                    <div className="px-4 pb-4 pt-1" style={{ backgroundColor: "#0A0A0A" }}>
                      {messages[o.id] === undefined ? (
                        <div className="flex items-center gap-2 py-2">
                          <span
                            className="auth-spinner"
                            style={{ borderColor: "#00FF94", borderTopColor: "transparent" }}
                          />
                          <span className="text-xs" style={{ color: "#555555" }}>
                            Loading…
                          </span>
                        </div>
                      ) : messages[o.id] === null ? (
                        <p className="text-xs py-2" style={{ color: "#555555" }}>
                          No SMS received for this order
                        </p>
                      ) : (
                        <div
                          className="rounded-lg p-3"
                          style={{ backgroundColor: "#0F0F0F", border: "1px solid #1A1A1A" }}
                        >
                          <p className="text-xs mb-1" style={{ color: "#555555" }}>
                            Received code
                          </p>
                          <p className="font-mono text-2xl font-bold" style={{ color: "#00FF94" }}>
                            {messages[o.id]!.sms_code}
                          </p>
                          {messages[o.id]!.full_text && (
                            <p className="text-xs mt-2" style={{ color: "#555555" }}>
                              {messages[o.id]!.full_text}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            : tab === "rentals"
            ? rentals.map((r, i) => (
                <div
                  key={r.id}
                  className="px-4 py-3.5 flex items-center justify-between gap-3"
                  style={{ borderTop: i === 0 ? "none" : "1px solid #1A1A1A" }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusBadge(r.status)}
                      <span className="text-[13px]" style={{ color: "#F5F5F5" }}>
                        {r.service_name}
                      </span>
                    </div>
                    <div
                      className="font-mono text-[11px] mt-1 truncate"
                      style={{ color: "#555555" }}
                    >
                      {formatDate(r.created_at)} · {r.country_name}
                      {r.phone_number ? ` · ${r.phone_number}` : ""} · {r.days}d
                    </div>
                  </div>
                  <div className="font-mono text-sm shrink-0" style={{ color: "#00FF94" }}>
                    ${r.cost.toFixed(2)}
                  </div>
                </div>
              ))
            : esims.map((e, i) => (
                <div
                  key={e.id}
                  className="px-4 py-3.5 flex items-center justify-between gap-3"
                  style={{ borderTop: i === 0 ? "none" : "1px solid #1A1A1A" }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusBadge(e.status)}
                      <span className="text-[13px]" style={{ color: "#F5F5F5" }}>
                        {e.country_name || e.country || "eSIM"}
                      </span>
                    </div>
                    <div
                      className="font-mono text-[11px] mt-1 truncate"
                      style={{ color: "#555555" }}
                    >
                      {formatDate(e.created_at)} ·{" "}
                      {e.total_bytes
                        ? formatBytes(e.total_bytes)
                        : `${e.data_gb ?? "?"} GB`}
                      {e.duration_days ? ` · ${e.duration_days}d` : ""}
                      {e.iccid ? ` · ${e.iccid}` : ""}
                    </div>
                  </div>
                  <div className="font-mono text-sm shrink-0" style={{ color: "#00FF94" }}>
                    ${e.cost.toFixed(2)}
                  </div>
                </div>
              ))}
        </div>
      )}

      <Pager page={page} totalPages={totalPages} onPage={goPage} />
    </div>
  );
}
