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
        <div className="min-h-screen" style={{ backgroundColor: "#080808" }}>
          <Sidebar initialBalance={initialBalance} initialEmail={initialEmail} />
          {/* Main content — offset by sidebar width on desktop */}
          <main className="md:ml-[220px] px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
            {children}
          </main>
        </div>
      </ToastProvider>
    </UserProvider>
  );
}
