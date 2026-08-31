"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import Logo from "@/components/site/Logo";
import ThemeToggle from "@/components/site/ThemeToggle";
import BalanceChip from "./BalanceChip";
import SignOutButton from "./SignOutButton";

interface SidebarProps {
  initialBalance: number;
  initialEmail: string;
}

const navItems = [
  {
    label: "Get Number",
    href: "/dashboard",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: "Rentals",
    href: "/dashboard/rentals",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M9 5h6M9 18h6" />
        <rect x="9" y="8" width="6" height="5" rx="0.5" />
      </svg>
    ),
  },
  {
    label: "eSIM",
    href: "/dashboard/esim",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17 2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6z" />
        <path d="M17 2l1 4" />
        <rect x="9" y="12" width="6" height="6" rx="1" />
        <path d="M9 15h6M12 12v6" />
      </svg>
    ),
  },
  {
    label: "Wallet",
    href: "/dashboard/wallet",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    label: "History",
    href: "/dashboard/history",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
];

export default function Sidebar({
  initialBalance,
  initialEmail,
}: SidebarProps) {
  const pathname = usePathname();
  const user = useUser();
  const [balance, setBalance] = useState(initialBalance);

  // Server is the source of truth: when a server render / router.refresh()
  // provides a new balance, adopt it. This keeps the balance correct even when
  // the client session is briefly unavailable (e.g. after the Flutterwave
  // redirect), where the client-side refresh below can't run.
  useEffect(() => {
    setBalance(initialBalance);
  }, [initialBalance]);

  const refreshBalance = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single();
    if (data) setBalance(data.balance);
  }, [user]);

  useEffect(() => {
    refreshBalance();
    const iv = setInterval(refreshBalance, 10000);
    return () => clearInterval(iv);
  }, [refreshBalance]);

  // Expose refreshBalance globally so OrderForm / wallet can call it
  useEffect(() => {
    (
      window as unknown as { __refreshBalance?: () => void }
    ).__refreshBalance = refreshBalance;
  }, [refreshBalance]);

  return (
    <>
      {/* Desktop/tablet sidebar. h-dvh (not h-screen) so Safari/Chrome browser
          chrome can't push the bottom section — the sign-out button — under
          the fold, and the safe-area padding keeps it above the home bar. */}
      <aside
        className="hidden md:flex fixed top-0 left-0 h-dvh flex-col pt-6 px-4 pb-[calc(1.5rem_+_env(safe-area-inset-bottom))] z-40"
        style={{
          width: 220,
          backgroundColor: "var(--surface)",
          borderRight: "1px solid var(--line)",
        }}
      >
        {/* The nav scrolls; the account block below never does. With
            justify-between and no overflow, a short viewport — a tablet in
            landscape, a desktop window dragged small — pushed the balance and
            the sign-out button off the bottom with no way to reach them.
            min-h-0 is what lets a flex child actually scroll. */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Logo */}
          <Link
            href="/"
            aria-label="GetAnyNumberOnline home"
            className="block mb-10 px-2"
          >
            <Logo className="h-8 w-auto text-accent" />
          </Link>

          {/* Nav */}
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors"
                  style={{
                    color: active ? "var(--accent)" : "var(--muted)",
                    backgroundColor: active
                      ? "color-mix(in srgb, var(--accent) 6%, transparent)"
                      : "transparent",
                    borderLeft: active
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                  }}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom section — shrink-0 so it is never squeezed out instead. */}
        <div className="shrink-0 flex flex-col gap-3 px-2 pt-4">
          <BalanceChip balance={balance} />
          <div className="text-[11px] text-muted truncate">
            {initialEmail}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SignOutButton className="flex-1" />
          </div>
        </div>
      </aside>

      {/* Mobile account bar.
          Lives here rather than in the dashboard layout so it reads the same
          live `balance` state the rail does — the layout only ever had the
          server-rendered figure, which is why mobile showed no balance at all.
          Sticky because it used to scroll away inside <main>, taking the only
          sign-out button on the whole mobile layout with it. */}
      <div
        className="md:hidden sticky top-0 z-30 flex items-center gap-2 px-4 py-2"
        style={{
          backgroundColor: "var(--surface)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <Link href="/dashboard/wallet" aria-label="Wallet balance">
          <BalanceChip balance={balance} compact />
        </Link>
        <span
          className="font-mono text-[11px] text-muted truncate min-w-0 flex-1"
          title={initialEmail}
        >
          {initialEmail}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around pt-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))]"
        style={{ backgroundColor: "var(--surface)", borderTop: "1px solid var(--line)" }}
      >
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1 p-2"
              style={{ color: active ? "var(--accent)" : "var(--muted)" }}
            >
              {item.icon}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
