import Link from "next/link";
import Logo from "./Logo";
import ThemeToggle from "@/components/site/ThemeToggle";

/**
 * Public marketing nav shared by every marketing page. All colours are
 * theme tokens, so it adapts automatically when the user switches between
 * light and dark.
 */
export default function SiteNav() {
  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-background/85 border-b border-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Mark only — the accessible name carries "GetAnyNumberOnline" for
            screen readers and search, so the wordmark does not have to. */}
        <Link href="/" aria-label="GetAnyNumberOnline home">
          <Logo id="nav" className="h-5 w-auto text-accent" />
        </Link>

        <div className="flex items-center gap-3 sm:gap-6">
          <Link
            href="/pricing"
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/auth"
            className="text-sm text-muted hover:text-foreground transition-colors hidden sm:inline"
          >
            Sign in
          </Link>
          <ThemeToggle />
          <Link
            href="/auth"
            className="text-sm font-medium bg-pine text-paper hover:bg-pine-deep rounded-full px-5 py-2 transition-colors"
          >
            Get started&nbsp;&rarr;
          </Link>
        </div>
      </div>
    </nav>
  );
}
