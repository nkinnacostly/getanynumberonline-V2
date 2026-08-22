# AGENTS.md — quick start

**`CLAUDE.md` is the full rules file** (schema, balance RPCs, env var placement,
pricing markup, design system, provider rules). Read it before writing code.
This file is only orientation for the first minutes of a session; if anything
disagrees with `CLAUDE.md`, it loses. Keep this file thin.

## Stack & layout facts you'd otherwise guess wrong

- Next.js **16** App Router + React 19 + TS strict + Tailwind v4; Supabase is the
  entire backend (Auth, Postgres, Deno Edge Functions). Deploy target: Vercel.
- Next 16 quirk: middleware lives in **`proxy.ts`**, exporting `proxy()` — there
  is no `middleware.ts`. Dynamic route `params`/`searchParams` are Promises.
- Package manager is **npm**. A legacy `pnpm-lock.yaml` is also tracked — ignore
  it; update `package-lock.json`.
- There is also an `/admin/*` panel (absent from CLAUDE.md's folder map). It is
  gated three times: `proxy.ts`, then `is_admin` in `src/app/admin/layout.tsx`,
  then again inside the `admin-api` edge function on every call.
- SEO landing routes (`receive-sms/[service]`, `numbers/[country]`,
  `compare/[competitor]`, `pricing`) prerender from static data in
  `src/lib/seo/*` via `generateStaticParams` — no provider calls at build time.
  Keep `sitemap.ts` in sync when touching them.
- Provider API references live in `supabase/functions/_shared/*.md` — consult
  before adding any provider call.

## Verification — there are NO tests and NO CI

Nothing runs automatically; verify locally before claiming done:

1. `npx tsc --noEmit` — must pass clean (there is no `typecheck` script).
2. `npm run build` — must pass. It type-checks but does **not** run ESLint, so a
   green build does not mean clean lint.
3. `npm run lint` — currently FAILS with ~10 pre-existing errors
   (`no-explicit-any`, `react-hooks/set-state-in-effect`). Don't mass-fix them
   unasked; just add none.
4. Exercise the real changed flow with `npm run dev`. eSIM Access has no sandbox
   — test against production and refund with `esim/cancel`.

Deno functions under `supabase/functions/` are excluded from `tsconfig.json`,
so they are never type-checked locally (ESLint parses them, nothing more).
Type/deploy errors surface only when deploying — review carefully.

## Deploys

1. Edge functions: `./supabase/functions/deploy.sh [fn ...]` (passes
   `--no-verify-jwt`). A raw `supabase functions deploy` MUST also pass it: the
   CLI resets gateway JWT verification ON every deploy, which 401s the
   Flutterwave/eSIM webhooks before your code runs — silently breaking top-ups.
2. After changing `esimaccess-webhook`, re-register its URL:
   `./supabase/functions/esimaccess-webhook/register.sh`.
3. Frontend changes: `vercel --prod`.

## Hard rules that cause incidents when missed

Details in `CLAUDE.md` — these are the ones agents break most often:

- Providers are NEVER called from the browser or Next API routes. SMSPool
  (FormData POST) and eSIM Access (`callEsimAccess()`, JSON POST) are proxied
  only through `supabase/functions/*`.
- Never write `profiles.balance` directly — use the RPCs in CLAUDE.md §5
  (`credit_balance`, `deduct_balance_and_create_*`). Schema/RPC source of truth:
  `supabase/migrations/`.
- Frontend → Edge calls go through `callEdgeFunction` (`src/lib/api.ts`);
  user/session comes from the `useUser()` hook; Supabase clients only from
  `src/lib/supabase/{client,server}.ts`.
- Secrets (`SMSPOOL_API_KEY`, `ESIMACCESS_ACCESS_CODE`, webhook secrets) live
  ONLY in Supabase edge secrets — never `.env.local`/Vercel. Only Supabase URL,
  anon key, and Flutterwave public key get `NEXT_PUBLIC_`.
