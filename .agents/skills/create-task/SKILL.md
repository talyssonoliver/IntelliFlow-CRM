---
name: create-task
description: Create new tasks in the IntelliFlow CRM sprint plan. Generates Sprint_plan.csv rows, task JSON files, task-registry entries, and dependency-graph nodes with PRD/ADR governance. Use when the user says "add a task", "create a new task", "register a feature", "new sprint item", "add to sprint plan", or asks to track a new piece of work.
---

# Create Task

Automate end-to-end task creation across Sprint_plan.csv, task JSON, task-registry.json, and dependency-graph.json. All data is sourced from the real codebase — never fabricated.

## Task Prefix → STOA Owner Mapping

| Prefix | Domain | STOA Owner |
|--------|--------|------------|
| IFC-* (domain/API) | Core features, integrations | STOA-Domain |
| IFC-* (security) | Security features | STOA-Security |
| PG-* | Pages, UI components | STOA-Quality |
| ENV-*-AI | Environment, infrastructure | STOA-Foundation |
| AI-SETUP-*, AUTOMATION-* | AI tooling, agent coordination | STOA-Intelligence |
| EXC-* | Exception/special tasks | STOA-Foundation |
| GOV-*, DOC-*, PM-OPS-* | Governance, docs, PM ops | STOA-Automation |
| ANALYTICS-* | Analytics features | STOA-Domain |
| BRAND-*, GTM-*, SALES-* | Brand, go-to-market, sales | STOA-Quality |
| ENG-OPS-*, EP-* | Engineering ops, process | STOA-Foundation |
| EXP-* | Experimental/exploration | STOA-Intelligence |

## Hexagonal Layer → Owner Mapping

| Layer | Package | Typical Prefix |
|-------|---------|----------------|
| Domain | `packages/domain/` | IFC-* |
| Application (Ports/Use Cases) | `packages/application/` | IFC-* |
| Adapters (Repositories) | `packages/adapters/` | IFC-* |
| Validators | `packages/validators/` | IFC-* |
| API (tRPC Routers) | `apps/api/` | IFC-* |
| Frontend (Pages/Components) | `apps/web/` | PG-* |
| AI Worker | `apps/ai-worker/` | AI-SETUP-*, IFC-* |
| Infrastructure | Docker, CI, configs | ENV-*-AI |

## Phase Overview

| Phase | Name | Key Actions | Reference |
|-------|------|-------------|-----------|
| 1 | Context Gathering | Determine prefix, scan IDs, search codebase | `references/id-generation.md` |
| 2 | Task Specification | Generate 17 CSV columns, display draft | `references/csv-columns-guide.md` |
| 3 | File Creation | Write JSON, append CSV, update registry + graph | `references/json-file-authoring.md`, `references/dependency-graph-update.md` |
| 4 | PRD/ADR Governance | Create stubs if needed | `references/prd-adr-governance.md` |
| 5 | Verification | 10-gate checklist | `references/verification-checklist.md` |

---

## Phase 1: Context Gathering

### 1.1 Determine Task Prefix

From the user's description, infer which prefix to use (see mapping tables above). If ambiguous, ask the user.

### 1.2 Allocate Task ID

Read `references/id-generation.md` for the full procedure:
1. Read `apps/project-tracker/docs/metrics/_global/task-registry.json`
2. Extract all IDs for the prefix across all status arrays
3. Allocate MAX + 1
4. Verify uniqueness via Grep across Sprint_plan split files

### 1.3 Search Codebase for Context

Gather real data to inform the task specification:

**Related code** — Grep for relevant domain entities, services, components:
```
Grep pattern="<keyword>" in packages/domain/src/
Grep pattern="<keyword>" in apps/web/src/
Grep pattern="<keyword>" in apps/api/src/modules/
```

**Related PRDs** — Search for existing requirements:
```
Glob pattern="docs/planning/prd-*.md"
```
Read titles to find related documents.

**Related ADRs** — Search for architectural decisions:
```
Read docs/planning/adr/README.md
```
Scan the index for related ADRs.

**Dependency chains** — Find where this task fits:
```
Read docs/design/diagrams/complete-dependency-chains.md
```
Search for related entity names.

**Similar completed tasks** — Calibrate estimates:
```
Grep pattern="<similar-section>" in Sprint_plan split files
```
Read completed task JSONs to get `actual_duration_minutes`.

### 1.4 Identify Dependencies

From the codebase search, determine:
- Which existing tasks must complete before this one (direct dependencies)
- Which sprint those dependencies are in (to determine target sprint)
- What files/policies are pre-requisites

---

## Phase 2: Task Specification

Read `references/csv-columns-guide.md` for detailed column rules.

Generate all 17 CSV columns using the gathered context. Key fields:

1. **Task ID** — from Phase 1.2
2. **Section** — reuse existing section from CSV
3. **Description** — concise verb-object-qualifier
4. **Owner** — from prefix→owner mapping
5. **Dependencies** — comma-separated task IDs
6. **Pre-requisites** — semicolon-separated FILE:/ENV:/POLICY:/DESIGN: entries
7. **Definition of Done** — outcome + artifacts + targets + verification
8. **Status** — `Backlog`
9. **KPIs** — measurable targets
10. **Target Sprint** — integer >= max dependency sprint
11. **Artifacts To Track** — semicolon-separated ARTIFACT:/EVIDENCE: entries
12. **Validation Method** — semicolon-separated VALIDATE:/AUDIT:/GATE: entries
13. **Estimate (O/M/P)** — calibrated from similar tasks
14. **Planned Start/Finish** — ISO dates
15. **Percent Complete** — `0`
16. **Dependency Types** — mirrors Dependencies with `:FS` suffix

### User Confirmation Gate

Display the complete draft to the user in a readable format:

```
=== New Task Draft ===
Task ID:        IFC-183
Section:        Core CRM
Description:    Implement contact merge with duplicate detection
Owner:          Tech Lead (STOA-Domain)
Dependencies:   IFC-002, IFC-131
Target Sprint:  5
Status:         Backlog
...
```

**Wait for explicit user approval before writing any files.**

---

## Phase 3: File Creation

After user approval, create files in this order:

### 3.1 Create Task JSON

Read `references/json-file-authoring.md` for the full template and field rules.

Write the JSON file to:
```
apps/project-tracker/docs/metrics/sprint-{N}/{TASK-ID}.json
```

### 3.2 Append to Sprint_plan.csv

Read the current end of `Sprint_plan.csv` to find the insertion point.
Append one new row with all 17 columns.

**CSV escaping**: Wrap any field containing commas in double quotes.

### 3.3 Update task-registry.json

Read `apps/project-tracker/docs/metrics/_global/task-registry.json`.

Add the new task ID to the appropriate status array (add to a `BACKLOG` array — create it if it doesn't exist in `tasks_by_status`).

Update:
- `total_tasks` — increment by 1
- `sprints.sprint-{N}` — increment `backlog` count (create sprint entry if new)
- `last_updated` — current ISO timestamp

### 3.4 Update dependency-graph.json

Read `references/dependency-graph-update.md` for the full procedure.

Add the new node and reverse edges. Update `last_updated`.

---

## Phase 4: PRD/ADR Governance

Read `references/prd-adr-governance.md` for the full decision tree.

1. Check if the task prefix requires a PRD or ADR
2. Search for existing related documents
3. If needed and not found, create a minimal stub
4. Link the document path in the CSV Pre-requisites and Artifacts columns

---

## Phase 5: Verification

Read `references/verification-checklist.md` and run all 10 gates:

1. Task ID uniqueness
2. JSON schema compliance
3. Dependency IDs exist
4. No circular dependencies
5. Artifact path plausibility
6. PRD/ADR governance satisfied
7. CSV multi-value separators correct
8. $schema relative path correct
9. Dependency Types mirrors Dependencies
10. Split files stale reminder

Report results:

```
=== Verification Results ===
Gate 1 (ID Uniqueness):        PASS
Gate 2 (JSON Schema):          PASS
...
Gate 10 (Split Files Stale):   PASS (reminder issued)

All gates passed. Task {TASK-ID} created successfully.
```

---

## Output Summary

After successful creation, display:

```
=== Task Created ===
ID:     {TASK-ID}
Sprint: {N}
Files:
  - apps/project-tracker/docs/metrics/sprint-{N}/{TASK-ID}.json (created)
  - apps/project-tracker/docs/metrics/_global/Sprint_plan.csv (appended)
  - apps/project-tracker/docs/metrics/_global/task-registry.json (updated)
  - apps/project-tracker/docs/metrics/_global/dependency-graph.json (updated)
  - docs/planning/prd-{slug}.md (created, if applicable)
  - docs/planning/adr/ADR-{NNN}-{slug}.md (created, if applicable)

Next steps:
  1. Regenerate split files: npx tsx tools/scripts/split-sprint-plan.ts
  2. Sync metrics: curl -X POST http://localhost:3002/api/sync-metrics
  3. Start implementation: /spec-session {TASK-ID}
```
