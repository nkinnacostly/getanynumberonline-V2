import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/site/Logo";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

/**
 * The page a human lands on from the unsubscribe link in a campaign footer.
 *
 * The work is done by the email-unsubscribe Edge Function, which this calls
 * server-side. Two reasons it lives here rather than being served by that
 * function directly:
 *
 *  1. Supabase's function gateway rewrites Content-Type to text/plain, so an
 *     HTML body renders as source. Verified against the deployed function — a
 *     custom header passed through untouched while content-type did not.
 *  2. A supabase.co URL in a marketing footer looks like phishing. The link
 *     people click should be the domain the email claims to come from.
 *
 * The signing secret stays in Supabase: this page forwards the id and token
 * and never sees it.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string }>;
}) {
  const { u, t } = await searchParams;
  let ok = false;

  if (u && t) {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/email-unsubscribe` +
          `?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`,
        { method: "POST", cache: "no-store" },
      );
      ok = res.ok;
    } catch {
      ok = false;
    }
  }

  return (
    <main
      className="min-h-dvh flex items-center justify-center px-4"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div
        className="w-full max-w-md rounded-lg p-8 text-center"
        style={{
          backgroundColor: "var(--surface)",
          border: "1px solid var(--line)",
        }}
      >
        <Logo id="unsub" className="h-5 w-auto mx-auto mb-6 text-accent" />

        <h1
          className="text-lg font-bold mb-2"
          style={{ color: ok ? "var(--accent)" : "var(--danger)" }}
        >
          {ok ? "You're unsubscribed" : "This link isn't valid"}
        </h1>

        <p className="text-[14px] leading-relaxed" style={{ color: "var(--muted)" }}>
          {ok ? (
            <>
              You won&apos;t receive marketing email from us again. Account and
              security messages &mdash; password resets and order updates
              &mdash; will still be sent.
            </>
          ) : (
            <>
              The link is incomplete or has been altered. Reply to any of our
              emails and we&apos;ll remove you by hand.
            </>
          )}
        </p>

        <Link
          href="/"
          className="inline-block mt-6 text-[13px] underline underline-offset-2"
          style={{ color: "var(--muted)" }}
        >
          Back to getanynumberonline
        </Link>
      </div>
    </main>
  );
}
