"use client";

import { useSyncExternalStore } from "react";

/** Never changes, so the store never notifies — the value is constant per phase. */
const subscribe = () => () => {};

/**
 * False while rendering on the server AND during the hydration render, true
 * on every render after that.
 *
 * This is the supported way to render something that cannot match on both
 * sides. `useSyncExternalStore` is given a different snapshot for the server,
 * and React deliberately uses that same server snapshot for the hydration
 * pass — so the first client render is identical to the server's, and the
 * switch happens in the commit afterwards. A `useState(false)` + `useEffect`
 * pair does the same thing but trips `react-hooks/set-state-in-effect`.
 *
 * The reason it exists here: every timestamp in the dashboard was formatted
 * with `toLocaleDateString` and no `timeZone`, so Vercel rendered it in UTC
 * and the browser re-rendered it in the reader's zone. React saw two different
 * strings and threw hydration error #418 on /dashboard/wallet and
 * /dashboard/history on every single load.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
