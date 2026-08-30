import Link from "next/link";
import Logo from "@/components/site/Logo";

interface AuthCardProps {
  children: React.ReactNode;
}

/** Grid texture — hairline grid derived from the foreground so it stays
    visible-but-subtle in both themes (white lines vanish on light). */
const GRID_LINE = "color-mix(in srgb, var(--foreground) 4%, transparent)";

export default function AuthCard({ children }: AuthCardProps) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{
        backgroundColor: "var(--background)",
        backgroundImage: `linear-gradient(${GRID_LINE} 1px, transparent 1px), linear-gradient(90deg, ${GRID_LINE} 1px, transparent 1px)`,
        backgroundSize: "40px 40px",
      }}
    >
      {/* Logo — top-left fixed */}
      <div className="fixed top-0 left-0 p-5">
        <Link href="/" aria-label="GetAnyNumberOnline home">
          <Logo className="h-9 w-auto text-accent" />
        </Link>
      </div>

      {/* Card */}
      <div className="w-full" style={{ maxWidth: 420 }}>
        <div
          className="p-8"
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--line-strong)",
            borderRadius: 8,
          }}
        >
          {children}
        </div>
      </div>

      {/* Legal — single copy below the card */}
      <p className="mt-6 text-[11px] text-muted text-center max-w-xs">
        By continuing you agree to our{" "}
        <Link
          href="/terms"
          className="text-accent/80 hover:text-accent transition-colors"
        >
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link
          href="/privacy"
          className="text-accent/80 hover:text-accent transition-colors"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
