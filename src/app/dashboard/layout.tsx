import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/dashboard/Sidebar";
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
          {/* The mobile account bar moved into Sidebar, which owns the live
              balance — it is rendered above this <main>, sticky, so it stays
              reachable instead of scrolling away with the sign-out button. */}
          <main className="md:ml-[220px] px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
            {children}
          </main>
        </div>
      </ToastProvider>
    </UserProvider>
  );
}
