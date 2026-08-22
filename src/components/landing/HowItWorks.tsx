import { ArrowRight } from "./icons";

/**
 * Three-step onboarding strip. Numbers stay in DM Mono per the design
 * system; steps are separated by hairline dividers that collapse to a
 * stacked list on mobile.
 */

const STEPS = [
  {
    num: "01",
    label: "Choose service + country",
    desc: "Pick from 1,300+ services across 150+ countries.",
  },
  {
    num: "02",
    label: "Get your number",
    desc: "A real SIM-based number assigned in under 3 seconds.",
  },
  {
    num: "03",
    label: "Receive your code",
    desc: "The OTP appears live in your dashboard. Copy and done.",
  },
];

export default function HowItWorks() {
  return (
    <section
      aria-label="How it works"
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24"
    >
      <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#1A1A1A] border-t border-b border-[#1A1A1A]">
        {STEPS.map((step) => (
          <div
            key={step.num}
            className="flex items-start gap-4 px-0 md:px-8 first:md:pl-0 last:md:pr-0 py-8"
          >
            <span className="font-mono text-xs text-[#00FF94] border border-[#00FF94]/25 rounded-md w-10 h-10 shrink-0 flex items-center justify-center">
              {step.num}
            </span>
            <div>
              <h3 className="font-sans text-base font-bold text-[#F5F5F5] mb-1">
                {step.label}
              </h3>
              <p className="text-sm text-[#555555] leading-relaxed">
                {step.desc}
              </p>
            </div>
            <ArrowRight
              className="w-5 h-5 text-[#333333] ml-auto hidden md:block shrink-0 self-center"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
