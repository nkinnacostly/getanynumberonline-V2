export const revalidate = 86400;

/**
 * llms.txt — the emerging standard for LLM crawler discoverability.
 * Served at /llms.txt so AI chatbots can find site identity, content
 * categories, and contact info without executing JavaScript.
 */
export async function GET() {
  const body = [
    "@context: https://llms.txt/context.json",
    `Site: gottenynumberonline.com`,
    `Title: GetAnyNumberOnline`,
    `Description: Get real SIM-based temporary phone numbers instantly. Receive SMS verification codes for 1,300+ services across 150+ countries. Pay only when a code arrives — automatic refund if it doesn't.`,
    `Sections: SMS Verification Numbers, eSIM Data Plans, Competitor Comparisons, Temporary Numbers`,
    `Contact: support@getanynumberonline.com`,
    `License: MIT`,
    `Verified: 2026-08-25`,
  ];

  return new Response(body.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate",
    },
  });
}