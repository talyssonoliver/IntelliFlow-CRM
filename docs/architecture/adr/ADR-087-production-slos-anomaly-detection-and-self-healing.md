# ADR-087: Production SLOs, anomaly detection and self-healing

**Status:** Accepted (2026-10-23, ENV-008-AI spec consensus 4/4)

**Date:** 2026-10-22

**Deciders:** Talysson Oliveira (owner rulings of 2026-10-22: scope option A,
and Railway evidence by CI on merge). ENV-008-AI spec session: DevOps-Lead,
Security-Lead, Domain-Expert, Test-Engineer.

**Technical Story:** ENV-008-AI, "Automated Observability with Predictive
Monitoring". Builds on IFC-032 (production OTLP to Grafana Cloud, alert rules as
code, #802 #804 #808). Sits beside ADR-086 (IFC-074, the log pipeline), which it
does not change.

## Context and Problem Statement

ENV-008-AI was closed in Sprint 0 on three configuration files:
`infra/monitoring/anomaly-detection.json`,
`infra/monitoring/self-healing-rules.yaml` and
`infra/monitoring/otel-config.yaml`. No running system loads any of them. The
task was reopened (#795) because the evidence was not production evidence.

A read-only check of production on 2026-10-22 found:

- api and ai-worker send OTLP straight to the Grafana Cloud gateway. There is no
  collector.
- Grafana Asserts runs anomaly and prediction rules on the span metrics.
- Five IFC-032 alert rules email the owner.
- There are no SLOs and no service dashboard.
- Nothing sets a Railway restart policy or health check. The Terraform provider
  cannot set either.

What should "anomaly detection active", "predictive alerts set" and
"self-healing enabled" mean for this product, and how do we prove each one in
production?

## Decision Drivers

- Evidence must come from production. A file that nothing loads is not evidence
  (#795, constitution).
- Reuse what runs: Grafana Cloud, the IFC-032 "as code, applied by CI on merge"
  pattern (`grafana-alert-rules.yml`) and the working GitHub secrets.
- No new secrets (the repository store is at its cap), no new paid service, and
  no direct production changes from a developer machine (owner ruling 2).
- SLO targets come from `docs/operations/slo-definitions.md`. They must not be
  tuned to pass.

## Considered Options

1. **Build in-house.** Write our own anomaly model and a remediation bot that
   redeploys on alerts.
2. **Use the platform features that already run** (chosen). Grafana Asserts for
   anomaly and prediction, Grafana SLOs (with their burn-rate alerts) for
   predictive alerting, and the Railway restart policy plus a deploy health
   check for self-healing. All of it is declared as code and applied by CI.
3. **Park the task.** Attest PARTIAL and build nothing.

## Decision Outcome

Chosen option: **2**. It is the only option whose claims can be proven from
production without a new system to run and maintain. The owner chose it (ruling
A).

- **Anomaly detection** = Grafana Asserts rules computed from the api and
  ai-worker span metrics. `anomaly-detection.json` now records which rules run
  and which series they read.
- **Predictive alerts** = the IFC-032 rules plus SLO burn-rate alerts (fast and
  slow burn), which warn before the error budget runs out.
- **Self-healing** = Railway `restartPolicyType: ON_FAILURE` (a crashed process
  is restarted) and a deploy-time health check on the api (a failing deployment
  never takes traffic). A CI job reads and sets these through the Railway API
  with the existing `RAILWAY_TOKEN` secret. Railway's health check is a deploy
  gate, not a continuous liveness probe, and the docs say so.
- **SLOs and the dashboard** live under `infra/monitoring/grafana/cloud/` and
  are applied by CI on merge, like the alert rules.

### Positive Consequences

- Every DoD claim points at something running in production, with an API
  response as proof.
- One provisioning pattern for alerts, SLOs and dashboards.

### Negative Consequences

- Production evidence exists only after merge. The attestation records
  NEEDS_HUMAN until the first CI run.
- The Asserts rules are managed by the Grafana plugin, not by this repository.
- The ws, events-worker and ingestion-worker services still emit nothing. That
  gap is tracked under EP-001-AI.
- `ON_FAILURE` restarts a process that crashes. It does not restart a process
  that hangs. Railway's health check gates deployments; it is not a liveness
  probe.
- CI owns the Railway settings. Changing `DESIRED` in
  `tools/scripts/observability/apply-railway-self-healing.mjs` changes
  production on merge. The settings persist even if the workflow is deleted. A
  manual `workflow_dispatch` run is the only drift check: run it after any
  change made in the Railway dashboard. A scheduled check was rejected because
  of the Actions budget.
- `RAILWAY_TOKEN` is an account-wide, repository-level secret. Scoping it down
  needs the owner, because the secret store is at its cap (tracked as an issue).
- The SLO window is 28 days rolling, against the 30 days calendar in
  `slo-definitions.md`. The 3x/2h burn rule and the 75%-budget rule are not
  built.
- Every edit to any Grafana-as-code file re-applies alert rules, SLOs and the
  dashboard. All three applies are idempotent.

## Links

- `docs/operations/slo-definitions.md` (IFC-142), source of the targets
- `.specify/sprints/sprint-18/context/ENV-008-AI/ENV-008-AI-owner-ruling.md`
- ADR-086, observability log pipeline (IFC-074)
