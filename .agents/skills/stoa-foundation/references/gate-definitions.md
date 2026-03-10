# Foundation STOA: Gate Definitions

## Baseline Gates — NOT Part of This STOA

The following gates run in MATOP Phase 2.5 (mandatory baseline) BEFORE any STOA agent spawns. They are NOT part of the Foundation STOA and should NOT be re-run here:

```
pnpm run typecheck       # Already run in baseline
pnpm run build           # Already run in baseline
pnpm run lint            # Already run in baseline (eslint --max-warnings=0)
pnpm run format:check    # Already run in baseline
```

**If baseline fails, MATOP stops immediately. This STOA is never spawned.**

## Foundation-Specific Gates

These are the only gates this STOA runs:

```bash
# 1. Artifact path validation
tsx tools/lint/artifact-paths.ts 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/artifact-paths-lint.log"

# 2. Dependency architecture validation (broad scope: all packages + apps)
pnpm exec depcruise --config .dependency-cruiser.cjs packages apps --output-type err 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/dependency-cruiser.log"

# 3. Docker configuration validation (if docker-compose.yml exists)
if [ -f "docker-compose.yml" ]; then
  docker compose config -q 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/docker-config.log"
fi
```

Optional (run when available):
```bash
# 4. Commit linting
python tools/audit/commit_msg_lint.py --count 20 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/commitlint.log"
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
| ANY gate exits non-zero | FAIL |
| Docker config invalid (for infra tasks) | FAIL |
| Plan deliverable missing or at wrong path | FAIL |

**CRITICAL**: There is NO WARN verdict. Gates either pass (exit 0) or fail.

## Execution Code (TypeScript)

```typescript
import {
  loadAuditMatrix,
  runGates,
  generateStoaVerdict,
  writeStoaVerdict,
  getEvidenceDir,
} from './tools/scripts/lib/stoa/index.js';

const matrix = loadAuditMatrix(repoRoot);
const evidenceDir = getEvidenceDir(repoRoot, runId);

// Foundation-specific gates only (baseline already ran typecheck/build/lint)
const foundationGates = [
  'artifact-paths-lint',
  'dependency-cruiser-validate',
  'docker-config',
  'commitlint',
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
  "rationale": "All Foundation-specific gates passed",
  "toolIdsExecuted": ["artifact-paths-lint", "dependency-cruiser-validate", "docker-config", "commitlint"],
  "findings": [],
  "timestamp": "2025-12-20T14:30:00.000Z"
}
```

## Waiver Handling

- Baseline gates (typecheck, build, lint, format) are handled by MATOP Phase 2.5 — NEVER waivable
- Foundation-specific gates: if command not available, create waiver record with reason
- Waivers stored in `waivers.json` in evidence dir
- Human must approve waivers before task can complete

## Example Output

```
[Foundation STOA] Task: ENV-008-AI
[Foundation STOA] Note: Baseline (typecheck, build, lint, format) already passed in Phase 2.5
[Foundation STOA] Running 3 Foundation-specific gates...

  [1/3] artifact-paths-lint... PASS (1.2s)
  [2/3] dependency-cruiser-validate... PASS (4.5s)
  [3/3] docker-config... PASS (0.8s)

[Foundation STOA] Verdict: PASS
[Foundation STOA] Rationale: All Foundation-specific gates passed
[Foundation STOA] Output: artifacts/reports/system-audit/<RUN_ID>/stoa-verdicts/Foundation.json
```

## Rules

- Do NOT re-run baseline gates (typecheck, build, lint, format) — they already ran
- Log each gate's stdout/stderr to evidence files
- Report exact exit codes and durations for each gate
- FAIL verdict blocks task completion — issues must be fixed before re-run
