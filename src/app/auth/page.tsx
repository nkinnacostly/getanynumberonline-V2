"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthCard from "@/components/auth/AuthCard";

const INPUT_CLS =
  "w-full h-[44px] px-3 text-[14px] text-[#F5F5F5] placeholder-[#444444] rounded-[6px] outline-none transition-colors" as const;
const INPUT_STYLE = {
  backgroundColor: "#141414",
  border: "1px solid #222222",
} as const;
const FOCUS_BORDER = "#00FF94";

function validateEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function AuthPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [signUpSuccess, setSignUpSuccess] = useState(false);

  const switchTab = (t: "signin" | "signup") => {
    setTab(t);
    setGeneralError(null);
    setFieldErrors({});
    setSignUpSuccess(false);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!email) errs.email = "Email is required";
    else if (!validateEmail(email)) errs.email = "Enter a valid email address";
    if (!password) errs.password = "Password is required";
    else if (password.length < 8)
      errs.password = "Must be at least 8 characters";
    if (tab === "signup") {
      if (!confirmPassword) errs.confirm = "Confirm your password";
      else if (password !== confirmPassword)
        errs.confirm = "Passwords do not match";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    if (!validate()) return;

    setLoading(true);
    const supabase = createClient();

    try {
      if (tab === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSignUpSuccess(true);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (!data.session)
          throw new Error("Sign in failed — no session returned");
        await supabase.auth.setSession(data.session);
        // Give the session time to persist before navigating
        await new Promise((resolve) => setTimeout(resolve, 500));
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: any) {
      setGeneralError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = FOCUS_BORDER;
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "#222222";
  };

  /* ── Sign-up success state ── */
  if (signUpSuccess) {
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
            Check your email
          </h2>
          <p className="text-[13px] text-[#555555] mb-6">
            We sent a confirmation link to{" "}
            <span className="text-[#F5F5F5]">{email}</span>. Click it to
            activate your account.
          </p>
          <button
            onClick={() => {
              setSignUpSuccess(false);
              switchTab("signin");
            }}
            className="text-[13px] text-[#00FF94] hover:opacity-80 transition-opacity"
          >
            &larr; Back to sign in
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      {/* Heading */}
      <h2 className="font-sans text-xl font-bold text-[#F5F5F5] mb-6">
        {tab === "signin" ? "Welcome back" : "Create account"}
      </h2>

      {/* Tab toggle */}
      <div
        className="flex rounded-[6px] p-1 mb-6"
        style={{ backgroundColor: "#141414" }}
      >
        <button
          onClick={() => switchTab("signin")}
          className="flex-1 text-[13px] font-medium py-2 rounded-[5px] transition-colors"
          style={{
            backgroundColor: tab === "signin" ? "#00FF94" : "transparent",
            color: tab === "signin" ? "#080808" : "#555555",
          }}
        >
          Sign in
        </button>
        <button
          onClick={() => switchTab("signup")}
          className="flex-1 text-[13px] font-medium py-2 rounded-[5px] transition-colors"
          style={{
            backgroundColor: tab === "signup" ? "#00FF94" : "transparent",
            color: tab === "signup" ? "#080808" : "#555555",
          }}
        >
          Sign up
        </button>
      </div>

      {/* General error banner */}
      {generalError && (
        <div
          className="mb-4 px-3 py-3 rounded-[6px] text-[13px]"
          style={{
            backgroundColor: "#1A0000",
            border: "1px solid #FF4444",
            color: "#FF4444",
          }}
        >
          {generalError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email */}
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
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldErrors((p) => ({ ...p, email: "" }));
            }}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="you@example.com"
            className={INPUT_CLS}
            style={INPUT_STYLE}
          />
          {fieldErrors.email && (
            <p className="mt-1 text-[12px]" style={{ color: "#FF4444" }}>
              {fieldErrors.email}
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="password"
            className="block text-[12px] mb-1.5"
            style={{ color: "#888888" }}
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldErrors((p) => ({ ...p, password: "" }));
            }}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="••••••••"
            className={INPUT_CLS}
            style={INPUT_STYLE}
          />
          {fieldErrors.password && (
            <p className="mt-1 text-[12px]" style={{ color: "#FF4444" }}>
              {fieldErrors.password}
            </p>
          )}
          {tab === "signin" && (
            <div className="mt-1.5 text-right">
              <Link
                href="/auth/reset-password"
                className="text-[12px] text-[#555555] hover:text-[#888888] transition-colors"
              >
                Forgot password?
              </Link>
            </div>
          )}
        </div>

        {/* Confirm Password (sign-up only) */}
        {tab === "signup" && (
          <div>
            <label
              htmlFor="confirm"
              className="block text-[12px] mb-1.5"
              style={{ color: "#888888" }}
            >
              Confirm Password
            </label>
            <input
              id="confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setFieldErrors((p) => ({ ...p, confirm: "" }));
              }}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="••••••••"
              className={INPUT_CLS}
              style={INPUT_STYLE}
            />
            {fieldErrors.confirm && (
              <p className="mt-1 text-[12px]" style={{ color: "#FF4444" }}>
                {fieldErrors.confirm}
              </p>
            )}
          </div>
        )}

        {/* Submit */}
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
          {loading
            ? "Please wait..."
            : tab === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px" style={{ backgroundColor: "#1A1A1A" }} />
        <span className="text-[12px] text-[#555555]">or</span>
        <div className="flex-1 h-px" style={{ backgroundColor: "#1A1A1A" }} />
      </div>

      {/* Toggle */}
      <p className="text-center text-[13px] text-[#555555]">
        {tab === "signin" ? (
          <>
            Don&apos;t have an account?{" "}
            <button
              onClick={() => switchTab("signup")}
              className="text-[#00FF94] hover:opacity-80 transition-opacity font-medium"
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              onClick={() => switchTab("signin")}
              className="text-[#00FF94] hover:opacity-80 transition-opacity font-medium"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </AuthCard>
  );
}
