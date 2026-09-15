"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useNavigate } from "@/hooks/useNavigate";
import { ADMIN_PAGE_SIZE, readPage, readSize } from "@/lib/pagination";

/**
 * Table pagination that lives in the URL.
 *
 * Every paginated list in the app reads `page` and `size` from the query
 * string and writes them back, so a table view is a thing you can bookmark,
 * share with someone, reload onto, and walk out of with the back button.
 * Held in React state instead — which is what the admin tables did — page 4 of
 * the refunds survives exactly as long as the tab does.
 *
 * Two ways to write, because there are two ways the rows are fetched
 * ------------------------------------------------------------------
 * `source` says who fetches the rows, and that decides how the URL is updated:
 *
 *   "server"  The page is a Server Component that reads searchParams and
 *             queries in the render (the wallet and history pages). The URL
 *             change IS the refetch, so it has to be a real navigation.
 *
 *   "client"  The page fetches through admin-api from the browser (every
 *             admin table). Here a router.push would re-run the whole server
 *             render for nothing — and /admin/layout.tsx is an async gate that
 *             calls auth.getUser() and reads profiles, so a page click would
 *             cost two extra server round trips to move a number. So the URL
 *             is updated with the native History API instead, which Next
 *             supports and keeps in sync with useSearchParams. No server
 *             render, back button still works.
 *
 * Defaults are left out of the URL: /admin/orders and /admin/orders?page=1&
 * size=25 are the same view, and only one of them belongs in someone's address
 * bar. Both spellings read back identically, so a hand-typed ?size=50 works.
 */

export interface TableParamOptions {
  /** Who fetches the rows. See the note above — there is no safe default. */
  source: "server" | "client";
  /** Rows per page when the URL does not say. */
  defaultSize?: number;
  /**
   * Prefixes the param names (`orders_page`), for a route that shows more than
   * one independently paged table at once. Leave unset for a single table.
   */
  prefix?: string;
}

export function useTableParams({
  source,
  defaultSize = ADMIN_PAGE_SIZE,
  prefix,
}: TableParamOptions) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const navigate = useNavigate();

  const key = useCallback(
    (name: string) => (prefix ? `${prefix}_${name}` : name),
    [prefix],
  );

  const page = readPage(searchParams.get(key("page")));
  const size = readSize(searchParams.get(key("size")), defaultSize);

  const apply = useCallback(
    (patch: Record<string, string | number | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [name, value] of Object.entries(patch)) {
        const param = key(name);
        if (value === null || value === undefined || value === "") {
          next.delete(param);
        } else {
          next.set(param, String(value));
        }
      }

      if (next.get(key("page")) === "1") next.delete(key("page"));
      if (next.get(key("size")) === String(defaultSize)) next.delete(key("size"));

      const qs = next.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;

      if (source === "server") {
        navigate(url);
      } else {
        // Supported by the App Router and synced into useSearchParams, so the
        // component re-renders with the new values without a server render.
        window.history.pushState(null, "", url);
      }
    },
    [searchParams, pathname, key, defaultSize, source, navigate],
  );

  const setPage = useCallback((p: number) => apply({ page: p }), [apply]);

  /** More rows per page can put the current page past the end, so it resets. */
  const setSize = useCallback(
    (s: number) => apply({ size: s, page: 1 }),
    [apply],
  );

  /** Page 3 of a list you just re-filtered is a different list. Reset. */
  const setFilter = useCallback(
    (name: string, value: string | null) => apply({ [name]: value, page: 1 }),
    [apply],
  );

  const getParam = useCallback(
    (name: string) => searchParams.get(key(name)),
    [searchParams, key],
  );

  return useMemo(
    () => ({ page, size, setPage, setSize, setFilter, getParam, apply }),
    [page, size, setPage, setSize, setFilter, getParam, apply],
  );
}
