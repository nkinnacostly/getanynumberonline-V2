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
        disallow: ["/auth", "/auth/", "/dashboard", "/dashboard/", "/api/", "/esim/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}