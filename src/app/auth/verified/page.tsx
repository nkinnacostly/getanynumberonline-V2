import Link from "next/link";
import AuthCard from "@/components/auth/AuthCard";

export default function AuthVerifiedPage() {
  return (
    <AuthCard>
      <div className="flex flex-col items-center text-center py-2">
        <svg
          width="56"
          height="56"
          viewBox="0 0 48 48"
          fill="none"
          className="mb-5"
          aria-hidden
        >
          <circle cx="24" cy="24" r="24" fill="#00FF94" fillOpacity="0.1" />
          <path
            d="M16 24l6 6 10-12"
            stroke="#00FF94"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h1 className="font-sans text-xl font-bold text-[#F5F5F5] mb-3">
          Email verified
        </h1>
        <p className="text-[13px] text-[#555555] mb-8 max-w-[280px]">
          Your account is ready. Sign in to get started.
        </p>
        <Link
          href="/auth"
          className="w-full h-[44px] rounded-[6px] text-[14px] font-bold flex items-center justify-center gap-1 transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#00FF94", color: "#080808" }}
        >
          Sign in →
        </Link>
      </div>
    </AuthCard>
  );
}
