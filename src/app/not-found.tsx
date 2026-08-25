import Link from "next/link";
import type { Metadata } from "next";
import { SITE_NAME, SITE_DESCRIPTION, absoluteUrl } from "@/lib/seo/config";

export const metadata: Metadata = {
  title: `${SITE_NAME} — Page Not Found`,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: `${SITE_NAME} — Page Not Found`,
    description: SITE_DESCRIPTION,
    url: absoluteUrl("/"),
    type: "website",
  },
  twitter: {
    card: "summary",
    title: `${SITE_NAME} — Page Not Found`,
    description: SITE_DESCRIPTION,
  },
};

export default function NotFoundPage() {
  return (
    <html lang="en">
      <head>
        <title>404 — Page Not Found</title>
      </head>
      <body className="min-h-full flex flex-col items-center justify-center p-8 text-center">
        <h1 className="text-5xl font-extrabold text-paper mb-4">404</h1>
        <p className="text-2xl text-paper/70 mb-8">
          The page you're looking for doesn't exist.
        </p>

        <div className="space-y-4 max-w-md w-full">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-pine text-paper rounded-full hover:bg-pine-deep transition-colors text-sm"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="3" y1="3" x2="21" y2="21" />
              <line x1="21" y1="3" x2="3" y2="21" />
            </svg>
            Go home
          </Link>

          <a
            href="/pricing"
            className="inline-flex items-center gap-2 px-6 py-3 border border-line rounded-full hover:border-pine text-sm transition-colors"
          >
            View pricing
          </a>

          <a
            href="/receive-sms"
            className="inline-flex items-center gap-2 px-6 py-3 border border-line rounded-free hover:border-pine text-sm transition-colors"
          >
            Browse services
          </a>
        </div>
      </body>
    </html>
  );
}