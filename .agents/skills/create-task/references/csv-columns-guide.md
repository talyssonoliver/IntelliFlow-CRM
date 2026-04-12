# CSV Columns Guide

Sprint_plan.csv has exactly 18 columns. The new row MUST match this header order
exactly:

```
Task ID,Section,Description,Owner,Dependencies,Pre-requisites,Definition of Done,Status,KPIs,Target Sprint,Artifacts To Track,Validation Method,Estimate (O/M/P),Planned Start,Planned Finish,Percent Complete,Dependency Types,Cadence
```

## Column-by-Column Rules

### 1. Task ID

Generated via `references/id-generation.md`. Must match `^[A-Z]+-[A-Z0-9-]+$`.

### 2. Section

Controlled vocabulary — reuse an existing section from the CSV. Common values:

- `AI Foundation`, `Validation`, `Core CRM`, `Environment`, `Security`,
  `Analytics`, `Governance`, `Communications`, `Scheduling`, `Public Site`,
  `Developer Portal`, `Marketing`, `Settings`, `Notifications`, `Billing`

Grep existing rows to discover sections:
`Grep pattern="^[^,]+,([^,]+)," in Sprint_plan_A.csv`.

### 3. Description

Concise task summary. Format: `<verb> <object> <qualifier>`. Keep under 120
chars. Example: `Implement contact merge feature with duplicate detection`

### 4. Owner

Format: `<Role> (STOA-<Owner>)`. Map from task prefix:

| Prefix                   | Owner                             |
| ------------------------ | --------------------------------- |
| IFC-\* (domain/API)      | Tech Lead (STOA-Domain)           |
| IFC-\* (security)        | Security (STOA-Security)          |
| PG-\*                    | Frontend (STOA-Quality)           |
| ENV-\*-AI                | DevOps (STOA-Foundation)          |
| AI-SETUP-_, AUTOMATION-_ | AI Specialist (STOA-Intelligence) |
| EXC-\*                   | Tech Lead (STOA-Foundation)       |
| GOV-_, DOC-_             | PM (STOA-Automation)              |
| ANALYTICS-\*             | Analytics (STOA-Domain)           |

### 5. Dependencies

Comma-separated task IDs that must complete first. Only list direct
dependencies. Example: `IFC-002,IFC-131`

Leave empty if no dependencies.

### 6. Pre-requisites

Semicolon-separated entries using these prefixes:

- `FILE:path/to/file` — Required file must exist
- `ENV:description` — Environment/configuration requirement
- `POLICY:description` — Policy or process requirement
- `IMPLEMENTS:FLOW-XXX` — Implements a specific flow
- `DESIGN:path/to/mockup` — UI design mockup (MANDATORY for all PG-\* tasks)

Standard pre-requisites always included for IFC-_/PG-_:

- `FILE:docs/planning/adr/ADR-NNN-slug.md` (if ADR exists)
- `FILE:docs/planning/prd-slug.md` (if PRD exists)

Search for related PRDs/ADRs and include their paths.

### 7. Definition of Done

Formula:
`<outcome statement>; artifacts: <comma-list>; targets: <measurable>; verified by: <method>`

Example:
`Application layer created (ports + use-cases); adapters layer created; artifacts: packages/application/src/ports/*, packages/adapters/src/*; targets: 100% coverage, no domain-infra deps; verified by: pnpm test, architecture tests`

### 8. Status

New tasks: `Backlog` (title-case). Valid values: Planned, Backlog, In Progress,
Validating, Completed, Blocked, Failed, Needs Human, In Review.

### 9. KPIs

Comma-separated measurable targets. Examples:

- `Coverage >90%, Response <200ms, Zero critical vulnerabilities`
- `100% commands functional, hooks triggering <100ms`

### 10. Target Sprint

Integer 0-33 or `Continuous`. Determine from:

- Dependency sprint (must be >= max dependency sprint)
- Feature timeline from dependency chains doc
- Current sprint if urgent

### 11. Artifacts To Track

Semicolon-separated entries using these prefixes:

- `ARTIFACT:path/to/file` — File to be created
- `EVIDENCE:path/to/attestation` — Evidence file
- `SPEC:path/to/spec` — Specification document
- `PLAN:path/to/plan` — Execution plan

Use real package paths matching project structure:

- `packages/domain/src/crm/<entity>/`
- `packages/application/src/usecases/<domain>/`
- `packages/adapters/src/repositories/`
- `apps/web/src/app/<route>/page.tsx`
- `apps/web/src/components/<feature>/`
- `apps/api/src/modules/<module>/`

### 12. Validation Method

Semicolon-separated entries using these prefixes:

- `VALIDATE:command` — Automated validation (e.g., `VALIDATE:pnpm test`)
- `AUDIT:type` — Manual review (e.g., `AUDIT:manual-review`)
- `GATE:name` — Quality gate (e.g., `GATE:security-scan-pass`)

Standard validations for code tasks:

- `VALIDATE:pnpm typecheck;VALIDATE:pnpm test;VALIDATE:pnpm lint;VALIDATE:pnpm build`

### 13. Estimate (O/M/P)

Optimistic/Most-likely/Pessimistic in minutes. Format: `O/M/P`.

Calibration ranges by type:

- Simple config/doc: `30/60/120`
- Domain model + tests: `60/120/240`
- Full feature (domain + API + UI): `120/240/480`
- Complex integration: `180/360/720`
- Infrastructure/DevOps: `90/180/360`

Search completed similar tasks to calibrate — use their
`actual_duration_minutes` from task JSONs.

### 14. Planned Start

ISO date `YYYY-MM-DD`. Use today's date or the expected start date.

### 15. Planned Finish

ISO date `YYYY-MM-DD`. Calculate from Planned Start + Most-likely estimate.

### 16. Percent Complete

`0` for new Backlog tasks.

### 17. Dependency Types

Mirrors the Dependencies column with `:FS` (Finish-to-Start) suffix. Example: If
Dependencies is `IFC-002,IFC-131`, then Dependency Types is
`IFC-002:FS,IFC-131:FS`.

Leave empty if Dependencies is empty.

### 18. Cadence

Operational refresh cadence for continuous tasks. Format: `name:threshold`.
Valid values: `daily:1d`, `weekly:7d`, `per-sprint:14d`, `quarterly:90d`,
`per-build:1d`. Leave EMPTY for one-time tasks (the vast majority). Only set for
tasks with `Target Sprint = Continuous`.

## CSV Escaping Rules

- Fields containing commas MUST be wrapped in double quotes
- Fields containing double quotes must escape them as `""`
- Semicolons within a field do NOT need escaping (they're intra-field
  separators)
- Never leave trailing commas — every row must have exactly 17 commas (18
  fields)
