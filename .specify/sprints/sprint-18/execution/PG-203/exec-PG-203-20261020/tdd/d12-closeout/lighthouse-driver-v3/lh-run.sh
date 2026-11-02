#!/usr/bin/env bash
# PG-203 D12 Lighthouse re-measure (2026-10-29). Run from the worktree root, under the exclusive DB slot:
#   node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-203 --exclusive intelliflow-db -- bash tmp/pg203-local/lh-run.sh
# Local Supabase (auth only, migrations and seed off) in a scratch workdir, a production web build with the
# local endpoints inlined, then stack.sh inside a fresh migrated and seeded test database. Reads no .env.local.
set -euo pipefail
SB=/c/Users/talys/AppData/Local/Temp/claude/C--Users-talys-projects-intelliFlow-CRM-worktrees-pg-203/f7d22516-a758-41d6-8916-a2c4accfdecc/scratchpad/supa
mkdir -p "$SB/supabase"
cp supabase/config.toml "$SB/supabase/config.toml"
cp -r supabase/templates "$SB/supabase/" 2>/dev/null || true
python - "$SB/supabase/config.toml" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s = re.sub(r'(\[db\.migrations\][^\[]*?enabled = )true', r'\1false', s, count=1, flags=re.S)
s = re.sub(r'(\[db\.seed\][^\[]*?enabled = )true', r'\1false', s, count=1, flags=re.S)
open(p, 'w', encoding='utf-8', newline='\n').write(s)
PY

stop_supabase() { supabase stop --workdir "$SB" > /dev/null 2>&1 || true; }
trap stop_supabase EXIT
echo "[lh-run] supabase start $(date -u +%FT%TZ)"
supabase start --workdir "$SB" > "$SB/start.log" 2>&1
supabase status -o env --workdir "$SB" > "$SB/status.env" 2> /dev/null
python tmp/pg203-local/make-env.py "$SB/status.env" tmp/pg203-local/local.env

set -a
# shellcheck disable=SC1091
. tmp/pg203-local/local.env
set +a
echo "[lh-run] web build $(date -u +%FT%TZ)"
pnpm --filter @intelliflow/web build > tmp/pg203-local/web-build.log 2>&1
echo "[lh-run] stack $(date -u +%FT%TZ)"
node scripts/test-db.mjs run --seed -- bash tmp/pg203-local/stack.sh > tmp/pg203-local/run.log 2>&1
echo "[lh-run] done $(date -u +%FT%TZ)"
cat tmp/pg203-local/result.json
