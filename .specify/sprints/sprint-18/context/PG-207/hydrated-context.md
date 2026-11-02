# Hydrated Context: PG-207

**Generated:** 2026-10-20T22:19:19.361Z
**Context Hash:** 20ffc585e981...

---

## Task Metadata

| Field | Value |
|-------|-------|
| Task ID | PG-207 |
| Section | Settings |
| Owner | Frontend Dev (STOA-Foundation) |
| Status | Specifying |
| Target Sprint | 18 |

### Description

Module Settings - Email (/email/email-settings)

### Definition of Done

Email settings at /email/email-settings (SMTP/IMAP config per tenant, signatures per user/org, tracking pixel on/off, reply-to override, bounce handling rules). Secrets MUST go through server-side tRPC - never in client bundle. MUST follow docs/planning/module-settings-playbook.md: PageHeader+bento grid; canonical EmptyState (entity + phase=passive); system-compliant CTAs; TagsTab via forwardRef; $transaction on all destructive writes; no skipDuplicates; Zod superRefine for duplicate signature names; colorToken CHECK constraint; AI defaults FALSE; wire every Boolean toggle in email automation OR declare as category-2 follow-up under IFC-310/311/312; include cross-tenant negative test; Lighthouse >=90; verified by: pnpm test

### Dependencies

- PG-178
- PG-182

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

### PG-182

| Artifact | Path |
|----------|------|
| Status | Completed |
| Specification | Not found |
| Plan | Not found |
| Delivery | Not found |
| Attestation | .specify\sprints\sprint-17\attestations\PG-182 |

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
| task_metadata | apps/project-tracker/docs/metrics/_global/Sprint_plan.csv | 2026-10-20T22:19:19.361Z |
| project_knowledge | CLAUDE.md | 2026-10-20T22:19:19.361Z |
| project_knowledge | docs\architecture\adr\ADR-000-feasibility.md | 2026-10-20T22:19:19.361Z |
| project_knowledge | docs\architecture\adr\ADR-001-modern-stack.md | 2026-10-20T22:19:19.361Z |
| project_knowledge | docs\architecture\adr\ADR-002-domain-driven-design.md | 2026-10-20T22:19:19.361Z |
| project_knowledge | docs\architecture\adr\ADR-003-type-safe-api-design.md | 2026-10-20T22:19:19.361Z |
| project_knowledge | docs\architecture\adr\ADR-004-multi-tenancy.md | 2026-10-20T22:19:19.361Z |
| project_knowledge | docs\architecture\adr\ADR-005-workflow-engine.md | 2026-10-20T22:19:19.361Z |
| project_knowledge | docs\architecture\adr\ADR-006-agent-tools.md | 2026-10-20T22:19:19.361Z |
| project_knowledge | docs\architecture\adr\ADR-007-data-governance.md | 2026-10-20T22:19:19.361Z |
| project_knowledge | docs\architecture\adr\ADR-008-audit-logging.md | 2026-10-20T22:19:19.361Z |
| project_knowledge | docs\architecture\adr\ADR-009-zero-trust-security.md | 2026-10-20T22:19:19.361Z |

---

*Context integrity can be verified using hash: `20ffc585e98100d981f709a65b293df31a8d80681a4e6fc2ca5a3edcf17acc10`*
