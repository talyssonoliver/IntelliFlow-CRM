# Hydrated Context: ENV-008-AI

**Generated:** 2026-10-22T23:02:30.712Z
**Context Hash:** c37a2f35dd9c...

---

## Task Metadata

| Field | Value |
|-------|-------|
| Task ID | ENV-008-AI |
| Section | Foundation Setup |
| Owner | Backend Dev + AI Specialist (STOA-Intelligence) |
| Status | Specifying |
| Target Sprint | 18 |

### Description

Automated Observability with Predictive Monitoring

### Definition of Done

OpenTelemetry AI-configured, predictive alerts set, anomaly detection active, self-healing enabled; targets: >=100%

### Dependencies

- ENV-005-AI

---

## Dependency Artifacts

### ENV-005-AI

| Artifact | Path |
|----------|------|
| Status | Completed |
| Specification | Not found |
| Plan | Not found |
| Delivery | Not found |
| Attestation | .specify\sprints\sprint-0\attestations\ENV-005-AI |

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
| task_metadata | apps/project-tracker/docs/metrics/_global/Sprint_plan.csv | 2026-10-22T23:02:30.712Z |
| project_knowledge | CLAUDE.md | 2026-10-22T23:02:30.712Z |
| project_knowledge | docs\architecture\adr\ADR-000-feasibility.md | 2026-10-22T23:02:30.712Z |
| project_knowledge | docs\architecture\adr\ADR-001-modern-stack.md | 2026-10-22T23:02:30.712Z |
| project_knowledge | docs\architecture\adr\ADR-002-domain-driven-design.md | 2026-10-22T23:02:30.712Z |
| project_knowledge | docs\architecture\adr\ADR-003-type-safe-api-design.md | 2026-10-22T23:02:30.712Z |
| project_knowledge | docs\architecture\adr\ADR-004-multi-tenancy.md | 2026-10-22T23:02:30.712Z |
| project_knowledge | docs\architecture\adr\ADR-005-workflow-engine.md | 2026-10-22T23:02:30.712Z |
| project_knowledge | docs\architecture\adr\ADR-006-agent-tools.md | 2026-10-22T23:02:30.712Z |
| project_knowledge | docs\architecture\adr\ADR-007-data-governance.md | 2026-10-22T23:02:30.712Z |
| project_knowledge | docs\architecture\adr\ADR-008-audit-logging.md | 2026-10-22T23:02:30.712Z |
| project_knowledge | docs\architecture\adr\ADR-009-zero-trust-security.md | 2026-10-22T23:02:30.712Z |

---

*Context integrity can be verified using hash: `c37a2f35dd9ca623c938ecf133b68c2295af01a223b9eed0da065f3c2d2dc2b7`*

---

## Lane addendum (2026-10-22): codebase patterns verified by hand

The library's pattern search returned 0 because its shell `grep`/`find` calls fail on this
Windows host ("The system cannot find the path specified", seven times in the hydration run).
Patterns found with the Grep/Glob tools instead:

| Pattern | Path | Relevance |
|---|---|---|
| Grafana alert rules as code, applied by CI on merge | `infra/monitoring/grafana/cloud/alert-rules.json`, `tools/scripts/observability/apply-grafana-alert-rules.mjs`, `.github/workflows/grafana-alert-rules.yml` | Template for SLO and dashboard as code |
| Shared Grafana provisioning client | `tools/scripts/lib/grafana-provisioning.mjs` (+ `.test.ts`) | Reuse the HTTP client; do not fork it |
| Synthetic monitoring as code | `infra/monitoring/grafana/cloud/synthetic-monitoring.json`, `.github/workflows/synthetic-monitoring.yml` | Second instance of the same pattern |
| Railway CLI driven by the working GitHub secret | `.github/workflows/promote-production.yml:173-200` (`RAILWAY_API_TOKEN: secrets.RAILWAY_TOKEN`) | Pattern for the restart-policy step (ruling 2) |
| OTel SDK, direct OTLP to the gateway | `apps/api/src/tracing/otel.ts`, `packages/observability/src/node-instrumentations.ts`, `infra/terraform/environments/production/terraform.tfvars:142-153` | The real production path |
| Local collector stack | `infra/monitoring/docker-compose.monitoring.yml:27` mounts `otel-collector.yaml` | `otel-config.yaml` is not mounted by anything |
| SLO targets (document only) | `docs/operations/slo-definitions.md` (IFC-142) | Source of SLO targets; nothing in Grafana yet |

## Parallel-lane overlap

The IFC-074 lane (worktree `ifc-074`, branch `feat/ifc-074-ifc074`, no PR yet) changes api
logging, `docs/operations/incident-runbook.md`, `infra/monitoring/sentry-project-config.json`
and the ADR README, and adds ADR-086 (observability log pipeline). ENV-008-AI leaves those
files alone, except for one ADR README row. It uses ADR-087, because 083-086 are claimed by
sibling lanes.
