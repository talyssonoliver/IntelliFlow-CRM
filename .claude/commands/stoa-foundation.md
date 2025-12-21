# Foundation STOA Sub-Agent

Execute Foundation STOA validation for infrastructure, tooling, CI, and
environment tasks.

## Usage

```
/stoa-foundation <TASK_ID> [RUN_ID]
```

## Arguments

- `TASK_ID` (required): The task ID being validated
- `RUN_ID` (optional): The run ID from MATOP orchestrator. If not provided,
  generates a new one.

## Responsibility

The Foundation STOA owns:

- Infrastructure and tooling setup
- CI/CD pipeline configuration
- Environment bootstrap and validation
- Docker and container configuration
- Monorepo tooling (Turborepo, pnpm)
- Secrets plumbing and environment variables
- Observability stack setup

## Gate Profile (Mandatory)

Execute these gates from `audit-matrix.yml` in order:

### Tier 1 Baseline Gates

```bash
# 1. TypeScript compilation
pnpm run typecheck 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/turbo-typecheck.log"

# 2. Build validation
pnpm run build 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/turbo-build.log"

# 3. Linting
pnpm exec eslint --max-warnings=0 . 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/eslint.log"

# 4. Formatting
pnpm run format:check 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/prettier-check.log"

# 5. Commit linting
python tools/audit/commit_msg_lint.py --count 20 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/commitlint.log"
```

### Foundation-Specific Gates

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

## Verdict Logic

| Condition                                      | Verdict     |
| ---------------------------------------------- | ----------- |
| All gates exit 0                               | PASS        |
| Non-critical warnings (formatting, minor lint) | WARN        |
| Build fails OR typecheck fails                 | FAIL        |
| Docker config invalid (for infra tasks)        | FAIL        |
| Tool misconfiguration or ambiguous results     | NEEDS_HUMAN |

## Verdict Output

Produce verdict file at:
`artifacts/reports/system-audit/$RUN_ID/stoa-verdicts/Foundation.json`

```json
{
  "stoa": "Foundation",
  "taskId": "<TASK_ID>",
  "verdict": "PASS|WARN|FAIL|NEEDS_HUMAN",
  "rationale": "All infrastructure gates passed",
  "toolIdsSelected": ["turbo-typecheck", "turbo-build", "eslint-max-warnings-0", ...],
  "toolIdsExecuted": ["turbo-typecheck", "turbo-build", ...],
  "waiversProposed": [],
  "findings": [],
  "timestamp": "2025-12-20T14:30:00.000Z"
}
```

## Execution

```typescript
// Run Foundation STOA validation
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

// Foundation-specific gate selection
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

## Waiver Handling

If a required gate cannot run (tool not installed, env var missing):

1. Create waiver record with reason
2. Store in `waivers.json`
3. Mark verdict as WARN (or FAIL in strict mode)
4. Human must approve waiver before task can complete

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

## Related Commands

- `/matop-execute` - MATOP orchestrator (spawns this sub-agent)
- `/stoa-security` - Security STOA sub-agent
- `/stoa-quality` - Quality STOA sub-agent
