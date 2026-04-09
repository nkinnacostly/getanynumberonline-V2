"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthCard from "@/components/auth/AuthCard";

const INPUT_CLS =
  "w-full h-[44px] px-3 text-[14px] text-[#F5F5F5] placeholder-[#444444] rounded-[6px] outline-none transition-colors";
const INPUT_STYLE = {
  backgroundColor: "#141414",
  border: "1px solid #222222",
};

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "#00FF94";
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "#222222";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/auth/update-password",
      });
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthCard>
        <div className="flex flex-col items-center text-center py-4">
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            className="mb-4"
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
          <h2 className="font-sans text-lg font-bold text-[#F5F5F5] mb-2">
            Reset link sent
          </h2>
          <p className="text-[13px] text-[#555555] mb-6">
            Check your inbox at <span className="text-[#F5F5F5]">{email}</span>{" "}
            for a link to reset your password.
          </p>
          <Link
            href="/auth"
            className="text-[13px] text-[#00FF94] hover:opacity-80 transition-opacity"
          >
            &larr; Back to sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h2 className="font-sans text-xl font-bold text-[#F5F5F5] mb-2">
        Reset your password
      </h2>
      <p className="text-[13px] text-[#555555] mb-6">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      {error && (
        <div
          className="mb-4 px-3 py-3 rounded-[6px] text-[13px]"
          style={{
            backgroundColor: "#1A0000",
            border: "1px solid #FF4444",
            color: "#FF4444",
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-[12px] mb-1.5"
            style={{ color: "#888888" }}
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="you@example.com"
            className={INPUT_CLS}
            style={INPUT_STYLE}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-[44px] rounded-[6px] text-[14px] font-bold transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ backgroundColor: "#00FF94", color: "#080808" }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.opacity = "0.9";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          {loading && <span className="auth-spinner" />}
          {loading ? "Sending..." : "Send reset link"}
        </button>
      </form>

      <div className="mt-6 text-center">
        <Link
          href="/auth"
          className="text-[13px] text-[#555555] hover:text-[#888888] transition-colors"
        >
          &larr; Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}
