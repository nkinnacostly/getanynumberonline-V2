import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/dashboard/Sidebar";
import ThemeToggle from "@/components/site/ThemeToggle";
import { ToastProvider } from "@/components/dashboard/Toast";
import { UserProvider } from "@/hooks/useUser";

/** Authenticated area — never indexable, regardless of the robots.txt rules. */
export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("balance")
    .eq("id", user?.id)
    .single();

  const initialBalance = profile?.balance ?? 0;
  const initialEmail = user?.email ?? "";

  return (
    <UserProvider initialUser={user}>
      <ToastProvider>
        <div className="min-h-screen bg-background text-foreground">
          <Sidebar initialBalance={initialBalance} initialEmail={initialEmail} />
          {/* Main content — offset by sidebar width on desktop */}
          <main className="md:ml-[220px] px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
            {/* Mobile theme switch — the bottom tab bar is reserved for the
                four primary destinations (CLAUDE.md §14). */}
            <div className="flex justify-end mb-2 md:hidden">
              <ThemeToggle />
            </div>
            {children}
          </main>
        </div>
      </ToastProvider>
    </UserProvider>
  );
}
