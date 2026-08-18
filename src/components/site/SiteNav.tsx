import Link from "next/link";
import Logo from "./Logo";

/**
 * Public marketing nav. Extracted from the homepage so /pricing, the
 * programmatic pages and /compare all share one header instead of each
 * growing a copy.
 */
export default function SiteNav() {
  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-[#080808]/80 border-b border-[#1A1A1A]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Mark only — the accessible name carries "GetAnyNumberOnline" for
            screen readers and search, so the wordmark does not have to. */}
        <Link href="/" aria-label="GetAnyNumberOnline home">
          <Logo id="nav" className="h-5 w-auto text-[#00FF94]" />
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
