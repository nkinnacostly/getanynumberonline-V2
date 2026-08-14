import type { MetadataRoute } from "next";
import { absoluteUrl, IS_PRODUCTION_DEPLOY } from "@/lib/seo/config";

/**
 * Non-production deployments disallow everything. Belt and braces with the
 * noindex meta tag from ROBOTS_META: robots.txt stops the crawl, the meta tag
 * handles anything already discovered via an external link.
 */
export default function robots(): MetadataRoute.Robots {
  if (!IS_PRODUCTION_DEPLOY) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Authenticated surfaces: nothing crawlable, and we don't want the
        // sign-in page competing with the marketing pages.
        disallow: ["/auth", "/auth/", "/dashboard", "/dashboard/", "/api/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
