#!/bin/sh
# One-shot n8n bootstrap (runs in the n8n image before the main n8n container starts).
#  1. Creates the SMTP credential from environment variables. The credential is stored
#     encrypted (N8N_ENCRYPTION_KEY) in n8n's database and is never written to the repo.
#  2. Imports the workflow JSON files and publishes them.
set -eu

MARKER=/home/node/.n8n/.lendloop-bootstrapped
if [ -f "$MARKER" ] && [ "${N8N_FORCE_REIMPORT:-false}" != "true" ]; then
  echo "[init] already bootstrapped – skipping (set N8N_FORCE_REIMPORT=true to re-import)"
  exit 0
fi

for v in N8N_ENCRYPTION_KEY LENDLOOP_TO_N8N_SECRET N8N_TO_LENDLOOP_SECRET LENDLOOP_CONVEX_SITE_URL; do
  eval "val=\${$v:-}"
  if [ -z "$val" ]; then echo "[init] missing required env var $v (see n8n/.env.example)"; exit 1; fi
done

CRED_FILE=$(mktemp)
trap 'rm -f "$CRED_FILE"' EXIT
# Build JSON with node so special characters in passwords are escaped correctly.
node -e '
const e = process.env;
process.stdout.write(JSON.stringify([{
  id: "LendLoopSmtp0001",
  name: "LendLoop SMTP",
  type: "smtp",
  data: {
    host: e.SMTP_HOST || "mailpit",
    port: Number(e.SMTP_PORT || 1025),
    secure: e.SMTP_SECURE === "true",
    user: e.SMTP_USER || "",
    password: e.SMTP_PASS || "",
    disableStartTls: (e.SMTP_HOST || "mailpit") === "mailpit",
  },
}]));
' > "$CRED_FILE"

n8n import:credentials --input="$CRED_FILE"
n8n import:workflow --separate --input=/workflows
# n8n 2.x only runs an error workflow if it is published too.
for id in LendLoopErrors01 LendLoopNotify01 LendLoopRemind01; do
  n8n publish:workflow --id="$id"
done

touch "$MARKER"
echo "[init] done"
