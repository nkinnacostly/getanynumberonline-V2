import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
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
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith("/dashboard")) {
    // If coming back from Flutterwave payment, don't redirect to auth
    // Let the client-side handle session restoration
    const isPaymentReturn = request.nextUrl.searchParams.has("topup");
    if (isPaymentReturn) {
      return response;
    }
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
