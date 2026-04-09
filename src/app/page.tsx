import Link from "next/link";
import HeroCard from "@/components/landing/HeroCard";
import ServiceTicker from "@/components/landing/ServiceTicker";

export default function Home() {
  const steps = [
    {
      num: "01",
      label: "Choose service + country",
      desc: "Pick from 500+ services across 50+ countries.",
    },
    {
      num: "02",
      label: "Get your number",
      desc: "A real SIM-based number assigned in under 3 seconds.",
    },
    {
      num: "03",
      label: "Receive your code",
      desc: "OTP appears live in your dashboard. Copy and done.",
    },
  ];

  const pricingRows = [
    {
      service: "Google verification",
      country: "United States",
      price: "$0.15",
    },
    {
      service: "WhatsApp activation",
      country: "United Kingdom",
      price: "$0.22",
    },
    { service: "Telegram sign-in", country: "India", price: "$0.08" },
  ];

  const simCompare = [
    { platform: "Telegram", voip: false, sim: true },
    { platform: "Tinder", voip: false, sim: true },
    { platform: "Google", voip: false, sim: true },
  ];

  const barHeights = [60, 85, 70, 94, 78, 88, 92];

  const avatarInitials = [
    { letter: "A", bg: "#00FF94" },
    { letter: "K", bg: "#0ea5e9" },
    { letter: "R", bg: "#f59e0b" },
    { letter: "M", bg: "#ef4444" },
  ];

  return (
    <div className="min-h-screen bg-[#080808] text-[#F5F5F5]">
      {/* ─── Navbar ─── */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-[#080808]/80 border-b border-[#1A1A1A]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 font-mono text-sm text-[#F5F5F5]"
          >
            <span className="text-[#00FF94]">&#x2588;</span>
            getnumber
          </Link>

          <div className="flex items-center gap-6">
            <Link
              href="/auth"
              className="text-sm text-[#555555] hover:text-[#F5F5F5] transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/auth"
              className="text-sm font-medium text-[#00FF94] border border-[#00FF94]/30 hover:border-[#00FF94] rounded-md px-4 py-1.5 transition-colors"
            >
              Get started&nbsp;&rarr;
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 md:pt-20 md:pb-28">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-16">
          {/* Left */}
          <div className="flex-1 max-w-xl">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 mb-8 px-3 py-1 rounded-full border border-[#00FF94]/20 bg-[#00FF94]/5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00FF94]" />
              <span className="font-mono text-xs text-[#00FF94]">
                Real SIM cards&nbsp;&bull;&nbsp;Not VoIP
              </span>
            </div>

            <h1 className="font-sans text-5xl sm:text-6xl md:text-7xl font-800 leading-[1.05] tracking-tight mb-6">
              Verify anything.
              <br />
              <span className="text-[#00FF94]">Instantly.</span>
            </h1>

            <p className="text-[#555555] text-base sm:text-lg max-w-md mb-10">
              Temporary phone numbers for SMS verification. Real SIM cards,
              instant delivery, pay only when you receive a code.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 mb-10">
              <Link
                href="/auth"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#00FF94] text-[#080808] font-semibold rounded-md hover:bg-[#00FF94]/90 transition-colors text-sm"
              >
                Get a number&nbsp;&rarr;
              </Link>
              <a
                href="#pricing"
                className="inline-flex items-center justify-center px-6 py-3 border border-[#333333] text-[#F5F5F5] rounded-md hover:border-[#555555] transition-colors text-sm"
              >
                See pricing
              </a>
            </div>

            {/* Social proof */}
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {avatarInitials.map((a, i) => (
                  <div
                    key={i}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-[#080808] ring-2 ring-[#080808]"
                    style={{ backgroundColor: a.bg }}
                  >
                    {a.letter}
                  </div>
                ))}
              </div>
              <span className="text-xs text-[#555555]">
                Trusted by 2,400+ developers
              </span>
            </div>
          </div>

          {/* Right — Hero Card */}
          <div className="flex-shrink-0 lg:flex-shrink lg:max-w-md w-full">
            <HeroCard />
          </div>
        </div>
      </section>

      {/* ─── Ticker ─── */}
      <div className="mt-20">
        <ServiceTicker />
      </div>

      {/* ─── How it works ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#1A1A1A]">
          {steps.map((step) => (
            <div
              key={step.num}
              className="px-0 md:px-8 first:pl-0 last:pr-0 py-6 md:py-0"
            >
              <span className="font-mono text-[#00FF94] text-xs mb-4 block font-light">
                {step.num}
              </span>
              <h3 className="font-sans text-lg font-bold text-[#F5F5F5] mb-2">
                {step.label}
              </h3>
              <p className="text-sm text-[#555555] leading-relaxed">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Feature highlights — asymmetric grid ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        {/* Row 1 */}
        <div className="grid md:grid-cols-3 gap-4 mb-4">
          {/* Large card (2/3) */}
          <div className="md:col-span-2 bg-[#0F0F0F] border border-[#1A1A1A] rounded-lg p-8">
            <h3 className="font-sans text-xl font-bold text-[#F5F5F5] mb-2">
              Real SIM cards, not VoIP
            </h3>
            <p className="text-sm text-[#555555] mb-6 max-w-md">
              Most services now block VoIP numbers. Our numbers come from real
              SIM cards in real phones, so they pass even the strictest platform
              checks.
            </p>

            {/* Comparison table */}
            <div className="font-mono text-xs">
              <div className="grid grid-cols-3 gap-4 pb-2 mb-2 border-b border-[#1A1A1A] text-[#555555]">
                <span>platform</span>
                <span className="text-center">VoIP</span>
                <span className="text-center">Real SIM</span>
              </div>
              {simCompare.map((row) => (
                <div
                  key={row.platform}
                  className="grid grid-cols-3 gap-4 py-2 border-b border-[#1A1A1A]/50"
                >
                  <span className="text-[#F5F5F5]">{row.platform}</span>
                  <span className="text-center text-red-500">&times;</span>
                  <span className="text-center text-[#00FF94]">&check;</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tall card (1/3) — success rate */}
          <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-lg p-8 flex flex-col justify-between">
            <div>
              <span className="font-mono text-5xl font-medium text-[#00FF94]">
                94%
              </span>
              <p className="text-sm text-[#555555] mt-2">
                average success rate
              </p>
            </div>

            {/* Sparkline bars */}
            <div className="flex items-end gap-1.5 mt-8 h-16">
              {barHeights.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-[#00FF94]/20 rounded-sm"
                  style={{ height: `${h}%` }}
                >
                  <div
                    className="w-full bg-[#00FF94] rounded-sm"
                    style={{ height: `${Math.min(h + 5, 100)}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2 */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-lg p-8">
            <h3 className="font-sans text-lg font-bold text-[#F5F5F5] mb-2">
              Pay per use, no subscriptions
            </h3>
            <p className="text-sm text-[#555555] leading-relaxed">
              Top up your wallet with any amount. You only pay when a number is
              assigned. If no SMS is received, you get an automatic refund.
            </p>
          </div>
          <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-lg p-8">
            <h3 className="font-sans text-lg font-bold text-[#F5F5F5] mb-2">
              20-minute sessions with auto-refund
            </h3>
            <p className="text-sm text-[#555555] leading-relaxed">
              Each number stays active for 20 minutes. Cancel anytime before the
              code arrives and your balance is instantly restored. Zero risk.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section
        id="pricing"
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24"
      >
        <div className="max-w-2xl mx-auto text-center mb-12">
          <h2 className="font-sans text-3xl sm:text-4xl font-bold text-[#F5F5F5] mb-3">
            No surprises.
          </h2>
          <p className="text-[#555555] text-base">
            You only pay when an SMS is received. Nothing else.
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          {pricingRows.map((row, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-4 border-b border-[#1A1A1A] font-mono text-sm"
            >
              <span className="text-[#F5F5F5]">{row.service}</span>
              <span className="text-[#555555] hidden sm:block">
                {row.country}
              </span>
              <span className="text-[#00FF94]">{row.price}</span>
            </div>
          ))}

          <p className="text-xs text-[#555555] mt-6 text-center">
            Prices vary by service and country. You always see the price before
            you pay.
          </p>

          <div className="text-center mt-8">
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 text-sm text-[#00FF94] border border-[#00FF94]/30 hover:border-[#00FF94] rounded-md px-5 py-2 transition-colors font-medium"
            >
              View all pricing&nbsp;&rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-[#1A1A1A]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link href="/" className="font-mono text-sm text-[#555555]">
              <span className="text-[#00FF94]">&#x2588;</span> getnumber
            </Link>
            <div className="flex items-center gap-6 text-xs text-[#555555]">
              <Link
                href="/terms"
                className="hover:text-[#F5F5F5] transition-colors"
              >
                Terms
              </Link>
              <Link
                href="/privacy"
                className="hover:text-[#F5F5F5] transition-colors"
              >
                Privacy
              </Link>
              <a href="#" className="hover:text-[#F5F5F5] transition-colors">
                API Docs
              </a>
            </div>
          </div>
          <div className="text-center sm:text-left mt-4 text-xs text-[#555555]/60">
            &copy; {new Date().getFullYear()} getnumber. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
