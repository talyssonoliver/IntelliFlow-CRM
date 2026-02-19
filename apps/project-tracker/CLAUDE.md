# apps/project-tracker — Sprint Tracker & Metrics Dashboard

Dashboard at http://localhost:3002/

**Dashboard Features**:
- **Live Sprint Progress**: Auto-refreshes every 30 seconds
- **Phase Breakdown**: Visual progress for all Sprint 0 phases
- **KPI Tracking**: Automation %, manual interventions, blockers
- **Completed Tasks**: Timeline with duration metrics
- **Blocker History**: All blockers with resolution status

## Single Source of Truth

`Sprint_plan.csv` at `docs/metrics/_global/Sprint_plan.csv` is the **single source of truth** for all task data. All JSON files are derived.

**DO NOT read Sprint_plan.csv directly** — exceeds 25K token limit. Use split files (`Sprint_plan_A.csv` through `E`). See `docs/claude-refs/sprint-plan-guide.md`.

**Always sync after editing CSV**: UI Sync button, API call, or CLI script.
**NEVER edit JSON files directly** — they'll be overwritten by sync.

## JSON Schema Rules (CRITICAL)

Schemas at `docs/metrics/schemas/` use `additionalProperties: false` — **NO extra fields allowed**.

### task-status.schema.json
- **Status enum**: Only `Planned`, `Backlog`, `In Progress`, `Validating`, `Completed`, `Blocked`, `Failed`, `Needs Human`, `In Review`
- **`artifacts.created`**: Must be objects `{ path, sha256, created_at }`, NOT strings
- **`context_acknowledgment.files_read`**: Requires `sha256` key (64-char hex), not `hash`
- **`validation_results`**: Allowed fields: `name`, `command`, `exit_code`, `passed`, `timestamp`, `duration_ms`, `stdout_hash`. Use names: "TypeScript", "Tests", "Lint", "Build". NO `details` field.
- **`gate_results`**: `gate_id` (required), `passed` (required), `exit_code`, `score`, `timestamp`, `log_path`
- **`kpis`**: Each allows `target`, `actual`, `met` (required), `unit` (optional)
- **`dependencies`**: Only `required`, `all_satisfied`, `verified_at`

### attestation.schema.json
- NO `files_created`, `files_modified`, `coverage_metrics`, `plan_deliverables`, `completion_gates`, `schedule_metrics`, `completion_status`
- USE `artifact_hashes`, `dependencies_verified`, and `notes` instead
- **Validate JSON against schemas BEFORE writing** — don't create then fix

## Hashing

Use `certutil -hashfile <path> SHA256` on Windows for SHA256 hashes (not Get-FileHash).

## API Endpoints

- `/api/metrics/sprint` — Sprint summary with KPIs
- `/api/metrics/phases` — All phase progress
- `/api/metrics/task/[taskId]` — Individual task details
- `/api/sync-metrics` (POST) — Trigger sync
- `/api/sprint-plan/` — Sprint plan data

## Sync Methods

1. UI — Metrics page → green "Sync" button → "Refresh"
2. API — `curl -X POST http://localhost:3002/api/sync-metrics`
3. CLI — `cd apps/project-tracker && npx tsx scripts/sync-metrics.ts`

## Task Completion Workflow

When completing a Sprint_plan task:

1. **Update Sprint_plan.csv**: Change `Status` column from "Planned" → "Completed"
2. **Create Task JSON**: Add `{TASK-ID}.json` in appropriate phase folder
3. **Update Phase Summary**: Modify `_phase-summary.json` aggregated metrics
4. **Update Sprint Summary**: Update `_summary.json` with new totals
5. **Verify Dashboard**: Check http://localhost:3002/ Metrics tab shows update

### Phase Directory Patterns

```
docs/metrics/
├── sprint-0/
│   ├── _summary.json
│   ├── phase-0-initialisation/
│   │   ├── _phase-summary.json
│   │   └── TASK-ID.json
│   ├── phase-1-ai-foundation/
│   ├── phase-2-parallel/
│   │   ├── parallel-a/
│   │   ├── parallel-b/
│   │   └── parallel-c/
│   ├── phase-3-dependencies/
│   └── phase-5-completion/
├── sprint-1/
│   └── phase-1-validation/
└── schemas/
    ├── task-status.schema.json
    ├── phase-summary.schema.json
    ├── sprint-summary.schema.json
    └── attestation.schema.json
```

## Anti-Fabrication Measures

All metrics use cryptographic verification — **NEVER** simulate, mock, or fabricate data:

- **SHA256 hashes**: Prove artifact creation
- **Stdout hashes**: Verify command execution
- **ISO 8601 timestamps**: Immutable audit trail
- **Validation exit codes**: Prove test success (must come from actual execution)
- **JSON schemas**: Enforce data integrity (`additionalProperties: false`)

If infrastructure is unavailable, display "pending" or "not available" — never populate with fake/sample values.

## Key Files

- `lib/data-sync.ts` — Sync utility functions
- `app/api/sync-metrics/route.ts` — API endpoint
- `scripts/sync-metrics.ts` — CLI script
- `docs/DATA_SYNC.md` — Full documentation
