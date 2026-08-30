import type { MetadataRoute } from "next";
import { absoluteUrl, IS_PRODUCTION_DEPLOY } from "@/lib/seo/config";

export default function robots(): MetadataRoute.Robots {
  if (!IS_PRODUCTION_DEPLOY) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      // AI crawlers — allow full access so chatbots can index the product
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
      { userAgent: "Applebot-Extended", allow: "/" },
      { userAgent: "CCBot", allow: "/" },
      { userAgent: "Bytespider", allow: "/" },

      // General disallow for all other bots
      {
        userAgent: "*",
        // /auth is deliberately NOT here — it carries a noindex instead, set
        // in src/app/auth/layout.tsx. A blocked page that is linked from every
        // page in the nav can still be indexed URL-only; a crawlable one that
        // says noindex cannot.
        disallow: ["/dashboard", "/dashboard/", "/admin", "/admin/", "/api/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}