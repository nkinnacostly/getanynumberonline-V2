"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdjustBalanceForm from "@/components/admin/AdjustBalanceForm";
import { AdminCard } from "@/components/admin/AdminTable";
import {
  OrdersTable,
  RentalsTable,
  TransactionsTable,
} from "@/components/admin/EntityTables";
import FilterTabs from "@/components/admin/FilterTabs";
import Pager from "@/components/dashboard/Pager";
import { useToast } from "@/components/dashboard/Toast";
import { useAdminList } from "@/hooks/useAdminList";
import { useUser } from "@/hooks/useUser";
import {
  type AdminOrder,
  type AdminRental,
  type AdminTransaction,
  type AdminUserDetail,
  dateTime,
  getUser,
  listOrders,
  listRentals,
  listTransactions,
  money,
  setBan,
} from "@/lib/admin-api";

const TABS = [
  { value: "orders", label: "Orders" },
  { value: "transactions", label: "Transactions" },
  { value: "rentals", label: "Rentals" },
];

export default function UserDetailClient({ userId }: { userId: string }) {
  const { toast } = useToast();
  const me = useUser();

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [tab, setTab] = useState("orders");
  const [adjusting, setAdjusting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getUser(userId);
      setUser(res.user);
      setFailed(null);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Could not load this user");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleBan = async () => {
    if (!user) return;
    const next = !user.is_banned;
    const verb = next ? "Ban" : "Unban";
    if (!confirm(`${verb} ${user.email ?? "this user"}?`)) return;
    try {
      await setBan(user.user_id, next);
      toast(`${verb}ned ${user.email ?? "user"}`, "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : `${verb} failed`, "error");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <span
          className="auth-spinner"
          style={{ borderColor: "#00FF94", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (failed || !user) {
    return (
      <div>
        <BackLink />
        <AdminCard>
          <p className="py-12 text-center text-sm" style={{ color: "#FF4444" }}>
            {failed ?? "User not found"}
          </p>
        </AdminCard>
      </div>
    );
  }

  const isSelf = me?.id === user.user_id;
  // Everything they have ever paid in, from any source.
  const totalIn = user.deposited_real + user.credited_by_admin;
  // How much of their spend actually produced a code. The gap between this and
  // total_deducted is refunded money — see the delivery rate below.
  const deliveryRate =
    user.orders_total > 0
      ? Math.round((user.orders_delivered / user.orders_total) * 100)
      : null;

  return (
    <div>
      <BackLink />

      {/* ── Identity ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <h1
          className="text-xl sm:text-2xl font-bold break-all"
          style={{ color: "#F5F5F5" }}
        >
          {user.email ?? "(no email)"}
        </h1>
        {user.is_admin && <Tag label="ADMIN" color="#F5A623" />}
        {user.is_flagged && <Tag label="FLAGGED" color="#F5A623" />}
        {user.is_banned && <Tag label="BANNED" color="#FF4444" />}
      </div>
      <p className="font-mono text-[11px] mb-6" style={{ color: "#555555" }}>
        {user.user_id} · joined {dateTime(user.joined)}
      </p>

      {/* The reason an account was auto-flagged is the thing an admin arriving
          from the review queue came here to read, so it leads. */}
      {user.is_flagged && (
        <div
          className="rounded-lg p-4 mb-6 flex flex-wrap items-center justify-between gap-3"
          style={{
            backgroundColor: "rgba(245,166,35,0.08)",
            border: "1px solid rgba(245,166,35,0.32)",
          }}
        >
          <div>
            <p className="text-[13px] font-semibold" style={{ color: "#F5A623" }}>
              Flagged for review
            </p>
            <p className="text-[12px] mt-1" style={{ color: "#888888" }}>
              {user.flag_reason ?? "No reason recorded."}
            </p>
          </div>
          <Link
            href="/admin/flagged"
            className="font-mono text-[11px] underline underline-offset-2 shrink-0"
            style={{ color: "#F5A623" }}
          >
            Review queue →
          </Link>
        </div>
      )}

      {/* ── Money ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Metric label="Balance" value={money(user.balance)} accent />
        <Metric
          label="Deposited"
          value={money(user.deposited_real)}
          sub={`${user.deposit_count} top-up${user.deposit_count === 1 ? "" : "s"}${
            user.pending_topups ? ` · ${user.pending_topups} pending` : ""
          }`}
        />
        <Metric
          label="Spent"
          value={money(user.total_deducted)}
          sub={
            user.total_refunded > 0
              ? `${money(user.total_refunded)} refunded`
              : "nothing refunded"
          }
          tone={user.total_refunded > 0 ? "#F5A623" : undefined}
        />
        <Metric
          label="Codes delivered"
          value={`${user.orders_delivered}/${user.orders_total}`}
          sub={deliveryRate === null ? "no orders yet" : `${deliveryRate}% success`}
          // A low delivery rate is the single most useful support signal here:
          // it separates "this person is unhappy" from "our supply is failing".
          tone={
            deliveryRate === null
              ? "#555555"
              : deliveryRate < 30
                ? "#FF4444"
                : deliveryRate < 70
                  ? "#F5A623"
                  : "#00FF94"
          }
        />
      </div>

      {/* Admin credits are not revenue and are broken out so they can't be
          mistaken for money this person actually paid. */}
      {user.credited_by_admin > 0 && (
        <p className="font-mono text-[11px] mb-4" style={{ color: "#555555" }}>
          Includes {money(user.credited_by_admin)} credited by an admin —{" "}
          {money(totalIn)} in total, {money(user.spent_on_delivered)} of spend
          delivered a code.
        </p>
      )}

      {/* ── Actions ────────────────────────────────────────── */}
      <AdminCard>
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAdjusting((v) => !v)}
              className="h-[38px] px-4 rounded-[6px] text-[13px] font-medium"
              style={{ border: "1px solid #333333", color: "#F5F5F5" }}
            >
              {adjusting ? "Cancel" : "Adjust balance"}
            </button>
            <button
              onClick={handleBan}
              disabled={isSelf}
              title={isSelf ? "You can't ban your own account" : undefined}
              className="h-[38px] px-4 rounded-[6px] text-[13px] font-medium disabled:opacity-30"
              style={{
                border: `1px solid ${user.is_banned ? "#00FF94" : "#FF4444"}`,
                color: user.is_banned ? "#00FF94" : "#FF4444",
              }}
            >
              {user.is_banned ? "Unban user" : "Ban user"}
            </button>
          </div>

          {adjusting && (
            <div className="mt-4">
              <AdjustBalanceForm
                userId={user.user_id}
                currentBalance={user.balance}
                onDone={() => {
                  setAdjusting(false);
                  load();
                }}
              />
            </div>
          )}
        </div>
      </AdminCard>

      {/* ── History ────────────────────────────────────────── */}
      <div className="mt-8">
        <FilterTabs
          options={TABS}
          value={tab}
          onChange={setTab}
          label="Choose a history view"
        />

        {/* Only the active tab is mounted, so switching tabs fetches that list
            and nothing else — three lists on mount would be three wasted calls. */}
        {tab === "orders" && <OrdersTab userId={userId} />}
        {tab === "transactions" && <TransactionsTab userId={userId} />}
        {tab === "rentals" && <RentalsTab userId={userId} />}
      </div>
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────
// Each owns its own paging, and reuses the same table the site-wide list page
// renders — just without the user column, since every row is this person.

function OrdersTab({ userId }: { userId: string }) {
  const { rows, total, page, setPage, loading, totalPages } =
    useAdminList<AdminOrder>(listOrders, undefined, userId);

  return (
    <>
      <TabCount noun="order" total={total} />
      <OrdersTable
        rows={rows}
        loading={loading}
        showUser={false}
        emptyLabel="This user has not ordered a number"
      />
      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </>
  );
}

function TransactionsTab({ userId }: { userId: string }) {
  const { rows, total, page, setPage, loading, totalPages } =
    useAdminList<AdminTransaction>(listTransactions, undefined, userId);

  return (
    <>
      <TabCount noun="transaction" total={total} />
      <TransactionsTable
        rows={rows}
        loading={loading}
        showUser={false}
        emptyLabel="No transactions on this account"
      />
      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </>
  );
}

function RentalsTab({ userId }: { userId: string }) {
  const { rows, total, page, setPage, loading, totalPages } =
    useAdminList<AdminRental>(listRentals, undefined, userId);

  return (
    <>
      <TabCount noun="rental" total={total} />
      <RentalsTable
        rows={rows}
        loading={loading}
        showUser={false}
        emptyLabel="This user has no rentals"
      />
      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </>
  );
}

// ── Small pieces ─────────────────────────────────────────────

function TabCount({ noun, total }: { noun: string; total: number }) {
  return (
    <p className="font-mono text-xs mb-3" style={{ color: "#555555" }}>
      {total} {noun}
      {total === 1 ? "" : "s"}
    </p>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/users"
      className="inline-flex items-center gap-1.5 text-[13px] mb-5"
      style={{ color: "#555555" }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M15 18l-6-6 6-6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      All users
    </Link>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium tracking-wider"
      style={{ color, border: `1px solid ${color}52` }}
    >
      {label}
    </span>
  );
}

function Metric({
  label,
  value,
  sub,
  accent,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  tone?: string;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ backgroundColor: "#0F0F0F", border: "1px solid #1A1A1A" }}
    >
      <p
        className="text-[11px] uppercase tracking-wider mb-2"
        style={{ color: "#555555" }}
      >
        {label}
      </p>
      <p
        className="font-mono text-xl sm:text-2xl font-medium"
        style={{ color: tone ?? (accent ? "#00FF94" : "#F5F5F5") }}
      >
        {value}
      </p>
      {sub && (
        <p className="font-mono text-[11px] mt-1" style={{ color: "#555555" }}>
          {sub}
        </p>
      )}
    </div>
  );
}
