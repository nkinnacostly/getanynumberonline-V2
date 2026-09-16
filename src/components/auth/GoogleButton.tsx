"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { destinationFrom } from "@/lib/auth-destination";

/**
 * "Continue with Google" — one button for both tabs.
 *
 * OAuth does not distinguish signing up from signing in: Google hands back an
 * identity, and Supabase either creates a user or matches an existing one. So
 * this sits outside the sign-in/sign-up toggle and says "Continue", which is
 * the wording Google's own guidelines use for exactly this reason.
 *
 * Existing accounts are not duplicated. Supabase links a new provider identity
 * to the user with the same email as long as that email is verified — which
 * every password account here has, because sign-up requires confirming it. One
 * user, one wallet, whichever button they press next time.
 */
export default function GoogleButton({
  disabled,
  onError,
}: {
  disabled?: boolean;
  /** Shown by the page, so OAuth and password errors read the same. */
  onError: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    onError("");

    try {
      if (!(await googleEnabled())) {
        throw new Error(
          "it is not enabled for this project yet. Use your email and password below.",
        );
      }

      const params = new URLSearchParams(window.location.search);
      const callback = new URL("/auth/callback", window.location.origin);
      // `flow` tells the callback this is a sign-in rather than an email
      // confirmation, which lands somewhere else entirely.
      callback.searchParams.set("flow", "oauth");
      const next = destinationFrom(params);
      if (next) callback.searchParams.set("next", next);

      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback.toString() },
      });

      // A configuration problem lands here — "Unsupported provider" when the
      // Google provider has not been enabled in Supabase. Said out loud rather
      // than left as a button that does nothing when clicked.
      if (error) throw error;

      // On success the browser is already navigating to Google, so `loading`
      // is deliberately left on: re-enabling it would flash the button back to
      // normal underneath the redirect.
    } catch (err: unknown) {
      onError(
        err instanceof Error
          ? `Google sign-in is unavailable: ${err.message}`
          : "Google sign-in is unavailable",
      );
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className="w-full h-[44px] rounded-[6px] text-[14px] font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
      style={{
        backgroundColor: "transparent",
        border: "1px solid var(--line-strong)",
        color: "var(--foreground)",
      }}
    >
      {loading ? <span className="auth-spinner" /> : <GoogleMark />}
      {loading ? "Redirecting…" : "Continue with Google"}
    </button>
  );
}

/**
 * Is the Google provider actually turned on for this project?
 *
 * Worth one request before redirecting, because signInWithOAuth does not
 * validate the provider — it just sends the browser to Supabase's /authorize,
 * which answers a disabled provider with a raw JSON 400 on a supabase.co URL.
 * The person clicking sees neither our site nor an explanation. Asking first
 * turns that into a sentence they can act on.
 *
 * Fails open: if the check itself cannot be reached, the sign-in is attempted
 * anyway rather than blocked by a flaky probe.
 */
async function googleEnabled(): Promise<boolean> {
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!base || !key) return true;
    const res = await fetch(`${base}/auth/v1/settings`, {
      headers: { apikey: key },
    });
    if (!res.ok) return true;
    const json = (await res.json()) as { external?: Record<string, boolean> };
    return json.external?.google !== false;
  } catch {
    return true;
  }
}

/**
 * The Google "G".
 *
 * The literal hex is the one deliberate exception §13 has to allow here: these
 * are Google's brand colours and their branding guidelines do not permit
 * recolouring the mark, so it cannot be driven by the theme tokens like every
 * other icon in the app. It reads correctly on both the light and dark card.
 */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
