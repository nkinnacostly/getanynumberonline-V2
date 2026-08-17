"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/dashboard/Toast";
import { ADMIN_PAGE_SIZE, type Paged } from "@/lib/admin-api";

/**
 * Paginated + filtered loading for the admin tables.
 *
 * Orders, rentals and transactions are the same page three times over — fetch
 * a page, hold a filter, reset to page 1 when the filter changes, surface
 * errors as a toast. Extracted so the pages are just their columns.
 */
export function useAdminList<T>(
  fetcher: (params: { offset: number; limit: number } & Record<string, unknown>) => Promise<Paged<T>>,
  filterKey?: string,
) {
  const { toast } = useToast();
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetcher({
        offset: (page - 1) * ADMIN_PAGE_SIZE,
        limit: ADMIN_PAGE_SIZE,
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
  }, [page, filter, filterKey, toast]);

  useEffect(() => {
    load();
  }, [load]);

  /** Changing the filter must go back to page 1, or you land on an empty page. */
  const changeFilter = useCallback((next: string) => {
    setFilter(next);
    setPage(1);
  }, []);

  return {
    rows,
    total,
    page,
    setPage,
    filter,
    changeFilter,
    loading,
    reload: load,
    totalPages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
  };
}
