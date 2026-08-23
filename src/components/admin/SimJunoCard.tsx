"use client";

import { AdminCard } from "@/components/admin/AdminTable";
import { dateTime, money, type AdminSimJunoStatus } from "@/lib/admin-api";

/** SimJuno's wallet page, where the reseller float gets topped up. */
export const SIMJUNO_WALLET_URL = "https://simjuno.com/dashboard/wallet";

/**
 * eSIM supplier card for the admin overview.
 *
 * Shows the cached reseller balance (what reconcile-esims last saw — opening
 * this panel never burns provider rate limit) with an explicit Refresh that
 * does one live check and persists it. SimJuno has no funding API, so topping
 * up is a link to their dashboard rather than a button here.
 */
export default function SimJunoCard({
  status,
  loading,
  refreshing,
  onRefresh,
}: {
  status: AdminSimJunoStatus | null;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const low =
    !!status && (!status.available || status.balance < status.min_balance);

  return (
    <AdminCard>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p
              className="text-[11px] uppercase tracking-wider mb-2"
              style={{ color: "var(--muted)" }}
            >
              eSIM supplier — SimJuno float
            </p>
            <p
              className="font-mono text-3xl font-medium"
              style={{ color: low ? "var(--danger)" : "var(--accent)" }}
            >
              {loading ? "…" : money(status?.balance)}
            </p>
            <p className="font-mono text-[11px] mt-1.5" style={{ color: "var(--muted)" }}>
              {status
                ? `Floor ${money(status.min_balance)} · checked ${dateTime(status.checked_at)}`
                : "Availability unknown"}
            </p>
            {!loading && status?.note && (
              <p className="text-[12px] mt-1" style={{ color: "var(--warning)" }}>
                {status.note}
              </p>
            )}
          </div>

          {/* Availability mirrors the storefront gate */}
          <span
            className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase whitespace-nowrap"
            style={{
              backgroundColor: low
                ? "color-mix(in srgb, var(--warning) 12%, transparent)"
                : "color-mix(in srgb, var(--accent) 10%, transparent)",
              color: low ? "var(--warning)" : "var(--accent)",
              border: `1px solid ${low ? "color-mix(in srgb, var(--warning) 32%, transparent)" : "color-mix(in srgb, var(--accent) 32%, transparent)"}`,
            }}
          >
            {status ? (status.available ? "selling" : "paused") : "unknown"}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing || loading}
            className="h-[44px] px-4 rounded-[6px] text-[13px] font-semibold transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
            style={{
              backgroundColor: "transparent",
              border: "1px solid var(--line-strong)",
              color: "var(--foreground)",
            }}
          >
            {refreshing ? (
              <>
                <span
                  className="auth-spinner"
                  style={{ borderColor: "var(--foreground)", borderTopColor: "transparent", width: 14, height: 14 }}
                />
                Checking…
              </>
            ) : (
              "Refresh balance"
            )}
          </button>
          <a
            href={SIMJUNO_WALLET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="h-[44px] px-4 rounded-[6px] text-[13px] font-bold flex items-center justify-center"
            style={{ backgroundColor: "var(--accent)", color: "var(--accent-ink)" }}
          >
            Top up at SimJuno ↗
          </a>
        </div>

        <p className="text-[11px] mt-3 leading-relaxed" style={{ color: "var(--muted)" }}>
          SimJuno has no funding API — top-ups happen on their dashboard. Below the
          floor the eSIM store pauses automatically until the next successful check.
        </p>
      </div>
    </AdminCard>
  );
}
