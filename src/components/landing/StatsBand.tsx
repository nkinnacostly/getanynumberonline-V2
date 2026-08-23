import { ArrowUpRight } from "./icons";

/**
 * Proof band under the hero — three oversized mono numerals. The middle
 * card is the deep-pine showcase: it is the sanctioned surface that the
 * electric-green accent sits on (mint on pine, never mint on light).
 */

const STATS = [
  {
    value: "1,300+",
    label: "services supported",
    note: "From WhatsApp and Telegram to OpenAI — pick a service, get a number.",
  },
  {
    value: "94%",
    label: "average success rate",
    note: "Codes typically land within seconds of requesting the number.",
    pine: true,
  },
  {
    value: "<3s",
    label: "median assignment",
    note: "A fresh real-SIM number is assigned almost the moment you order.",
  },
];

export default function StatsBand() {
  return (
    <section
      aria-label="Key numbers"
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24"
    >
      <div className="grid md:grid-cols-3 gap-4">
        {STATS.map((s) => (
          <div
            key={s.label}
            className={`rounded-lg p-8 flex flex-col min-h-[220px] ${
              s.pine
                ? "bg-pine"
                : "bg-surface border border-line"
            }`}
          >
            <span
              className={`self-end p-2 rounded-full border ${
                s.pine
                  ? "border-paper/20 text-mint"
                  : "border-line text-muted"
              }`}
              aria-hidden="true"
            >
              <ArrowUpRight className="w-4 h-4" />
            </span>

            <span
              className={`font-mono text-5xl mt-auto ${
                s.pine ? "text-mint" : "text-foreground"
              }`}
            >
              {s.value}
            </span>
            <span
              className={`text-sm font-semibold mt-1 ${
                s.pine ? "text-paper" : "text-foreground"
              }`}
            >
              {s.label}
            </span>
            <span
              className={`text-[13px] leading-relaxed mt-2 ${
                s.pine ? "text-paper/60" : "text-muted"
              }`}
            >
              {s.note}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
