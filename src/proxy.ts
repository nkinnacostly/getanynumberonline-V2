import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Supabase writes the session to cookies named `sb-<project-ref>-auth-token`,
 * chunked as `.0`, `.1`, … when the JWT is large enough to need it.
 *
 * The presence of one is how we tell "signed out" from "signed in but the auth
 * call didn't answer" — see the fail-open note in `proxy` below.
 */
const hasAuthCookie = (request: NextRequest) =>
  request.cookies.getAll().some((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user }, error } = await supabase.auth.getUser();

  // /admin is gated again in its layout (is_admin) and once more in the
  // admin-api edge function. This only short-circuits the unauthenticated
  // case so a logged-out visitor never renders a protected shell.
  const isProtected =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/admin");

  if (!isProtected) return supabaseResponse;

  // getUser() is a network call, and a failed one returns null exactly like a
  // signed-out visitor does. Bouncing on both means a momentary Supabase blip
  // signs a perfectly valid session out of the page it asked for.
  //
  // So separate the two. A definitive rejection — 400/401, "refresh token is
  // not valid" — really is signed out, and still redirects. A transport
  // failure or a 5xx carries no verdict at all, so if the browser still holds
  // an auth cookie the request goes through and the layout and RLS decide;
  // they are the actual security boundary, as the comment above says.
  const isTransient =
    !!error &&
    (error.status === undefined || error.status === 0 || error.status >= 500);

  if (!user) {
    if (isTransient && hasAuthCookie(request)) {
      console.error(
        `proxy: auth check failed transiently for ${request.nextUrl.pathname}, allowing through:`,
        error.message,
      );
      return supabaseResponse;
    }

    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.search = "";
    // Carry the destination so signing in lands where the user was going
    // instead of dumping everyone on /dashboard.
    url.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );

    const redirect = NextResponse.redirect(url);
    // Any tokens getUser() refreshed live on supabaseResponse. Returning a
    // bare redirect discards them, leaving the browser holding a refresh token
    // that has already been consumed — which logs the user out for real on the
    // next request.
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie);
    });
    return redirect;
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
