import type { User, UserIdentity } from "@supabase/supabase-js";

/**
 * Reading a user's linked sign-in methods.
 *
 * One email address is one account, always — Supabase enforces unique emails
 * on auth.users, so a second account on the same address is not something this
 * app declines to build, it is something that cannot exist. When someone with
 * a password account signs in with Google on that same address, Supabase
 * attaches the Google identity to the account they already have.
 *
 * That is the behaviour we want (one person, one wallet), but it happens
 * silently and after the fact: by the time the callback runs, the accounts are
 * already joined. So the least we can do is notice it happened and say so,
 * which is what `justLinkedExistingAccount` is for.
 */

export const GOOGLE = "google";

/** How recently the Google identity must have appeared to count as "just now". */
const FRESH_LINK_MS = 2 * 60 * 1000;

export function findIdentity(
  identities: UserIdentity[] | undefined,
  provider: string,
): UserIdentity | undefined {
  return identities?.find((i) => i.provider === provider);
}

/**
 * Did this sign-in just attach Google to an account that already existed?
 *
 * Three things have to be true, and the third is why this is time-based:
 *   - there is a Google identity
 *   - there is at least one other identity, so the account predates Google
 *   - that Google identity was created moments ago, by this very sign-in
 *
 * Without the last check every future Google sign-in would re-announce a
 * merge that happened months back. There is no "linked_at" flag to read
 * instead, so the window is the signal — and the OAuth round trip takes
 * seconds, so two minutes is generous. The only cost of getting it wrong is
 * showing a returning user the notice a second time, which is harmless.
 */
export function justLinkedExistingAccount(user: User | null | undefined): boolean {
  const identities = user?.identities;
  if (!identities || identities.length < 2) return false;

  const google = findIdentity(identities, GOOGLE);
  if (!google?.created_at) return false;

  const others = identities.filter((i) => i.provider !== GOOGLE);
  if (others.length === 0) return false;

  const age = Date.now() - new Date(google.created_at).getTime();
  return age >= 0 && age < FRESH_LINK_MS;
}
