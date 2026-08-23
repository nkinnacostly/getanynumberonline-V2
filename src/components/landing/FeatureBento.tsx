import { Bolt, Calendar, Clock, SimIcon } from "./icons";

/**
 * Capability bento on the light surface — 2×2 white cards with pine icon
 * tiles carrying the mint accent, and a border-color hover (no shadows).
 */

const FEATURES = [
  {
    icon: SimIcon,
    title: "Real SIM inventory",
    desc: "Numbers come from physical SIM cards on mobile carriers, so they pass even strict VoIP-blocking verification flows.",
  },
  {
    icon: Bolt,
    title: "Pay per use",
    desc: "Top up your wallet with any amount and pay only when a number is assigned. No subscriptions, no expiry on your balance.",
  },
  {
    icon: Clock,
    title: "20-minute sessions, auto-refund",
    desc: "Every session stays live for 20 minutes. If no SMS lands, the refund is automatic — no tickets, no support queue.",
  },
  {
    icon: Calendar,
    title: "Rentals & eSIM data",
    desc: "Keep a number long-term for repeat logins, or install a data-only eSIM for your next trip — both from the same dashboard.",
  },
];

export default function FeatureBento() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
      <div className="max-w-2xl mb-12">
        <h2 className="font-sans text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-3">
          Everything in{" "}
          <span className="text-accent">one dashboard</span>
        </h2>
        <p className="text-muted text-base">
          Order numbers, read codes, manage rentals and top up — without
          juggling tools.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="bg-surface border border-line rounded-lg p-8 hover:border-line-strong transition-colors"
          >
            <span className="inline-flex p-2.5 rounded-lg bg-pine text-mint mb-5">
              <f.icon className="w-5 h-5" />
            </span>
            <h3 className="font-sans text-lg font-bold text-foreground mb-2">
              {f.title}
            </h3>
            <p className="text-sm text-muted leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
