#!/usr/bin/env bash
# PG-203 D12 local stack. Run from the worktree root inside:
#   node scripts/test-db.mjs run --seed -- bash tmp/pg203-local/stack.sh
# DATABASE_URL comes from test-db (a fresh, migrated, seeded database). Nothing reads .env.local.
set -euo pipefail
export NODE_ENV=development PORT=4000 APP_URL=http://localhost:3400
export REDIS_HOST=localhost REDIS_PORT=6380
export EMAIL_PROVIDER=mock DSAR_SLA_INTERVAL_MS=0 RUN_ADMIN_LHCI=1
unset RESEND_API_KEY SENDGRID_API_KEY || true

WEB_LOG=tmp/pg203-local/web.log
pnpm --filter @intelliflow/web exec next start -p 3400 > "$WEB_LOG" 2>&1 &
WEB_PID=$!
cleanup() { taskkill //PID "$WEB_PID" //T //F > /dev/null 2>&1 || kill "$WEB_PID" 2> /dev/null || true; }
trap cleanup EXIT
for _ in $(seq 1 90); do
  if curl -s -o /dev/null -w '%{http_code}' http://localhost:3400/robots.txt | grep -q 200; then break; fi
  sleep 2
done
npx tsx tmp/pg203-local/e2e-dsar.ts
