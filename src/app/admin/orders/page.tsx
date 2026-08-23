"use client";

import FilterTabs from "@/components/admin/FilterTabs";
import { OrdersTable } from "@/components/admin/EntityTables";
import Pager from "@/components/dashboard/Pager";
import { useAdminList } from "@/hooks/useAdminList";
import { type AdminOrder, listOrders } from "@/lib/admin-api";

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
        <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>Orders</h1>
        <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>{total} total</span>
      </div>

      <FilterTabs options={STATUSES} value={filter} onChange={changeFilter} label="Filter by status" />

      <OrdersTable rows={rows} loading={loading} />

      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}
