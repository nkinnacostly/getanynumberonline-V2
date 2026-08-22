import Link from "next/link";
import { ArrowUpRight } from "./icons";

/**
 * Full-width closing CTA band before the footer — the "Fight Fraud …"
 * panel of the reference layout. One rounded surface, oversized claim,
 * single action.
 */
export default function CtaBand() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
      <div className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-lg px-6 sm:px-12 py-14 sm:py-20 text-center">
        <h2 className="font-sans text-3xl sm:text-5xl font-bold tracking-tight leading-[1.1] max-w-2xl mx-auto mb-4">
          Stop losing signups to{" "}
          <span className="text-[#00FF94]">VoIP blocks.</span>
        </h2>
        <p className="text-[#555555] text-base sm:text-lg max-w-xl mx-auto mb-10">
          Top up your wallet and receive your next verification code in
          seconds — on a real number, backed by an automatic refund.
        </p>
        <Link
          href="/auth"
          className="inline-flex items-center gap-2 min-h-[44px] px-7 bg-[#00FF94] text-[#080808] font-semibold rounded-md hover:bg-[#00FF94]/90 transition-colors text-sm"
        >
          Create your account
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}
