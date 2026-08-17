// ============================================================
// Shared: authentication for the reconcile/cron endpoints.
//
// These are called by pg_cron over HTTP, not by a signed-in user, so they
// authenticate with a shared secret rather than a JWT. Two credentials are
// accepted:
//
//   • internal_secrets.reconcile — generated inside Postgres and used by the
//     cron command, so it never has to be handled by a human or committed
//   • RECONCILE_SECRET env — for manual/operator invocation
//
// Extracted because reconcile-esims and reconcile-orders were otherwise going
// to carry identical copies of this, including the constant-time compare.
// ============================================================

// deno-lint-ignore no-explicit-any
type Supabase = any;

/**
 * Constant-time compare. A plain `!==` on a secret leaks its prefix through
 * response timing to anyone who can reach the endpoint.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the request carries a valid reconcile credential. */
export async function isReconcileAuthorized(
  req: Request,
  supabase: Supabase,
): Promise<boolean> {
  const presented = req.headers.get("x-reconcile-secret") ?? "";
  if (!presented) return false;

  const envSecret = Deno.env.get("RECONCILE_SECRET") ?? "";
  if (envSecret && timingSafeEqual(presented, envSecret)) return true;

  const { data } = await supabase
    .from("internal_secrets")
    .select("value")
    .eq("name", "reconcile")
    .maybeSingle();

  const dbSecret = String(data?.value ?? "");
  return dbSecret !== "" && timingSafeEqual(presented, dbSecret);
}
