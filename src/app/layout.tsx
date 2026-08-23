import type { Metadata } from "next";
import { Syne, DM_Mono } from "next/font/google";
import Script from "next/script";
import JsonLd from "@/components/seo/JsonLd";
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
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Site-wide identity. Page-level schema (FAQ, Product) is added by
            the individual routes and references these by @id. */}
        <JsonLd data={[organizationSchema(), websiteSchema()]} />
        <Script
          defer
          data-domain="getanynumberonline.com"
          src="https://plausible.io/js/script.js"
        />
        {children}
      </body>
    </html>
  );
}
