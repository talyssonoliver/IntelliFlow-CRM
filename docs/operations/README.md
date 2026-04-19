# Operations — IntelliFlow CRM

Living documentation for the running system: how we release, respond to
incidents, run services, and enforce quality. If you are on-call,
troubleshooting a production issue, or writing a new service, start here.

## How this directory is organized

```
docs/operations/
├── runbooks/              Service-scoped operational runbooks (per-service how-to)
├── engineering-playbook.md  Process playbooks (cross-cutting)
├── project-playbook.md
├── quality-gates.md
├── raci.md
├── wip-policy.md
├── ticket-sizing.md
├── slo-definitions.md
├── env-requirements.md
├── pr-checklist.md
├── abc-classification.md
├── incident-runbook.md    Cross-cutting incident process (not service-scoped)
├── release-rollback.md
├── system-audit.md        Reports / audit evidence
├── restore-drill-report.md
└── audit-performance-and-iteration.md
```

### Categories

| Category          | Naming / location                          | Examples                                                           |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| **Runbooks**      | `runbooks/*.md` — per-service how-to       | `workers-runbook.md`, `notification-service.md`, `ingestion.md`    |
| **Playbooks**     | `*-playbook.md` at top level               | `engineering-playbook.md`, `project-playbook.md`                   |
| **Policies**      | `*-policy.md`, `*-checklist.md` at top lvl | `wip-policy.md`, `pr-checklist.md`, `quality-gates.md`, `raci.md`  |
| **Reference**     | `env-*.md`, `*-classification.md`          | `env-requirements.md`, `abc-classification.md`, `ticket-sizing.md` |
| **Cross-cutting** | `incident-*.md`, `release-*.md`            | `incident-runbook.md`, `release-rollback.md`, `slo-definitions.md` |
| **Reports**       | `*-report.md`, `*-audit.md`                | `restore-drill-report.md`, `system-audit.md`                       |

`incident-runbook.md` stays at top-level (not in `runbooks/`) because it is a
cross-cutting process doc governing all services — closer in kind to
`engineering-playbook.md` than to a per-service runbook.

## Runbooks (`runbooks/`)

Per-service operational how-tos. Each file covers one service, one
responsibility, and follows a consistent shape (Overview → Metrics/Alerts →
Procedures → Troubleshooting → Retry/DLQ → Escalation).

| Runbook                                                             | Scope                                                                                  |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [dlq-triage.md](runbooks/dlq-triage.md)                             | Dead-letter-queue triage across all event consumers                                    |
| [easypanel-runbook.md](runbooks/easypanel-runbook.md)               | EasyPanel-hosted monitoring stack (Prometheus, Grafana, Loki, SonarQube)               |
| [ingestion.md](runbooks/ingestion.md)                               | Document/email ingestion pipeline                                                      |
| [maintenance-runbook.md](runbooks/maintenance-runbook.md)           | Developer-workstation disk/cache maintenance                                           |
| [monitoring-runbook.md](runbooks/monitoring-runbook.md)             | OTLP push pipeline, health checks, local monitoring stack                              |
| [notification-service.md](runbooks/notification-service.md)         | Multi-channel notification delivery (IFC-157 — consolidates former `notifications.md`) |
| [release-checklist.md](runbooks/release-checklist.md)               | Pre-release sign-off steps                                                             |
| [workers-runbook.md](runbooks/workers-runbook.md)                   | Event, ingestion, notification worker services                                         |
| [workflow-troubleshooting.md](runbooks/workflow-troubleshooting.md) | Temporal/LangGraph/BullMQ workflow diagnosis (IFC-141)                                 |

## Cross-cutting process docs

- `incident-runbook.md` — P1–P4 incident response process + comms templates
- `release-rollback.md` — Rollback procedure for any release
- `slo-definitions.md` — Service-level objectives + error budgets

## Policies & playbooks

- `engineering-playbook.md` — How we write, review, and ship code
- `project-playbook.md` — Sprint cadence, ceremonies, task lifecycle
- `quality-gates.md` — The 4 non-negotiable validations
  (typecheck/tests/lint/build)
- `raci.md` — Decision ownership matrix
- `wip-policy.md` — Work-in-progress limits per role
- `ticket-sizing.md` — Sizing guidance
- `pr-checklist.md` — PR author + reviewer checklist

## Reference

- `env-requirements.md` — Environment variables per app
- `abc-classification.md` — Data classification tiers
- `audit-performance-and-iteration.md` — Performance audit methodology
- `system-audit.md` — System audit report (latest)
- `restore-drill-report.md` — Backup restore drill evidence

## When to write here vs elsewhere

| You're documenting…                                  | Put it in…                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| An architectural decision                            | `docs/architecture/adr/`                                                    |
| How a service is operated day-to-day                 | `docs/operations/runbooks/<service>.md`                                     |
| A cross-cutting process (incident response, release) | `docs/operations/*.md` at top level                                         |
| A compliance policy                                  | `docs/compliance-and-governance/compliance/`                                |
| Developer onboarding / local setup                   | `docs/development/` (or `docs/operations/env-requirements.md` for env vars) |
| Product requirement                                  | `docs/planning/prd-*.md`                                                    |

## See also

- [`../architecture/adr/README.md`](../architecture/adr/README.md) —
  Architecture Decision Records
- [`../architecture/diagrams/`](../architecture/diagrams/) — System diagrams +
  dependency chains
- [`../compliance-and-governance/compliance/`](../compliance-and-governance/compliance/)
  — GDPR / ISO / SOC2 checklists
- [`../compliance-and-governance/governance/`](../compliance-and-governance/governance/)
  — Risk register, release promotion policy
