/**
 * Structured-data builders. Every @id and url routes through absoluteUrl so
 * schema can never disagree with the canonical tags.
 */

import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo/config";

export interface FaqItem {
  question: string;
  answer: string;
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/icon.svg"),
    },
    description: SITE_DESCRIPTION,
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

export function faqSchema(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/**
 * Product + Offer for a priced thing. `lowPrice` drives the rich result, so it
 * must be the real marked-up price the customer pays — never the wholesale one.
 */
export function productSchema(opts: {
  name: string;
  description: string;
  path: string;
  lowPrice: number;
  highPrice?: number;
  offerCount?: number;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.path),
    brand: { "@type": "Brand", name: SITE_NAME },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: opts.lowPrice.toFixed(2),
      ...(opts.highPrice ? { highPrice: opts.highPrice.toFixed(2) } : {}),
      ...(opts.offerCount ? { offerCount: opts.offerCount } : {}),
      availability: "https://schema.org/InStock",
      url: absoluteUrl(opts.path),
    },
  };
}
