# Hydrate Context — Full Hydration Process

## §1 Extract Task Metadata

Read from `Sprint_plan.csv` (use split files A-E based on task range):
- Task ID, section, description
- Status, target sprint
- Dependencies, definition of done
- Affected paths (from Pre-requisites and Artifacts To Track columns)

## §2 Resolve Dependency Artifacts

For each task listed in the Dependencies column:
- Find specifications: `.specify/sprints/sprint-{N}/specifications/{DEP_ID}-spec.md`
- Find execution plans: `.specify/sprints/sprint-{N}/planning/{DEP_ID}-plan.md`
- Find attestation records: `.specify/sprints/sprint-{N}/attestations/{DEP_ID}/`
- Identify code files and interfaces created by that task

## §3 Scan Codebase Patterns

- Search for relevant code by task keywords (task title words, section name, entity names)
- Extract code snippets with surrounding context (5–10 lines)
- Score patterns by relevance to the task
- Limit to most relevant patterns (max 20)

## §4 Load Project Knowledge

- CLAUDE.md project guidelines (`CLAUDE.md` at repo root)
- Architecture documentation (ADRs at `docs/planning/adr/`)
- Product Requirements Documents (PRDs at `docs/planning/prd-*.md`)
- Domain model files (`packages/domain/src/`)
- Prisma schemas (`packages/db/prisma/schema.prisma`)

### §4.1 PRD/ADR Resolution

For the task being hydrated, identify the **most relevant** PRD and ADR:

1. **PRD resolution**: Search `docs/planning/prd-*.md` for PRDs whose `Related Tasks`
   field or feature area matches the task's section/description. Store the path in
   `relatedPrd` (or `null` if no match).
2. **ADR resolution**: Search `docs/planning/adr/ADR-*.md` for ADRs whose
   `Technical Story` field references the task ID or related task IDs. Store in
   `relatedAdrs[]`.
3. Include both in the hydrated context output so downstream skills can reference them.

## §5 Generate Context Hash

- SHA256 hash of all context content combined
- Enables verification of context integrity between sessions

## §6 Requirements Flow Hook (Elicitação → Análise)

Capture the upstream inputs explicitly. Store in the hydrated context so
spec/ADR can reference them:

- **Necessidades dos Usuários** — what the user needs this feature to do
- **Informações de Domínio** — domain knowledge relevant to the task
- **Sistemas Existentes** — existing systems/code this interacts with
- **Regulamentos** — regulatory requirements (GDPR, SOC2, etc.)
- **Leis** — legal constraints

**Flag gaps**:
- If no ADR exists for the decision area, note `"adr_required": true` so
  spec-session can open an ADR stub.
- If the task is user-facing (PG-*, or IFC-* with UI components) and no PRD
  covers the feature area, note `"prd_required": true` so spec-session can
  create one.

## Output Example

```
User: /hydrate-context IFC-101

Claude Code:
[Context Hydration] Task: IFC-101 - Lead Domain Model
[Context Hydration] Starting context hydration...

[Task Metadata]
- Section: Core CRM
- Status: Planned
- Dependencies: IFC-002, IFC-106
- Sprint: 2

[Dependency Artifacts]
- IFC-002: Specification found at .specify/sprints/sprint-2/specifications/IFC-002-spec.md
- IFC-106: Completed, attestation at .specify/sprints/sprint-1/attestations/IFC-106/

[Codebase Patterns] Found 12 relevant patterns:
- packages/domain/src/crm/lead/Lead.ts:15 (Lead entity)
- packages/validators/src/lead.ts:8 (Zod schema)
- apps/api/src/modules/lead/lead.router.ts:22 (tRPC router)

[Project Knowledge]
- CLAUDE.md loaded (15KB)
- 6 ADRs found
- 3 domain models identified
- Prisma schema loaded

[Output]
Context written to: .specify/sprints/sprint-2/context/IFC-101/IFC-101-hydrated-context.md
Context hash: sha256:a1b2c3d4...
```
