import HeroCard from "./HeroCard";
import { Shield } from "./icons";

/**
 * Right-hand hero collage — a small bento cluster in the style of modern
 * SaaS landings: one product mock (the live session card), one accent tile,
 * one stat tile, and a slowly rotating seal. Pure CSS animation only; the
 * session timer is the sole client island (inside HeroCard).
 */

const EQ_BARS = [38, 62, 90, 55, 78, 44, 68];

function RotatingSeal() {
  return (
    <div className="relative w-20 h-20 shrink-0" aria-hidden="true">
      <svg viewBox="0 0 100 100" className="badge-spin w-full h-full">
        <defs>
          <path
            id="seal-circle"
            d="M 50,50 m -38,0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0"
          />
        </defs>
        <text
          className="font-mono"
          fontSize="10.5"
          letterSpacing="2.5"
          fill="#555555"
        >
          <textPath href="#seal-circle">REAL SIM • NOT VOIP •</textPath>
        </text>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <Shield className="w-5 h-5 text-[#00FF94]" />
      </span>
    </div>
  );
}

export default function HeroCollage() {
  return (
    <div className="w-full flex flex-col gap-3">
      {/* Row A — promise chip + rotating seal */}
      <div className="flex items-stretch gap-3">
        <div className="flex-1 bg-[#F5F5F5] text-[#080808] rounded-lg p-4 flex items-center gap-3">
          <Shield className="w-6 h-6 shrink-0" />
          <p className="text-[13px] leading-snug font-medium">
            No code delivered?{" "}
            <span className="font-bold">Auto-refund.</span>
          </p>
        </div>
        <RotatingSeal />
      </div>

      {/* Row B — live session mock (client island: countdown timer) */}
      <HeroCard />

      {/* Row C — accent feed tile + stat tile */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#00FF94] text-[#080808] rounded-lg p-4 overflow-hidden">
          <span className="font-mono text-[11px] uppercase tracking-wider block mb-3">
            live sms feed
          </span>
          <div className="flex items-end gap-1 h-10" aria-hidden="true">
            {EQ_BARS.map((h, i) => (
              <span
                key={i}
                className="eq-bar flex-1 bg-[#080808]/85 rounded-sm"
                style={{ height: `${h}%`, animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>

        <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-lg p-4 flex flex-col justify-between">
          <span className="font-mono text-3xl text-[#00FF94]">94%</span>
          <span className="text-xs text-[#555555] leading-snug">
            codes delivered on the first try
          </span>
        </div>
      </div>
    </div>
  );
}
