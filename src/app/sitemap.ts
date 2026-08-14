import type { MetadataRoute } from "next";
import { COUNTRIES, SERVICES } from "@/lib/seo/catalog";
import { absoluteUrl } from "@/lib/seo/config";
import { COMPETITORS } from "@/lib/seo/competitors";

/**
 * Only publicly indexable URLs belong here. /auth and /dashboard are excluded
 * deliberately — they're disallowed in robots.ts, and listing a blocked URL in
 * a sitemap is a Search Console error.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/pricing"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/terms"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/privacy"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const serviceRoutes: MetadataRoute.Sitemap = SERVICES.map((s) => ({
    url: absoluteUrl(`/receive-sms/${s.slug}`),
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const countryRoutes: MetadataRoute.Sitemap = COUNTRIES.map((c) => ({
    url: absoluteUrl(`/numbers/${c.slug}`),
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const compareRoutes: MetadataRoute.Sitemap = COMPETITORS.map((c) => ({
    url: absoluteUrl(`/compare/${c.slug}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...serviceRoutes, ...countryRoutes, ...compareRoutes];
}
