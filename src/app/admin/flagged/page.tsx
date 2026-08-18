"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminCard, TableShell, Td, Th, Tr } from "@/components/admin/AdminTable";
import { useToast } from "@/components/dashboard/Toast";
import { useUser } from "@/hooks/useUser";
import {
  type AdminFlaggedUser,
  clearFlag,
  dateTime,
  listFlagged,
  money,
  notifyFlagsChanged,
  setBan,
} from "@/lib/admin-api";

/**
 * Review queue for users auto-flagged by evaluate_user_fraud.
 *
 * Flagging never bans — it only asks a human to look. So every row leads with
 * the evidence (the reason, and the cancel/order ratio behind it) and offers
 * exactly two decisions: it's fine, or it isn't.
 */
export default function AdminFlaggedPage() {
  const { toast } = useToast();
  const me = useUser();

  const [rows, setRows] = useState<AdminFlaggedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFlagged();
      setRows(res.rows ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load flagged users", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleClear = async (user: AdminFlaggedUser) => {
    if (!confirm(`Clear the flag on ${user.email ?? "this user"}?`)) return;
    setBusy(user.id);
    try {
      await clearFlag(user.id);
      toast("Flag cleared", "success");
      notifyFlagsChanged();
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not clear the flag", "error");
    } finally {
      setBusy(null);
    }
  };

  const handleBan = async (user: AdminFlaggedUser) => {
    const next = !user.is_banned;
    const verb = next ? "Ban" : "Unban";
    if (!confirm(`${verb} ${user.email ?? "this user"}?`)) return;
    setBusy(user.id);
    try {
      await setBan(user.id, next);
      toast(`${verb}ned ${user.email ?? "user"}`, "success");
      notifyFlagsChanged();
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : `${verb} failed`, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <h1 className="text-2xl font-bold" style={{ color: "#F5F5F5" }}>
          Flagged users
        </h1>
        <span className="font-mono text-xs" style={{ color: "#555555" }}>
          {rows.length} awaiting review
        </span>
      </div>
      <p className="text-[13px] mb-6" style={{ color: "#555555" }}>
        Auto-flagged for review. Flagging never blocks ordering on its own —
        these accounts are still trading until you act.
      </p>

      {!loading && rows.length === 0 ? (
        <AdminCard>
          <p className="py-16 text-center text-sm" style={{ color: "#555555" }}>
            Nothing flagged. Nice.
          </p>
        </AdminCard>
      ) : (
        <TableShell
          loading={loading}
          empty={false}
          colSpan={6}
          head={
            <>
              <Th>User</Th>
              <Th>Reason</Th>
              <Th align="right">Cancels</Th>
              <Th hide="md" align="right">Balance</Th>
              <Th hide="lg">Flagged</Th>
              <Th align="right">Actions</Th>
            </>
          }
        >
          {rows.map((user) => (
            <Tr key={user.id}>
              <Td mono>
                <span className="flex items-center gap-2">
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="truncate max-w-[150px] sm:max-w-[220px] underline underline-offset-2 decoration-[#333333] hover:decoration-[#00FF94] transition-colors"
                    style={{ color: "#F5F5F5" }}
                  >
                    {user.email ?? user.id.slice(0, 8)}
                  </Link>
                  {user.is_banned && (
                    <span
                      className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono tracking-wider"
                      style={{ color: "#FF4444", border: "1px solid rgba(255,68,68,0.32)" }}
                    >
                      BANNED
                    </span>
                  )}
                </span>
              </Td>

              {/* The reason is the whole point of the row, so it gets the
                  warning colour rather than a badge that says "flagged". */}
              <Td color="#F5A623">
                <span className="block text-[12px] leading-snug max-w-[280px]">
                  {user.flag_reason ?? "Flagged for review"}
                </span>
              </Td>

              <Td mono align="right" color="#F5A623">
                {user.cancel_count}/{user.order_count}
              </Td>
              <Td hide="md" mono align="right">{money(user.balance)}</Td>
              <Td hide="lg" mono color="#555555">{dateTime(user.flagged_at)}</Td>

              <Td align="right">
                <span className="flex items-center justify-end gap-2 whitespace-nowrap">
                  <button
                    onClick={() => handleClear(user)}
                    disabled={busy === user.id}
                    className="px-2 py-1.5 rounded-[4px] text-[11px] font-medium disabled:opacity-30"
                    style={{ border: "1px solid #333333", color: "#F5F5F5" }}
                  >
                    Clear flag
                  </button>
                  <button
                    onClick={() => handleBan(user)}
                    disabled={busy === user.id || me?.id === user.id}
                    title={me?.id === user.id ? "You can't ban your own account" : undefined}
                    className="px-2 py-1.5 rounded-[4px] text-[11px] font-medium disabled:opacity-30"
                    style={{
                      border: `1px solid ${user.is_banned ? "#00FF94" : "#FF4444"}`,
                      color: user.is_banned ? "#00FF94" : "#FF4444",
                    }}
                  >
                    {user.is_banned ? "Unban" : "Ban"}
                  </button>
                </span>
              </Td>
            </Tr>
          ))}
        </TableShell>
      )}
    </div>
  );
}
