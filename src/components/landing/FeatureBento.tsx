import { Bolt, Calendar, Clock, SimIcon } from "./icons";

/**
 * Capability bento — 2×2 grid of product features with inline-SVG glyphs
 * and hover border lift (color only; the design system bans shadows).
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
        <h2 className="font-sans text-3xl sm:text-4xl font-bold tracking-tight text-[#F5F5F5] mb-3">
          Everything in{" "}
          <span className="text-[#00FF94]">one dashboard</span>
        </h2>
        <p className="text-[#555555] text-base">
          Order numbers, read codes, manage rentals and top up — without
          juggling tools.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-lg p-8 hover:border-[#333333] transition-colors"
          >
            <span className="inline-flex p-2.5 rounded-md bg-[#00FF94]/10 text-[#00FF94] mb-5">
              <f.icon className="w-5 h-5" />
            </span>
            <h3 className="font-sans text-lg font-bold text-[#F5F5F5] mb-2">
              {f.title}
            </h3>
            <p className="text-sm text-[#555555] leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
