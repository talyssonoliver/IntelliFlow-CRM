# infra/monitoring - Observability Config (referenced by inline paths)

## Purpose

Source-of-truth **config** (no code) for observability/alerting: Grafana
dashboards (`dashboards/`, `grafana/provisioning/`), Prometheus/alert rules
(`alert-rules.yml`, `alerts/`, `ai-prometheus-rules.yaml`), health-check specs,
AB-test / drift / anomaly / retention configs, and
`docker-compose.monitoring.yml`.

## How it is consumed (inline path strings, not imports)

This is a config dir, so consumers reference it by **hardcoded path**:

- `apps/workers/shared/src/health-server.ts` — endpoints must match
  `infra/monitoring/health-checks.yaml` (kept in sync by convention).
- `tools/scripts/observability/lint-alerts.ts` — lints
  `grafana/provisioning/alerting/intelliflow-rules.yaml`.
- `tools/scripts/observability/sync-collector-artifact.ts`,
  `validate-schemas.ts`, `rotate-secrets.ts` — read configs here.
- `apps/project-tracker/lib/artifact-registry.ts` — links `infra/monitoring/*`
  files to tasks (IFC-117/163/ENV-008-AI/ENV-015-AI).
- `infra/monitoring/pipeline-status.yaml` references `tools/plan/`.

## Pitfalls

- Renaming/moving files here silently breaks the inline-path consumers above (no
  compiler will catch it) — grep `infra/monitoring/<file>` before renaming.
- Dashboards/rules are deployment artifacts; changing them affects live
  alerting. Validate via the `tools/scripts/observability/*` linters.
