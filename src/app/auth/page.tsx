"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthCard from "@/components/auth/AuthCard";

const INPUT_CLS =
  "w-full h-[44px] px-3 pr-11 text-[14px] text-[#F5F5F5] placeholder-[#444444] rounded-[6px] outline-none transition-colors" as const;
const INPUT_STYLE = {
  backgroundColor: "#141414",
  border: "1px solid #222222",
} as const;
const FOCUS_BORDER = "#00FF94";

function validateEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isEmailNotConfirmed(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const o = err as { message?: string; code?: string };
  const m = (o.message ?? "").toLowerCase();
  const c = (o.code ?? "").toLowerCase();
  return (
    m.includes("email not confirmed") ||
    c === "email_not_confirmed" ||
    m.includes("email_not_confirmed")
  );
}

function isRateLimited(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const m = ((err as { message?: string }).message ?? "").toLowerCase();
  return m.includes("rate limit") || m.includes("too many requests");
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [signInErrorKind, setSignInErrorKind] = useState<
    null | "email_not_confirmed" | "rate_limit"
  >(null);
  const [resendSent, setResendSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<
    null | "error" | "success"
  >(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const params = new URLSearchParams(window.location.search);
        const fullQuery = params.toString();
        if (params.get("topup") === "success") {
          router.replace(`/dashboard/wallet?${fullQuery}`);
        } else {
          router.replace("/dashboard");
        }
        return;
      }
      const params = new URLSearchParams(window.location.search);
      if (params.get("error") === "verification_failed") {
        setVerificationNotice("error");
        params.delete("error");
        const q = params.toString();
        router.replace(q ? `/auth?${q}` : "/auth", { scroll: false });
      } else if (params.get("verified") === "true") {
        setVerificationNotice("success");
        params.delete("verified");
        const q = params.toString();
        router.replace(q ? `/auth?${q}` : "/auth", { scroll: false });
      }
    });
  }, [router]);

  const switchTab = (t: "signin" | "signup") => {
    setTab(t);
    setGeneralError(null);
    setFieldErrors({});
    setSignUpSuccess(false);
    setSignInErrorKind(null);
    setResendSent(false);
    setVerificationNotice(null);
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
    setSignInErrorKind(null);
    setResendSent(false);
    if (!validate()) return;

    setLoading(true);
    const supabase = createClient();

    try {
      if (tab === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setSignUpSuccess(true);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          if (isEmailNotConfirmed(error)) {
            setSignInErrorKind("email_not_confirmed");
            return;
          }
          if (isRateLimited(error)) {
            setSignInErrorKind("rate_limit");
            return;
          }
          throw error;
        }
        if (!data.session) throw new Error("Sign in failed");
        const params = new URLSearchParams(window.location.search);
        const topup = params.get("topup");
        if (topup === "success") {
          router.push(`/dashboard/wallet?${params.toString()}`);
        } else {
          router.push("/dashboard");
        }
        router.refresh();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong";
      setGeneralError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!email || !validateEmail(email)) {
      setFieldErrors((p) => ({
        ...p,
        email: "Enter a valid email to resend confirmation",
      }));
      return;
    }
    setResendLoading(true);
    setResendSent(false);
    const supabase = createClient();
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      setResendSent(true);
    } catch (e: unknown) {
      setGeneralError(
        e instanceof Error ? e.message : "Could not resend email",
      );
    } finally {
      setResendLoading(false);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = FOCUS_BORDER;
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "#222222";
  };

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
            type="button"
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
      <h2 className="font-sans text-xl font-bold text-[#F5F5F5] mb-6">
        {tab === "signin" ? "Welcome back" : "Create account"}
      </h2>

      <div
        className="flex mb-6 gap-1 rounded-[6px]"
        style={{
          backgroundColor: "#141414",
          padding: 4,
        }}
      >
        <button
          type="button"
          onClick={() => switchTab("signin")}
          className="flex-1 min-h-[44px] text-[13px] rounded-[6px] transition-colors flex items-center justify-center"
          style={{
            backgroundColor: tab === "signin" ? "#00FF94" : "transparent",
            color: tab === "signin" ? "#080808" : "#555555",
            fontWeight: tab === "signin" ? 700 : 400,
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => switchTab("signup")}
          className="flex-1 min-h-[44px] text-[13px] rounded-[6px] transition-colors flex items-center justify-center"
          style={{
            backgroundColor: tab === "signup" ? "#00FF94" : "transparent",
            color: tab === "signup" ? "#080808" : "#555555",
            fontWeight: tab === "signup" ? 700 : 400,
          }}
        >
          Sign up
        </button>
      </div>

      {verificationNotice === "error" && (
        <div
          className="mb-4 px-3 py-3 rounded-[6px] text-[13px]"
          style={{
            backgroundColor: "#1A0000",
            border: "1px solid #FF4444",
            color: "#FF4444",
          }}
          role="alert"
        >
          Email verification failed. The link may have expired. Please sign up
          again or contact support.
        </div>
      )}

      {verificationNotice === "success" && (
        <div
          className="mb-4 px-3 py-3 rounded-[6px] text-[13px]"
          style={{
            backgroundColor: "#001A0F",
            border: "1px solid #00FF94",
            color: "#00FF94",
          }}
          role="status"
        >
          Email verified successfully! You can now sign in.
        </div>
      )}

      {signInErrorKind === "email_not_confirmed" && tab === "signin" && (
        <div
          className="mb-4 px-3 py-3 rounded-[6px] text-[13px]"
          style={{
            backgroundColor: "#1A1500",
            border: "1px solid #F5A623",
            color: "#F5A623",
          }}
        >
          <p className="mb-3">
            Please confirm your email before signing in.
          </p>
          <button
            type="button"
            onClick={handleResendConfirmation}
            disabled={resendLoading}
            className="w-full py-2 rounded-[6px] text-[12px] font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ backgroundColor: "#F5A623", color: "#080808" }}
          >
            {resendLoading && <span className="auth-spinner" />}
            Resend confirmation email
          </button>
          {resendSent && (
            <p className="mt-3 text-[12px] text-[#00FF94] text-center font-mono">
              Confirmation email sent!
            </p>
          )}
        </div>
      )}

      {signInErrorKind === "rate_limit" && tab === "signin" && (
        <div
          className="mb-4 px-3 py-3 rounded-[6px] text-[13px]"
          style={{
            backgroundColor: "#1A1500",
            border: "1px solid #F5A623",
            color: "#F5A623",
          }}
        >
          Too many sign in attempts. Please wait a few minutes before trying
          again.
        </div>
      )}

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
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldErrors((p) => ({ ...p, email: "" }));
              setSignInErrorKind(null);
              setResendSent(false);
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

        <div>
          <label
            htmlFor="password"
            className="block text-[12px] mb-1.5"
            style={{ color: "#888888" }}
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={
                tab === "signin" ? "current-password" : "new-password"
              }
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
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-0 top-0 h-[44px] w-11 flex items-center justify-center rounded-r-[6px] text-[#555555] hover:text-[#F5F5F5] transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
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

        {tab === "signup" && (
          <div>
            <label
              htmlFor="confirm"
              className="block text-[12px] mb-1.5"
              style={{ color: "#888888" }}
            >
              Confirm Password
            </label>
            <div className="relative">
              <input
                id="confirm"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
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
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-0 top-0 h-[44px] w-11 flex items-center justify-center rounded-r-[6px] text-[#555555] hover:text-[#F5F5F5] transition-colors"
                aria-label={
                  showConfirmPassword
                    ? "Hide confirm password"
                    : "Show confirm password"
                }
              >
                <EyeIcon open={showConfirmPassword} />
              </button>
            </div>
            {fieldErrors.confirm && (
              <p className="mt-1 text-[12px]" style={{ color: "#FF4444" }}>
                {fieldErrors.confirm}
              </p>
            )}
          </div>
        )}

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
    </AuthCard>
  );
}
