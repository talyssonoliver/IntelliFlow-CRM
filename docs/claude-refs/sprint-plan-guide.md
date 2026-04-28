# Sprint Plan Guide

## CSV Location

`apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` — **single source of
truth**.

**DO NOT read Sprint_plan.csv directly** — exceeds 25K token limit. Use the
range-split files. As of Wave 4 they are **gitignored derived files** — only
`Sprint_plan.csv` itself is committed:

| Range  | Approximate content        | ~Tokens |
| ------ | -------------------------- | ------- |
| `A`    | Earliest sprints (0-1)     | ~18k    |
| `B-D`  | Sprints 1-12               | ~18k each |
| `E-G`  | Sprints 12-22              | ~12-18k each |
| `H-J`  | Sprints 22-29 (most recent) | ~8-15k each |

Read a range via either:

1. **Local**: `pnpm regenerate:derived` — content-hash cached, idempotent.
   Output lands in `apps/project-tracker/docs/metrics/_global/Sprint_plan_<range>.csv`
   (gitignored). Cache hits on warm runs are <100 ms.
2. **API**: `GET http://localhost:3002/api/sprint-plan?range=<A..J>` —
   project-tracker regenerates lazily and caches per request.

**Auto-regeneration triggers**:

- On git commit (pre-commit hook detects CSV changes; runs `regenerate:derived`)
- On data-sync (UI sync button or API call)
- Manually: `pnpm regenerate:derived` (or `npx tsx tools/scripts/regenerate-derived.ts`)
- On fresh clone: same — regenerator is required before any agent reads splits

`task-registry.json` and `dependency-graph.json` are also derived files; the
same `pnpm regenerate:derived` orchestrator produces them via
`build-task-registry.mjs` / `build-dependency-graph.mjs`.

## Key CSV Columns

- `Section`: Feature area (AI Foundation, Validation, Core CRM, etc.)
- `Dependencies`: Task IDs that must complete first
- `Pre-requisites`: Files, policies, and environment requirements (see prefixes
  below)
- `Definition of Done`: Specific completion criteria
- `KPIs`: Measurable success metrics (e.g., "Coverage >90%", "Response <200ms")
- `Target Sprint`: Sprint number (0-33) or "Continuous"
- `Artifacts To Track`: Specific files/directories to be created
- `Validation Method`: How to verify task completion
- `Cadence`: Operational refresh cadence for continuous tasks (e.g., `daily:1d`,
  `weekly:7d`)

## Pre-requisite Prefixes

- `FILE:path/to/file` — Required file must exist
- `ENV:description` — Environment/configuration requirement
- `POLICY:description` — Policy or process requirement
- `IMPLEMENTS:FLOW-XXX` — Implements a specific flow
- `DESIGN:path/to/mockup.png` — **UI Design mockup to match** (CRITICAL for UI
  tasks)

**UI Tasks**: All PG-\* tasks MUST reference design mockups via `DESIGN:`
prefix. See `docs/design/README.md`.

## Dashboard Views

| View       | Purpose                                        | When to Use                                             |
| ---------- | ---------------------------------------------- | ------------------------------------------------------- |
| Dashboard  | Sprint overview, task counts, progress bars    | Start of sprint, quick status checks                    |
| Kanban     | Visual task board by status                    | Track task flow: Backlog → Planned → In Progress → Done |
| Analytics  | Charts, trends, velocity metrics               | Mid-sprint reviews, identify bottlenecks                |
| Metrics    | KPI tracking, phase summaries, evidence        | Verify KPIs met, check attestations                     |
| Execution  | Sprint orchestration, parallel spawning        | Execute sprints, monitor sub-agents                     |
| Governance | Policy compliance, STOA gate results           | Verify governance requirements met                      |
| Contracts  | Task agreements, SLAs, commitments             | Review task contracts before completion                 |
| Audit      | Full audit runs, security scans, quality gates | Final validation before marking Done                    |

## Task Structure

Each task has: Task ID, Section, Description, Owner, Dependencies,
Pre-requisites, Definition of Done, KPIs, Target Sprint, Artifacts To Track,
Validation Method.

## Example: IFC-106 (Hexagonal Module Boundaries)

```
Dependencies: IFC-002, IFC-131
Pre-requisites: Domain model for all entities implemented
Definition of Done: Application layer created (ports + use-cases);
                    adapters layer created; module boundary rules enforced in CI;
                    architecture tests passing; ADR updated
KPIs: No domain code depends on infrastructure, 100% adapters tested
Artifacts: packages/application/src/ports/*,
           packages/application/src/usecases/*,
           packages/adapters/src/*,
           tests/architecture/*,
           docs/architecture/hex-boundaries.md
```

This tells you:

- Wait for `IFC-002` and `IFC-131` to complete first
- Create specific packages and tests
- Ensure domain has no infrastructure deps (verified by tests)
- Document in ADR

## Finding Tasks

```bash
# Search for a specific task
grep "IFC-106" Sprint_plan.csv

# Find all tasks in a section
grep "Core CRM" Sprint_plan.csv

# Find tasks for a specific sprint
grep ",5," Sprint_plan.csv  # Sprint 5 tasks
```

## Runtime State Files

The swarm orchestrator (`scripts/swarm/orchestrator.sh`) uses these JSON files
at runtime:

- `artifacts/blockers.json` — Tracks blocked tasks requiring resolution
- `artifacts/human-intervention-required.json` — Tracks tasks needing human
  review
- `artifacts/qualitative-reviews/` — Stores qualitative review outputs

These files are **generated at runtime** (not versioned), read/written during
swarm execution, located in `artifacts/` (NOT under `docs/`).

## Data Synchronization

`Sprint_plan.csv` is single source of truth. All JSON files are derived.

**Architecture**:

```
Sprint_plan.csv (SOURCE OF TRUTH — committed)
       ↓ [pnpm regenerate:derived — content-hash cached]
   ├── Sprint_plan.json
   ├── Sprint_plan_[A-J].csv      (derived, gitignored)
   ├── task-registry.json         (derived, gitignored)
   ├── dependency-graph.json      (derived, gitignored)
   ├── Individual task files (*.json)
   └── Phase summaries (_phase-summary.json)
```

**Sync Methods** (in order of preference):

1. UI Sync — Metrics page → green "Sync" button → "Refresh"
2. Auto-Sync — Click "Refresh" button on any page (auto-syncs in background)
3. API Call — `curl -X POST http://localhost:3002/api/sync-metrics`
4. CLI — `cd apps/project-tracker && npx tsx scripts/sync-metrics.ts`

**DO**:

- Always edit `Sprint_plan.csv` for task updates
- Run sync after CSV changes
- Check console logs to verify sync succeeded

**DON'T**:

- Edit JSON files directly (they'll be overwritten)
- Skip syncing after CSV edits (causes inconsistencies)
- Edit multiple files manually (only edit the CSV)

## Troubleshooting Inconsistent Data

If metrics don't match after editing CSV:

1. Click green "Sync" button on Metrics page
2. Check browser console for "Metrics synced:" message
3. Click "Refresh" to reload updated data

**Manual Verification**:

```powershell
$csv = Import-Csv "apps\project-tracker\docs\metrics\_global\Sprint_plan.csv"
$sprint0 = $csv | Where-Object { $_.'Target Sprint' -eq '0' }
$sprint0 | Group-Object Status | Select-Object Name, Count
```

**Implementation Files**:

- `apps/project-tracker/lib/data-sync.ts` — Sync utility functions
- `apps/project-tracker/app/api/sync-metrics/route.ts` — API endpoint
- `apps/project-tracker/scripts/sync-metrics.ts` — CLI script
- `apps/project-tracker/docs/DATA_SYNC.md` — Full documentation

## Key Resources

- **Sprint Plan CSV**:
  `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` — 303 tasks,
  single source of truth
- **Sprint Plan JSON**:
  `apps/project-tracker/docs/metrics/_global/Sprint_plan.json` — Structured data
  (auto-generated)
- **Metrics Dashboard**: http://localhost:3002/ — Real-time sprint progress
- **Metrics README**: `apps/project-tracker/docs/metrics/README.md` —
  Infrastructure documentation
- **Data Sync Docs**: `apps/project-tracker/docs/DATA_SYNC.md`
- **README**: `README.md` — Project overview and quick start
- **Planning Analysis**: `PLANNING_ANALYSIS.md` — Initial sprint decomposition
  (Portuguese)
- **ADRs**: `docs/architecture/adr/` — Architecture decisions
- **API Docs**: Auto-generated from tRPC routers (`pnpm run docs:api`)
- **Domain Docs**: Docusaurus site at `docs/`
- **Dependency Chains**:
  `docs/architecture/diagrams/complete-dependency-chains.md` — All 36 entities
- **Dependency Graph**: Task dependencies tracked in CSV `Dependencies` column
