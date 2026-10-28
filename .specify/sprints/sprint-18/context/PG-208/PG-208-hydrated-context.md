# Hydrated Context: PG-208

**Generated:** 2026-10-20T22:15:19.512Z
**Context Hash:** cafa713adcb8...

---

## Task Metadata

| Field | Value |
|-------|-------|
| Task ID | PG-208 |
| Section | Settings |
| Owner | Frontend Dev (STOA-Foundation) |
| Status | Specifying |
| Target Sprint | 18 |

### Description

Module Settings - Task Automation (/tasks/(list)/automation)

### Definition of Done

Task automation at /tasks/(list)/automation (rule builder: when X happens create/assign task; trigger types = entity event/schedule/webhook; actions = create task, assign by round-robin, notify). MUST follow docs/planning/module-settings-playbook.md: PageHeader+bento grid; canonical EmptyState (entity + phase=passive); system-compliant CTAs; TagsTab via forwardRef; $transaction on all destructive writes; no skipDuplicates; Zod superRefine for duplicate (trigger, action) pairs; colorToken CHECK constraint; AI defaults FALSE; wire every Boolean toggle in task automation OR declare as category-2 follow-up under IFC-310/311/312; include cross-tenant negative test; Lighthouse >=90; verified by: pnpm test

### Dependencies

- PG-178
- PG-191

---

## Dependency Artifacts

### PG-178

| Artifact | Path |
|----------|------|
| Status | Completed |
| Specification | Not found |
| Plan | Not found |
| Delivery | Not found |
| Attestation | .specify\sprints\sprint-16\attestations\PG-178 |

### PG-191

| Artifact | Path |
|----------|------|
| Status | Completed |
| Specification | Not found |
| Plan | Not found |
| Delivery | Not found |
| Attestation | .specify\sprints\sprint-18\attestations\PG-191 |

---

## Codebase Patterns

No relevant codebase patterns found.
---

## Project Knowledge

### CLAUDE.md

Loaded (16285 chars)

### Architecture Docs

- docs\architecture\adr\ADR-000-feasibility.md
- docs\architecture\adr\ADR-001-modern-stack.md
- docs\architecture\adr\ADR-002-domain-driven-design.md
- docs\architecture\adr\ADR-003-type-safe-api-design.md
- docs\architecture\adr\ADR-004-multi-tenancy.md
- docs\architecture\adr\ADR-005-workflow-engine.md
- docs\architecture\adr\ADR-006-agent-tools.md
- docs\architecture\adr\ADR-007-data-governance.md
- docs\architecture\adr\ADR-008-audit-logging.md
- docs\architecture\adr\ADR-009-zero-trust-security.md

### Domain Models

- packages\domain\src\activity-feed\ActivityFeedConstants.ts
- packages\domain\src\activity-feed\ActivityFeedStatsTypes.ts
- packages\domain\src\activity-feed\ActivityFeedTypes.ts
- packages\domain\src\activity-feed\index.ts
- packages\domain\src\activity-feed\__tests__\ActivityFeedConstants.test.ts

### Schemas

- packages\validators\src\account-settings.ts
- packages\validators\src\account-territories.ts
- packages\validators\src\account-tiers.ts
- packages\validators\src\account.ts
- packages\validators\src\activity-feed.ts

---

## Sources

| Type | Path | Loaded At |
|------|------|-----------|
| task_metadata | apps/project-tracker/docs/metrics/_global/Sprint_plan.csv | 2026-10-20T22:15:19.512Z |
| project_knowledge | CLAUDE.md | 2026-10-20T22:15:19.512Z |
| project_knowledge | docs\architecture\adr\ADR-000-feasibility.md | 2026-10-20T22:15:19.512Z |
| project_knowledge | docs\architecture\adr\ADR-001-modern-stack.md | 2026-10-20T22:15:19.512Z |
| project_knowledge | docs\architecture\adr\ADR-002-domain-driven-design.md | 2026-10-20T22:15:19.512Z |
| project_knowledge | docs\architecture\adr\ADR-003-type-safe-api-design.md | 2026-10-20T22:15:19.512Z |
| project_knowledge | docs\architecture\adr\ADR-004-multi-tenancy.md | 2026-10-20T22:15:19.512Z |
| project_knowledge | docs\architecture\adr\ADR-005-workflow-engine.md | 2026-10-20T22:15:19.512Z |
| project_knowledge | docs\architecture\adr\ADR-006-agent-tools.md | 2026-10-20T22:15:19.512Z |
| project_knowledge | docs\architecture\adr\ADR-007-data-governance.md | 2026-10-20T22:15:19.512Z |
| project_knowledge | docs\architecture\adr\ADR-008-audit-logging.md | 2026-10-20T22:15:19.512Z |
| project_knowledge | docs\architecture\adr\ADR-009-zero-trust-security.md | 2026-10-20T22:15:19.512Z |

---

*Context integrity can be verified using hash: `cafa713adcb8303089c6a12503a49293ff8af70db4b18752f4e852762e98dac4`*
