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

## Amendment 2026-10-29: detection paths, KPI evidence, data in api records

**Detection paths.** Two rules in
`infra/monitoring/grafana/cloud/alert-rules.json` are the delivered
fast-detection paths:

- `ifc074-error-spans-direct` (#1040), on span metrics;
- `ifc074-error-logs-direct` (#1062), on Loki error-level lines. It was created
  in production on merge, in workflow run 40846555065.

The Loki rule selects `{service_name="ai-worker"}` only (the combined worker
logs as ai-worker). api errors are left to the span rule. Both rules' modelled
figures come from the #1040 and #1062 PR bodies and are not measured here:

- the span rule, modelled at 162-203 s, which is above the target, so api
  episodes are expected to miss it;
- the Loki rule, modelled at 36-61 s for the 9 of 13 replayed episodes that had
  an error-level line.

Widening the Loki rule to the api waits on the client-error log-level split (F14
after F11).

**KPI (owner ruling 4, 2026-10-29).** The primary statistic is the first alert
per error episode; the per-rule mean is co-reported. It is judged after deploy,
over at least 72 h or at least 10 real error episodes. The 2026-10-22 value
(per-incident mean 268.7 s, n=63) predates both rules and is not comparable.

**Where the KPI lives.** The collector stays local and read-only, and is never
run in CI. After deploy, the result flows through this chain, which needs no new
workflow, token or secret:

1. `artifacts/reports/mttr-baseline.json` (committed);
2. `task-tracking.json` `kpis.mttd_target`, with the file's SHA-256 as `source`;
3. attestation `kpi_results`;
4. `pnpm generate:metrics`, which feeds the tracker's task KPI panel.

The ENV-008 dashboard gains an "MTTD per error episode (live proxy)" panel. It
shows, per minute, error spans, error-level lines and first Alerting transitions
(from the alert state history). It is labelled a proxy: Grafana cannot join the
two per episode inside a panel. The collector checks each repo rule through its
own datasource (`DATASOURCE_KINDS`), so the Loki rule is read as LogQL, never as
PromQL.

**Data in api log records.** `tenantId` and `userId` reach Loki through the
logger mixin, but only on protected and tenant procedures (public, admin,
partner and auth procedures carry neither). They are pseudonymous ids, and
`user.id` is already on the Tempo span. The purpose is incident debugging, and
access is owner-only Grafana under the stack's Loki retention. If the owner
wants userId minimised, it is done once, for every service, in both the mixin
and the spans. The record carries no message, stack, cause, email or request id,
and its path and errorName are allowlisted.

**Retention bound (2026-10-29, open).** How long these ids are kept is bounded
by the Grafana Cloud stack's configured log retention. That figure is not
verified yet: the stack's Loki data only starts recently, so it can't be
inferred from the data, and the 720h in `infra/monitoring/loki-config.yml`
applies only to the self-hosted Loki. NEEDS_HUMAN: the owner reads the log
retention in the Grafana Cloud stack settings, and this ADR is updated with the
figure.

**Runtime impact on the api.**

- **Log volume.** Log records are written only inside a tRPC call: one `info`
  line per call, plus one `warn` line when the call is slower than 50 ms. The
  `@opentelemetry/sdk-logs` batch processor starts its export timer only while
  records are buffered, and unrefs it. So these logs add no outbound traffic
  while the api is idle.
- **Metrics exporter.** It is separate and pre-existing. The coordinator's live
  check on 2026-10-29 found the api deployment SLEEPING (last change at
  09:28:30Z, after the restart) and no api OTel metric series in Grafana. So the
  NodeSDK's 60 s metrics export is not reaching Grafana and does not keep the
  api awake today. If metrics export is ever enabled, the cumulative reader
  could block idle sleep; then set `OTEL_METRICS_EXPORTER=none` or a delta
  temporality preference (F19, low).
- **Cost.** The Loki volume estimate is about 1-2 lines per request at a few
  hundred bytes each, set against the free tier's 50 GB a month. It is an
  estimate. There is no volume tripwire yet (F15).

## Links

- ADR-001 (modern stack), ADR-017 (real trace evidence), IFC-032 (alert
  delivery)
- `.specify/sprints/sprint-18/specifications/IFC-074-spec.md`
