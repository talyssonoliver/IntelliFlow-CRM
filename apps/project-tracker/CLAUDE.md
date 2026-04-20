# apps/project-tracker — Sprint Tracker & Metrics Dashboard

Next.js 16 dashboard served at http://localhost:3002/. Reads the sprint plan
CSV + metrics tree, renders live progress, and powers the APIs consumed by
`/exec`, `/refresh-context`, `/compliance-check`, and executive reporting.

## Tech

Next.js 16.1.6 (App Router) · React 19.2 · Tailwind v4 · Zod v4 · `csv-parse` +
`papaparse` · `js-yaml`. Port 3002 is fixed in `package.json`.

## Two Directories, Two Roles

Evidence and tracking are split across two trees. Know which is which:

| Tree                                                        | Role                                                                                                                             | Hand-edit?                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `.specify/sprints/sprint-{N}/` (repo root)                  | **Source of truth for evidence** — attestations, context packs, plans, specs, execution runs, STOA verdicts, follow-ups, reports | Yes (by `/exec`, `/plan-session`, `/spec-session`, etc.) |
| `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` | **Source of truth for the task list** — statuses, KPIs, dependencies, dates                                                      | Yes                                                      |
| `apps/project-tracker/docs/metrics/sprint-{N}/*.json`       | **Derived** — per-task tracking JSON built from CSV + `.specify/` evidence; powers the dashboard                                 | **Never — sync overwrites**                              |
| `apps/project-tracker/docs/metrics/schemas/`                | JSON schemas referenced by both trees                                                                                            | Schema changes only                                      |

Pipeline: CSV + `.specify/**` ─(sync)→ `docs/metrics/sprint-*/*.json` ─→
dashboard APIs.

## Sprint Plan CSV

`docs/metrics/_global/Sprint_plan.csv` (589 rows, ~316 tasks, sprints 0–29).

**DO NOT read `Sprint_plan.csv` directly** — exceeds the 25K token limit. Use
the split files:

```
Sprint_plan_A.csv  (EXC-INIT-001 → IFC-042)
Sprint_plan_B.csv  (IFC-043 → PG-015)
Sprint_plan_C.csv  (PG-016 → SALES-002)
Sprint_plan_D.csv  (PM-OPS-001 → IFC-123)
Sprint_plan_E.csv  (IFC-124 → IFC-170)
Sprint_plan_F.csv  (IFC-171 → PG-156)
Sprint_plan_G.csv  (PG-157 → IFC-233)
Sprint_plan_H.csv  (IFC-234 → IFC-296)
Sprint_plan_I.csv  (IFC-297 → IFC-308)
```

Regenerate splits: `npx tsx tools/scripts/split-sprint-plan.ts`. Full guide:
`docs/claude-refs/sprint-plan-guide.md`.

## JSON Schemas (CRITICAL)

Schemas at `docs/metrics/schemas/` all use `additionalProperties: false` — no
extra fields anywhere:

```
analytics-event · attestation · dependency-graph · evidence-pack
extracted-text · kpi-definitions · phase-summary · sprint-summary
task-registry · task-status · traceability · vulnerability-baseline
```

### task-status.schema.json

- **Required top-level**: `task_id`, `status` (root is closed).
- **Status enum**: accepts both Title Case and UPPER_SNAKE variants —
  `Planned/PLANNED`, `Backlog/BACKLOG`, `In Progress/IN_PROGRESS`,
  `Validating/VALIDATING`, `Completed/DONE`, `Blocked/BLOCKED`, `Failed/FAILED`,
  `Needs Human/NEEDS_HUMAN`, `In Review/IN_REVIEW`.
- **`dependencies`**: `required` + `all_satisfied` required; `verified_at`,
  `notes` optional. Legacy `dependencies_resolved` still allowed at root.
- **`artifacts.created[]`**: objects `{ path, sha256 (64-hex), created_at }` —
  never plain strings. Also supports `expected[]` and `missing[]`.
- **`validations[]`**: required `name`, `command`, `executed_at`, `exit_code`,
  `passed`; optional `duration_ms`, `stdout_hash`. Standard names: `TypeScript`,
  `Tests`, `Lint`, `Build`.
- **`kpis`**: each KPI object requires `target`, `actual`, `met`; optional
  `unit`.
- **`execution`**: `retry_count` required; optional `started_at`,
  `completed_at`, `duration_minutes`, `executor`, `agents`,
  `execution_log`/`log_path`, `last_error`.
- **`status_history[]`**: `{ status, at, note? }`.

### attestation.schema.json

- **Required**: `schema_version` (`"1.0.0"`), `task_id`, `attestor`,
  `attestation_timestamp`, `verdict`.
- **Verdict enum**: `COMPLETE`, `INCOMPLETE`, `PARTIAL`, `BLOCKED`,
  `NEEDS_HUMAN`. Use `verdict`, **not** `status` (common LLM mistake — CSV
  column is `Status`, but the attestation field is `verdict`).
- **Attestation path**:
  `.specify/sprints/sprint-{N}/attestations/{TASK_ID}/attestation.json` — the
  integrity checker only scans `attestations/`, not `execution/{run_id}/`.
- **Context ack filename**: plain `context_ack.json`, never prefixed with the
  task ID.
- **`validation_results[]`** (executive dashboard reads this): required
  `command`, `exit_code`, `passed`, `timestamp`; optional `name`, `duration_ms`,
  `stdout_hash`. Include exactly 4 entries — TypeScript, Tests, Lint, Build.
- **`gate_results[]`**: `gate_id` + `passed` required; optional `exit_code`,
  `score`, `timestamp`, `log_path`.
- **`kpi_results[]`**: all four of `kpi`, `target`, `actual`, `met` required.
- **Also allowed** at root: `context_acknowledgment`, `evidence_summary`,
  `artifact_hashes`, `dependencies_verified`, `definition_of_done_items`,
  `manual_verification`, `environment`, `notes`, `run_id`.

Two different systems read validation data: the executive dashboard API reads
`validation_results` from `attestation.json`; the sprint-validation CLI reads
`validations[]` from the task-status JSON under `docs/metrics/sprint-*/`. Keep
both in sync.

**Validate against the schema before writing** — don't create then fix.

## Hashing

Use `certutil -hashfile <path> SHA256` on Windows (not `Get-FileHash`, which
formats differently). Lowercase 64-hex output is required by the schema
patterns.

## App Layout

```
app/
├── page.tsx, layout.tsx, providers.tsx, globals.css
├── swarm/             # Swarm monitor page
├── terminal/          # Execution terminal view
└── api/               # 23 endpoint groups — see below

components/            # 30+ views: Dashboard, Executive, Gantt, Kanban,
                       # Schedule, Contracts, Governance, Artifacts,
                       # Audit, Tracking, Swarm, TaskModal, ...
lib/
├── data-sync/         # Sync package: orchestrator, csv-mapping,
│                      #   json-generators, summary-generators,
│                      #   task-json-updater, dependency-graph,
│                      #   schedule-sync, validation, file-io
├── context-snapshot.ts        # Powers docs/SESSION_CONTEXT.md
├── current-state-report.ts    # Powers docs/CURRENT_STATE_REPORT.md
├── csv-parser.ts, csv-status.ts
├── api.ts, api-types.ts, TaskDataContext.tsx
├── artifact-registry.ts, governance.ts, execution-history.ts
├── phase-calculator.ts, schedule-calculator.ts, priority-scorer.ts
├── task-coverage.ts, data-validator.ts, risk-domain.ts
├── claude-session-spawner.ts, subprocess-spawner.ts, run-assistant.ts
└── paths.ts, types.ts, utils.ts, icons.tsx

scripts/
├── sync-metrics.ts               # CLI sync (alt to API/UI)
├── generate-context.ts           # Writes docs/SESSION_CONTEXT.md
└── generate-current-state-report.ts  # Writes docs/CURRENT_STATE_REPORT.md
```

## API Endpoints

Grouped under `app/api/`:

| Group                                                                                                                                                                                                               | Purpose                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sprint-plan/`                                                                                                                                                                                                      | Master CSV/JSON read                                                                                                                                               |
| `sprint/`                                                                                                                                                                                                           | `baseline`, `completion`, `events`, `execute`, `generate-prompt`, `history`, `phases`, `progress`, `status`, `validation`                                          |
| `tasks/`                                                                                                                                                                                                            | List + `generate-prompt`, `plan`, `plan-batch`, `start`, `validation-summary`                                                                                      |
| `metrics/`                                                                                                                                                                                                          | `sprint`, `phases`, `task/[taskId]`, `executive`, `capacity`, `velocity`, `team-velocity`, `risks`, `profiling`, `feedback-analytics`, `web-vitals`, `watch`       |
| `audit/`                                                                                                                                                                                                            | `affected`, `bundles`, `matrix`, `sprint-completion`, `stream`                                                                                                     |
| `compliance/`                                                                                                                                                                                                       | `accessibility`, `security-scan`, `test-results`, `zap-scan`                                                                                                       |
| `governance/`                                                                                                                                                                                                       | `debt`, `digest`, `lint-report`, `migrate`, `phantom-audit`, `platform-health`, `revert-incomplete`, `review-queue`, `run-lint`, `summary`, `task`, `traceability` |
| `schedule/`                                                                                                                                                                                                         | `calculate`, `critical-path`                                                                                                                                       |
| `matop/`                                                                                                                                                                                                            | `plan`, `spec`, `sprint-runs`                                                                                                                                      |
| `context/`, `contracts/`, `artifacts/`, `dependency-graph/`, `spec-tracker/`, `tracking/`, `infrastructure/`, `code-analysis/`, `performance-report/`, `run-k6-test/`, `claude-session/`, `swarm/`, `unified-data/` | Supporting feature surfaces                                                                                                                                        |
| `sync-metrics/` (POST)                                                                                                                                                                                              | Trigger full sync from CSV → JSON tree                                                                                                                             |

## Sync Methods

1. **UI** — Metrics page → green "Sync" button → "Refresh".
2. **API** — `curl -X POST http://localhost:3002/api/sync-metrics`.
3. **CLI** — `cd apps/project-tracker && npx tsx scripts/sync-metrics.ts`.

All three run the orchestrator in `lib/data-sync/` to rebuild `_summary.json`,
`_phase-summary.json`, and per-task files from the CSV.

## Context / State Report Generators

- **Session digest** (`docs/SESSION_CONTEXT.md`):
  `npx tsx apps/project-tracker/scripts/generate-context.ts` or
  `curl -X POST http://localhost:3002/api/context` or `/refresh-context`.
  Source: `lib/context-snapshot.ts`.
- **Full state report** (`docs/CURRENT_STATE_REPORT.md`): regenerated by the
  same three entry points. Source: `lib/current-state-report.ts`.

Both files are derived — **never hand-edit**.

## Evidence Tree — `.specify/sprints/sprint-{N}/`

**Canonical** execution-evidence tree. Written by `/spec-session`,
`/plan-session`, `/exec`, `/compliance-check`, `/hydrate-context`,
`/code-review`, `/matop-execute`. The integrity checker and STOA agents read
from here. The metrics tree is derived from this plus the CSV — but sync only
_reads_ `.specify/`; it never writes into it.

Sprints present: 0–29, plus **sprint-41** (outlier: only holds
`attestations/DOC-010/context_pack.*` — no attestation or task-status file; not
mirrored in the metrics tree).

```
.specify/
├── memory/
│   ├── constitution.md
│   └── Framework.md
└── sprints/sprint-{N}/
    ├── _summary.json
    ├── specifications/             # {TASK_ID}-spec.md, {TASK_ID}-discussion.md
    │                                #   (sometimes *-v1-superseded.md)
    ├── planning/                    # {TASK_ID}-plan.md + superseded versions
    │   └── codex-run/               #   Sprint-0 ONLY: {manifests/, plan.json,
    │                                #   prompt.md, report.md, tasks.json}
    ├── attestations/{TASK_ID}/      # ← integrity checker scans ONLY this dir
    │   ├── attestation.json
    │   ├── attestation-latest.json  #   (optional, some tasks)
    │   ├── context_ack.json         #   plain filename — NO TASK_ID prefix
    │   ├── context_pack.md
    │   └── context_pack.manifest.json
    ├── execution/{TASK_ID}/         # Two run-dir naming conventions live:
    │   ├── run-{ISO8601}Z/          #   Sprint-17+ (new)
    │   └── {YYYYMMDD-HHMMSS}-{hash}/ #  Sprint-0 era (legacy)
    │       ├── {TASK_ID}-delivery.md
    │       ├── logs/                 #   Numbered step logs (06-typecheck.log, ...)
    │       └── matop/
    │           ├── gate-selection.json
    │           └── stoa-verdicts/{Foundation|Domain|Quality|…}.json
    ├── context/                      # Newer surface (sprint-15, 17, 29 so far)
    │   ├── {TASK_ID}-agent-selection.json
    │   ├── {TASK_ID}-hydrated-context.json
    │   ├── {TASK_ID}-hydrated-context.md
    │   ├── {TASK_ID}-plan-session.json
    │   └── {TASK_ID}/                #   Some tasks nest their own dir
    ├── reports/                      # code-review/{run-ts}/, latest@ symlink,
    │                                  #   package-review/
    ├── follow-ups/                   # {TASK_ID}-follow-ups.json
    └── sprint-{N}-audit.json         # Ad hoc (e.g., sprint-10-audit.json)
```

**Two-tree linkage**:

- Metrics task JSON (`docs/metrics/sprint-{N}/{TASK_ID}.json`) points back via
  `execution.log_path` to
  `.specify/sprints/sprint-{N}/execution/{TASK_ID}/run-*/...-delivery.md`.
- `.specify/` attestations reference schemas via
  `$schema: "../../../../apps/project-tracker/docs/metrics/schemas/attestation.schema.json"`.
- `findTaskFile()` in `lib/data-sync/file-io.ts` only searches
  `docs/metrics/sprint-{N}/`; evidence resolution crosses to `.specify/` only
  through explicit paths.

## Derived Metrics Tree — `apps/project-tracker/docs/metrics/`

Rebuilt by sync. The dashboard reads here, never from `.specify/` directly (it
references `.specify/` via `execution.log_path` on task-status files).

```
docs/metrics/
├── _global/                    # Sprint_plan.csv/json, Sprint_plan_A..I.csv,
│                               #   task-registry.json, dependency-graph.json,
│                               #   kpi-definitions.json, phase-validations/,
│                               #   continuous/, flows/
├── schemas/                    # 12 schemas (see list above)
├── sprint-0/ … sprint-29/      # Per-task tracking JSON (DERIVED)
│   ├── _summary.json           # Canonical per-sprint aggregate (always)
│   └── {TASK_ID}.json          # task-status schema — FLAT at sprint root
├── plan-overrides.yaml
├── plan-remediation.csv
├── review-queue.json
└── validation.yaml
```

**Canonical layout is flat**: `docs/metrics/sprint-{N}/{TASK_ID}.json`. Sync
writes every new task at the sprint root regardless of phase.

**Legacy phase subdirs** (`phase-*/`, including
`phase-2-parallel/parallel-{a,b,c}/`) still exist in sprints 0, 2, 5, 15, 17
from earlier conventions. Nothing deletes them, and `findTaskFile` /
`updateSprintSummaryGeneric` walk them recursively, so a `{TASK_ID}.json` inside
a phase dir is still honored — but don't create new ones there.

**`_phase-summary.json` is effectively dead.** Only 4 files survive (sprint-0
`parallel-b` + sprint-2's three phase dirs). `updatePhaseSummaries` is hardcoded
to sprint-0 and only touches summaries that already exist; it never creates them
for other sprints. Treat as historical.

## Anti-Fabrication

All metrics are cryptographically verifiable — **never** simulate, mock, or
fabricate data:

- SHA256 hashes prove artifact creation.
- Stdout hashes verify command execution.
- ISO 8601 timestamps form an immutable audit trail.
- Exit codes must come from actual runs.
- Closed JSON schemas (`additionalProperties: false`) enforce shape.

If infrastructure is unavailable, display "pending" or "not available" — never a
fake value.

## Key Files

- `lib/data-sync/` — orchestrator + generators.
- `app/api/sync-metrics/route.ts` — API sync endpoint.
- `scripts/sync-metrics.ts` — CLI sync.
- `docs/DATA_SYNC.md` — end-to-end sync documentation.
- `docs/metrics/README.md` — metrics infrastructure overview.
