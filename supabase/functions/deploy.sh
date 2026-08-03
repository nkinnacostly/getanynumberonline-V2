#!/usr/bin/env bash
# Deploy Supabase Edge Functions for GetAnyNumberOnline.
#
# IMPORTANT: always deploy with --no-verify-jwt.
# The Supabase CLI RESETS "Verify JWT with legacy secret" back to ON on every
# deploy. When it is ON, the Supabase gateway rejects any request without a
# valid Supabase JWT — including the Flutterwave webhook forwarded by
# getpaidly.co (which carries `verif-hash`, not a JWT) — with a 401 BEFORE the
# function code runs. That silently breaks wallet top-ups. Each function does
# its own auth (verif-hash for webhooks, auth.getUser() for user calls), so the
# gateway JWT check must stay OFF.
#
# Usage:
#   ./supabase/functions/deploy.sh                # deploy all functions
#   ./supabase/functions/deploy.sh wallet-topup   # deploy specific function(s)

set -euo pipefail

FUNCTIONS=(
  cancel-order
  cancel-rental
  get-esim-catalog
  get-esim-profile
  get-rental-catalog
  get-rental-pricing
  order-esim
  order-number
  poll-rental-sms
  poll-sms
  reconcile-topups
  rent-number
  sync-smspool-catalog
  wallet-topup
)

targets=("$@")
if [ ${#targets[@]} -eq 0 ]; then
  targets=("${FUNCTIONS[@]}")
fi

for fn in "${targets[@]}"; do
  echo "▶ Deploying $fn (--no-verify-jwt)"
  supabase functions deploy "$fn" --no-verify-jwt
done

echo "✔ Done. Verify JWT is OFF for all deployed functions."
