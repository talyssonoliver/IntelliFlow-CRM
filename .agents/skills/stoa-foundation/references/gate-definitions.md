# Foundation STOA: Gate Definitions

## Tier 1 Baseline Gates (MANDATORY — NEVER WAIVE)

All Tier 1 gates are NON-WAIVABLE. "Frontend-only", "simple task", or "typecheck sufficient" are NOT valid reasons to skip.

```bash
# 1. TypeScript compilation
pnpm run typecheck 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/turbo-typecheck.log"

# 2. Build validation — NEVER waive or skip
# Typecheck is NOT a substitute. Build validates SSR/CSR boundaries,
# dynamic imports, and bundle resolution that typecheck cannot catch.
pnpm run build 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/turbo-build.log"
# Or package-scoped if root build unavailable:
pnpm --filter <affected-package> build

# 3. Linting
pnpm exec eslint --max-warnings=0 . 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/eslint.log"

# 4. Formatting
pnpm run format:check 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/prettier-check.log"
```

Optional Tier 1 (run when available):
```bash
# 5. Commit linting
python tools/audit/commit_msg_lint.py --count 20 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/commitlint.log"
```

## Foundation-Specific Gates

```bash
# 6. Artifact path validation
tsx tools/lint/artifact-paths.ts 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/artifact-paths-lint.log"

# 7. Docker configuration validation (if docker-compose.yml exists)
if [ -f "docker-compose.yml" ]; then
  docker compose config -q 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/docker-config.log"
fi

# 8. Dependency architecture validation
pnpm exec depcruise --config .dependency-cruiser.cjs packages apps --output-type err 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/dependency-cruiser.log"
```

## Plan Deliverable Verification Gate (BLOCKING)

Read the plan file: `.specify/sprints/sprint-{N}/planning/{TASK_ID}-plan.md`

Steps:
1. Extract ALL file paths from "Files to Create:" and "Files to Modify:" sections
2. Verify each file exists on disk at the EXACT planned path
3. Count verified files and compare against plan's stated total
4. If any planned file is missing or at a different path → FAIL

This gate cannot be waived. Path deviations must be corrected before PASS.

## Verdict Logic

| Condition | Verdict |
|---|---|
| All gates exit 0 | PASS |
| ANY gate exits non-zero (including formatting) | FAIL |
| Build fails OR typecheck fails | FAIL |
| Docker config invalid (for infra tasks) | FAIL |
| Plan deliverable missing or at wrong path | FAIL |

**CRITICAL**: There is NO WARN verdict. Gates either pass (exit 0) or fail. WARN was removed because it silently allowed incomplete work to pass through.

## Execution Code (TypeScript)

```typescript
import {
  loadAuditMatrix,
  selectGates,
  runGates,
  generateStoaVerdict,
  writeStoaVerdict,
  getEvidenceDir,
} from './tools/scripts/lib/stoa/index.js';

const matrix = loadAuditMatrix(repoRoot);
const evidenceDir = getEvidenceDir(repoRoot, runId);

const foundationGates = [
  'turbo-typecheck',
  'turbo-build',
  'eslint-max-warnings-0',
  'prettier-check',
  'commitlint',
  'dependency-cruiser-validate',
];

const results = await runGates(foundationGates, {
  repoRoot,
  evidenceDir,
  matrix,
  dryRun: false,
});

const verdict = generateStoaVerdict(
  'Foundation',
  taskId,
  { execute: foundationGates, waiverRequired: [], skipped: [] },
  results,
  [],
  isStrictMode()
);

writeStoaVerdict(evidenceDir, verdict);
console.log(`Foundation STOA: ${verdict.verdict}`);
```

## Verdict JSON Schema

```json
{
  "stoa": "Foundation",
  "taskId": "<TASK_ID>",
  "verdict": "PASS|FAIL|NEEDS_HUMAN",
  "rationale": "All infrastructure gates passed",
  "toolIdsExecuted": ["turbo-typecheck", "turbo-build", "eslint-max-warnings-0", "prettier-check", "commitlint", "dependency-cruiser-validate"],
  "findings": [],
  "timestamp": "2025-12-20T14:30:00.000Z"
}
```

## Waiver Handling

- Tier 1 gates (typecheck, build, lint, formatting) can NEVER be waived
- Non-Tier-1 gates: if command not available, create waiver record with reason
- Waivers stored in `waivers.json` in evidence dir
- Human must approve waivers before task can complete

## Example Output

```
[Foundation STOA] Task: ENV-008-AI
[Foundation STOA] Running 6 gates...

  [1/6] turbo-typecheck... PASS (2.3s)
  [2/6] turbo-build... PASS (45.2s)
  [3/6] eslint-max-warnings-0... PASS (12.1s)
  [4/6] prettier-check... PASS (3.4s)
  [5/6] commitlint... PASS (1.2s)
  [6/6] dependency-cruiser-validate... PASS (4.5s)

[Foundation STOA] Verdict: PASS
[Foundation STOA] Rationale: All 6 gates passed
[Foundation STOA] Output: artifacts/reports/system-audit/<RUN_ID>/stoa-verdicts/Foundation.json
```

## Rules

- Run ALL Tier 1 gates regardless of individual results (collect all failures)
- Log each gate's stdout/stderr to evidence files
- Report exact exit codes and durations for each gate
- FAIL verdict blocks task completion — issues must be fixed before re-run
