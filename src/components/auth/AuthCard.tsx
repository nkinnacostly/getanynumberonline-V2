import Link from "next/link";

interface AuthCardProps {
  children: React.ReactNode;
}

/** Grid texture — line color at 3% white max so it stays subtle on #080808 */
const GRID_LINE = "rgba(255,255,255,0.03)";

export default function AuthCard({ children }: AuthCardProps) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{
        backgroundColor: "#080808",
        backgroundImage: `linear-gradient(${GRID_LINE} 1px, transparent 1px), linear-gradient(90deg, ${GRID_LINE} 1px, transparent 1px)`,
        backgroundSize: "40px 40px",
      }}
    >
      {/* Logo — top-left fixed */}
      <div className="fixed top-0 left-0 p-5">
        <Link
          href="/"
          className="flex items-center gap-2 font-mono text-sm text-[#F5F5F5]"
        >
          <span className="text-[#00FF94]">&#x2588;</span>
          getnumber
        </Link>
      </div>

      {/* Card */}
      <div className="w-full" style={{ maxWidth: 420 }}>
        <div
          className="p-8"
          style={{
            backgroundColor: "#0F0F0F",
            border: "1px solid #222222",
            borderRadius: 8,
          }}
        >
          {children}
        </div>
      </div>

      {/* Legal — single copy below the card */}
      <p className="mt-6 text-[11px] text-[#555555] text-center max-w-xs">
        By continuing you agree to our{" "}
        <Link
          href="/terms"
          className="text-[#00FF94]/80 hover:text-[#00FF94] transition-colors"
        >
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link
          href="/privacy"
          className="text-[#00FF94]/80 hover:text-[#00FF94] transition-colors"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
