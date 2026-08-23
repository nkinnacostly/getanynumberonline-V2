"use client";

import FilterTabs from "@/components/admin/FilterTabs";
import { TransactionsTable } from "@/components/admin/EntityTables";
import Pager from "@/components/dashboard/Pager";
import { useAdminList } from "@/hooks/useAdminList";
import { type AdminTransaction, listTransactions } from "@/lib/admin-api";

const TYPES = [
  { value: "", label: "All" },
  { value: "topup", label: "Top-up" },
  { value: "deduction", label: "Deduction" },
  { value: "refund", label: "Refund" },
];

export default function AdminTransactionsPage() {
  const { rows, total, page, setPage, filter, changeFilter, loading, totalPages } =
    useAdminList<AdminTransaction>(listTransactions, "type");

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>Transactions</h1>
        <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>{total} total</span>
      </div>

      <FilterTabs options={TYPES} value={filter} onChange={changeFilter} label="Filter by type" />

      <TransactionsTable rows={rows} loading={loading} />

      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}
