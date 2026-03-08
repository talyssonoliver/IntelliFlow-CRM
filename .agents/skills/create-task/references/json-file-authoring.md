# Task JSON File Authoring

## File Location

Place task JSONs at:
```
apps/project-tracker/docs/metrics/sprint-{N}/{phase-dir}/{TASK-ID}.json
```

Phase directory patterns:
- `phase-0-initialisation/`
- `phase-1-ai-foundation/`, `phase-1-validation/`, `phase-1/`
- `phase-2-parallel/parallel-a/`, `parallel-b/`, `parallel-c/`
- `phase-3-dependencies/`
- `phase-5-completion/`
- Root of sprint dir (no phase) for later sprints (sprint-2+)

For new tasks where sprint/phase is uncertain, place directly in `sprint-{N}/`.

## $schema Relative Path

The `$schema` path is relative to the JSON file's location:
- Depth 2 (e.g., `sprint-2/IFC-004.json`): `"../../schemas/task-status.schema.json"`
- Depth 3 (e.g., `sprint-0/phase-1-ai-foundation/AI-SETUP-001.json`): `"../../schemas/task-status.schema.json"` — schemas dir is at metrics level
- Depth 4 (e.g., `sprint-0/phase-2-parallel/parallel-a/AI-SETUP-002.json`): `"../../../schemas/task-status.schema.json"`

Count directory levels from the JSON file up to `docs/metrics/` to determine depth.

## Schema: Required Fields

Only `task_id` and `status` are strictly required by the schema. But for completeness, populate all fields.

## New Task Template

```json
{
  "$schema": "../../schemas/task-status.schema.json",
  "task_id": "TASK-ID",
  "section": "Section from CSV",
  "description": "Description from CSV",
  "owner": "Owner from CSV",
  "sprint": "sprint-N",
  "phase": "phase-name or null",
  "stream": null,
  "status": "Backlog",
  "dependencies": {
    "required": ["DEP-001", "DEP-002"],
    "all_satisfied": false,
    "verified_at": null
  },
  "dependencies_resolved": [],
  "started_at": null,
  "completed_at": null,
  "target_duration_minutes": null,
  "actual_duration_minutes": null,
  "kpis": {},
  "artifacts": {
    "expected": [],
    "created": [],
    "missing": []
  },
  "validations": [],
  "blockers": [],
  "status_history": [
    {
      "status": "Backlog",
      "at": "2026-02-23T00:00:00Z"
    }
  ],
  "notes": ""
}
```

## Field Rules (additionalProperties: false at every level)

### `status`
Title-case for new tasks: `"Backlog"`. The schema allows both cases (e.g., `Backlog` and `BACKLOG`), but use title-case for new JSON files. Valid values: `Planned`, `Backlog`, `In Progress`, `Validating`, `Completed`, `Blocked`, `Failed`, `Needs Human`, `In Review`.

### `dependencies`
Only these fields allowed (additionalProperties: false):
- `required` (array of strings) — dependency task IDs
- `all_satisfied` (boolean) — false for new tasks
- `verified_at` (ISO string or null) — null for new tasks
- `notes` (string, optional) — extra context

### `execution`
Only these fields allowed (additionalProperties: false):
- `started_at`, `completed_at` (ISO string or null)
- `duration_minutes` (number or null)
- `executor` (string)
- `agents` (array of strings)
- `execution_log`, `log_path` (strings)
- `retry_count` (integer, required, default 0)
- `last_error` (string or null)

For new Backlog tasks, omit the `execution` object entirely (it's optional).

### `artifacts`
- `expected`: array of strings — artifact paths from CSV Artifacts column (strip ARTIFACT:/EVIDENCE:/SPEC:/PLAN: prefixes)
- `created`: array of objects `{ path, sha256, created_at }` — empty for new tasks
- `missing`: array of strings — empty for new tasks

### `kpis`
Object with string keys. Each value must have:
- `target` (string | number | boolean) — required
- `actual` (string | number | boolean) — required (use `null`-equivalent like `0` or `""` for new tasks; or set a placeholder)
- `met` (boolean) — required (false for new tasks)
- `unit` (string) — optional

For new tasks, either leave `kpis` as `{}` or populate targets from the CSV KPIs column.

### `status_history`
Array of objects, each with:
- `status` (string, required) — must be valid status enum
- `at` (string, required) — ISO 8601 timestamp
- `note` (string, optional)

For new tasks: one entry with `"Backlog"` status and current timestamp.

### `blockers`
Each object: `description` (required), `raised_at` (required), `resolved_at` (nullable), `resolution` (optional).

### `validations`
Each object: `name`, `command`, `executed_at`, `exit_code`, `passed` (all required). Optional: `duration_ms`, `stdout_hash`. Empty array for new tasks.

## Forbidden Fields

Do NOT add fields that belong to `attestation.schema.json`:
- `files_created`, `files_modified`, `coverage_metrics`, `plan_deliverables`, `completion_gates`, `schedule_metrics`, `completion_status`, `context_acknowledgment`, `gate_results`

The task-status schema has `additionalProperties: false` — any extra field will fail validation.

## Validation

After writing the JSON, verify it against the schema by checking:
1. All required fields present (`task_id`, `status`)
2. No extra fields at any nesting level
3. Status value is in the enum
4. ISO timestamps match the pattern (end with `Z`)
5. `dependencies.required` contains only strings
