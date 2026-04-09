"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthCard from "@/components/auth/AuthCard";

const INPUT_CLS =
  "w-full h-[44px] px-3 text-[14px] text-[#F5F5F5] placeholder-[#444444] rounded-[6px] outline-none transition-colors";
const INPUT_STYLE = {
  backgroundColor: "#141414",
  border: "1px solid #222222",
};

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const [codeExchanging, setCodeExchanging] = useState(false);

  /** PKCE: recovery/invite links may land here with ?code= — exchange then clean URL. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;

    let cancelled = false;
    setCodeExchanging(true);
    const supabase = createClient();
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error: exErr }) => {
        if (cancelled) return;
        if (exErr) {
          setError(exErr.message);
          return;
        }
        router.replace("/auth/update-password", { scroll: false });
      })
      .finally(() => {
        if (!cancelled) setCodeExchanging(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "#00FF94";
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "#222222";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const errs: Record<string, string> = {};
    if (!password) errs.password = "Password is required";
    else if (password.length < 8)
      errs.password = "Must be at least 8 characters";
    if (!confirmPassword) errs.confirm = "Confirm your password";
    else if (password !== confirmPassword)
      errs.confirm = "Passwords do not match";
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
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
            Password updated
          </h2>
          <p className="text-[13px] text-[#555555]">
            Redirecting to dashboard...
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h2 className="font-sans text-xl font-bold text-[#F5F5F5] mb-2">
        Set new password
      </h2>
      <p className="text-[13px] text-[#555555] mb-6">
        Choose a strong password for your account.
      </p>

      {codeExchanging && (
        <div className="flex items-center justify-center gap-2 py-8 mb-2">
          <span
            className="auth-spinner"
            style={{
              borderColor: "#00FF94",
              borderTopColor: "transparent",
              width: 24,
              height: 24,
            }}
          />
          <span className="text-[13px] text-[#555555]">Verifying link…</span>
        </div>
      )}

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

      <form
        onSubmit={handleSubmit}
        className={`space-y-4 ${codeExchanging ? "opacity-40 pointer-events-none" : ""}`}
      >
        <div>
          <label
            htmlFor="password"
            className="block text-[12px] mb-1.5"
            style={{ color: "#888888" }}
          >
            New password
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
        </div>

        <div>
          <label
            htmlFor="confirm"
            className="block text-[12px] mb-1.5"
            style={{ color: "#888888" }}
          >
            Confirm new password
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
          {loading ? "Updating..." : "Update password"}
        </button>
      </form>
    </AuthCard>
  );
}
