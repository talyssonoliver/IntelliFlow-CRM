# Hydrated Context: PG-199

**Generated:** 2026-10-19T10:39:48.952Z
**Context Hash:** dab1a6656d9e...

---

## Task Metadata

| Field | Value |
|-------|-------|
| Task ID | PG-199 |
| Section | Settings |
| Owner | Frontend Dev (STOA-Foundation) |
| Status | Specifying |
| Target Sprint | 18 |

### Description

Module Settings - Model Config (/agent-approvals/model-config)

### Definition of Done

Model config at /agent-approvals/model-config (per-agent model selection, temperature, max tokens, fallback chain, per-agent cost ceilings). Respect Never-Downgrade rule for model IDs (memory/feedback_never_downgrade_without_approval.md). MUST follow docs/planning/module-settings-playbook.md: PageHeader+bento grid; canonical EmptyState (entity + phase=passive); system-compliant CTAs; TagsTab via forwardRef; $transaction on all destructive writes; no skipDuplicates; Zod superRefine for duplicate agent keys; colorToken CHECK constraint; AI defaults FALSE; wire every Boolean toggle in agent-approval automation OR declare as category-2 follow-up under IFC-310/311/312; include cross-tenant negative test; Lighthouse >=90; verified by: pnpm test

### Dependencies

- PG-178
- PG-152
- PG-192

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

### PG-152

| Artifact | Path |
|----------|------|
| Status | Completed |
| Specification | Not found |
| Plan | Not found |
| Delivery | Not found |
| Attestation | .specify\sprints\sprint-8\attestations\PG-152 |

### PG-192

| Artifact | Path |
|----------|------|
| Status | Completed |
| Specification | Not found |
| Plan | Not found |
| Delivery | Not found |
| Attestation | .specify\sprints\sprint-16\attestations\PG-192 |

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
| task_metadata | apps/project-tracker/docs/metrics/_global/Sprint_plan.csv | 2026-10-19T10:39:48.952Z |
| project_knowledge | CLAUDE.md | 2026-10-19T10:39:48.952Z |
| project_knowledge | docs\architecture\adr\ADR-000-feasibility.md | 2026-10-19T10:39:48.952Z |
| project_knowledge | docs\architecture\adr\ADR-001-modern-stack.md | 2026-10-19T10:39:48.952Z |
| project_knowledge | docs\architecture\adr\ADR-002-domain-driven-design.md | 2026-10-19T10:39:48.952Z |
| project_knowledge | docs\architecture\adr\ADR-003-type-safe-api-design.md | 2026-10-19T10:39:48.952Z |
| project_knowledge | docs\architecture\adr\ADR-004-multi-tenancy.md | 2026-10-19T10:39:48.952Z |
| project_knowledge | docs\architecture\adr\ADR-005-workflow-engine.md | 2026-10-19T10:39:48.952Z |
| project_knowledge | docs\architecture\adr\ADR-006-agent-tools.md | 2026-10-19T10:39:48.952Z |
| project_knowledge | docs\architecture\adr\ADR-007-data-governance.md | 2026-10-19T10:39:48.952Z |
| project_knowledge | docs\architecture\adr\ADR-008-audit-logging.md | 2026-10-19T10:39:48.952Z |
| project_knowledge | docs\architecture\adr\ADR-009-zero-trust-security.md | 2026-10-19T10:39:48.952Z |

---

*Context integrity can be verified using hash: `dab1a6656d9e6d063225cfb4d699cc5f5dc159418eb67478b1815966fcbf5f11`*

## Lane additions (spec-session Phase 0.76/0.77/0.9/0.95)

Shared-component audit, route-conflict audit and dependency verification are recorded in
PG-199-hydrated-context.json; full exploration in PG-199-spec-exploration.md; owner rulings in
PG-199-owner-ruling.md.
