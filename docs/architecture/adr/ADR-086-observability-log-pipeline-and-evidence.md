# ADR-086: Observability log pipeline and production evidence

**Status:** Accepted (2026-10-22, validated by the IFC-074 implementation and
its first production collector run)

**Date:** 2026-10-22

**Deciders:** Talysson Oliveira (owner ruling 2026-10-22, option A), IFC-074
spec session (DevOps-Lead, Backend-Architect, Security-Lead, Test-Engineer,
Domain-Expert)

**Technical Story:** IFC-074 — PHASE-040: Full Stack Observability. Amends the
observability lines of ADR-001 (lines 107, 413-429: "OpenTelemetry, Prometheus,
Grafana").

## Context and Problem Statement

Production exports OpenTelemetry traces, metrics and logs from `api` and
`ai-worker` to Grafana Cloud over OTLP. A read-only check on 2026-10-22 found
that Loki holds log lines only from `ai-worker`: the api writes its per-request
log with `console.*`, and only pino records are forwarded to the OTel Logs SDK
(`packages/observability/src/node-instrumentations.ts`, #809). The IFC-074
evidence files (`artifacts/reports/correlation-test.csv`,
`artifacts/reports/mttr-baseline.json`) were hand-written, and the only alerts
that fire from real traffic are Grafana-managed rules that are not in the repo.

How should services log so that a log line, its trace and its metrics can be
joined, and what counts as evidence that they are?

## Decision Drivers

- A log line must carry `trace_id`/`span_id` and reach the same backend as the
  trace (Grafana "Logs for this trace").
- Evidence must come from production telemetry, never from in-memory exporters,
  templates or simulated incidents (constitution, ADR-017).
- No personal data or credential-shaped strings in exported logs or committed
  evidence.
- Minimal change: reuse `createLogger` and the existing pino instrumentation.

## Considered Options

1. pino (via `@intelliflow/observability` `createLogger`) → instrumentation-pino
   → OTLP → Loki for every Node service.
2. An OTel winston transport or a console patch in the api.
3. Scrape Railway stdout into Loki with a separate agent.

## Decision Outcome

Chosen option: 1.

- Node services log through pino created by `createLogger`, after the OTel SDK
  has started (the logger is created lazily, so `instrumentation-pino` patches
  it). Records carry `trace_id`/`span_id` from the active span and are exported
  over OTLP. `createLogger` redacts credential and email fields.
- The api's per-request log is a pino record
  (`type: trpc.request | trpc.slow | trpc.error`) with no error message, request
  id, email or other free text. Pseudonymous `tenantId`/`userId` may appear
  (gdpr-compliance.md:89).
- Grafana-managed alert rules (the App Observability / asserts rules) count as
  real alerts for MTTD, alongside the rules-as-code in
  `infra/monitoring/grafana/cloud/alert-rules.json`.
- Observability evidence is produced only by the read-only collector
  `tools/scripts/observability/collect-observability-evidence.mjs` from Grafana
  Cloud (Loki, Tempo, Prometheus, alert state history). Its outputs are
  allowlist-validated and fail closed. Per incident, MTTD = time of the alert's
  transition to Alerting minus the start of the earliest error span of that
  incident. The KPI is judged per error episode: anchored incidents of one
  service whose first errors start within 10 minutes of each other are one
  episode, and its MTTD runs from the earliest error to the earliest alert from
  any rule. The statistic is the mean over episodes. (Amended 2026-10-23:
  Grafana Asserts' ErrorRatioBreach cannot fire sooner than about 180 s after
  the first error, so a direct span-metrics rule was added in the repo's
  rules-as-code; per alert, the slow rule would still count against the KPI
  after the fast one had already fired.)

### Positive Consequences

- One log pipeline for api and ai-worker; logs, traces and span metrics join on
  `trace_id` and `service`.
- Evidence is reproducible: re-running the collector regenerates it.

### Negative Consequences

- One Loki line per tRPC call (volume/cost grows with traffic).
- Evidence for a service exists only after that service has real traffic.
- The collector currently uses an Admin service-account token read-only; a
  Viewer token is a follow-up.

## Links

- ADR-001 (modern stack), ADR-017 (real trace evidence), IFC-032 (alert
  delivery)
- `.specify/sprints/sprint-18/specifications/IFC-074-spec.md`
