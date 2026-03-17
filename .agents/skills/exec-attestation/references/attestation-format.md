# Attestation Format — Full JSON Template & Field Rules

> **SCHEMA COMPLIANCE**: Only use fields defined in `apps/project-tracker/docs/metrics/schemas/attestation.schema.json`.
> Adding extra fields will FAIL validation (`additionalProperties: false`).

## Full JSON Template

```json
{
  "$schema": "../../../../../apps/project-tracker/docs/metrics/schemas/attestation.schema.json",
  "schema_version": "1.0.0",
  "task_id": "<TASK_ID>",
  "run_id": "<task_id>-validation-<YYYYMMDD>-<HHMMSS>",
  "attestor": "Claude Code",
  "attestation_timestamp": "<ISO 8601>",
  "verdict": "COMPLETE",
  "evidence_summary": {
    "artifacts_verified": 3,
    "validations_passed": 4,
    "validations_failed": 0,
    "gates_passed": 4,
    "gates_failed": 0,
    "kpis_met": 3,
    "kpis_missed": 0,
    "placeholders_found": 0
  },
  "validation_results": [
    {
      "name": "TypeScript",
      "command": "pnpm --filter <package> typecheck",
      "passed": true,
      "exit_code": 0,
      "timestamp": "<ISO 8601>",
      "duration_ms": 3000
    },
    {
      "name": "Tests",
      "command": "npx vitest run <test-path>",
      "passed": true,
      "exit_code": 0,
      "timestamp": "<ISO 8601>",
      "duration_ms": 5000
    },
    {
      "name": "Lint",
      "command": "npx eslint <src-path>",
      "passed": true,
      "exit_code": 0,
      "timestamp": "<ISO 8601>",
      "duration_ms": 2000
    },
    {
      "name": "Build",
      "command": "pnpm --filter <package> build",
      "passed": true,
      "exit_code": 0,
      "timestamp": "<ISO 8601>",
      "duration_ms": 5000
    }
  ],
  "kpi_results": [
    { "kpi": "<name>", "target": "<value>", "actual": "<value>", "met": true }
  ],
  "definition_of_done_items": [
    { "criterion": "<DoD item>", "met": true, "evidence": "<how verified>" }
  ],
  "dependencies_verified": ["<dependency task IDs>"],
  "context_acknowledgment": {
    "acknowledged_at": "<ISO 8601>",
    "files_read": [
      { "path": "<file>", "sha256": "<64-char hex>" }
    ],
    "invariants_acknowledged": ["<invariants>"]
  },
  "artifact_hashes": {
    "<file-path>": "<64-char hex SHA256>"
  },
  "environment": {
    "os": "<platform>",
    "node_version": "<version>",
    "git_commit": "<commit hash>",
    "branch": "<branch name>"
  },
  "notes": "<summary of implementation>"
}
```

---

## Critical Field Rules

### `validation_results` — MUST have exactly 4 entries

The dashboard API matches by `name`. Use EXACTLY these names:
- `"TypeScript"`
- `"Tests"`
- `"Lint"`
- `"Build"`

Without `name`, UI shows all validations as "pending" even though they passed.

Allowed fields per entry: `name`, `command`, `passed`, `exit_code`, `timestamp`, `duration_ms`
**NOT allowed**: `details`, `stdout`, `stderr`, `output` — additionalProperties is false

### `context_acknowledgment.files_read` — sha256 key (NOT hash)

```json
{ "path": "apps/web/src/...", "sha256": "a1b2c3d4..." }
```

Hash calculation:
- Windows: `certutil -hashfile <path> SHA256`
- Linux/Mac: `sha256sum <path> | cut -d' ' -f1`

### `verdict` Field

| Value | Meaning | Can Complete? |
|---|---|---|
| `"COMPLETE"` | All work finished, all gates passed | YES |
| `"INCOMPLETE"` | Major work remaining | NO |
| `"PARTIAL"` | Some work deferred | NO |
| `"BLOCKED"` | Blocking issues | NO |
| `"NEEDS_HUMAN"` | Human intervention required | NO |

### `kpi_results` — Must use measured percentages

**CORRECT** (measured):
```json
{ "kpi": "Test coverage >=90%", "actual": "95.27% stmts, 96.21% lines, 100% functions", "met": true }
```

**WRONG** (qualitative count):
```json
{ "kpi": "Test coverage >=90%", "actual": "25/25 tests passing, all components covered", "met": true }
```

---

## Fields NOT in Schema (DO NOT include)

These fields will cause schema validation to FAIL:

| Forbidden Field | Use Instead |
|---|---|
| ~~`files_created`~~ | `artifact_hashes` |
| ~~`files_modified`~~ | `artifact_hashes` |
| ~~`schedule_metrics`~~ | Put in task-status JSON |
| ~~`completion_status`~~ | `verdict` |
| ~~`coverage_metrics`~~ | Put in task-status JSON |
| ~~`plan_deliverables`~~ | Parsed from plan file by dashboard API |
| ~~`details`~~ (in validation_results) | Not allowed |

---

## Hash Calculation Commands

```bash
# Windows
certutil -hashfile path/to/file.ts SHA256

# Linux/Mac
sha256sum path/to/file.ts | cut -d' ' -f1
```

Output from certutil looks like:
```
SHA256 hash of path/to/file.ts:
a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd
CertUtil: -hashfile command completed successfully.
```
Take only the second line (64 hex characters).

---

## API Verification

After writing attestation.json, verify the API sees it correctly:

```bash
curl http://localhost:3002/api/tasks/validation-summary/<TASK_ID>
```

Expected response when correct:
```json
{
  "completionGates": {
    "canComplete": true,
    "blockingReasons": []
  },
  "validations": {
    "typecheck": "pass",
    "tests": "pass",
    "lint": "pass",
    "build": "pass"
  }
}
```

If `canComplete` is false or any validation shows "pending", check:
1. `validation_results[].name` uses exact strings ("TypeScript", "Tests", "Lint", "Build")
2. `verdict` is exactly `"COMPLETE"`
3. File is at the correct path: `.specify/sprints/sprint-{N}/attestations/<TASK_ID>/attestation.json`
