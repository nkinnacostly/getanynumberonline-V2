import Link from "next/link";
import { ArrowUpRight } from "./icons";

/**
 * Full-width closing CTA band before the footer — the deep-pine panel that
 * closes the light page. This is the biggest green-on-pine moment: mint
 * highlight words and a mint pill button on forest green.
 */
export default function CtaBand() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
      <div className="bg-pine rounded-lg px-6 sm:px-12 py-14 sm:py-20 text-center">
        <h2 className="font-sans text-3xl sm:text-5xl font-bold tracking-tight leading-[1.1] max-w-2xl mx-auto mb-4 text-paper">
          Stop losing signups to{" "}
          <span className="text-mint">VoIP blocks.</span>
        </h2>
        <p className="text-paper/65 text-base sm:text-lg max-w-xl mx-auto mb-10">
          Top up your wallet and receive your next verification code in
          seconds — on a real number, backed by an automatic refund.
        </p>
        <Link
          href="/auth"
          className="inline-flex items-center gap-2 min-h-[44px] px-7 bg-mint text-mint-ink font-semibold rounded-full hover:bg-mint/90 transition-colors text-sm"
        >
          Create your account
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}
