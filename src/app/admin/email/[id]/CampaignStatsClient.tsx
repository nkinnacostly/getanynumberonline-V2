"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminCard, StatusBadge, TableShell, Td, Th, Tr } from "@/components/admin/AdminTable";
import FilterTabs from "@/components/admin/FilterTabs";
import { useToast } from "@/components/dashboard/Toast";
import {
  type CampaignStats,
  dateTime,
  getCampaignStats,
} from "@/lib/admin-api";

/**
 * Who got it, who read it, who bounced.
 *
 * The filters are the questions an operator actually asks after a send, so
 * each one is a tab rather than something to work out from a full list.
 */
const FILTERS = [
  { value: "all", label: "Everyone" },
  { value: "opened", label: "Opened" },
  { value: "unopened", label: "Didn't open" },
  { value: "clicked", label: "Clicked" },
  { value: "bounced", label: "Bounced" },
  { value: "complained", label: "Spam" },
  { value: "notsent", label: "Not sent" },
];

export default function CampaignStatsClient({ campaignId }: { campaignId: string }) {
  const { toast } = useToast();
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCampaignStats(campaignId, filter);
      setStats(res.stats);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load stats", "error");
    } finally {
      setLoading(false);
    }
  }, [campaignId, filter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const t = stats?.totals;
  // Rates are quoted against DELIVERED, not against everyone we tried to mail.
  // An open rate diluted by bounces flatters nobody and misleads everyone.
  const pct = (n: number) =>
    t && t.delivered > 0 ? `${Math.round((n / t.delivered) * 100)}%` : "—";

  return (
    <div>
      <Link
        href="/admin/email"
        className="inline-block text-[13px] mb-5"
        style={{ color: "var(--muted)" }}
      >
        ← All campaigns
      </Link>

      <h1
        className="text-xl sm:text-2xl font-bold mb-1"
        style={{ color: "var(--foreground)" }}
      >
        {stats?.campaign.subject ?? "Campaign"}
      </h1>
      {stats && (
        <p className="font-mono text-[11px] mb-6" style={{ color: "var(--muted)" }}>
          {stats.campaign.audience === "all"
            ? "all subscribers"
            : (stats.campaign.target_email ?? "one user")}{" "}
          · {dateTime(stats.campaign.completed_at ?? stats.campaign.created_at)}
        </p>
      )}

      {t && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
            <Metric label="Delivered" value={t.delivered} sub={`of ${t.recipients} sent`} />
            <Metric label="Opened" value={t.opened} sub={pct(t.opened)} tone="var(--accent)" />
            <Metric label="Clicked" value={t.clicked} sub={pct(t.clicked)} />
            <Metric
              label="Bounced"
              value={t.bounced}
              sub={t.bounced > 0 ? "address rejected" : "none"}
              tone={t.bounced > 0 ? "var(--danger)" : undefined}
            />
          </div>

          {(t.complained > 0 || t.failed > 0 || t.pending > 0) && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {t.complained > 0 && (
                <Metric
                  label="Marked spam"
                  value={t.complained}
                  sub="auto-unsubscribed"
                  tone="var(--danger)"
                />
              )}
              {t.failed > 0 && (
                <Metric label="Failed" value={t.failed} tone="var(--warning)" />
              )}
              {t.pending > 0 && (
                <Metric label="Still sending" value={t.pending} tone="var(--warning)" />
              )}
            </div>
          )}

          {/* Opens are a soft signal and the page says so where the number is,
              not in a footnote nobody reads. */}
          <p className="text-[12px] mb-6" style={{ color: "var(--muted)" }}>
            Opens are approximate. Apple Mail and Gmail pre-load images for
            privacy, which registers as an open nobody made — read the number as
            a direction, not a count. Clicks are reliable.
          </p>
        </>
      )}

      <FilterTabs
        options={FILTERS}
        value={filter}
        onChange={setFilter}
        label="Filter recipients"
      />

      <TableShell
        loading={loading}
        empty={!stats || stats.rows.length === 0}
        emptyLabel="No recipients match this filter"
        colSpan={5}
        head={
          <>
            <Th>Recipient</Th>
            <Th>Status</Th>
            <Th hide="sm">Opened</Th>
            <Th hide="md">Clicked</Th>
            <Th hide="lg">Detail</Th>
          </>
        }
      >
        {(stats?.rows ?? []).map((r) => (
          <Tr key={r.user_id}>
            <Td mono>
              <Link
                href={`/admin/users/${r.user_id}`}
                className="block truncate max-w-[200px] underline underline-offset-2"
                style={{ color: "var(--foreground)" }}
              >
                {r.email}
              </Link>
            </Td>
            <Td>
              <StatusBadge
                status={
                  r.complained_at
                    ? "spam"
                    : r.bounced_at
                      ? "bounced"
                      : r.delivered_at
                        ? "delivered"
                        : r.status
                }
              />
            </Td>
            <Td hide="sm" mono color={r.opened_at ? "var(--accent)" : "var(--muted)"}>
              {r.opened_at
                ? `${dateTime(r.opened_at)}${r.open_count > 1 ? ` ×${r.open_count}` : ""}`
                : "—"}
            </Td>
            <Td hide="md" mono color={r.clicked_at ? "var(--accent)" : "var(--muted)"}>
              {r.clicked_at ? dateTime(r.clicked_at) : "—"}
            </Td>
            <Td hide="lg" color="var(--muted)">
              <span className="block truncate max-w-[240px] text-[12px]">
                {r.bounce_detail ?? r.error ?? "—"}
              </span>
            </Td>
          </Tr>
        ))}
      </TableShell>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
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
        style={{ color: tone ?? "var(--foreground)" }}
      >
        {value}
      </p>
      {sub && (
        <p className="font-mono text-[11px] mt-1" style={{ color: "var(--muted)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}
