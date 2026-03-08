# Metrics Format — JSON Examples & Recording Process

## Session Start Example

```json
{
  "$schema": "../../../schemas/task-status.schema.json",
  "task_id": "PG-015",
  "status": "In Progress",
  "started_at": "2026-01-29T09:00:00.000Z",
  "completed_at": null,
  "status_history": [
    {
      "status": "In Progress",
      "at": "2026-01-29T14:00:00.000Z",
      "note": "exec session started"
    }
  ],
  "execution": {
    "started_at": "2026-01-29T14:00:00.000Z",
    "completed_at": null,
    "executor": "Claude Code /exec",
    "agents": ["Foundation", "Security", "Quality", "Domain"],
    "retry_count": 0
  }
}
```

### Display at Start

```
[Metrics] Task PG-015 exec session started
[Metrics] Status: Plan Complete → In Progress
[Metrics] Execution started at: 2026-01-29T14:00:00.000Z
[Metrics] STOAs: Foundation, Security, Quality, Domain
[Metrics] Saved to: apps/project-tracker/docs/metrics/sprint-13/PG-015.json
```

---

## Session End Example (Success)

```json
{
  "status": "Completed",
  "completed_at": "2026-01-29T16:30:00.000Z",
  "actual_duration_minutes": 450,
  "status_history": [
    { "status": "Completed", "at": "2026-01-29T16:30:00.000Z", "note": "exec completed — MATOP PASS" }
  ],
  "execution": {
    "started_at": "2026-01-29T14:00:00.000Z",
    "completed_at": "2026-01-29T16:30:00.000Z",
    "duration_minutes": 150,
    "executor": "Claude Code /exec",
    "agents": ["Foundation", "Security", "Quality", "Domain"],
    "retry_count": 0,
    "last_error": null
  },
  "artifacts": {
    "expected": ["apps/web/src/app/(public)/login/page.tsx"],
    "created": [
      {
        "path": "apps/web/src/app/(public)/login/page.tsx",
        "sha256": "a1b2c3d4...",
        "created_at": "2026-01-29T15:30:00.000Z"
      }
    ],
    "missing": []
  },
  "validations": [
    {
      "name": "TypeScript",
      "command": "pnpm --filter @intelliflow/web typecheck",
      "executed_at": "2026-01-29T16:00:00.000Z",
      "exit_code": 0,
      "duration_ms": 12500,
      "passed": true
    },
    {
      "name": "Tests",
      "command": "pnpm --filter @intelliflow/web test",
      "executed_at": "2026-01-29T16:10:00.000Z",
      "exit_code": 0,
      "duration_ms": 45000,
      "passed": true
    },
    {
      "name": "Lint",
      "command": "pnpm --filter @intelliflow/web lint",
      "executed_at": "2026-01-29T16:15:00.000Z",
      "exit_code": 0,
      "duration_ms": 8000,
      "passed": true
    },
    {
      "name": "Build",
      "command": "pnpm --filter @intelliflow/web build",
      "executed_at": "2026-01-29T16:20:00.000Z",
      "exit_code": 0,
      "duration_ms": 35000,
      "passed": true
    }
  ],
  "kpis": {
    "test_coverage": { "target": 80, "actual": 85.3, "met": true, "unit": "percent" },
    "response_time": { "target": 200, "actual": 145, "met": true, "unit": "ms" }
  },
  "blockers": [],
  "notes": "Sign-in page implemented with CSRF protection and full accessibility."
}
```

### Display at End (Success)

```
[Metrics] ════════════════════════════════════════════
[Metrics] Task PG-015 COMPLETED
[Metrics] ════════════════════════════════════════════
[Metrics] Status: In Progress → Completed
[Metrics] Duration: 450 min (7.5h) | Exec: 150 min (2.5h)
[Metrics] Target: 480 min | Status: UNDER TARGET
[Metrics] Artifacts: 2 created, 0 missing
[Metrics] Validations: TypeScript PASS, Tests PASS, Lint PASS, Build PASS
[Metrics] KPIs: Coverage 85.3% (target 80%), Response 145ms (target 200ms)
[Metrics] Saved to: apps/project-tracker/docs/metrics/sprint-13/PG-015.json
[Metrics] ════════════════════════════════════════════
```

---

## Session End Example (Failed)

```json
{
  "status": "Failed",
  "completed_at": "2026-01-29T16:30:00.000Z",
  "status_history": [
    { "status": "Failed", "at": "2026-01-29T16:30:00.000Z", "note": "exec failed — Security gate failed" }
  ],
  "execution": {
    "started_at": "2026-01-29T14:00:00.000Z",
    "completed_at": "2026-01-29T16:30:00.000Z",
    "duration_minutes": 150,
    "executor": "Claude Code /exec",
    "retry_count": 1,
    "last_error": "Security STOA: pnpm audit found 3 high severity vulnerabilities"
  }
}
```

---

## SHA256 Hash Calculation

```bash
# Windows (certutil)
certutil -hashfile path/to/file.ts SHA256
# Take only the second line of output (64 hex chars)

# Linux/Mac
sha256sum path/to/file.ts | cut -d' ' -f1
```

---

## Fields Summary

### Session Start Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Set to "In Progress" |
| `started_at` | ISO 8601 | When session began |
| `status_history[]` | array | Add entry: `{ status, at, note }` |
| `execution.started_at` | ISO 8601 | Implementation start time |
| `execution.executor` | string | "Claude Code /exec" |
| `execution.agents` | string[] | STOA names selected for this task |

### Session End Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | "Completed", "Failed", or "Needs Human" |
| `completed_at` | ISO 8601 | When session ended |
| `actual_duration_minutes` | number | Total minutes from started_at to completed_at |
| `execution.completed_at` | ISO 8601 | Execution end time |
| `execution.duration_minutes` | number | Execution-only duration |
| `execution.last_error` | string\|null | Error message if failed, null if success |
| `artifacts.created[]` | array | `{ path, sha256, created_at }` for each file |
| `artifacts.missing[]` | array | Paths of expected files not created |
| `validations[]` | array | All 4 commands: `{ name, command, executed_at, exit_code, duration_ms, passed }` |
| `kpis{}` | object | `{ target, actual, met, unit }` per KPI |
| `blockers[]` | array | Any remaining blockers |
| `notes` | string | Summary of implementation |

---

## Package Mapping (for validations field)

| Task Pattern | Package Filter |
|---|---|
| `PG-*`, `IFC-090`, `IFC-091` | `@intelliflow/web` |
| `IFC-085`, `AI-SETUP-*` | `@intelliflow/ai-worker` |
| `IFC-003`, `IFC-004` | `@intelliflow/api` |
