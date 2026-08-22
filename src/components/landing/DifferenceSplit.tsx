import { Check, Cross, Refresh, Shield } from "./icons";

/**
 * "What makes us different" split — comparison table on the left, claim +
 * supporting points on the right, mirroring modern two-column differentiator
 * sections. The table data is static and matches what platforms actually
 * reject; nothing here is fetched at render time.
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
        <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-lg p-8">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#555555] block mb-6">
            platform checks
          </span>
          <div className="font-mono text-xs">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 pb-2 mb-2 border-b border-[#1A1A1A] text-[#555555]">
              <span>platform</span>
              <span className="w-16 text-center">VoIP</span>
              <span className="w-16 text-center">real sim</span>
            </div>
            {SIM_COMPARE.map((row) => (
              <div
                key={row.platform}
                className="grid grid-cols-[1fr_auto_auto] gap-x-6 py-3 border-b border-[#1A1A1A]/50 last:border-0"
              >
                <span className="text-[#F5F5F5]">{row.platform}</span>
                <span className="w-16 flex justify-center text-[#FF4444]">
                  <Cross className="w-4 h-4" />
                </span>
                <span className="w-16 flex justify-center text-[#00FF94]">
                  <Check className="w-4 h-4" />
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#555555] mt-6 leading-relaxed">
            Most verification platforms block VoIP ranges outright. Real SIM
            numbers clear the same checks.
          </p>
        </div>

        {/* Right — claim + points */}
        <div>
          <h2 className="font-sans text-3xl sm:text-4xl font-bold leading-tight tracking-tight text-[#F5F5F5] mb-4">
            What makes us{" "}
            <span className="text-[#00FF94]">different</span> from VoIP
            sites
          </h2>
          <p className="text-[#555555] text-base leading-relaxed mb-10 max-w-md">
            Typical temp-number services resell internet-generated ranges.
            Every number here comes from a physical SIM card in a real device
            on a mobile network.
          </p>

          <div className="space-y-8">
            {POINTS.map((p) => (
              <div key={p.title} className="flex items-start gap-4">
                <span className="p-2.5 rounded-md bg-[#00FF94]/10 text-[#00FF94] shrink-0">
                  <p.icon className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-sans text-base font-bold text-[#F5F5F5] mb-1">
                    {p.title}
                  </h3>
                  <p className="text-sm text-[#555555] leading-relaxed max-w-md">
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
