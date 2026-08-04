#!/usr/bin/env bash
# Register (or re-register) this project's eSIM Access webhook.
#
# eSIM Access fires a CHECK_HEALTH probe the moment the URL is saved and REFUSES
# to store an endpoint that does not answer 2xx — so deploy esimaccess-webhook
# and set ESIMACCESS_WEBHOOK_SECRET as an edge secret BEFORE running this.
#
# Usage:
#   ESIMACCESS_ACCESS_CODE=xxx \
#   ESIMACCESS_WEBHOOK_SECRET=yyy \
#   SUPABASE_PROJECT_REF=abcdefgh \
#     ./supabase/functions/esimaccess-webhook/register.sh
#
#   ./supabase/functions/esimaccess-webhook/register.sh --show   # just read it back

set -euo pipefail

: "${ESIMACCESS_ACCESS_CODE:?set ESIMACCESS_ACCESS_CODE}"
BASE="https://api.esimaccess.com/api/v1/open"

if [ "${1:-}" = "--show" ]; then
  curl -s -X POST "$BASE/webhook/query" \
    -H "RT-AccessCode: $ESIMACCESS_ACCESS_CODE" \
    -H "Content-Type: application/json" -d '{}'
  echo
  exit 0
fi

: "${ESIMACCESS_WEBHOOK_SECRET:?set ESIMACCESS_WEBHOOK_SECRET (same value as the edge secret)}"
: "${SUPABASE_PROJECT_REF:?set SUPABASE_PROJECT_REF}"

URL="https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/esimaccess-webhook?token=${ESIMACCESS_WEBHOOK_SECRET}"

echo "▶ Registering $URL"
curl -s -X POST "$BASE/webhook/save" \
  -H "RT-AccessCode: $ESIMACCESS_ACCESS_CODE" \
  -H "Content-Type: application/json" \
  -d "{\"webhook\":\"$URL\"}"
echo
echo "If success:false above, the CHECK_HEALTH probe failed — confirm the"
echo "function is deployed with --no-verify-jwt and the secret matches."
