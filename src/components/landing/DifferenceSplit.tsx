import { Check, Cross, Refresh, Shield } from "./icons";

/**
 * "What makes us different" split on the light surface — comparison table in
 * a white card on the left, claim + supporting points on the right. Icon
 * chips are pine tiles carrying the mint accent (green-on-pine rule).
 */

const SIM_COMPARE = [
  { platform: "Telegram" },
  { platform: "Tinder" },
  { platform: "Google" },
  { platform: "WhatsApp" },
];

const POINTS = [
  {
    icon: Shield,
    title: "Passes strict platform checks",
    desc: "Numbers are tied to physical carrier lines, so lookup databases read them as ordinary mobile numbers — not flagged VoIP ranges.",
  },
  {
    icon: Refresh,
    title: "Zero-risk pricing",
    desc: "If no code arrives within 20 minutes, your wallet is refunded automatically. You can also cancel before delivery for an instant restore.",
  },
];

export default function DifferenceSplit() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* Left — comparison mock */}
        <div className="bg-surface border border-line rounded-lg p-8">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-6">
            platform checks
          </span>
          <div className="font-mono text-xs">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 pb-2 mb-2 border-b border-line text-muted">
              <span>platform</span>
              <span className="w-16 text-center">VoIP</span>
              <span className="w-16 text-center">real sim</span>
            </div>
            {SIM_COMPARE.map((row) => (
              <div
                key={row.platform}
                className="grid grid-cols-[1fr_auto_auto] gap-x-6 py-3 border-b border-line/60 last:border-0"
              >
                <span className="text-foreground">{row.platform}</span>
                <span className="w-16 flex justify-center text-danger">
                  <Cross className="w-4 h-4" />
                </span>
                <span className="w-16 flex justify-center text-accent">
                  <Check className="w-4 h-4" />
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted mt-6 leading-relaxed">
            Most verification platforms block VoIP ranges outright. Real SIM
            numbers clear the same checks.
          </p>
        </div>

        {/* Right — claim + points */}
        <div>
          <h2 className="font-sans text-3xl sm:text-4xl font-bold leading-tight tracking-tight text-foreground mb-4">
            What makes us{" "}
            <span className="text-accent">different</span> from VoIP
            sites
          </h2>
          <p className="text-muted text-base leading-relaxed mb-10 max-w-md">
            Typical temp-number services resell internet-generated ranges.
            Every number here comes from a physical SIM card in a real device
            on a mobile network.
          </p>

          <div className="space-y-8">
            {POINTS.map((p) => (
              <div key={p.title} className="flex items-start gap-4">
                <span className="p-2.5 rounded-lg bg-pine text-mint shrink-0">
                  <p.icon className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-sans text-base font-bold text-foreground mb-1">
                    {p.title}
                  </h3>
                  <p className="text-sm text-muted leading-relaxed max-w-md">
                    {p.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
