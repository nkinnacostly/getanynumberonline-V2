import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/seo/JsonLd";
import SiteFooter from "@/components/site/SiteFooter";
import SiteNav from "@/components/site/SiteNav";
import { COMPETITORS, type Competitor, findCompetitor } from "@/lib/seo/competitors";
import { SITE_NAME } from "@/lib/seo/config";
import { breadcrumbSchema } from "@/lib/seo/jsonld";

export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ competitor: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ competitor: string }>;
}): Promise<Metadata> {
  const { competitor: slug } = await params;
  const rival = findCompetitor(slug);
  if (!rival) return {};

  const title = `${SITE_NAME} vs ${rival.name} — Honest Comparison`;
  const description = `How ${SITE_NAME} and ${rival.name} compare on number type, pricing, refunds and coverage — including when ${rival.name} is the better choice.`;

  return {
    title,
    description,
    alternates: { canonical: `/compare/${rival.slug}` },
    openGraph: {
      title,
      description,
      url: `/compare/${rival.slug}`,
      type: "article",
    },
  };
}

function ComparisonTable({ rival }: { rival: Competitor }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="sr-only">
          Feature comparison between {SITE_NAME} and {rival.name}
        </caption>
        <thead>
          <tr className="border-b border-[#1A1A1A]">
            <th scope="col" className="text-left py-3 pr-4 font-mono text-xs uppercase tracking-wider text-[#555555] w-40">
              Feature
            </th>
            <th scope="col" className="text-left py-3 pr-4 font-sans font-bold text-[#00FF94]">
              {SITE_NAME}
            </th>
            <th scope="col" className="text-left py-3 font-sans font-bold text-[#F5F5F5]">
              {rival.name}
            </th>
          </tr>
        </thead>
        <tbody>
          {rival.rows.map((row) => (
            <tr key={row.feature} className="border-b border-[#1A1A1A]/60 align-top">
              <th scope="row" className="text-left py-4 pr-4 font-mono text-xs text-[#555555] font-normal">
                {row.feature}
              </th>
              <td className="py-4 pr-4 text-[#F5F5F5] leading-relaxed">{row.us}</td>
              <td className="py-4 text-[#555555] leading-relaxed">{row.them}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ComparePage({
  params,
}: {
  params: Promise<{ competitor: string }>;
}) {
  const { competitor: slug } = await params;
  const rival = findCompetitor(slug);
  if (!rival) notFound();

  const others = COMPETITORS.filter((c) => c.slug !== rival.slug);

  return (
    <div className="min-h-screen bg-[#080808] text-[#F5F5F5]">
      <SiteNav />

      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Compare", path: `/compare/${rival.slug}` },
          { name: rival.name, path: `/compare/${rival.slug}` },
        ])}
      />

      <main>
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-10">
          <nav aria-label="Breadcrumb" className="mb-6 font-mono text-xs text-[#555555]">
            <Link href="/" className="hover:text-[#00FF94]">Home</Link>
            <span className="mx-2">/</span>
            <span className="text-[#F5F5F5]">vs {rival.name}</span>
          </nav>

          <h1 className="font-sans text-4xl sm:text-5xl font-bold tracking-tight mb-5 leading-[1.1]">
            {SITE_NAME} vs {rival.name}
          </h1>

          <p className="text-[#555555] text-base sm:text-lg leading-relaxed max-w-2xl">
            {rival.summary} Both services solve the same problem, so this page
            sets out the differences plainly — including where {rival.name} is
            the better pick.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
          <h2 className="font-sans text-2xl font-bold mb-6">Side by side</h2>
          <ComparisonTable rival={rival} />
          <p className="text-xs text-[#555555] mt-6 leading-relaxed">
            Details in the {SITE_NAME} column reflect how our service works
            today. Details in the {rival.name} column are drawn from their
            public documentation and are summarised in general terms — check
            their site for current pricing and policies, which can change
            without notice.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-lg p-6">
              <h2 className="font-sans text-lg font-bold mb-3">
                When {rival.name} is the better choice
              </h2>
              <p className="text-sm text-[#555555] leading-relaxed">{rival.chooseThem}</p>
            </div>
            <div className="bg-[#0F0F0F] border border-[#00FF94]/20 rounded-lg p-6">
              <h2 className="font-sans text-lg font-bold mb-3">
                When {SITE_NAME} is the better choice
              </h2>
              <p className="text-sm text-[#555555] leading-relaxed">{rival.chooseUs}</p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#00FF94] text-[#080808] font-semibold rounded-md hover:bg-[#00FF94]/90 transition-colors text-sm"
            >
              Try {SITE_NAME}&nbsp;&rarr;
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 border border-[#333333] text-[#F5F5F5] rounded-md hover:border-[#555555] transition-colors text-sm"
            >
              See our pricing
            </Link>
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
          <h2 className="font-sans text-lg font-bold mb-4">Other comparisons</h2>
          <div className="flex flex-wrap gap-2">
            {others.map((c) => (
              <Link
                key={c.slug}
                href={`/compare/${c.slug}`}
                className="font-mono text-xs px-3 py-2 rounded-md border border-[#1A1A1A] bg-[#0F0F0F] text-[#555555] hover:text-[#00FF94] hover:border-[#00FF94]/40 transition-colors"
              >
                vs {c.name}
              </Link>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
