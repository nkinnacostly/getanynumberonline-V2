import type { Metadata } from "next";
import { Syne, DM_Mono } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";
import JsonLd from "@/components/seo/JsonLd";
import TopLoader from "@/components/site/TopLoader";
import {
  ROBOTS_META,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "@/lib/seo/config";
import { organizationSchema, websiteSchema } from "@/lib/seo/jsonld";
import "./globals.css";

/**
 * Applies the stored theme before first paint so there is no flash of the
 * wrong palette. Runs synchronously at the top of <head>; must stay a plain
 * string — no imports, no JSX beyond this file's own markup.
 *
 * Default is dark when no preference is stored (the product's origin theme).
 */
const THEME_INIT = `(function(){try{var s=localStorage.getItem("gano-theme");var d=s?s==="dark":true;document.documentElement.classList.toggle("dark",d);}catch(e){document.documentElement.classList.add("dark");}})();`;

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  // Everything relative below resolves against this, so og:url and canonicals
  // can never drift onto the vercel.app preview host again.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    // Child pages set only their own title; the brand is appended here.
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  // `keywords` is ignored by Google and has been since 2009 — removed.
  openGraph: {
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: "/",
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  // Preview/branch deployments get noindex so the *.vercel.app host never
  // competes with the real domain. See IS_PRODUCTION_DEPLOY.
  robots: ROBOTS_META,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the theme script mutates <html>'s class list
    // before React hydrates — the attribute difference is expected.
    <html
      lang="en"
      className={`${syne.variable} ${dmMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* next/script rather than a raw <script>: React 19 flags any script
            element in a component tree and Next's dev overlay raises it as an
            error on every page load. beforeInteractive hands the same inline
            code to Next, which injects it into <head> during SSR — so it still
            runs before first paint, and there is no script element in the
            React tree to complain about. A <template>, which the warning
            suggests, would never execute at all. */}
        <Script id="gano-theme-init" strategy="beforeInteractive">
          {THEME_INIT}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">
        {/* Suspense because TopLoader reads useSearchParams, which opts its
            subtree out of prerendering. Bounded here, that costs a null
            fallback; unbounded, it would force every static page in the app
            to be client-rendered. */}
        <Suspense fallback={null}>
          <TopLoader />
        </Suspense>
        {/* Site-wide identity. Page-level schema (FAQ, Product) is added by
            the individual routes and references these by @id. */}
        <JsonLd data={[organizationSchema(), websiteSchema()]} />
        <Script
          defer
          data-domain="getanynumberonline.com"
          src="https://plausible.io/js/script.js"
        />
        {/* Google tag (gtag.js) — measurement IDs are public by design,
            hardcoded so analytics never depends on env wiring. */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-K2NM69XDDG"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-K2NM69XDDG');
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
