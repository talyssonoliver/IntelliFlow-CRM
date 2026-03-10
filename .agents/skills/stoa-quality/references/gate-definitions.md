# Quality STOA: Gate Definitions

## Core Quality Gates

```bash
# 1. Test execution with coverage
pnpm exec turbo run test:coverage 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/turbo-test-coverage.log"
# Coverage thresholds: 90% statements, branches, functions, lines
```

## Integration Tests

```bash
# 2. Integration tests (if defined)
pnpm run test:integration 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/test-integration.log"
```

## E2E Tests (when applicable)

```bash
# 3. E2E tests (for UI-impacting changes)
pnpm run test:e2e 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/test-e2e.log"
```

## Optional Quality Gates

```bash
# 4. Mutation testing (Stryker - if enabled)
if [ "$ENABLE_MUTATION" = "true" ]; then
  pnpm exec stryker run 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/stryker.log"
fi

# 5. SonarQube analysis (if SONAR_TOKEN available)
if [ -n "$SONAR_TOKEN" ]; then
  node scripts/sonarqube-helper.js analyze 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/sonarqube.log"
fi

# 6. Lighthouse CI (for frontend changes)
if [ "$RUN_LIGHTHOUSE" = "true" ]; then
  pnpm exec lighthouse-ci autorun 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/lighthouse-ci.log"
fi
```

## Coverage Thresholds

From `vitest.config.ts` (enforced):

| Metric | Threshold | Action if Below |
|---|---|---|
| Statements | 90% | FAIL |
| Branches | 90% | FAIL |
| Functions | 90% | FAIL |
| Lines | 90% | FAIL |

**Critical Configuration Check:**

```typescript
// vitest.config.ts MUST have:
coverage: {
  thresholds: {
    statements: 90,
    branches: 90,
    functions: 90,
    lines: 90,
  },
  thresholdAutoUpdate: false,  // CRITICAL: must be false
}
```

If `thresholdAutoUpdate: true`, the gate is ineffective — report as NEEDS_HUMAN.

## Verdict Logic

There is **NO WARN verdict**. All verdicts are binary: PASS, FAIL, or NEEDS_HUMAN.

| Condition | Verdict |
|---|---|
| Coverage >= 90%, all tests pass, no lint errors | PASS |
| Coverage below 90% | FAIL |
| Tests fail | FAIL |
| Coverage enforcement not configured | NEEDS_HUMAN |

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

const qualityGates = ['turbo-test-coverage'];

const results = await runGates(qualityGates, {
  repoRoot,
  evidenceDir,
  matrix,
  dryRun: false,
});

// Parse coverage from output
const coverageMatch = results[0].stdout?.match(/All files\s+\|\s+([\d.]+)/);
const coverage = coverageMatch ? parseFloat(coverageMatch[1]) : 0;

const findings = [];
if (coverage < 90) {
  findings.push({
    severity: 'high',
    source: 'turbo-test-coverage',
    message: `Coverage at ${coverage}% (threshold: 90%) — FAIL`,
    recommendation: 'Add tests to increase coverage above 90%',
  });
}

const verdict = generateStoaVerdict(
  'Quality',
  taskId,
  { execute: qualityGates, waiverRequired: [], skipped: [] },
  results,
  [],
  isStrictMode()
);

writeStoaVerdict(evidenceDir, verdict);
```

## Verdict JSON Schema

```json
{
  "stoa": "Quality",
  "taskId": "<TASK_ID>",
  "verdict": "PASS|FAIL|NEEDS_HUMAN",
  "rationale": "Coverage 92.3%, all 156 tests passed",
  "toolIdsSelected": ["turbo-test-coverage", "eslint-max-warnings-0"],
  "toolIdsExecuted": ["turbo-test-coverage", "eslint-max-warnings-0"],
  "waiversProposed": [],
  "findings": [],
  "metrics": {
    "coverage": {
      "statements": 92.3,
      "branches": 91.1,
      "functions": 93.5,
      "lines": 92.0
    },
    "tests": {
      "total": 156,
      "passed": 156,
      "failed": 0,
      "skipped": 2
    }
  },
  "timestamp": "2025-12-20T14:30:00.000Z"
}
```

## Example Output

```
[Quality STOA] Task: IFC-001
[Quality STOA] Running 1 gate...

  [1/1] turbo-test-coverage... PASS (23.4s)
        - 156 tests passed, 0 failed, 2 skipped
        - Coverage: 92.3% statements, 91.1% branches

[Quality STOA] Verdict: PASS
[Quality STOA] Rationale: Coverage 92.3% exceeds 90% threshold, all tests passed
[Quality STOA] Output: artifacts/reports/system-audit/<RUN_ID>/stoa-verdicts/Quality.json
```
