/**
 * Canonical site identity. Every URL in metadata, sitemap, robots and JSON-LD
 * derives from SITE_URL — nothing hardcodes a hostname, which is how the
 * og:url ended up pointing at the vercel.app preview domain.
 */

export const SITE_URL = "https://www.getanynumberonline.com";

/** Brand name used in all metadata, schema and legal copy. */
export const SITE_NAME = "GetAnyNumberOnline";

export const SITE_TAGLINE = "Temporary Phone Numbers for SMS Verification";

export const SITE_DESCRIPTION =
  "Get real SIM-based temporary phone numbers instantly. Receive SMS verification codes for 1,300+ services across 150+ countries. Pay only when a code arrives — automatic refund if it doesn't.";

/** Absolute URL for a site-relative path. */
export function absoluteUrl(path = "/"): string {
  return new URL(path, SITE_URL).toString();
}

/**
 * Preview and development deployments must never be indexed — that is how a
 * *.vercel.app subdomain ends up competing with the real domain in search
 * results. Only VERCEL_ENV === 'production' is indexable.
 *
 * NOTE: VERCEL_ENV is a build-time server variable. It is undefined locally,
 * which correctly yields noindex for `next dev` / `next start`.
 */
export const IS_PRODUCTION_DEPLOY = process.env.VERCEL_ENV === "production";

export const ROBOTS_META = IS_PRODUCTION_DEPLOY
  ? {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large" as const,
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    }
  : { index: false, follow: false, nocache: true };
