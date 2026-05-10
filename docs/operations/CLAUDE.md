# docs/operations — Agent guide

## Purpose

Living operational documentation: runbooks (per-service how-to), playbooks
(cross-cutting process), policies, incident/release process, SLOs, and audit
evidence. Agents consume this to ground on-call, release, and reliability tasks.
Full category breakdown: [`./README.md`](./README.md).

## Structure at a glance

```
docs/operations/
├── runbooks/             service-scoped (one file per service)
├── *-playbook.md         cross-cutting process (engineering, project)
├── *-policy.md / *-checklist.md   policies & checklists
├── incident-runbook.md   cross-cutting — NOT in runbooks/ on purpose
├── release-rollback.md   cross-cutting release ops
├── slo-definitions.md    SLOs + error budgets
└── system-audit.md / restore-drill-report.md   reports
```

## Rules for agents

### Writing new operational docs

1. **Service-scoped how-to?** → `runbooks/<service>.md`. Follow the shape used
   by `workers-runbook.md` / `notification-service.md`: Overview →
   Metrics/Alerts → Procedures → Troubleshooting → Retry/DLQ → Escalation.
2. **Cross-cutting process (affects all services)?** → top level. Examples that
   already live there: `incident-runbook.md`, `release-rollback.md`.
3. **Policy or checklist?** → top level with `*-policy.md` or `*-checklist.md`
   suffix.
4. **Architecture decision?** → **NOT HERE.** Use `docs/architecture/adr/` with
   the ADR template.
5. **Product requirement?** → **NOT HERE.** Use `docs/planning/prd-*.md`.

### Naming conventions (enforced)

- **Runbooks** go inside `runbooks/`. Do NOT create a new `*-runbook.md` at top
  level unless it is demonstrably cross-cutting (like `incident-runbook.md`). If
  you're unsure, it belongs in `runbooks/`.
- Do NOT create `docs/runbooks/` or `docs/ops/` — those directories were
  consolidated on 2026-04-15. All operational content lives under
  `docs/operations/`.

### Linking

- From a runbook to a sibling runbook: `./other-runbook.md` (same directory, no
  `../`)
- From a runbook to a top-level op doc: `../engineering-playbook.md`
- From outside `docs/operations/` to anything here: `docs/operations/...` or
  relative `../operations/...`
- From `docs/operations/*.md` (top level) to a runbook:
  `./runbooks/<service>.md`

### When editing existing runbooks

- Runbooks are used during incidents — keep them scannable. Tables + code
  fences + short bullets, not prose essays.
- Every runbook should have an **Escalation / On-Call** section with contacts.
- Every runbook should link the relevant alert rule (from
  `infra/monitoring/alerts-config.yaml` or Prometheus rules).
- If the service has a DLQ, the runbook must document triage commands for it
  (database-level AND BullMQ-level where applicable — see
  `notification-service.md` §5.3–5.5 for the pattern).

## Recent consolidation (2026-04-15) — context agents should know

- `docs/runbooks/` → removed; content moved to `docs/operations/runbooks/`.
- `docs/ops/` + `docs/ops/playbooks/` → removed (were empty).
- 4 top-level `*-runbook.md` files moved into `runbooks/`: `easypanel`,
  `maintenance`, `monitoring`, `workers`.
- `runbooks/notifications.md` merged into `runbooks/notification-service.md`
  (80% overlap; the merged doc is v1.1.0 and absorbs the 4 unique sections from
  `notifications.md`).
- Historical attestations under `.specify/sprints/*/attestations/` that
  reference old paths were intentionally left untouched — they are immutable
  evidence.

## Cross-references agents should check when editing

- `apps/project-tracker/docs/metrics/validation.yaml` — has `test -f` shell
  commands for specific operations files. Moving or deleting a file referenced
  there breaks CI validation. Grep the YAML before any relocation.
- `.github/CODEOWNERS` — `/docs/operations/ @intelliflow-crm/devops-team`. Do
  not move a file out of `docs/operations/` without updating CODEOWNERS, or the
  file loses mandatory devops review.
- `infra/monitoring/alerts-config.yaml` — some alerts carry a `runbook:` URL
  pointing into `docs/operations/runbooks/`. If you move or rename a runbook,
  update that URL — the link is served to on-call during real incidents.
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` +
  `task-registry.json` (the registry is derived and gitignored as of Wave 4;
  regenerate via `pnpm regenerate:derived`) — many task prerequisites reference
  paths under `docs/operations/`. Run
  `pnpm --filter @intelliflow/project-tracker exec tsx scripts/sync-metrics.ts`
  after any move.

## See also

- [`../../CLAUDE.md`](../../CLAUDE.md) — Repo-root agent guide
- [`../architecture/adr/README.md`](../architecture/adr/README.md) — ADRs
- [`../compliance-and-governance/compliance/`](../compliance-and-governance/compliance/)
  — Compliance checklists
