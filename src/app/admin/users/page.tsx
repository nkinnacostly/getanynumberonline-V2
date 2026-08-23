"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdjustBalanceForm from "@/components/admin/AdjustBalanceForm";
import { StatusBadge, TableShell, Td, Th, Tr } from "@/components/admin/AdminTable";
import Pager from "@/components/dashboard/Pager";
import { useToast } from "@/components/dashboard/Toast";
import { useUser } from "@/hooks/useUser";
import {
  ADMIN_PAGE_SIZE,
  type AdminUser,
  listUsers,
  money,
  setBan,
  shortDate,
} from "@/lib/admin-api";

export default function AdminUsersPage() {
  const { toast } = useToast();
  const me = useUser();

  const [rows, setRows] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage: number, term: string) => {
      setLoading(true);
      try {
        const res = await listUsers({
          search: term || undefined,
          offset: (targetPage - 1) * ADMIN_PAGE_SIZE,
        });
        setRows(res.rows ?? []);
        setTotal(res.total ?? 0);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not load users", "error");
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    load(page, search);
    // `search` is applied on submit, not per keystroke — see handleSearch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load(1, search);
  };

  const handleBan = async (user: AdminUser) => {
    const next = !user.is_banned;
    const verb = next ? "Ban" : "Unban";
    if (!confirm(`${verb} ${user.email ?? "this user"}?`)) return;
    try {
      await setBan(user.id, next);
      toast(`${verb}ned ${user.email ?? "user"}`, "success");
      load(page, search);
    } catch (e) {
      toast(e instanceof Error ? e.message : `${verb} failed`, "error");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
          Users
        </h1>
        <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
          {total} total
        </span>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 mb-5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email…"
          className="flex-1 h-[44px] px-3 text-[14px] rounded-[6px] outline-none"
          style={{ backgroundColor: "var(--field)", border: "1px solid var(--line-strong)", color: "var(--foreground)" }}
        />
        <button
          type="submit"
          className="h-[44px] px-5 rounded-[6px] text-[14px] font-bold"
          style={{ backgroundColor: "var(--accent)", color: "var(--accent-ink)" }}
        >
          Search
        </button>
      </form>

      <TableShell
        loading={loading}
        empty={rows.length === 0}
        emptyLabel={search ? `No users matching “${search}”` : "No users yet"}
        colSpan={5}
        head={
          <>
            <Th>Email</Th>
            <Th align="right">Balance</Th>
            <Th hide="sm">Status</Th>
            <Th hide="md">Joined</Th>
            <Th align="right">Actions</Th>
          </>
        }
      >
        {rows.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            isSelf={me?.id === user.id}
            open={openRow === user.id}
            onToggle={() => setOpenRow(openRow === user.id ? null : user.id)}
            onBan={() => handleBan(user)}
            onAdjusted={() => {
              setOpenRow(null);
              load(page, search);
            }}
          />
        ))}
      </TableShell>

      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  open,
  onToggle,
  onBan,
  onAdjusted,
}: {
  user: AdminUser;
  isSelf: boolean;
  open: boolean;
  onToggle: () => void;
  onBan: () => void;
  onAdjusted: () => void;
}) {
  return (
    <>
      <Tr>
        <Td mono>
          <span className="flex items-center gap-2">
            {/* The email is the way into the account: everything this person
                has ordered, been charged and been refunded lives one click in. */}
            <Link
              href={`/admin/users/${user.id}`}
              className="truncate max-w-[180px] sm:max-w-none underline underline-offset-2 decoration-line-strong hover:decoration-accent transition-colors"
              style={{ color: "var(--foreground)" }}
            >
              {user.email ?? user.id.slice(0, 8)}
            </Link>
            {user.is_admin && (
              <span
                className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wider"
                style={{
                  backgroundColor: "rgba(245,166,35,0.12)",
                  color: "var(--warning)",
                  border: "1px solid rgba(245,166,35,0.32)",
                }}
              >
                ADMIN
              </span>
            )}
          </span>
        </Td>
        <Td mono align="right">{money(user.balance)}</Td>
        <Td hide="sm">
          <StatusBadge status={user.is_banned ? "banned" : "active"} />
        </Td>
        <Td hide="md" mono color="var(--muted)">{shortDate(user.created_at)}</Td>
        <Td align="right">
          <span className="flex items-center justify-end gap-2 whitespace-nowrap">
            <button
              onClick={onToggle}
              className="px-2 py-1.5 rounded-[4px] text-[11px] font-medium transition-colors"
              style={{ border: "1px solid var(--line-strong)", color: "var(--foreground)" }}
            >
              {open ? "Cancel" : "Adjust"}
            </button>
            <button
              onClick={onBan}
              disabled={isSelf}
              title={isSelf ? "You can't ban your own account" : undefined}
              className="px-2 py-1.5 rounded-[4px] text-[11px] font-medium transition-colors disabled:opacity-30"
              style={{
                border: `1px solid ${user.is_banned ? "var(--accent)" : "var(--danger)"}`,
                color: user.is_banned ? "var(--accent)" : "var(--danger)",
              }}
            >
              {user.is_banned ? "Unban" : "Ban"}
            </button>
          </span>
        </Td>
      </Tr>

      {open && (
        <tr style={{ borderBottom: "1px solid var(--line)" }}>
          <td colSpan={5} className="px-4 py-4" style={{ backgroundColor: "var(--field)" }}>
            <AdjustBalanceForm
              userId={user.id}
              currentBalance={user.balance}
              onDone={onAdjusted}
            />
          </td>
        </tr>
      )}
    </>
  );
}
