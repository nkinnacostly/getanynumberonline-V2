import Image from "next/image";
import { Bolt, Chat, Check, Globe, Shield } from "./icons";

/**
 * Hero portrait composition after the Coursa-style reference: a human photo
 * masked into a slowly morphing organic blob (deep pine), with floating
 * product "bubbles" around it — each one tells one app story: code received,
 * number assigned, auto-refund, verified SIM. Photos are rectangular; the
 * blob mask is how the cutout-collage look is achieved without image editing.
 *
 * The portrait is a locally stored Unsplash photo (public/images/) — no
 * hotlinking, so the hero can never break on a third-party change.
 */

export default function HeroPortrait() {
  return (
    <div className="relative w-full max-w-sm sm:max-w-105 mx-auto">
      <div className="relative aspect-10/11">
        {/* Offset outline blob for depth (border only — no shadows allowed) */}
        <div
          aria-hidden="true"
          className="blob-shape absolute inset-0 translate-x-3 translate-y-3 border-2 border-pine/15"
        />

        {/* Pine blob with portrait */}
        <div className="blob-shape absolute inset-0 overflow-hidden bg-pine">
          <Image
            src="/images/hero-portrait.png"
            alt="Smiling man in a green cap looking toward his next verification"
            fill
            priority
            sizes="(max-width: 640px) 92vw, (max-width: 1024px) 480px, 420px"
            className="object-cover"
          />
        </div>

        {/* ── Floating bubbles ── */}

        {/* Code received */}
        <div className="floaty absolute -top-4 -left-2 sm:-left-10 z-10 flex items-center gap-2.5 bg-surface border border-line rounded-xl pl-2.5 pr-3.5 py-2.5">
          <span className="w-9 h-9 rounded-lg bg-accent text-accent-ink flex items-center justify-center shrink-0">
            <Bolt className="w-5 h-5" />
          </span>
          <span>
            <span className="block text-[13px] font-bold leading-tight text-foreground">
              Code received
            </span>
            <span className="block text-[11px] text-muted font-mono mt-0.5">
              just now
            </span>
          </span>
        </div>

        {/* Verified seal bubble */}
        <div
          className="floaty absolute top-[16%] -right-1 sm:-right-6 z-10 w-14 h-14 rounded-full bg-surface border border-line items-center justify-center hidden sm:flex"
          style={{ animationDelay: "2s" }}
        >
          <span className="w-9 h-9 rounded-full bg-pine flex items-center justify-center">
            <Check className="w-5 h-5 text-mint" />
          </span>
        </div>

        {/* Number assigned */}
        <div
          className="floaty absolute top-[46%] -right-2 sm:-right-8 z-10 flex items-center gap-2.5 bg-surface border border-line rounded-xl pl-2.5 pr-3.5 py-2.5"
          style={{ animationDelay: "0.8s" }}
        >
          <span className="w-9 h-9 rounded-lg bg-pine text-mint flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5" />
          </span>
          <span>
            <span className="block text-[13px] font-bold leading-tight text-foreground font-mono">
              +1 (415) 555-0182
            </span>
            <span className="block text-[11px] text-muted mt-0.5">
              assigned · real SIM
            </span>
          </span>
        </div>

        {/* Auto-refund chip */}
        <div
          className="floaty absolute bottom-[12%] -left-2 sm:-left-8 z-10 flex items-center gap-2 bg-pine text-paper rounded-xl px-3.5 py-2.5"
          style={{ animationDelay: "1.4s" }}
        >
          <Shield className="w-4 h-4 text-mint" />
          <span className="text-xs font-semibold whitespace-nowrap">
            Auto-refund
          </span>
        </div>

        {/* SMS chat bubble */}
        <div
          className="floaty absolute -bottom-4 right-6 sm:right-12 z-10 w-12 h-12 rounded-full bg-surface border border-line items-center justify-center hidden sm:flex"
          style={{ animationDelay: "2.6s" }}
        >
          <Chat className="w-6 h-6 text-accent" />
        </div>

        {/* Hand-drawn arrow doodle, like the reference */}
        <svg
          viewBox="0 0 120 80"
          aria-hidden="true"
          className="absolute -bottom-14 left-2 w-24 text-terracotta hidden sm:block"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 66 C 34 74, 64 64, 82 32" strokeDasharray="7 7" />
          <path d="M70 30 L83 31 L78 44" />
        </svg>
      </div>
    </div>
  );
}
