"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import BalanceChip from "./BalanceChip";

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
  const router = useRouter();
  const [balance, setBalance] = useState(initialBalance);

  const refreshBalance = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single();
    if (data) setBalance(data.balance);
  }, []);

  useEffect(() => {
    refreshBalance();
    const iv = setInterval(refreshBalance, 10000);
    return () => clearInterval(iv);
  }, [refreshBalance]);

  // Expose refreshBalance globally so OrderForm / wallet can call it
  useEffect(() => {
    (window as any).__refreshBalance = refreshBalance;
  }, [refreshBalance]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex fixed top-0 left-0 h-screen flex-col justify-between py-6 px-4 z-40"
        style={{
          width: 220,
          backgroundColor: "#0F0F0F",
          borderRight: "1px solid #1A1A1A",
        }}
      >
        <div>
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 font-mono text-xs text-[#F5F5F5] mb-10 px-2"
          >
            <span className="text-[#00FF94]">&#x2588;</span>
            getanynumberonline
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
                    color: active ? "#00FF94" : "#555555",
                    backgroundColor: active
                      ? "rgba(0,255,148,0.05)"
                      : "transparent",
                    borderLeft: active
                      ? "2px solid #00FF94"
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

        {/* Bottom section */}
        <div className="flex flex-col gap-3 px-2">
          <BalanceChip balance={balance} />
          <div className="text-[11px] text-[#555555] truncate">
            {initialEmail}
          </div>
          <button
            onClick={handleSignOut}
            className="text-[12px] text-[#555555] hover:text-[#FF4444] transition-colors text-left"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around py-2"
        style={{ backgroundColor: "#0F0F0F", borderTop: "1px solid #1A1A1A" }}
      >
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1 p-2"
              style={{ color: active ? "#00FF94" : "#555555" }}
            >
              {item.icon}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
