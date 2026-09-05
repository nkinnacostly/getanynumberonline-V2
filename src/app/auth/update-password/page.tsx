"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useNavigate } from "@/hooks/useNavigate";
import { createClient } from "@/lib/supabase/client";
import AuthCard from "@/components/auth/AuthCard";

const INPUT_CLS =
  "w-full h-[44px] px-3 text-[14px] text-foreground placeholder-muted rounded-[6px] outline-none transition-colors";
const INPUT_STYLE = {
  backgroundColor: "var(--field)",
  border: "1px solid var(--line-strong)",
};

export default function UpdatePasswordPage() {
  const router = useRouter();
  const navigate = useNavigate();
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
    e.target.style.borderColor = "var(--accent)";
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "var(--line-strong)";
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
        navigate("/dashboard");
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
            <circle cx="24" cy="24" r="24" fill="var(--accent)" fillOpacity="0.1" />
            <path
              d="M16 24l6 6 10-12"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h2 className="font-sans text-lg font-bold text-foreground mb-2">
            Password updated
          </h2>
          <p className="text-[13px] text-muted">
            Redirecting to dashboard...
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h2 className="font-sans text-xl font-bold text-foreground mb-2">
        Set new password
      </h2>
      <p className="text-[13px] text-muted mb-6">
        Choose a strong password for your account.
      </p>

      {codeExchanging && (
        <div className="flex items-center justify-center gap-2 py-8 mb-2">
          <span
            className="auth-spinner"
            style={{
              borderColor: "var(--accent)",
              borderTopColor: "transparent",
              width: 24,
              height: 24,
            }}
          />
          <span className="text-[13px] text-muted">Verifying link…</span>
        </div>
      )}

      {error && (
        <div
          className="mb-4 px-3 py-3 rounded-[6px] text-[13px]"
          style={{
            backgroundColor: "color-mix(in srgb, var(--danger) 10%, transparent)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
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
            style={{ color: "var(--muted)" }}
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
            <p className="mt-1 text-[12px]" style={{ color: "var(--danger)" }}>
              {fieldErrors.password}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="confirm"
            className="block text-[12px] mb-1.5"
            style={{ color: "var(--muted)" }}
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
            <p className="mt-1 text-[12px]" style={{ color: "var(--danger)" }}>
              {fieldErrors.confirm}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-[44px] rounded-[6px] text-[14px] font-bold transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ backgroundColor: "var(--accent)", color: "var(--accent-ink)" }}
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
