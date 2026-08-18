"use client";

import FilterTabs from "@/components/admin/FilterTabs";
import { RentalsTable } from "@/components/admin/EntityTables";
import Pager from "@/components/dashboard/Pager";
import { useAdminList } from "@/hooks/useAdminList";
import { type AdminRental, listRentals } from "@/lib/admin-api";

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

      <RentalsTable rows={rows} loading={loading} />

      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}
