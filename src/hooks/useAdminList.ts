"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/dashboard/Toast";
import { useTableParams } from "@/hooks/useTableParams";
import type { ListParams, Paged } from "@/lib/admin-api";

/**
 * Paginated + filtered loading for the admin tables.
 *
 * Orders, rentals and transactions are the same page three times over — fetch
 * a page, hold a filter, reset to page 1 when the filter changes, surface
 * errors as a toast. Extracted so the pages are just their columns.
 *
 * Page, size and the filter all live in the URL rather than in state, so an
 * admin can send someone "page 3 of the refunds" as a link and land back on it
 * after a reload. See `useTableParams` for why these write through the History
 * API rather than the router.
 *
 * `userId` scopes the list to one account, which is what the user detail page
 * renders. It is a plain string rather than an options object on purpose: an
 * object literal would be a new reference every render and re-trigger the
 * fetch on a loop.
 */
export function useAdminList<T>(
  fetcher: (params: ListParams & Record<string, unknown>) => Promise<Paged<T>>,
  filterKey?: string,
  userId?: string,
) {
  const { toast } = useToast();
  const { page, size, setPage, setSize, setFilter, getParam } = useTableParams({
    source: "client",
  });
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const filter = (filterKey ? getParam(filterKey) : null) ?? "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetcher({
        offset: (page - 1) * size,
        limit: size,
        ...(userId ? { user_id: userId } : {}),
        ...(filterKey && filter ? { [filterKey]: filter } : {}),
      });
      setRows(res.rows ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load data", "error");
    } finally {
      setLoading(false);
    }
    // `fetcher` is a module-level function per page, stable by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, size, filter, filterKey, userId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  /** Changing the filter must go back to page 1, or you land on an empty page. */
  const changeFilter = useCallback(
    (next: string) => {
      if (filterKey) setFilter(filterKey, next || null);
    },
    [filterKey, setFilter],
  );

  return {
    rows,
    total,
    page,
    setPage,
    size,
    setSize,
    filter,
    changeFilter,
    loading,
    reload: load,
    totalPages: Math.max(1, Math.ceil(total / size)),
  };
}
