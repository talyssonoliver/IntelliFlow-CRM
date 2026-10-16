# Hydrated Context: PG-204

> **Provenance:** Generated at 2026-10-13T06:22:17Z by /hydrate-context (tools/scripts/lib/stoa/context-hydration.ts), AFTER the spec phase (spec committed 00:09:23Z, consensus re-run 06:20:57Z) and after most of the implementation. It did not inform the original spec, plan or code; it is kept as the record of the late run. The hand-made PG-204-hydrated-context.json from the original session is relabelled separately.

**Generated:** 2026-10-13T06:22:17.459Z
**Context Hash:** 5b957c203001...

---

## Task Metadata

| Field | Value |
|-------|-------|
| Task ID | PG-204 |
| Section | Settings |
| Owner | Frontend Dev (STOA-Foundation) |
| Status | In Progress |
| Target Sprint | 18 |

### Description

Module Settings - Case Types (/cases/case-types)

### Definition of Done

Case types at /cases/case-types (taxonomy: category, default priority, default SLA, required fields, resolution workflow). MUST follow docs/planning/module-settings-playbook.md: PageHeader+bento grid; canonical EmptyState (entity + phase=passive); system-compliant CTAs; TagsTab via forwardRef; $transaction on all destructive writes; no skipDuplicates; Zod superRefine for duplicate type names; colorToken CHECK constraint; AI defaults FALSE; wire every Boolean toggle in case automation OR declare as category-2 follow-up under IFC-310/311/312; include cross-tenant negative test; Lighthouse >=90; verified by: pnpm test

### Dependencies

- PG-178
- PG-190

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

### PG-190

| Artifact | Path |
|----------|------|
| Status | Completed |
| Specification | Not found |
| Plan | Not found |
| Delivery | Not found |
| Attestation | .specify\sprints\sprint-18\attestations\PG-190 |

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
| task_metadata | apps/project-tracker/docs/metrics/_global/Sprint_plan.csv | 2026-10-13T06:22:17.459Z |
| project_knowledge | CLAUDE.md | 2026-10-13T06:22:17.459Z |
| project_knowledge | docs\architecture\adr\ADR-000-feasibility.md | 2026-10-13T06:22:17.459Z |
| project_knowledge | docs\architecture\adr\ADR-001-modern-stack.md | 2026-10-13T06:22:17.459Z |
| project_knowledge | docs\architecture\adr\ADR-002-domain-driven-design.md | 2026-10-13T06:22:17.459Z |
| project_knowledge | docs\architecture\adr\ADR-003-type-safe-api-design.md | 2026-10-13T06:22:17.459Z |
| project_knowledge | docs\architecture\adr\ADR-004-multi-tenancy.md | 2026-10-13T06:22:17.459Z |
| project_knowledge | docs\architecture\adr\ADR-005-workflow-engine.md | 2026-10-13T06:22:17.459Z |
| project_knowledge | docs\architecture\adr\ADR-006-agent-tools.md | 2026-10-13T06:22:17.459Z |
| project_knowledge | docs\architecture\adr\ADR-007-data-governance.md | 2026-10-13T06:22:17.459Z |
| project_knowledge | docs\architecture\adr\ADR-008-audit-logging.md | 2026-10-13T06:22:17.459Z |
| project_knowledge | docs\architecture\adr\ADR-009-zero-trust-security.md | 2026-10-13T06:22:17.459Z |

---

*Context integrity can be verified using hash: `5b957c20300193bf3af82aa2706219fa3071ea4748c939d4e0b01a7dc54fd1c1`*
