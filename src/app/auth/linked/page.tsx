"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import AuthCard from "@/components/auth/AuthCard";
import { useNavigate } from "@/hooks/useNavigate";
import { safeNextPath } from "@/lib/auth-destination";
import { GOOGLE, findIdentity } from "@/lib/auth-identities";
import { createClient } from "@/lib/supabase/client";

/**
 * "You already had an account here."
 *
 * Reached only when a Google sign-in just attached itself to an account that
 * already existed on that email address. Supabase does that automatically and
 * silently, and there is no hook to intervene beforehand — the identity is
 * already joined by the time any of our code runs — so this is the first
 * moment a human can be told, and the first moment they can say no.
 *
 * The two options are the only two that exist. A second account on the same
 * address is not one of them: Supabase requires every auth user to have a
 * unique email, so "keep them separate, same address" has nowhere to live. The
 * honest version of that choice is a different email, which the page says.
 */
export default function LinkedPage() {
  return (
    <Suspense fallback={null}>
      <Linked />
    </Suspense>
  );
}

/**
 * Why the unlink failed, in words a customer can act on.
 *
 * The failure worth naming is a project one: unlinkIdentity needs "Enable
 * Manual Linking" switched on in Supabase, and refuses with a 422 otherwise.
 * The settings endpoint does not expose that flag, so it cannot be checked
 * before the button is drawn — only reported after it is pressed. Either way
 * the account is untouched, and that is the sentence that matters to whoever
 * just pressed it.
 */
function unlinkFailureMessage(e: unknown): string {
  const err = e as { message?: string; code?: string };
  const text = `${err?.code ?? ""} ${err?.message ?? ""}`.toLowerCase();

  if (text.includes("manual linking") || text.includes("manual_linking")) {
    console.error(
      "ALERT auth: unlinkIdentity refused — enable Manual Linking in Supabase",
    );
    return (
      "We could not disconnect Google automatically. Your account is " +
      "unchanged — email support and we will separate them for you."
    );
  }

  return (
    (err?.message ? `${err.message}. ` : "") +
    "Your account is unchanged — you can still sign in either way."
  );
}

function Linked() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Nothing to decide without a session, and nothing to decide if Google
      // is the only way in — that is a new account, not a merge. Either way
      // this page has no business being on screen.
      if (!session) {
        navigate("/auth");
        return;
      }
      const identities = session.user.identities ?? [];
      if (identities.length < 2 || !findIdentity(identities, GOOGLE)) {
        navigate("/dashboard");
        return;
      }
      setEmail(session.user.email ?? null);
      setChecking(false);
    });
  }, [navigate]);

  const keepJoined = () => {
    const next =
      safeNextPath(new URLSearchParams(window.location.search).get("next")) ??
      "/dashboard";
    navigate(next);
  };

  const keepSeparate = async () => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      const { data, error: listErr } = await supabase.auth.getUserIdentities();
      if (listErr) throw listErr;

      const google = findIdentity(data?.identities, GOOGLE);
      if (!google) throw new Error("Google is not connected to this account");

      const { error: unlinkErr } = await supabase.auth.unlinkIdentity(google);
      if (unlinkErr) throw unlinkErr;

      // Signed out deliberately: the session they are holding was created by
      // the Google sign-in they just undid.
      await supabase.auth.signOut();
      setUndone(true);
    } catch (e: unknown) {
      setError(unlinkFailureMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <AuthCard>
        <div className="flex items-center justify-center py-10">
          <span className="auth-spinner" />
        </div>
      </AuthCard>
    );
  }

  if (undone) {
    return (
      <AuthCard>
        <h1 className="font-sans text-xl font-bold text-foreground mb-3">
          Google disconnected
        </h1>
        <p className="text-[13px] text-muted mb-6 leading-relaxed">
          Your original account is untouched — same balance, same history — and
          you can still sign in with your email and password.
        </p>
        <p className="text-[13px] text-muted mb-6 leading-relaxed">
          To keep a genuinely separate account, sign up with a different email
          address. One address can only ever belong to one account here.
        </p>
        <Link
          href="/auth"
          className="w-full h-[44px] rounded-[6px] text-[14px] font-bold flex items-center justify-center"
          style={{ backgroundColor: "var(--accent)", color: "var(--accent-ink)" }}
        >
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h1 className="font-sans text-xl font-bold text-foreground mb-3">
        You already have an account
      </h1>

      <p className="text-[13px] text-muted mb-4 leading-relaxed">
        <span className="font-mono text-foreground">{email}</span> was already
        registered here, so we connected Google to that account rather than
        starting a new one. Your balance, orders and rentals are all still
        there.
      </p>

      <div
        className="mb-6 px-3 py-3 rounded-[6px] text-[12px] leading-relaxed"
        style={{
          backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)",
          border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
          color: "var(--foreground)",
        }}
      >
        From now on either way in works — Google, or your email and password.
        Nothing about your password has changed.
      </div>

      {error && (
        <div
          className="mb-4 px-3 py-3 rounded-[6px] text-[13px]"
          style={{
            backgroundColor: "color-mix(in srgb, var(--danger) 10%, transparent)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
          }}
          role="alert"
        >
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={keepJoined}
        disabled={busy}
        className="w-full h-[44px] rounded-[6px] text-[14px] font-bold mb-3 disabled:opacity-50 flex items-center justify-center"
        style={{ backgroundColor: "var(--accent)", color: "var(--accent-ink)" }}
      >
        Keep one account
      </button>

      <button
        type="button"
        onClick={keepSeparate}
        disabled={busy}
        className="w-full h-[44px] rounded-[6px] text-[14px] font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        style={{
          border: "1px solid var(--line-strong)",
          color: "var(--foreground)",
        }}
      >
        {busy && <span className="auth-spinner" />}
        {busy ? "Disconnecting…" : "Don't connect Google"}
      </button>

      <p className="mt-4 text-[11px] text-muted leading-relaxed">
        Disconnecting leaves your existing account exactly as it was. A separate
        account needs a different email address — one address belongs to one
        account.
      </p>
    </AuthCard>
  );
}
