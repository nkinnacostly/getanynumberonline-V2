"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Admin navigation. Same shape as the dashboard Sidebar — 220px rail on
 * desktop, icon-only bottom tab bar under 768px — but carries an explicit
 * ADMIN badge, because operating on other people's money in the belief you're
 * in your own account is exactly the mistake worth designing against.
 */

const navItems = [
  {
    label: "Overview",
    href: "/admin",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    label: "Users",
    href: "/admin/users",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    ),
  },
  {
    label: "Orders",
    href: "/admin/orders",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3h6l1 4H8z" />
        <path d="M4 7h16l-1.5 13a2 2 0 0 1-2 2H7.5a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  {
    label: "Rentals",
    href: "/admin/rentals",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M9 5h6M9 18h6" />
      </svg>
    ),
  },
  {
    label: "Transactions",
    href: "/admin/transactions",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8h14l-3-3M21 16H7l3 3" />
      </svg>
    ),
  },
];

export default function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  // /admin must match exactly or every child route would light it up too.
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <>
      {/* Desktop rail */}
      <aside
        className="hidden md:flex fixed top-0 left-0 h-screen flex-col justify-between py-6 px-4 z-40"
        style={{
          width: 220,
          backgroundColor: "#0F0F0F",
          borderRight: "1px solid #1A1A1A",
        }}
      >
        <div>
          <div className="mb-10 px-2">
            <Link
              href="/admin"
              className="flex items-center gap-2 font-mono text-xs text-[#F5F5F5]"
            >
              <span className="text-[#00FF94]">&#x2588;</span>
              getanynumberonline
            </Link>
            <span
              className="inline-block mt-2 px-2 py-0.5 rounded font-mono text-[10px] font-medium tracking-wider"
              style={{
                backgroundColor: "rgba(245,166,35,0.12)",
                color: "#F5A623",
                border: "1px solid rgba(245,166,35,0.32)",
              }}
            >
              ADMIN
            </span>
          </div>

          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors"
                  style={{
                    color: active ? "#00FF94" : "#555555",
                    backgroundColor: active ? "rgba(0,255,148,0.05)" : "transparent",
                    borderLeft: active ? "2px solid #00FF94" : "2px solid transparent",
                  }}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-3 px-2">
          <div className="text-[11px] text-[#555555] truncate">{email}</div>
          <Link
            href="/dashboard"
            className="text-[12px] text-[#555555] hover:text-[#00FF94] transition-colors"
          >
            &larr; Back to app
          </Link>
          <button
            onClick={handleSignOut}
            className="text-[12px] text-[#555555] hover:text-[#FF4444] transition-colors text-left"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile bottom tabs */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around py-2"
        style={{ backgroundColor: "#0F0F0F", borderTop: "1px solid #1A1A1A" }}
      >
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md transition-colors"
              style={{ color: active ? "#00FF94" : "#555555" }}
            >
              {item.icon}
            </Link>
          );
        })}
      </nav>

      {/* Mobile ADMIN banner — the tab bar has no room for it, and knowing you
          are in the admin context matters more on a small screen. */}
      <div
        className="md:hidden sticky top-0 z-30 px-4 py-1.5 font-mono text-[10px] tracking-wider text-center"
        style={{
          backgroundColor: "rgba(245,166,35,0.12)",
          color: "#F5A623",
          borderBottom: "1px solid rgba(245,166,35,0.32)",
        }}
      >
        ADMIN MODE
      </div>
    </>
  );
}
