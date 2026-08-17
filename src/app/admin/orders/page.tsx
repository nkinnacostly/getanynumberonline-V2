"use client";

import FilterTabs from "@/components/admin/FilterTabs";
import { StatusBadge, TableShell, Td, Th, Tr } from "@/components/admin/AdminTable";
import Pager from "@/components/dashboard/Pager";
import { useAdminList } from "@/hooks/useAdminList";
import { type AdminOrder, dateTime, listOrders, money } from "@/lib/admin-api";

const STATUSES = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
  { value: "refunded", label: "Refunded" },
];

export default function AdminOrdersPage() {
  const { rows, total, page, setPage, filter, changeFilter, loading, totalPages } =
    useAdminList<AdminOrder>(listOrders, "status");

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "#F5F5F5" }}>Orders</h1>
        <span className="font-mono text-xs" style={{ color: "#555555" }}>{total} total</span>
      </div>

      <FilterTabs options={STATUSES} value={filter} onChange={changeFilter} label="Filter by status" />

      <TableShell
        loading={loading}
        empty={rows.length === 0}
        emptyLabel="No orders match this filter"
        colSpan={7}
        head={
          <>
            <Th hide="md">Date</Th>
            <Th>User</Th>
            <Th hide="sm">Service</Th>
            <Th hide="lg">Country</Th>
            <Th hide="sm">Number</Th>
            <Th>Status</Th>
            <Th align="right">Cost</Th>
          </>
        }
      >
        {rows.map((o) => (
          <Tr key={o.id}>
            <Td hide="md" mono color="#555555">{dateTime(o.created_at)}</Td>
            <Td mono>
              <span className="block truncate max-w-[160px] sm:max-w-[220px]">
                {o.email ?? "—"}
              </span>
            </Td>
            <Td hide="sm">{o.service_name ?? "—"}</Td>
            <Td hide="lg" color="#888888">{o.country_name ?? "—"}</Td>
            <Td hide="sm" mono>{o.smspool_number ?? "—"}</Td>
            <Td><StatusBadge status={o.status} /></Td>
            <Td mono align="right">{money(o.cost)}</Td>
          </Tr>
        ))}
      </TableShell>

      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}
