"use client";

import FilterTabs from "@/components/admin/FilterTabs";
import { StatusBadge, TableShell, Td, Th, Tr } from "@/components/admin/AdminTable";
import Pager from "@/components/dashboard/Pager";
import { useAdminList } from "@/hooks/useAdminList";
import {
  type AdminRental,
  dateTime,
  listRentals,
  money,
  shortDate,
} from "@/lib/admin-api";

const STATUSES = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

export default function AdminRentalsPage() {
  const { rows, total, page, setPage, filter, changeFilter, loading, totalPages } =
    useAdminList<AdminRental>(listRentals, "status");

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "#F5F5F5" }}>Rentals</h1>
        <span className="font-mono text-xs" style={{ color: "#555555" }}>{total} total</span>
      </div>

      <FilterTabs options={STATUSES} value={filter} onChange={changeFilter} label="Filter by status" />

      <TableShell
        loading={loading}
        empty={rows.length === 0}
        emptyLabel="No rentals match this filter"
        colSpan={8}
        head={
          <>
            <Th hide="md">Date</Th>
            <Th>User</Th>
            <Th hide="sm">Service</Th>
            <Th hide="lg">Country</Th>
            <Th hide="sm">Number</Th>
            <Th hide="lg" align="right">Days</Th>
            <Th hide="md">Expires</Th>
            <Th>Status</Th>
            <Th align="right">Cost</Th>
          </>
        }
      >
        {rows.map((r) => (
          <Tr key={r.id}>
            <Td hide="md" mono color="#555555">{dateTime(r.created_at)}</Td>
            <Td mono>
              <span className="block truncate max-w-[160px] sm:max-w-[220px]">
                {r.email ?? "—"}
              </span>
            </Td>
            <Td hide="sm">{r.service_name ?? "—"}</Td>
            <Td hide="lg" color="#888888">{r.country_name ?? "—"}</Td>
            <Td hide="sm" mono>{r.phone_number ?? "—"}</Td>
            <Td hide="lg" mono align="right">{r.days ?? "—"}</Td>
            <Td hide="md" mono color="#555555">{shortDate(r.expires_at)}</Td>
            <Td><StatusBadge status={r.status} /></Td>
            <Td mono align="right">{money(r.cost)}</Td>
          </Tr>
        ))}
      </TableShell>

      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}
