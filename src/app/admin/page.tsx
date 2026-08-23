"use client";

import { useEffect, useState } from "react";
import { AdminCard, StatusBadge } from "@/components/admin/AdminTable";
import SimJunoCard from "@/components/admin/SimJunoCard";
import { useToast } from "@/components/dashboard/Toast";
import {
  type AdminSimJunoStatus,
  type AdminStats,
  type AdminTransaction,
  dateTime,
  getSmspoolBalance,
  getSimJunoStatus,
  getStats,
  listTransactions,
  money,
  refreshSimJunoBalance,
} from "@/lib/admin-api";

/** Below this our SMSPool float is low enough to stop us fulfilling orders. */
const LOW_FLOAT_USD = 20;

export default function AdminOverviewPage() {
  const { toast } = useToast();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [float, setFloat] = useState<number | null>(null);
  const [floatError, setFloatError] = useState(false);
  const [simjuno, setSimjuno] = useState<AdminSimJunoStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [recent, setRecent] = useState<AdminTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Loaded once on mount. `loading` starts true, so nothing is set
  // synchronously here — every setState happens after the await, and the
  // cancelled flag stops them firing if the admin navigates away mid-fetch.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Settled, not all: a SMSPool outage must not blank the whole dashboard.
      const [statsRes, floatRes, simjunoRes, txRes] = await Promise.allSettled([
        getStats(),
        getSmspoolBalance(),
        getSimJunoStatus(),
        listTransactions({ limit: 10 }),
      ]);
      if (cancelled) return;

      if (statsRes.status === "fulfilled") setStats(statsRes.value);
      else toast("Could not load stats", "error");

      if (floatRes.status === "fulfilled") setFloat(floatRes.value.balance);
      else setFloatError(true);

      if (simjunoRes.status === "fulfilled") setSimjuno(simjunoRes.value);

      if (txRes.status === "fulfilled") setRecent(txRes.value.rows ?? []);

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [toast]);

  const lowFloat = float !== null && float < LOW_FLOAT_USD;
  const lowSimjuno =
    !!simjuno && (!simjuno.available || simjuno.balance < simjuno.min_balance);

  /** One live provider check; persists so the storefront gate reacts too. */
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      setSimjuno(await refreshSimJunoBalance());
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Could not read SimJuno balance",
        "error",
      );
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--foreground)" }}>
        Overview
      </h1>

      {lowFloat && (
        <div
          className="rounded-lg p-4 mb-6"
          style={{
            backgroundColor: "color-mix(in srgb, var(--danger) 10%, transparent)",
            border: "1px solid rgba(255,68,68,0.32)",
          }}
        >
          <p className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>
            SMSPool float is low
          </p>
          <p className="text-[12px] mt-1" style={{ color: "var(--muted)" }}>
            <span className="font-mono">{money(float)}</span> remaining. Below{" "}
            <span className="font-mono">{money(LOW_FLOAT_USD)}</span> new orders
            will start failing — top up the SMSPool account.
          </p>
        </div>
      )}

      {lowSimjuno && (
        <div
          className="rounded-lg p-4 mb-4"
          style={{
            backgroundColor: "color-mix(in srgb, var(--danger) 10%, transparent)",
            border: "1px solid rgba(255,68,68,0.32)",
          }}
        >
          <p className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>
            SimJuno float is low
          </p>
          <p className="text-[12px] mt-1" style={{ color: "var(--muted)" }}>
            <span className="font-mono">{money(simjuno?.balance)}</span> remaining,
            floor <span className="font-mono">{money(simjuno?.min_balance ?? 0)}</span>.
            eSIM purchases are paused — top up at{" "}
            <a
              href="https://simjuno.com/dashboard/wallet"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)" }}
            >
              simjuno.com/dashboard/wallet ↗
            </a>
          </p>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-10">
        <Metric label="Total revenue" value={stats ? money(stats.total_revenue) : null} loading={loading} accent />
        <Metric label="Total users" value={stats ? String(stats.total_users) : null} loading={loading}
          sub={stats?.banned_users ? `${stats.banned_users} banned` : undefined} />
        <Metric
          label="Flagged users"
          value={stats ? String(stats.flagged_users) : null}
          loading={loading}
          // Amber only when there is something to review; a permanent warning
          // colour on a zero is noise people learn to skip past.
          tone={stats?.flagged_users ? "var(--warning)" : undefined}
          sub={stats?.flagged_users ? "awaiting review" : undefined}
        />
        <Metric label="Orders today" value={stats ? String(stats.orders_today) : null} loading={loading}
          sub={stats ? `${stats.total_orders} all time` : undefined} />
        <Metric label="Active rentals" value={stats ? String(stats.active_rentals) : null} loading={loading} />
        <Metric
          label="SMSPool float"
          value={floatError ? "—" : float !== null ? money(float) : null}
          loading={loading}
          tone={floatError ? "var(--muted)" : lowFloat ? "var(--danger)" : "var(--accent)"}
          sub={floatError ? "unavailable" : undefined}
        />
      </div>

      {/* eSIM supplier */}
      <section className="mb-10">
        <SimJunoCard
          status={simjuno}
          loading={loading}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      </section>

      {/* Recent activity */}
      <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--muted)" }}>
        Recent activity
      </h2>
      <AdminCard>
        {loading ? (
          <div className="flex justify-center py-12">
            <span className="auth-spinner" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
          </div>
        ) : recent.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: "var(--muted)" }}>
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
                  style={{ borderBottom: "1px solid var(--line)" }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[12px] truncate" style={{ color: "var(--foreground)" }}>
                      {tx.email ?? "—"}
                    </p>
                    <p className="font-mono text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
                      {dateTime(tx.created_at)}
                      {tx.note ? ` · ${tx.note}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 hidden sm:block">
                    <StatusBadge status={tx.type} />
                  </div>
                  <span
                    className="font-mono text-[13px] shrink-0 w-24 text-right"
                    style={{ color: credit ? "var(--accent)" : "var(--danger)" }}
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
      style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)" }}
    >
      <p className="text-[11px] uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <p
        className="font-mono text-2xl font-medium"
        style={{ color: tone ?? (accent ? "var(--accent)" : "var(--foreground)") }}
      >
        {loading && value === null ? "…" : (value ?? "—")}
      </p>
      {sub && (
        <p className="font-mono text-[11px] mt-1" style={{ color: "var(--muted)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}
