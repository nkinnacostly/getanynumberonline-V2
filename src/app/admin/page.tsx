"use client";

import { useEffect, useState } from "react";
import { AdminCard, StatusBadge } from "@/components/admin/AdminTable";
import { useToast } from "@/components/dashboard/Toast";
import {
  type AdminStats,
  type AdminTransaction,
  dateTime,
  getSmspoolBalance,
  getStats,
  listTransactions,
  money,
} from "@/lib/admin-api";

/** Below this our SMSPool float is low enough to stop us fulfilling orders. */
const LOW_FLOAT_USD = 20;

export default function AdminOverviewPage() {
  const { toast } = useToast();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [float, setFloat] = useState<number | null>(null);
  const [floatError, setFloatError] = useState(false);
  const [recent, setRecent] = useState<AdminTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Loaded once on mount. `loading` starts true, so nothing is set
  // synchronously here — every setState happens after the await, and the
  // cancelled flag stops them firing if the admin navigates away mid-fetch.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Settled, not all: a SMSPool outage must not blank the whole dashboard.
      const [statsRes, floatRes, txRes] = await Promise.allSettled([
        getStats(),
        getSmspoolBalance(),
        listTransactions({ limit: 10 }),
      ]);
      if (cancelled) return;

      if (statsRes.status === "fulfilled") setStats(statsRes.value);
      else toast("Could not load stats", "error");

      if (floatRes.status === "fulfilled") setFloat(floatRes.value.balance);
      else setFloatError(true);

      if (txRes.status === "fulfilled") setRecent(txRes.value.rows ?? []);

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [toast]);

  const lowFloat = float !== null && float < LOW_FLOAT_USD;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "#F5F5F5" }}>
        Overview
      </h1>

      {lowFloat && (
        <div
          className="rounded-lg p-4 mb-6"
          style={{
            backgroundColor: "#1A0000",
            border: "1px solid rgba(255,68,68,0.32)",
          }}
        >
          <p className="text-[13px] font-semibold" style={{ color: "#FF4444" }}>
            SMSPool float is low
          </p>
          <p className="text-[12px] mt-1" style={{ color: "#888888" }}>
            <span className="font-mono">{money(float)}</span> remaining. Below{" "}
            <span className="font-mono">{money(LOW_FLOAT_USD)}</span> new orders
            will start failing — top up the SMSPool account.
          </p>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
        <Metric label="Total revenue" value={stats ? money(stats.total_revenue) : null} loading={loading} accent />
        <Metric label="Total users" value={stats ? String(stats.total_users) : null} loading={loading}
          sub={stats?.banned_users ? `${stats.banned_users} banned` : undefined} />
        <Metric label="Orders today" value={stats ? String(stats.orders_today) : null} loading={loading}
          sub={stats ? `${stats.total_orders} all time` : undefined} />
        <Metric label="Active rentals" value={stats ? String(stats.active_rentals) : null} loading={loading} />
        <Metric
          label="SMSPool float"
          value={floatError ? "—" : float !== null ? money(float) : null}
          loading={loading}
          tone={floatError ? "#555555" : lowFloat ? "#FF4444" : "#00FF94"}
          sub={floatError ? "unavailable" : undefined}
        />
      </div>

      {/* Recent activity */}
      <h2 className="text-sm font-semibold mb-4" style={{ color: "#555555" }}>
        Recent activity
      </h2>
      <AdminCard>
        {loading ? (
          <div className="flex justify-center py-12">
            <span className="auth-spinner" style={{ borderColor: "#00FF94", borderTopColor: "transparent" }} />
          </div>
        ) : recent.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: "#555555" }}>
            No transactions yet
          </p>
        ) : (
          <ul>
            {recent.map((tx) => {
              const credit = tx.type === "topup" || tx.type === "refund";
              return (
                <li
                  key={tx.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                  style={{ borderBottom: "1px solid #1A1A1A" }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[12px] truncate" style={{ color: "#F5F5F5" }}>
                      {tx.email ?? "—"}
                    </p>
                    <p className="font-mono text-[11px] mt-0.5" style={{ color: "#555555" }}>
                      {dateTime(tx.created_at)}
                      {tx.note ? ` · ${tx.note}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 hidden sm:block">
                    <StatusBadge status={tx.type} />
                  </div>
                  <span
                    className="font-mono text-[13px] shrink-0 w-24 text-right"
                    style={{ color: credit ? "#00FF94" : "#FF4444" }}
                  >
                    {credit ? "+" : "−"}
                    {money(tx.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </AdminCard>
    </div>
  );
}

function Metric({
  label,
  value,
  loading,
  sub,
  accent,
  tone,
}: {
  label: string;
  value: string | null;
  loading: boolean;
  sub?: string;
  accent?: boolean;
  tone?: string;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ backgroundColor: "#0F0F0F", border: "1px solid #1A1A1A" }}
    >
      <p className="text-[11px] uppercase tracking-wider mb-2" style={{ color: "#555555" }}>
        {label}
      </p>
      <p
        className="font-mono text-2xl font-medium"
        style={{ color: tone ?? (accent ? "#00FF94" : "#F5F5F5") }}
      >
        {loading && value === null ? "…" : (value ?? "—")}
      </p>
      {sub && (
        <p className="font-mono text-[11px] mt-1" style={{ color: "#555555" }}>
          {sub}
        </p>
      )}
    </div>
  );
}
