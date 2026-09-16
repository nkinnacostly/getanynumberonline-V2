import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth-destination";
import { createClient } from "@/lib/supabase/server";

/**
 * Everything that comes back from Supabase Auth with a code.
 *
 * Three flows share this one route and land in three different places:
 *   flow=oauth      a Google sign-in  -> the dashboard, or ?next=
 *   type=recovery   a password reset  -> /auth/update-password
 *   otherwise       an email confirm  -> /auth/verified
 *
 * `flow=oauth` is set by the Google button rather than inferred, because an
 * OAuth callback and an email confirmation are indistinguishable from the
 * query string alone — both arrive as ?code=… — and guessing wrong would drop
 * someone who just signed in on a page telling them to go and sign in.
 */

/** Where an OAuth user goes when they did not ask for anywhere in particular. */
async function landingFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();
    return data?.is_admin ? "/admin" : "/dashboard";
  } catch {
    // A slow or failing profile read must never block a valid sign-in.
    return "/dashboard";
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const isOAuth = searchParams.get("flow") === "oauth";

  // Google's own failures come back here, not as an exception: pressing Cancel
  // on the consent screen is ?error=access_denied. That is a person changing
  // their mind, so it gets a calm message rather than "verification failed".
  if (searchParams.get("error")) {
    const denied = searchParams.get("error") === "access_denied";
    return NextResponse.redirect(
      `${origin}/auth?error=${denied ? "oauth_cancelled" : "oauth_failed"}`,
    );
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (isOAuth) {
        // safeNextPath is the boundary: this value arrives on a URL that a
        // stranger could have sent, so only same-origin paths are honoured.
        const next = safeNextPath(searchParams.get("next"));
        const to = next ?? (await landingFor(supabase, data.user.id));
        return NextResponse.redirect(`${origin}${to}`);
      }
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/auth/update-password`);
      }
      return NextResponse.redirect(`${origin}/auth/verified`);
    }
  }

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      // Only email links reach this branch — an SMS OTP would never be sent
      // to a browser redirect — so the narrow type is the accurate one, and
      // it replaces the `as any` that used to sit here.
      type: type as EmailOtpType,
    });
    if (!error) {
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/auth/update-password`);
      }
      return NextResponse.redirect(`${origin}/auth/verified`);
    }
  }

  return NextResponse.redirect(
    `${origin}/auth?error=${isOAuth ? "oauth_failed" : "verification_failed"}`,
  );
}
