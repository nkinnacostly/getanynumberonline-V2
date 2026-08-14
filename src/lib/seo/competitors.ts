/**
 * Comparison-page data.
 *
 * GROUND RULE: every claim in the "us" column is a verifiable fact about our
 * own product, taken from the live implementation. Every "them" value is
 * either neutral, publicly documented, or explicitly marked as needing
 * verification. Nothing here asserts a competitor is worse — stating a
 * specific competitor price or policy that turns out to be wrong is both a
 * legal problem and a trust problem, so those are left as TODOs for a human
 * to confirm rather than guessed at.
 */

export interface CompareRow {
  feature: string;
  /** Factual, sourced from our own implementation. */
  us: string;
  /** Neutral or documented. Never a negative claim we can't back up. */
  them: string;
}

export interface Competitor {
  slug: string;
  /** Display name as they write it. */
  name: string;
  /** One-sentence neutral description. */
  summary: string;
  /** Honest statement of who they suit better. */
  chooseThem: string;
  /** Honest statement of who we suit better. */
  chooseUs: string;
  rows: CompareRow[];
}

/** Facts about our own product, reused across every comparison table. */
const OURS = {
  numbers: "Real SIM-based numbers, sourced from physical SIMs",
  pricing: "Pay per SMS received. No subscription, no minimum monthly spend",
  refund: "Automatic refund to your wallet if no code arrives in the 20-minute window",
  session: "20 minutes per number, cancellable at any time before the code lands",
  topup: "Wallet top-up from $1, paid by card through Flutterwave",
  catalog: "1,300+ services across 150+ countries",
  extras: "Long-term number rentals and data eSIMs from the same wallet",
};

export const COMPETITORS: Competitor[] = [
  {
    slug: "sms-activate",
    name: "SMS-Activate",
    summary:
      "One of the largest and longest-running SMS verification marketplaces, with a very wide country and service catalogue and an established API.",
    chooseThem:
      "You need an unusual country or service that smaller providers don't carry, you're running high volume through an API, or you already have balance and tooling built around their platform.",
    chooseUs:
      "You want every number to be a real SIM rather than a mix, you'd rather not think about whether a refund will happen, or you also need long-term rentals and data eSIMs from one balance.",
    rows: [
      { feature: "Number type", us: OURS.numbers, them: "Mixed pool sourced from many providers; type varies by country and service" },
      { feature: "Pricing model", us: OURS.pricing, them: "Pay per activation, priced per service and country" },
      // TODO(verify): confirm SMS-Activate's current refund window and whether
      // it is automatic or requires opening the activation. Do not publish a
      // specific claim until checked against their live terms.
      { feature: "Refunds", us: OURS.refund, them: "Refund policy applies to unused activations — check their current terms for the exact window" },
      { feature: "Session length", us: OURS.session, them: "Varies by service; typically a fixed window per activation" },
      // TODO(verify): confirm current minimum top-up and accepted methods.
      { feature: "Minimum top-up", us: OURS.topup, them: "Multiple payment methods including crypto — confirm current minimum on their site" },
      { feature: "Catalogue", us: OURS.catalog, them: "Very large catalogue, generally wider than ours" },
      { feature: "Beyond SMS", us: OURS.extras, them: "Rentals available; check current eSIM availability" },
    ],
  },
  {
    slug: "5sim",
    name: "5SIM",
    summary:
      "A well-known SMS verification provider with a clean API, a developer-oriented dashboard and competitive pricing across popular services.",
    chooseThem:
      "You're integrating programmatically at scale and want a mature API, or you need a specific country where they hold better stock than we do.",
    chooseUs:
      "You want real-SIM numbers specifically for platforms that reject VoIP, prefer a browser dashboard over an API integration, or want eSIM data alongside verification.",
    rows: [
      { feature: "Number type", us: OURS.numbers, them: "Pooled numbers; type and quality vary by operator and country" },
      { feature: "Pricing model", us: OURS.pricing, them: "Pay per activation, with prices varying by service and country" },
      // TODO(verify): confirm 5SIM's refund mechanics before making any
      // comparative statement here.
      { feature: "Refunds", us: OURS.refund, them: "Unused activations are refundable — confirm the current mechanics on their site" },
      { feature: "Session length", us: OURS.session, them: "Fixed activation window, length varies by product" },
      // TODO(verify): confirm current minimum deposit.
      { feature: "Minimum top-up", us: OURS.topup, them: "Several deposit methods — confirm the current minimum on their site" },
      { feature: "Catalogue", us: OURS.catalog, them: "Broad service and country coverage" },
      { feature: "Beyond SMS", us: OURS.extras, them: "Focused primarily on SMS verification" },
    ],
  },
  {
    slug: "textverified",
    name: "TextVerified",
    summary:
      "A US-focused verification service known for non-VoIP American numbers and a subscription-style model aimed at longer-running use cases.",
    chooseThem:
      "You need US numbers specifically, want to hold the same number for an extended period, or prefer a predictable monthly bill over per-use pricing.",
    chooseUs:
      "You need countries outside the US, want to pay only for the codes you actually receive, or don't want a recurring subscription for occasional verifications.",
    rows: [
      { feature: "Number type", us: OURS.numbers, them: "Non-VoIP US numbers" },
      // TODO(verify): confirm TextVerified's current plan structure and prices
      // before describing them more specifically than this.
      { feature: "Pricing model", us: OURS.pricing, them: "Credit and subscription options — confirm current plans and prices on their site" },
      { feature: "Refunds", us: OURS.refund, them: "Refund terms depend on the plan — check their current policy" },
      { feature: "Session length", us: OURS.session, them: "Longer holds available, suited to extended use" },
      { feature: "Minimum top-up", us: OURS.topup, them: "Plan-based — confirm current entry price on their site" },
      { feature: "Catalogue", us: OURS.catalog, them: "Primarily US-focused coverage" },
      { feature: "Beyond SMS", us: OURS.extras, them: "Focused on verification and number rental" },
    ],
  },
];

export function findCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}
