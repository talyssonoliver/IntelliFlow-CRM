# Validation Commands — Bash Reference

This file provides helper command examples only.
Always follow the gate contract in `.claude/skills/exec/references/phase4-completion-gates.md`
first. If the canonical gate file requires additional checks (for example runtime wiring or
validation-matrix verification), this helper reference does not override it.

## Hash Calculation

```bash
# Windows (certutil)
certutil -hashfile path/to/file.ts SHA256

# Linux/Mac
sha256sum path/to/file.ts | cut -d' ' -f1
```

## Gate 1: Checkbox Count

```bash
# Count all checkboxes
grep -c '\- \[ \]\|\- \[x\]' .specify/sprints/sprint-{N}/planning/<TASK_ID>-plan.md

# Count checked only
grep -c '\- \[x\]' .specify/sprints/sprint-{N}/planning/<TASK_ID>-plan.md

# List unchecked
grep '\- \[ \]' .specify/sprints/sprint-{N}/planning/<TASK_ID>-plan.md
```

## Gate 2: File Existence Check

```bash
# Verify a single file exists
test -f "apps/web/src/components/MyComponent.tsx" && echo "EXISTS" || echo "MISSING"

# Verify multiple files from a list
for f in "file1.ts" "file2.tsx" "file3.ts"; do
  test -f "$f" && echo "✅ $f" || echo "❌ MISSING: $f"
done
```

## Gate 2.5: CSV Artifact Reconciliation

```bash
# Automated check (preferred)
npx tsx tools/scripts/validate-artifacts.ts <TASK_ID>

# Manual: verify each path from CSV "Artifacts To Track" column
# Split on ";" delimiter, strip prefix (ARTIFACT:, EVIDENCE:, FILE:)
test -f "<path>" && echo "✅ <path>" || echo "❌ MISSING: <path>"
```

## Gate 3: Build Validation Commands

```bash
# Identify affected package from task type
# PG-*, IFC-090, IFC-091 → apps/web / @intelliflow/web
# IFC-085, AI-SETUP-* → apps/ai-worker / @intelliflow/ai-worker
# IFC-003, IFC-004 → apps/api / @intelliflow/api

# All 4 must exit 0
pnpm --filter <affected-package> typecheck
pnpm --filter <affected-package> test --run
pnpm --filter <affected-package> lint
pnpm --filter <affected-package> build
```

## Gate 4: STOA Verdict Check

```bash
# Read STOA verdicts
cat matop/stoa-verdicts/*.json

# Check consensus
cat matop/stoa-verdicts/consensus.json | grep '"verdict"'
```

## Gate 5: Container Registration Check

```bash
# Check if service is in container.ts
grep -n "ServiceName" apps/api/src/container.ts

# Check if service is in context.ts
grep -n "ServiceName" apps/api/src/context.ts

# Check if router is in router.ts
grep -n "routerName" apps/api/src/router.ts

# Check if Prisma model exists
grep -n "model ModelName" packages/db/prisma/schema.prisma
```

## Gate 6: Mock Coverage Audit

```bash
# Scan test files for container mocks (CRITICAL pattern)
grep -rn "vi.mock.*container" apps/web/src --include="*.test.*"
grep -rn "vi.mock.*context" apps/web/src --include="*.test.*"

# Find all vi.mock calls in a test file
grep -n "vi.mock" path/to/test.test.ts

# Check if mocked service exists in container
grep -n "MockedService" apps/api/src/container.ts
```

## Gate 7: Coverage Measurement

```bash
# Scoped coverage run (set thresholds to 0 to get numbers without blocking)
pnpm vitest run <test-files...> --coverage \
  --coverage.include='<impl-dir-1>/**' \
  --coverage.include='<impl-dir-2>/**' \
  --coverage.thresholds.lines=0 \
  --coverage.thresholds.functions=0 \
  --coverage.thresholds.statements=0 \
  --coverage.thresholds.branches=0

# Example: scope to a single component directory
pnpm vitest run apps/web/src/components/ai-monitoring/__tests__/ \
  --coverage \
  --coverage.include='apps/web/src/lib/ai-monitoring/**' \
  --coverage.include='apps/web/src/components/ai-monitoring/**' \
  --coverage.thresholds.lines=0 \
  --coverage.thresholds.functions=0 \
  --coverage.thresholds.statements=0 \
  --coverage.thresholds.branches=0
```

## Systemic Enforcement API

```bash
# Verify canComplete before marking completion
curl http://localhost:3002/api/tasks/validation-summary/<TASK_ID>

# Successful response looks like:
# { "completionGates": { "canComplete": true, "blockingReasons": [] } }

# Blocked response looks like:
# { "completionGates": { "canComplete": false, "blockingReasons": ["Gate 1: Plan not 100% complete"] } }
```

## Plan Deliverables Verification

```bash
# Parse plan for Files to Create
grep -A 20 "\*\*Files to Create:\*\*" .specify/sprints/sprint-{N}/planning/<TASK_ID>-plan.md | grep "^\- \`"

# Verify each file exists
# (run for each path extracted above)
test -f "<extracted-path>" && echo "✅" || echo "❌ MISSING"
```
