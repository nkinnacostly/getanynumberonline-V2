import { ArrowUpRight } from "./icons";

/**
 * Proof band under the hero — three oversized mono numerals in bordered
 * cards, echoing the "$20B / 80% / 10x" stat trio of modern bento layouts.
 * The middle card is inverted (light) to break the grid, like the reference.
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
    inverted: true,
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
              s.inverted
                ? "bg-[#F5F5F5] text-[#080808]"
                : "bg-[#0F0F0F] border border-[#1A1A1A]"
            }`}
          >
            <span
              className={`self-end p-2 rounded-md border ${
                s.inverted
                  ? "border-[#080808]/15 text-[#080808]"
                  : "border-[#1A1A1A] text-[#555555]"
              }`}
              aria-hidden="true"
            >
              <ArrowUpRight className="w-4 h-4" />
            </span>

            <span className="font-mono text-5xl mt-auto">
              {s.value}
            </span>
            <span
              className={`text-sm font-semibold mt-1 ${
                s.inverted ? "text-[#080808]" : "text-[#F5F5F5]"
              }`}
            >
              {s.label}
            </span>
            <span
              className={`text-[13px] leading-relaxed mt-2 ${
                s.inverted ? "text-[#080808]/60" : "text-[#555555]"
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
