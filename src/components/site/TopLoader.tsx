"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The thin progress bar across the top of every page.
 *
 * There is no `loading.tsx` anywhere in this app, so a navigation to a
 * server-rendered route — the dashboard, a filter change on history, page two
 * of the wallet — used to show nothing at all until the new page swapped in.
 * On a slow connection that reads as a dead click, and people click again.
 *
 * How it knows a navigation started
 * ---------------------------------
 * Two sources, because the App Router exposes no global "navigation pending"
 * signal. `useLinkStatus` only works inside the <Link> that was clicked, which
 * would mean wrapping every link in the app to drive one shared bar.
 *
 *   1. A document-level click listener catches every internal <a>, which is
 *      every <Link>, with no call-site changes. Note it deliberately does NOT
 *      skip events with defaultPrevented set: Link calls preventDefault on
 *      exactly the clicks it is going to handle itself, so a prevented click
 *      on an internal href is the signal, not a reason to ignore it.
 *   2. `startNavProgress()`, for a router.push() from a button, where there is
 *      no anchor to listen to. useNavigate() in src/hooks calls it, so no page
 *      has to remember.
 *
 * How it knows the navigation finished
 * ------------------------------------
 * The pathname and search string only change once the new route has committed,
 * so a change in either is the completion signal. Anything that never commits
 * is caught by GIVE_UP_MS — a stuck bar would be worse than no bar.
 */

const START_EVENT = "gano:nav-start";

/** Nothing is drawn until a navigation has taken this long. A prefetched
 *  route commits within a frame or two, and a bar that flashes on every
 *  instant navigation is more distracting than useful. */
const SHOW_AFTER_MS = 120;
/** How often the bar creeps forward while it waits. */
const CREEP_MS = 160;
/** The bar never fills on its own — it cannot know how far along it is, and
 *  a bar that sits at 100% while the page is still blank is a lie. */
const CEILING = 90;
/** How long the finished bar holds at 100% before fading out. */
const FADE_MS = 240;
/** A navigation that never lands must not leave a bar on screen for ever. */
const GIVE_UP_MS = 10_000;

/**
 * Tell the top loader that a navigation has begun.
 *
 * Only needed for navigation that does not go through a link. Prefer
 * `useNavigate()` from `@/hooks/useNavigate`, which calls this for you.
 */
export function startNavProgress() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(START_EVENT));
  }
}

/** Would clicking this anchor start a client navigation we can track? */
function isTrackableClick(e: MouseEvent): boolean {
  // Anything but a plain left click is the browser's business: new tab, new
  // window, context menu, paste-and-go.
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
    return false;
  }

  const target = e.target;
  if (!(target instanceof Element)) return false;
  const anchor = target.closest("a");
  if (!anchor) return false;

  const href = anchor.getAttribute("href");
  if (!href || anchor.hasAttribute("download")) return false;

  const linkTarget = anchor.getAttribute("target");
  if (linkTarget && linkTarget !== "_self") return false;

  let dest: URL;
  try {
    dest = new URL(href, window.location.href);
  } catch {
    return false;
  }

  // mailto:, tel:, and anything else that hands off to another application.
  if (dest.protocol !== "http:" && dest.protocol !== "https:") return false;
  // Leaving the site: the browser's own loading indicator takes over.
  if (dest.origin !== window.location.origin) return false;
  // Already here, or a jump to an anchor on this page. Neither fetches
  // anything, so neither has a loading state to show.
  if (dest.href === window.location.href) return false;
  if (
    dest.pathname === window.location.pathname &&
    dest.search === window.location.search &&
    dest.hash
  ) {
    return false;
  }

  return true;
}

export default function TopLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  // The event listeners run outside React's render, so the state machine lives
  // in refs — reading `visible` in a listener would read whatever it was when
  // the listener was created.
  const running = useRef(false);
  const shown = useRef(false);
  const timers = useRef<number[]>([]);
  const creep = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (creep.current !== null) {
      window.clearInterval(creep.current);
      creep.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    if (!running.current) return;
    running.current = false;
    clearTimers();

    // Committed before the bar was ever drawn — the common case for a
    // prefetched route. Nothing appeared, so nothing has to disappear.
    if (!shown.current) return;

    setProgress(100);
    timers.current.push(
      window.setTimeout(() => {
        setVisible(false);
        shown.current = false;
        // Only rewind once it has faded out, or the bar visibly runs
        // backwards on its way off screen.
        timers.current.push(window.setTimeout(() => setProgress(0), FADE_MS));
      }, FADE_MS),
    );
  }, [clearTimers]);

  const start = useCallback(() => {
    // A second navigation before the first lands keeps the bar it already has.
    if (running.current) return;
    running.current = true;
    clearTimers();

    timers.current.push(
      window.setTimeout(() => {
        shown.current = true;
        setVisible(true);
        setProgress(8);
        // Decelerating: fast at first, then slower the closer it gets to the
        // ceiling, so a long wait still looks like progress.
        creep.current = window.setInterval(() => {
          setProgress((p) =>
            p >= CEILING ? p : p + Math.max(0.5, (CEILING - p) / 14),
          );
        }, CREEP_MS);
      }, SHOW_AFTER_MS),
    );

    timers.current.push(window.setTimeout(finish, GIVE_UP_MS));
  }, [clearTimers, finish]);

  // Commit detection. Both parts of the URL matter: the history and wallet
  // pages navigate by search string alone, and those are server round-trips
  // like any other. The hash is deliberately excluded — it never fetches.
  const urlKey = `${pathname}?${searchParams.toString()}`;
  const lastKey = useRef(urlKey);
  useEffect(() => {
    if (urlKey === lastKey.current) return;
    lastKey.current = urlKey;
    // On the next frame rather than in the effect body, so the route that
    // just committed paints first and the bar completes over it. It also
    // keeps this out of the commit that rendered the new page, which is what
    // the react-hooks/set-state-in-effect rule is there to prevent.
    const frame = window.requestAnimationFrame(finish);
    return () => window.cancelAnimationFrame(frame);
  }, [urlKey, finish]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (isTrackableClick(e)) start();
    };
    const onStart = () => start();
    /**
     * Back and forward re-fetch the route just as a click does — but popstate
     * also fires for an in-page hash jump, which fetches nothing. Verified in
     * a real browser: clicking `#somewhere` fires popstate AND hashchange, and
     * a bar started there never finishes, because the pathname it is waiting
     * on does not change. So compare against the route we last committed;
     * `lastKey` still holds it, since usePathname has not caught up yet.
     */
    const onPop = () => {
      const here = `${window.location.pathname}?${
        new URLSearchParams(window.location.search).toString()
      }`;
      if (here !== lastKey.current) start();
    };

    document.addEventListener("click", onClick);
    window.addEventListener(START_EVENT, onStart);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener(START_EVENT, onStart);
      window.removeEventListener("popstate", onPop);
      clearTimers();
    };
  }, [start, clearTimers]);

  return (
    // Decorative: it says the same thing the page itself is about to say.
    // pointer-events-none so a 2px strip can never swallow a click on
    // whatever sits under it.
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[60] pointer-events-none"
      style={{ height: "2px" }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          backgroundColor: "var(--accent)",
          opacity: visible ? 1 : 0,
          transition: "width 200ms ease-out, opacity 240ms linear",
        }}
      />
    </div>
  );
}
