"use client";

import { StatusBadge, TableShell, Td, Th, Tr } from "./AdminTable";
import {
  type AdminOrder,
  type AdminRental,
  type AdminTransaction,
  dateTime,
  money,
  shortDate,
} from "@/lib/admin-api";

/**
 * The three admin entity tables, defined once.
 *
 * /admin/orders and the Orders tab of a user's detail page are the same table
 * with one column's difference, so the columns live here and both pages just
 * supply rows. `showUser` drops the email column where it would repeat the
 * page heading — and, since that frees a column, promotes Date to always
 * visible instead of md-and-up.
 */

interface EntityTableProps<T> {
  rows: T[];
  loading: boolean;
  /** false on a single-user view, where every row is the same person. */
  showUser?: boolean;
  emptyLabel?: string;
}

/** Email cell, truncated so a long address can't blow out the table width. */
function UserCell({ email }: { email: string | null }) {
  return (
    <Td mono>
      <span className="block truncate max-w-[160px] sm:max-w-[220px]">
        {email ?? "—"}
      </span>
    </Td>
  );
}

export function OrdersTable({
  rows,
  loading,
  showUser = true,
  emptyLabel = "No orders match this filter",
}: EntityTableProps<AdminOrder>) {
  const dateHide = showUser ? ("md" as const) : undefined;

  return (
    <TableShell
      loading={loading}
      empty={rows.length === 0}
      emptyLabel={emptyLabel}
      colSpan={showUser ? 7 : 6}
      head={
        <>
          <Th hide={dateHide}>Date</Th>
          {showUser && <Th>User</Th>}
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
          <Td hide={dateHide} mono color="var(--muted)">{dateTime(o.created_at)}</Td>
          {showUser && <UserCell email={o.email} />}
          <Td hide="sm">{o.service_name ?? "—"}</Td>
          <Td hide="lg" color="var(--muted)">{o.country_name ?? "—"}</Td>
          <Td hide="sm" mono>{o.smspool_number ?? "—"}</Td>
          <Td><StatusBadge status={o.status} /></Td>
          <Td mono align="right">{money(o.cost)}</Td>
        </Tr>
      ))}
    </TableShell>
  );
}

export function RentalsTable({
  rows,
  loading,
  showUser = true,
  emptyLabel = "No rentals match this filter",
}: EntityTableProps<AdminRental>) {
  const dateHide = showUser ? ("md" as const) : undefined;

  return (
    <TableShell
      loading={loading}
      empty={rows.length === 0}
      emptyLabel={emptyLabel}
      colSpan={showUser ? 9 : 8}
      head={
        <>
          <Th hide={dateHide}>Date</Th>
          {showUser && <Th>User</Th>}
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
          <Td hide={dateHide} mono color="var(--muted)">{dateTime(r.created_at)}</Td>
          {showUser && <UserCell email={r.email} />}
          <Td hide="sm">{r.service_name ?? "—"}</Td>
          <Td hide="lg" color="var(--muted)">{r.country_name ?? "—"}</Td>
          <Td hide="sm" mono>{r.phone_number ?? "—"}</Td>
          <Td hide="lg" mono align="right">{r.days ?? "—"}</Td>
          <Td hide="md" mono color="var(--muted)">{shortDate(r.expires_at)}</Td>
          <Td><StatusBadge status={r.status} /></Td>
          <Td mono align="right">{money(r.cost)}</Td>
        </Tr>
      ))}
    </TableShell>
  );
}

export function TransactionsTable({
  rows,
  loading,
  showUser = true,
  emptyLabel = "No transactions match this filter",
}: EntityTableProps<AdminTransaction>) {
  const dateHide = showUser ? ("md" as const) : undefined;

  return (
    <TableShell
      loading={loading}
      empty={rows.length === 0}
      emptyLabel={emptyLabel}
      colSpan={showUser ? 6 : 5}
      head={
        <>
          <Th hide={dateHide}>Date</Th>
          {showUser && <Th>User</Th>}
          <Th>Type</Th>
          <Th align="right">Amount</Th>
          <Th hide="sm" align="right">Balance after</Th>
          <Th hide={showUser ? "lg" : "sm"}>Note</Th>
        </>
      }
    >
      {rows.map((t) => {
        // Money in vs money out — refunds are credits, so they read green.
        const credit = t.type === "topup" || t.type === "refund";
        return (
          <Tr key={t.id}>
            <Td hide={dateHide} mono color="var(--muted)">{dateTime(t.created_at)}</Td>
            {showUser && <UserCell email={t.email} />}
            <Td><StatusBadge status={t.type} /></Td>
            <Td mono align="right" color={credit ? "var(--accent)" : "var(--danger)"}>
              {credit ? "+" : "−"}
              {money(t.amount)}
            </Td>
            <Td hide="sm" mono align="right" color="var(--muted)">
              {t.balance_after === null ? "—" : money(t.balance_after)}
            </Td>
            <Td hide={showUser ? "lg" : "sm"} color="var(--muted)">
              <span className="block truncate max-w-[220px]">
                {t.provider === "admin" ? `[admin] ${t.note ?? ""}` : (t.note ?? "—")}
              </span>
            </Td>
          </Tr>
        );
      })}
    </TableShell>
  );
}
