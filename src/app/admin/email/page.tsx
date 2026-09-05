"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge, TableShell, Td, Th, Tr } from "@/components/admin/AdminTable";
import CampaignComposer from "@/components/admin/CampaignComposer";
import Pager from "@/components/dashboard/Pager";
import { useToast } from "@/components/dashboard/Toast";
import {
  ADMIN_PAGE_SIZE,
  type AdminCampaign,
  type AudienceSize,
  dateTime,
  deleteCampaign,
  getAudienceSize,
  listCampaigns,
} from "@/lib/admin-api";

export default function AdminEmailPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminCampaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [audience, setAudience] = useState<AudienceSize | null>(null);

  /**
   * `silent` is for the background reads — the ones the operator did not ask
   * for. They skip the spinner so the table updates in place instead of
   * blanking, and swallow their error: the last good rows stay on screen and
   * the next tick tries again, which beats a toast every four seconds if the
   * network drops mid-send.
   */
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [list, size] = await Promise.all([
          listCampaigns({ offset: (page - 1) * ADMIN_PAGE_SIZE }),
          getAudienceSize(),
        ]);
        setRows(list.rows ?? []);
        setTotal(list.total ?? 0);
        setAudience(size.audience);
      } catch (e) {
        if (!silent) {
          toast(e instanceof Error ? e.message : "Could not load campaigns", "error");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [page, toast],
  );

  const refresh = useCallback(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * A send is not one atomic step. The composer sends a few batches per call,
   * whatever is left is drained by the dispatch cron, scheduled campaigns fire
   * on their own clock, and opens land minutes to days later. So while any row
   * is mid-flight the table re-reads itself and the counts climb on their own.
   *
   * It stops the moment nothing is in flight — `sent` and `failed` are
   * terminal — so an idle page makes no requests at all. A hidden tab is
   * skipped rather than polled, and re-reads once on becoming visible again.
   */
  const inFlight = rows.some(
    (c) => c.status === "queued" || c.status === "sending",
  );

  useEffect(() => {
    if (!inFlight) return;
    const tick = () => {
      if (document.visibilityState === "visible") load(true);
    };
    const id = window.setInterval(tick, 4000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [inFlight, load]);

  const handleDelete = async (c: AdminCampaign) => {
    if (!confirm(`Delete the draft "${c.subject}"?`)) return;
    try {
      await deleteCampaign(c.id);
      toast("Draft deleted", "success");
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not delete", "error");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
          Email
        </h1>
        <Link
          href="/admin/email/calendar"
          className="px-3 h-[30px] inline-flex items-center rounded-[6px] text-[12px] font-medium"
          style={{ border: "1px solid var(--line-strong)", color: "var(--foreground)" }}
        >
          Calendar &rarr;
        </Link>
      </div>
      <p className="text-[13px] mb-6" style={{ color: "var(--muted)" }}>
        Marketing email only. Password resets and order updates are sent
        separately and always reach everyone, including people who unsubscribe.
      </p>

      {audience && (
        <div className="mb-6 max-w-2xl">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Eligible" value={audience.eligible} tone="var(--accent)" />
            <Stat label="Unsubscribed" value={audience.unsubscribed} />
            <Stat
              label="Bounced"
              value={audience.bounce_suppressed}
              tone={audience.bounce_suppressed > 0 ? "var(--warning)" : undefined}
            />
            <Stat label="Banned" value={audience.banned} />
          </div>
          <p className="text-[11px] mt-2" style={{ color: "var(--muted)" }}>
            Every broadcast goes out in engagement order — {audience.engaged}{" "}
            who opened a previous campaign first, then {audience.unopened}{" "}
            delivered but unopened, then {audience.fresh} who have never had
            one. Anyone whose last campaign bounced sits this round out.
          </p>
        </div>
      )}

      <div className="mb-10">
        <CampaignComposer onCampaignChange={refresh} />
      </div>

      <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--muted)" }}>
        Campaigns
      </h2>
      {/* The single most confusing state here is a row sitting at "draft" after
          a successful test, so the table says why rather than leaving it to be
          worked out. */}
      <p className="text-[12px] mb-4" style={{ color: "var(--muted)" }}>
        A draft is a message that was written and tested but never sent — only
        the Send button delivers to real recipients.
      </p>

      <TableShell
        loading={loading}
        empty={rows.length === 0}
        emptyLabel="Nothing sent yet"
        colSpan={6}
        head={
          <>
            <Th>Subject</Th>
            <Th hide="sm">To</Th>
            <Th>Status</Th>
            <Th align="right">Sent</Th>
            <Th hide="md">When</Th>
            <Th align="right">{""}</Th>
          </>
        }
      >
        {rows.map((c) => (
          <Tr key={c.id}>
            <Td>
              {c.status === "draft" ? (
                <span className="block truncate max-w-[220px]">{c.subject}</span>
              ) : (
                <Link
                  href={`/admin/email/${c.id}`}
                  className="block truncate max-w-[220px] underline underline-offset-2"
                  style={{ color: "var(--foreground)" }}
                >
                  {c.subject}
                </Link>
              )}
              {c.last_error && (
                <span className="block text-[11px]" style={{ color: "var(--danger)" }}>
                  {c.last_error}
                </span>
              )}
            </Td>
            <Td hide="sm" mono color="var(--muted)">
              {c.audience === "all" ? "all subscribers" : (c.target_email ?? "—")}
              {c.template && c.template !== "basic" && (
                <span className="block text-[10px]">{c.template}</span>
              )}
            </Td>
            <Td>
              <StatusBadge status={c.status} />
              {c.status === "draft" && c.test_sent_at && (
                <span className="block text-[10px] mt-1" style={{ color: "var(--muted)" }}>
                  tested, not sent
                </span>
              )}
            </Td>
            <Td mono align="right">
              {c.sent_count}
              {typeof c.opened_count === "number" && c.opened_count > 0 && (
                <span style={{ color: "var(--accent)" }}> · {c.opened_count} opened</span>
              )}
              {c.failed_count > 0 && (
                <span style={{ color: "var(--danger)" }}> · {c.failed_count} failed</span>
              )}
            </Td>
            <Td hide="md" mono color="var(--muted)">
              {dateTime(c.completed_at ?? c.created_at)}
            </Td>
            <Td align="right">
              {c.status === "draft" && (
                <button
                  onClick={() => handleDelete(c)}
                  className="px-2 py-1.5 rounded-[4px] text-[11px] font-medium"
                  style={{ border: "1px solid var(--line-strong)", color: "var(--muted)" }}
                >
                  Delete
                </button>
              )}
            </Td>
          </Tr>
        ))}
      </TableShell>

      <Pager
        page={page}
        totalPages={Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))}
        onPage={setPage}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)" }}
    >
      <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <p
        className="font-mono text-xl font-medium mt-1"
        style={{ color: tone ?? "var(--foreground)" }}
      >
        {value}
      </p>
    </div>
  );
}
