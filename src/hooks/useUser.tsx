"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const UserContext = createContext<User | null>(null);

/**
 * Provides the authenticated Supabase user to all dashboard client components.
 *
 * The session is read with `getSession()` (local + reliable) rather than
 * `getUser()` (a network call that can transiently return null right after a
 * full page load — e.g. the redirect back from Flutterwave — and blank the UI).
 * Seeded from the server so the first render already has the user, and kept in
 * sync via `onAuthStateChange`.
 */
export function UserProvider({
  initialUser,
  children,
}: {
  initialUser: User | null;
  children: ReactNode;
}) {
  const [user, setUser] = useState<User | null>(initialUser);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    // Only replace state when the user actually changes, so consumers don't
    // re-run their loaders on every identical session read.
    const apply = (next: User | null) =>
      setUser((prev) => (prev?.id === next?.id ? prev : next));

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) apply(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

/** The current authenticated user, or null while loading / signed out. */
export function useUser() {
  return useContext(UserContext);
}
