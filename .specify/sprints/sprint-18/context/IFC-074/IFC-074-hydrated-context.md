# Hydrated Context: IFC-074

**Generated:** 2026-10-22T19:21:24.154Z
**Context Hash:** 1e381b13b281...

---

## Task Metadata

| Field | Value |
|-------|-------|
| Task ID | IFC-074 |
| Section | Observability |
| Owner | SRE Lead + DevOps (STOA-Automation) |
| Status | Specifying |
| Target Sprint | 18 |

### Description

PHASE-040: Full Stack Observability

### Definition of Done

Traces, metrics, logs unified with context; artifacts: sentry-project-config.json, correlation-test.csv, mttr-baseline.json; targets: <2min

### Dependencies

- IFC-003

---

## Dependency Artifacts

### IFC-003

| Artifact | Path |
|----------|------|
| Status | Completed |
| Specification | Not found |
| Plan | Not found |
| Delivery | Not found |
| Attestation | .specify\sprints\sprint-1\attestations\IFC-003 |

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
| task_metadata | apps/project-tracker/docs/metrics/_global/Sprint_plan.csv | 2026-10-22T19:21:24.154Z |
| project_knowledge | CLAUDE.md | 2026-10-22T19:21:24.154Z |
| project_knowledge | docs\architecture\adr\ADR-000-feasibility.md | 2026-10-22T19:21:24.154Z |
| project_knowledge | docs\architecture\adr\ADR-001-modern-stack.md | 2026-10-22T19:21:24.154Z |
| project_knowledge | docs\architecture\adr\ADR-002-domain-driven-design.md | 2026-10-22T19:21:24.154Z |
| project_knowledge | docs\architecture\adr\ADR-003-type-safe-api-design.md | 2026-10-22T19:21:24.154Z |
| project_knowledge | docs\architecture\adr\ADR-004-multi-tenancy.md | 2026-10-22T19:21:24.154Z |
| project_knowledge | docs\architecture\adr\ADR-005-workflow-engine.md | 2026-10-22T19:21:24.154Z |
| project_knowledge | docs\architecture\adr\ADR-006-agent-tools.md | 2026-10-22T19:21:24.154Z |
| project_knowledge | docs\architecture\adr\ADR-007-data-governance.md | 2026-10-22T19:21:24.154Z |
| project_knowledge | docs\architecture\adr\ADR-008-audit-logging.md | 2026-10-22T19:21:24.154Z |
| project_knowledge | docs\architecture\adr\ADR-009-zero-trust-security.md | 2026-10-22T19:21:24.154Z |

---

*Context integrity can be verified using hash: `1e381b13b2811fd288cabc8c6a2ade90e608836668cea3ff1a9d2f6e3d85c37d`*

---

## Supplement (spec-session lead, 2026-10-22)

The automated pattern scan above returned 0 patterns: on this Windows host the scanner's shell search failed
("The system cannot find the path specified", ~60 times). Codebase patterns were gathered instead by the five
Phase 0.75 exploration agents; see `.specify/sprints/sprint-18/specifications/IFC-074-discussion.md`.

- Shared component audit (Phase 0.76): N/A — no UI.
- Route conflict audit (Phase 0.77): N/A — no page or route.
- UI reachability (Phase 0.92): N/A — backend/infra task.
- Dependency chain (Phase 0.9): IFC-074 is missing from the Observability Stack section of
  `docs/architecture/diagrams/complete-dependency-chains.md`; adding it is in the spec (AC-008).
- Requirements hook: users = owner/on-call (single operator); domain = SRE evidence for MTTD and trace/log correlation;
  existing systems = Grafana Cloud (Tempo, Loki, Prometheus span metrics, alert state history), Sentry (api, web),
  Railway; regulations = GDPR pseudonymisation of log identifiers (`docs/compliance-and-governance/compliance/
  gdpr-compliance.md:89`); ADR gap = log pipeline + evidence rule → ADR-086.
