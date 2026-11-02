# ENV-008-AI — task code audit (reconcile route, production evidence)

**Date:** 2026-10-22 · **Auditor:** ENV-008-AI lane (`/task-code-audit`)
**Row:** Sprint 18, In Progress. DoD: "OpenTelemetry AI-configured, predictive alerts set,
anomaly detection active, self-healing enabled; targets: >=100%". KPIs: "100% services emit
traces/metrics/logs; alerting configured; SLOs defined; dashboards live".
**Artifact coverage:** no sprint-18 spec, plan or exec yet. Sprint-0 attestation is `PARTIAL`
(reopened by #795, re-planned by #920).
**Scope ruling:** owner chose option A, "re-scope to real". See `ENV-008-AI-owner-ruling.md`.

Every production fact below was read on 2026-10-22, read-only, from the Grafana Cloud stack
`graysushi1880` with the owner's Grafana service-account token. Railway could not be read (see
finding 5).

## Findings

1. **High: `self-healing-rules.yaml` is loaded by nothing (Lens 7).**
   - Evidence: `infra/monitoring/self-healing-rules.yaml:1-8` says it is "Sprint 0 scope ...
     Do NOT execute remediation automatically". No file in the repo reads it (grep over
     ts/mjs/yml/yaml/tf). Every playbook step is `operator_action`.
   - Impact: the sprint-0 attestation item "Self-healing enabled: met=true" is false.
   - Fix (ruling A): self-healing means the platform restarting a failed instance (Railway
     restart policy plus a health check). Rewrite the file to describe that mechanism and its
     evidence. Do not keep a playbook file that suggests automation exists.

2. **High: `anomaly-detection.json` is loaded by nothing (Lens 7).**
   - Evidence: the file declares `"mode": "heuristic"`, `"deferred": {"predictiveModels": ...}`,
     and `ai_cost_spike` is "placeholder for Sprint 0". There are no readers in the repo.
     Its metric names (`http_request_duration_seconds`, `ai_cost_usd`) are not the series
     production emits (`traces_spanmetrics_*`).
   - What is real: Grafana Asserts runs anomaly and prediction rules on the stack
     (`RequestRateAnomaly`, `ErrorRatioAnomaly`, `LatencyP95Anomaly`, `asserts:*:prediction`,
     `asserts:*:anomaly_upper_threshold`), computed from api and ai-worker span metrics.
   - Fix (ruling A): rewrite the file to describe the Asserts detection that really runs, with
     the rule names and the series they use.

3. **Medium: `otel-config.yaml` is not the production configuration.**
   - Evidence: `infra/monitoring/otel-config.yaml` is a collector config, but nothing mounts
     it. `docker-compose.monitoring.yml:27` mounts `otel-collector.yaml`. Production has no
     collector: `apps/api/src/tracing/otel.ts` exports OTLP directly to the Grafana Cloud
     gateway (`terraform.tfvars:153`).
   - Fix: add a header pointing to the real production path (SDK, then the gateway) and keep
     the file as the local-stack reference. This is the minimal change. Do not delete it,
     because EP-001-AI, AUTOMATION-001 and the CSV pre-requisites name it.

4. **Medium: no SLOs and no dashboard in production (KPI).**
   - Evidence: `GET /api/plugins/grafana-slo-app/resources/v1/slo` returns `{"slos":[]}`.
     `/api/search?type=dash-db` returns only Grafana Cloud's built-in usage and insight
     dashboards.
   - Fix (ruling A): add SLOs and one service dashboard as code under
     `infra/monitoring/grafana/cloud/`, applied by CI on merge, the same way
     `grafana-alert-rules.yml` already works.

5. **Blocker for finding 1's evidence: no Railway credential works.**
   - Evidence: `RAILWAY_API_TOKEN`, `RAILWAY_TOKEN` and `TF_VAR_railway_token` in `.env.local`
     all return `Not Authorized` on `{me{email}}`. Project-token mode returns
     `Project Token not found`. The `railway` CLI rejects both. The restart policy and health
     check of the production services therefore cannot be read or set from this lane, and the
     Terraform provider (`terraform-community-providers/railway ~> 0.3`) has no
     restart-policy or health-check field (`modules/railway/main.tf:29-40`).
   - Needs the owner: a fresh token, or the owner sets the two settings in the Railway UI.

6. **Medium: three services emit nothing (KPI "100% services").**
   - Evidence: Prometheus `count by (service_name)(target_info)` returns only `api` and
     `ai-worker`. Loki `service_name` (7 days) returns only `ai-worker`; no api log line has
     reached Loki.
   - Fix (ruling A): tracked follow-up (EP-001-AI), not built here.

7. **Low: the observability docs describe a collector topology that production does not use.**
   - Evidence: `implementation-guide.md:11-25` shows App, then Collector, then
     Tempo/Loki/Prom. None of the three docs mentions Grafana Cloud.
   - Fix: add a short "Production topology" section to each doc. Keep the local-stack text.

## What holds (do not rebuild)

- The OTel SDK in api and ai-worker exports to Grafana Cloud in production. Span metrics
  exist for both services (`traces_spanmetrics_calls_total`: ai-worker 9 series, api 7).
- Five production alert rules exist as code (`infra/monitoring/grafana/cloud/alert-rules.json`,
  applied by `grafana-alert-rules.yml`), in folder `intelliflow-prod`. They route to the
  owner's email contact point. Rule "Production telemetry stopped" covers predictive and
  absence alerting.
- Trace and log correlation is live for ai-worker (pino lines carry trace_id and span_id).

## Open questions

- Are restart-on-failure and a health check set on the Railway production services? This
  cannot be verified until finding 5 is resolved.

## Summary

- Lens 6 (UI reachability): N/A (infrastructure task).
- Lens 7 (scope adherence): 2 blocks (findings 1 and 2: the sprint-0 attestation claimed both
  met) and 2 warnings (findings 4 and 6).
- Residual risk: the self-healing evidence depends on Railway access.
