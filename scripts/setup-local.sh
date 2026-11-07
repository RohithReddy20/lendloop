#!/usr/bin/env bash
# One-time local wiring for the Convex <-> n8n integration.
#
#  1. Creates n8n/.env with freshly generated secrets (unless it already exists).
#  2. Pushes the matching secrets + webhook URL to the current Convex deployment
#     (piped through stdin, so secrets never appear in the process list or shell history).
#
# Usage: scripts/setup-local.sh [--force]
#   N8N_WEBHOOK_URL / SITE_URL env vars override the defaults below.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f n8n/.env && "${1:-}" != "--force" ]]; then
  echo "• n8n/.env already exists, keeping it (pass --force to regenerate secrets)"
else
  sed \
    -e "s|^N8N_ENCRYPTION_KEY=$|N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)|" \
    -e "s|^LENDLOOP_TO_N8N_SECRET=$|LENDLOOP_TO_N8N_SECRET=$(openssl rand -hex 32)|" \
    -e "s|^N8N_TO_LENDLOOP_SECRET=$|N8N_TO_LENDLOOP_SECRET=$(openssl rand -hex 32)|" \
    n8n/.env.example > n8n/.env
  chmod 600 n8n/.env
  echo "• wrote n8n/.env with new secrets"
fi

get() { grep -E "^$1=" n8n/.env | head -1 | cut -d= -f2-; }

{
  echo "LENDLOOP_TO_N8N_SECRET=$(get LENDLOOP_TO_N8N_SECRET)"
  echo "N8N_TO_LENDLOOP_SECRET=$(get N8N_TO_LENDLOOP_SECRET)"
  echo "N8N_LOAN_EVENTS_WEBHOOK_URL=${N8N_WEBHOOK_URL:-http://localhost:5678/webhook/lendloop/loan-events}"
  echo "SITE_URL=${SITE_URL:-http://localhost:3000}"
} | npx convex env set

echo "• Convex deployment configured"
echo
echo "Still to do (once): npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev"
