# Automation STOA Sub-Agent

Execute Automation STOA validation for orchestration, validation rules, and
artifact contracts.

## Usage

```
/stoa-automation <TASK_ID> [RUN_ID]
```

## Arguments

- `TASK_ID` (required): The task ID being validated
- `RUN_ID` (optional): The run ID from MATOP orchestrator. If not provided,
  generates a new one.

## Responsibility

The Automation STOA owns:

- Factory mechanics (swarm, orchestrator)
- Validation rules and scripts
- Artifact placement contracts
- Sprint tracking infrastructure
- Metrics and registry integrity
- Audit/evidence generation
- CI/CD pipeline automation
- STOA framework itself

## Gate Profile (Mandatory)

Execute these gates in order:

### Validation Infrastructure

```bash
# 1. Sprint 0 validation
pnpm run validate:sprint0 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/sprint-validation.log"

# 2. Sprint data validation
pnpm run validate:sprint-data 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/sprint-data-validation.log"
```

### Artifact Placement

```bash
# 3. Artifact paths linting
tsx tools/lint/artifact-paths.ts 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/artifact-paths-lint.log"
```

### Registry Integrity

```bash
# 4. Task registry consistency check
tsx tools/scripts/validate-sprint-data.ts 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/registry-check.log"
```

### CSV Uniqueness

```bash
# 5. Canonical file uniqueness check
COPIES=$(git ls-files | grep -c 'Sprint_plan.csv' || echo "0")
if [ "$COPIES" -ne 1 ]; then
  echo "ERROR: Found $COPIES copies of Sprint_plan.csv (expected 1)" | tee "artifacts/reports/system-audit/$RUN_ID/gates/csv-uniqueness.log"
  exit 1
fi
echo "OK: Exactly 1 Sprint_plan.csv tracked" | tee "artifacts/reports/system-audit/$RUN_ID/gates/csv-uniqueness.log"
```

### Metrics Sync Check

```bash
# 6. Verify metrics are synced from CSV
pnpm run sync:metrics --check 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/metrics-sync.log"
```

## Validation Rules

### Canonical File Locations

| File               | Expected Location                                     | Check            |
| ------------------ | ----------------------------------------------------- | ---------------- |
| Sprint_plan.csv    | `apps/project-tracker/docs/metrics/_global/`          | Uniqueness       |
| task-registry.json | `apps/project-tracker/docs/metrics/_global/`          | Derived from CSV |
| Task JSON files    | `apps/project-tracker/docs/metrics/sprint-0/phase-*/` | Schema valid     |

### Forbidden Locations

Runtime artifacts MUST NOT exist in:

- `apps/project-tracker/docs/metrics/.locks/**`
- `apps/project-tracker/docs/metrics/logs/**`
- `apps/project-tracker/docs/artifacts/**`
- `docs/**/*.tmp`, `docs/**/*.lock`

### Evidence Bundle Requirements

Every MATOP run MUST produce:

- `summary.json` with resolved canonical paths
- `evidence-hashes.txt` with SHA256 for all artifacts
- `gate-selection.json` with execute/waiverRequired/skipped
- `stoa-verdicts/<STOA>.json` for each signing STOA

## Verdict Logic

| Condition                                                   | Verdict |
| ----------------------------------------------------------- | ------- |
| All validation scripts pass, artifacts in correct locations | PASS    |
| Minor sync warnings, validations pass                       | WARN    |
| Sprint validation fails                                     | FAIL    |
| Artifact in forbidden location                              | FAIL    |
| Multiple Sprint_plan.csv copies                             | FAIL    |
| Registry inconsistent with CSV                              | FAIL    |

## Verdict Output

Produce verdict file at:
`artifacts/reports/system-audit/$RUN_ID/stoa-verdicts/Automation.json`

```json
{
  "stoa": "Automation",
  "taskId": "<TASK_ID>",
  "verdict": "PASS|WARN|FAIL|NEEDS_HUMAN",
  "rationale": "All validation scripts passed, artifacts correctly placed",
  "toolIdsSelected": [
    "artifact-paths-lint",
    "sprint-validation",
    "sprint-data-validation"
  ],
  "toolIdsExecuted": [
    "artifact-paths-lint",
    "sprint-validation",
    "sprint-data-validation"
  ],
  "waiversProposed": [],
  "findings": [],
  "automationMetrics": {
    "sprintValidationsPassed": 58,
    "artifactPathsValid": true,
    "csvUnique": true,
    "registrySynced": true
  },
  "timestamp": "2025-12-20T14:30:00.000Z"
}
```

## When to Trigger

The Automation STOA is triggered when:

### By Task Prefix (Lead)

- `AUTOMATION-*` tasks

### By Keywords (Supporting STOA)

- `orchestrator`, `swarm`, `tracker`
- `validation`, `artifact`, `audit`
- `sprint`, `metrics`, `registry`

### By Path Impact

- `tools/scripts/**`
- `tools/lint/**`
- `tools/audit/**`
- `tools/stoa/**`
- `apps/project-tracker/**`
- `.claude/commands/**`

## Self-Validation

The Automation STOA validates its own infrastructure:

```typescript
// Verify STOA framework is correctly installed
const stoaModules = [
  'tools/scripts/lib/stoa/types.ts',
  'tools/scripts/lib/stoa/gate-selection.ts',
  'tools/scripts/lib/stoa/stoa-assignment.ts',
  'tools/scripts/lib/stoa/orchestrator.ts',
];

for (const module of stoaModules) {
  if (!existsSync(join(repoRoot, module))) {
    findings.push({
      severity: 'critical',
      source: 'stoa-framework-check',
      message: `Missing STOA module: ${module}`,
      recommendation: 'Reinstall STOA framework',
    });
  }
}
```

## Example Output

```
[Automation STOA] Task: AUTOMATION-002
[Automation STOA] Running 4 gates...

  [1/4] sprint-validation... PASS (2.1s)
        - 58/58 validations passed
  [2/4] sprint-data-validation... PASS (1.3s)
        - 27 Sprint 0 tasks validated
  [3/4] artifact-paths-lint... PASS (0.8s)
        - All artifacts in correct locations
  [4/4] csv-uniqueness... PASS (0.2s)
        - Exactly 1 Sprint_plan.csv tracked

[Automation STOA] Verdict: PASS
[Automation STOA] Rationale: All validation scripts passed, infrastructure intact
[Automation STOA] Output: artifacts/reports/system-audit/<RUN_ID>/stoa-verdicts/Automation.json
```

## Related Commands

- `/matop-execute` - MATOP orchestrator (spawns this sub-agent)
- `/stoa-foundation` - Foundation STOA sub-agent
- `/stoa-quality` - Quality STOA sub-agent
