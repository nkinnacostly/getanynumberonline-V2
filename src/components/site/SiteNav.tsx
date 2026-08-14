import Link from "next/link";

/**
 * Public marketing nav. Extracted from the homepage so /pricing, the
 * programmatic pages and /compare all share one header instead of each
 * growing a copy.
 *
 * NOTE: the wordmark still reads "getnumber" while all metadata says
 * "GetAnyNumberOnline" — flagged for a branding decision, deliberately not
 * changed here.
 */
export default function SiteNav() {
  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-[#080808]/80 border-b border-[#1A1A1A]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 font-mono text-sm text-[#F5F5F5]"
        >
          <span className="text-[#00FF94]">&#x2588;</span>
          getnumber
        </Link>

        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/pricing"
            className="text-sm text-[#555555] hover:text-[#F5F5F5] transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/auth"
            className="text-sm text-[#555555] hover:text-[#F5F5F5] transition-colors hidden sm:inline"
          >
            Sign in
          </Link>
          <Link
            href="/auth"
            className="text-sm font-medium text-[#00FF94] border border-[#00FF94]/30 hover:border-[#00FF94] rounded-md px-4 py-1.5 transition-colors"
          >
            Get started&nbsp;&rarr;
          </Link>
        </div>
      </div>
    </nav>
  );
}
