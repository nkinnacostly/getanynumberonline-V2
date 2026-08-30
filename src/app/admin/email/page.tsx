"use client";

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, size] = await Promise.all([
        listCampaigns({ offset: (page - 1) * ADMIN_PAGE_SIZE }),
        getAudienceSize(),
      ]);
      setRows(list.rows ?? []);
      setTotal(list.total ?? 0);
      setAudience(size.audience);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load campaigns", "error");
    } finally {
      setLoading(false);
    }
  }, [page, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (c: AdminCampaign) => {
    if (!confirm(`Delete the draft "${c.subject}"?`)) return;
    try {
      await deleteCampaign(c.id);
      toast("Draft deleted", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not delete", "error");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--foreground)" }}>
        Email
      </h1>
      <p className="text-[13px] mb-6" style={{ color: "var(--muted)" }}>
        Marketing email only. Password resets and order updates are sent
        separately and always reach everyone, including people who unsubscribe.
      </p>

      {audience && (
        <div className="grid grid-cols-3 gap-4 mb-6 max-w-lg">
          <Stat label="Eligible" value={audience.eligible} tone="var(--accent)" />
          <Stat label="Unsubscribed" value={audience.unsubscribed} />
          <Stat label="Banned" value={audience.banned} />
        </div>
      )}

      <div className="mb-10">
        <CampaignComposer onSent={load} />
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
              <span className="block truncate max-w-[220px]">{c.subject}</span>
              {c.last_error && (
                <span className="block text-[11px]" style={{ color: "var(--danger)" }}>
                  {c.last_error}
                </span>
              )}
            </Td>
            <Td hide="sm" mono color="var(--muted)">
              {c.audience === "all" ? "all subscribers" : (c.target_email ?? "—")}
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
              {c.failed_count > 0 && (
                <span style={{ color: "var(--danger)" }}> +{c.failed_count} failed</span>
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
