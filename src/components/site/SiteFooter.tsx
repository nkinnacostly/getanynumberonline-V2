import Link from "next/link";
import Logo from "./Logo";
import {
  countriesBySlugs,
  flagEmoji,
  servicesBySlugs,
  TOP_COUNTRY_SLUGS,
  TOP_SERVICE_SLUGS,
} from "@/lib/seo/catalog";
import { SITE_NAME } from "@/lib/seo/config";

/**
 * Shared marketing footer.
 *
 * Also the site's main internal-linking surface: every page links to the top
 * service and country pages, which is what gets those programmatic URLs
 * crawled and gives them internal PageRank. Without this they'd only be
 * reachable from the sitemap, which is much weaker.
 */
export default function SiteFooter() {
  const services = servicesBySlugs(TOP_SERVICE_SLUGS);
  const countries = countriesBySlugs(TOP_COUNTRY_SLUGS);

  return (
    <footer className="border-t border-[#1A1A1A] mt-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 mb-10">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#F5F5F5] mb-4">
              Popular services
            </h2>
            <ul className="space-y-2">
              {services.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/receive-sms/${s.slug}`}
                    className="text-xs text-[#555555] hover:text-[#00FF94] transition-colors"
                  >
                    Receive {s.name} SMS
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#F5F5F5] mb-4">
              Numbers by country
            </h2>
            <ul className="space-y-2">
              {countries.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/numbers/${c.slug}`}
                    className="text-xs text-[#555555] hover:text-[#00FF94] transition-colors"
                  >
                    {flagEmoji(c.iso)} {c.name} numbers
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#F5F5F5] mb-4">
              Compare
            </h2>
            <ul className="space-y-2">
              <li>
                <Link href="/compare/sms-activate" className="text-xs text-[#555555] hover:text-[#00FF94] transition-colors">
                  vs SMS-Activate
                </Link>
              </li>
              <li>
                <Link href="/compare/5sim" className="text-xs text-[#555555] hover:text-[#00FF94] transition-colors">
                  vs 5SIM
                </Link>
              </li>
              <li>
                <Link href="/compare/textverified" className="text-xs text-[#555555] hover:text-[#00FF94] transition-colors">
                  vs TextVerified
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#F5F5F5] mb-4">
              Company
            </h2>
            <ul className="space-y-2">
              <li>
                <Link href="/pricing" className="text-xs text-[#555555] hover:text-[#00FF94] transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-xs text-[#555555] hover:text-[#00FF94] transition-colors">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-xs text-[#555555] hover:text-[#00FF94] transition-colors">
                  Privacy
                </Link>
              </li>
              {/* TODO(brand): "API Docs" link removed — no public API
                  documentation exists yet. Restore this entry pointing at the
                  real docs URL once they ship. */}
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-[#1A1A1A]">
          {/* Recessive in the footer — the mark drops to muted rather than
              carrying the accent a second time on the same page. */}
          <Link href="/" aria-label="GetAnyNumberOnline home">
            <Logo id="footer" className="h-4 w-auto text-[#555555]" />
          </Link>
          <p className="text-xs text-[#555555]/60">
            &copy; {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
