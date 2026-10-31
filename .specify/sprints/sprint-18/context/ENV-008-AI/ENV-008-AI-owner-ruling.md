# ENV-008-AI — owner ruling

**Date:** 2026-10-22
**Asked by:** the ENV-008-AI lane (AskUserQuestion modal)
**Answer:** A. Re-scope to real (Recommended)

## The question

Production evidence read on 2026-10-22, read-only:

- Grafana Cloud stack `graysushi1880` (Prometheus `target_info`): only `api` and
  `ai-worker` emit OTel. Loki holds `service_name` values for `ai-worker` only (last 7 days).
- Alert rules: the 5 IFC-032 rules in folder `intelliflow-prod` (labels `source=ifc-032`,
  `team=owner`) and the Grafana Asserts rule set (`RequestRateAnomaly`, `LatencyP95Anomaly`,
  `asserts:*:prediction`, `asserts:*:anomaly_upper_threshold`, ...). Contact points: an email
  to the owner plus the Asserts insight-processor webhook.
- SLOs: `{"slos":[]}`. Dashboards: only Grafana Cloud's built-in insight/usage dashboards.
- `infra/monitoring/self-healing-rules.yaml` and `infra/monitoring/anomaly-detection.json`:
  no code, workflow or Terraform reads either file.

Options offered:

- **A. Re-scope to real.** Anomaly detection = Grafana Asserts (live). Add SLOs and a dashboard
  as code, applied by the existing Grafana CI on merge. Self-healing = Railway
  restart-on-failure plus health checks set in Terraform. Rewrite the two dead config files to
  describe what really runs. The three silent workers go to a tracked follow-up (EP-001-AI).
  No direct production changes by the lane.
- B. Full scope, including workers (Railway OTLP secrets on ws/events/ingestion, which
  redeploys them, plus a self-healing consumer that redeploys on alert).
- C. Park it: attest PARTIAL, CSV stays In Progress.

## Ruling

**A.** This is a Category C re-scope of the DoD that the owner approved. It narrows
"self-healing enabled" and "anomaly detection active" to the mechanisms that really run in
production. Worker emission (ws, events-worker, ingestion-worker) is not dropped: it moves to a
tracked follow-up.

## Ruling 2: Railway self-healing evidence (2026-10-22)

**Question:** every Railway credential on this machine fails. The `.env.local` token (one value
used as `RAILWAY_API_TOKEN`, `RAILWAY_TOKEN` and `TF_VAR_railway_token`) returns
`Not Authorized` and `Project Token not found`. The CLI OAuth session expired at
2026-10-21 03:44 UTC and its refresh fails with `invalid_grant`. The GitHub secret
`RAILWAY_TOKEN` still works: `promote-production.yml` redeployed api and ai-worker with it on
2026-10-21 at 03:36. How should access be restored?

Options: A. the owner runs `railway login`; B. the owner pastes a new token;
C. do it by CI on merge.

**Answer: C. Do it by CI on merge (Recommended).** A workflow, run with the working GitHub
secret when the change merges, reads and sets the restart policy and health check of the
Railway production services and logs the result. Until that run exists, the attestation
records self-healing as NEEDS_HUMAN (evidence lands after merge).
