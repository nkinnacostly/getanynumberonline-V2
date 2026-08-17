import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { ToastProvider } from "@/components/dashboard/Toast";
import { UserProvider } from "@/hooks/useUser";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * Server-side admin gate.
 *
 * This renders nothing to a non-admin, so the admin UI never reaches the
 * browser. It is NOT the security boundary though — a determined caller could
 * request the admin data directly. The real boundary is admin-api, which
 * re-checks is_admin with the service role on every single call. This layout
 * is the UX half of that: don't show someone a panel they can't use.
 *
 * Reading is_admin through the caller's own RLS-scoped client is safe here
 * because it only ever reads their OWN row, and the migration's guard trigger
 * prevents anyone setting the flag on themselves.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, is_banned, email")
    .eq("id", user.id)
    .maybeSingle();

  // A banned admin is still banned. Fail closed on a missing profile too.
  if (!profile?.is_admin || profile.is_banned) redirect("/dashboard");

  return (
    <UserProvider initialUser={user}>
      <ToastProvider>
        <div className="min-h-screen" style={{ backgroundColor: "#080808" }}>
          <AdminSidebar email={profile.email ?? user.email ?? ""} />
          <main className="md:ml-[220px] px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
            {children}
          </main>
        </div>
      </ToastProvider>
    </UserProvider>
  );
}
