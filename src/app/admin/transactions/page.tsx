"use client";

import FilterTabs from "@/components/admin/FilterTabs";
import { StatusBadge, TableShell, Td, Th, Tr } from "@/components/admin/AdminTable";
import Pager from "@/components/dashboard/Pager";
import { useAdminList } from "@/hooks/useAdminList";
import {
  type AdminTransaction,
  dateTime,
  listTransactions,
  money,
} from "@/lib/admin-api";

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
        <h1 className="text-2xl font-bold" style={{ color: "#F5F5F5" }}>Transactions</h1>
        <span className="font-mono text-xs" style={{ color: "#555555" }}>{total} total</span>
      </div>

      <FilterTabs options={TYPES} value={filter} onChange={changeFilter} label="Filter by type" />

      <TableShell
        loading={loading}
        empty={rows.length === 0}
        emptyLabel="No transactions match this filter"
        colSpan={6}
        head={
          <>
            <Th hide="md">Date</Th>
            <Th>User</Th>
            <Th>Type</Th>
            <Th align="right">Amount</Th>
            <Th hide="sm" align="right">Balance after</Th>
            <Th hide="lg">Note</Th>
          </>
        }
      >
        {rows.map((t) => {
          // Money in vs money out — refunds are credits, so they read green.
          const credit = t.type === "topup" || t.type === "refund";
          return (
            <Tr key={t.id}>
              <Td hide="md" mono color="#555555">{dateTime(t.created_at)}</Td>
              <Td mono>
                <span className="block truncate max-w-[160px] sm:max-w-[220px]">
                  {t.email ?? "—"}
                </span>
              </Td>
              <Td><StatusBadge status={t.type} /></Td>
              <Td mono align="right" color={credit ? "#00FF94" : "#FF4444"}>
                {credit ? "+" : "−"}
                {money(t.amount)}
              </Td>
              <Td hide="sm" mono align="right" color="#888888">
                {t.balance_after === null ? "—" : money(t.balance_after)}
              </Td>
              <Td hide="lg" color="#555555">
                <span className="block truncate max-w-[220px]">
                  {t.provider === "admin" ? `[admin] ${t.note ?? ""}` : (t.note ?? "—")}
                </span>
              </Td>
            </Tr>
          );
        })}
      </TableShell>

      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}
