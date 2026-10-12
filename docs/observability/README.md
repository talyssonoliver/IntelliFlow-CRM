# Observability — Operator Runbook (IFC-032)

This document is the operator-facing reference for the OpenTelemetry stack
introduced/finalised by **IFC-032** (PHASE-005: OpenTelemetry Monitoring).

It supersedes nothing — the existing instrumentation in
`packages/observability/`, `apps/api/src/tracing/`, and the docker-compose stack
at `infra/monitoring/` continues to operate as before. IFC-032 adds:

1. Domain-level workflow spans inside `LeadRoutingService.routeLead`
   (`workflow.lead.route` parent + 3 children).
2. The `artifacts/misc/otel-collector-config.yaml` artifact, byte-synced from
   the runtime config at `infra/monitoring/otel-collector.yaml`.
3. The `artifacts/misc/trace-examples.json` artifact, captured from real
   `LeadRoutingService.routeLead` invocations via `InMemorySpanExporter`.
4. Four Grafana-provisioned alert rules at
   `infra/monitoring/grafana/provisioning/alerting/intelliflow-rules.yaml`.

Source-of-truth ADR: `docs/architecture/adr/ADR-017-workflow-reliability.md`.

---

## 1. Stack startup

```bash
docker compose -f infra/monitoring/docker-compose.monitoring.yml up -d
```

The compose file launches the four services that the apps export to:

| Service        | URL                     | Purpose                               |
| -------------- | ----------------------- | ------------------------------------- |
| OTel Collector | `localhost:4317` (gRPC) | Receives OTLP traces / metrics / logs |
|                | `localhost:4318` (HTTP) |                                       |
| Grafana        | `http://localhost:3000` | UI — dashboards, alert ack/silence    |
| Prometheus     | `http://localhost:9090` | Metric backend                        |
| Tempo          | `localhost:3200`        | Trace backend                         |
| Loki           | `localhost:3100`        | Log backend                           |

Datasources are auto-provisioned at startup via
`infra/monitoring/grafana/provisioning/datasources/datasources.yml` and the
alert rules added by IFC-032 are auto-loaded from
`provisioning/alerting/intelliflow-rules.yaml`.

To enable export from local apps, set:

```env
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=intelliflow-api      # or intelliflow-web / intelliflow-ai-worker
```

To **disable** OTel for an app (CI, local dev without the stack), set
`OTEL_ENABLED=false`.

---

## 2. Regenerating `artifacts/misc/trace-examples.json`

The artifact records real W3C-format trace IDs from
`LeadRoutingService.routeLead` invocations against three seeded fixtures
(rule-matched, load-balanced, and a HOT-lead-without-skill fallback). It is
captured hermetically via `InMemorySpanExporter` — no live collector required at
CI time.

```bash
# Default: writes to artifacts/misc/trace-examples.json
npx tsx tools/scripts/observability/capture-trace-examples.ts

# Custom output:
npx tsx tools/scripts/observability/capture-trace-examples.ts --out=/tmp/trace.json
```

Output shape is locked by
`apps/project-tracker/docs/metrics/schemas/trace-examples.schema.json` (closed
schema, `additionalProperties: false`). The CI gate `real-trace-data` verifies
that every captured `trace_id` matches the W3C 32-hex pattern.

To capture trace IDs from a **live OTLP exporter** (e.g., for production
debugging), point `OTEL_EXPORTER_OTLP_ENDPOINT` at the live collector and read
trace IDs from Tempo's search UI (Explore → Tempo → search for service
`intelliflow-api`, span `workflow.lead.route`). The capture script's hermetic
mode is the canonical evidence path; live capture is operational.

---

## 3. Viewing traces in Grafana → Tempo

1. Open `http://localhost:3000` (default credentials: `admin` / `admin` — change
   on first login).
2. Explore → **Tempo** datasource.
3. Paste a `trace_id` from `artifacts/misc/trace-examples.json` (any of the 3
   examples) into the search box.
4. The waterfall view shows `workflow.lead.route` (the parent) plus three
   children: `workflow.lead.route.evaluate_rules`,
   `workflow.lead.route.score_agents`, `workflow.lead.route.persist_audit`.

Each span carries the attributes documented in ADR-017 §3:

| Attribute                                    | Source                                                         |
| -------------------------------------------- | -------------------------------------------------------------- |
| `workflow.id`                                | UUID generated at `routeLead` entry; written to `RoutingAudit` |
| `route.id`                                   | Matched rule ID, or `rule:none` for fallback strategies        |
| `lead.id`                                    | Lead UUID                                                      |
| `tenant.id`                                  | Tenant UUID                                                    |
| `routing.method`                             | `rule_match` \| `skill_match` \| `load_balance`                |
| `routing.score`                              | Final winning score (0 when no eligible agent)                 |
| `agents.eligible_count` (score_agents child) | Number of agents considered                                    |
| `audit.id` (persist_audit child)             | Inserted RoutingAudit row id                                   |

---

## 4. Loki ↔ Tempo log correlation

`packages/observability/src/logging.ts:100-111` injects `trace_id` and `span_id`
into every Pino log line emitted inside an active OTel span. The Grafana
datasource provisioning at
`infra/monitoring/grafana/provisioning/datasources/datasources.yml` declares two
derived fields on the Loki datasource:

```yaml
- name: TraceID
  matcherRegex: '"trace_id":"([a-f0-9]+)"'
  url: ${__value.raw}
  datasourceUid: tempo
```

Click any log line in Explore → Loki → the trace ID becomes a deep link to the
corresponding Tempo trace. The same regex matches on `trace_id=<hex>` for
non-JSON log formats.

---

## 5. Alerts (IFC-032 baseline)

| Rule                     | Threshold               | Severity |
| ------------------------ | ----------------------- | -------- |
| `WorkflowErrorRateHigh`  | error rate > 1% over 5m | warning  |
| `WorkflowP95LatencyHigh` | p95 > 500ms over 5m     | warning  |
| `OtelCollectorDown`      | no spans for 5m         | critical |
| `LeadRoutingFailures`    | > 5 ERROR spans in 5m   | warning  |

All four are validated on every CI run by:

```bash
npx tsx tools/scripts/observability/lint-alerts.ts
```

A non-zero exit prints which rule is missing or which threshold drifted.

To **acknowledge** or **silence** an alert: Grafana → Alerting → Alert rules →
click the rule → "Silence". Document the silence reason in your incident ticket
so it is reviewed at the next SRE check-in.

To **add a new rule**: edit `intelliflow-rules.yaml`, restart the Grafana
container (or `kill -HUP` to re-provision), then update the `REQUIRED_RULES`
array in `tools/scripts/observability/lint-alerts.ts` so the lint check accepts
the new contract.

---

## 6. Synthetic Monitoring: production uptime probe (#811, IFC-032 follow-up)

The alert rules in section 5 all watch span metrics from our own traces — they
go silent together with the service they'd warn about if the production API
stops exporting at all. PR #804's body named the gap directly: _"Availability
(an external probe of `/health/ready`) is not a span-metric rule. It needs a
Grafana Synthetic Monitoring check."_ That check is
`infra/monitoring/grafana/cloud/synthetic-monitoring.json`, applied by
`tools/scripts/observability/apply-synthetic-monitoring.mjs`.

It does two things against two different Grafana Cloud APIs:

1. Creates/updates an HTTP check that probes
   `https://api-production-e9c1.up.railway.app/health/ready` every 60s from
   three public locations (London, Amsterdam, Frankfurt), via the Synthetic
   Monitoring API.
2. Creates/updates **one** Grafana alert rule, `ifc811-probe-success-down`, over
   the `probe_success` metric the check publishes to the stack's existing
   `grafanacloud-prom` datasource — via the **same** provisioning API
   `apply-grafana-alert-rules.mjs` uses, in the same `intelliflow-prod`
   folder/group, so it inherits the default notification policy (owner's email)
   IFC-032 already set up. It only ever creates/updates that one rule by uid; it
   never calls the folder/rule-group endpoint that
   `apply-grafana-alert-rules.mjs` uses to set the group interval, because that
   call replaces the group's entire rule list and would silently delete the
   IFC-032 rules.

### Two owner steps, then one apply — not done yet

This has **not** been applied. Two things only the owner can do, then the apply
command:

1. **Initialize Synthetic Monitoring on the stack.** Grafana Cloud
   (`graysushi1880`) → left sidebar → **Testing & synthetics → Synthetics** →
   click **Initialize the plugin**. It is pre-installed on every Grafana Cloud
   stack; this just turns it on.
2. **Issue a Synthetic Monitoring access token.** Same section → **Config →
   Access tokens → Generate access token**. That screen also shows the stack's
   Synthetic Monitoring API base URL (`SM_API_URL`, something like
   `https://synthetic-monitoring-api-<region>.grafana.net`). Add the token as
   the `SM_ACCESS_TOKEN` repo secret and the base URL as the `SM_API_URL` repo
   variable (mirrors how `GRAFANA_SA_TOKEN` was added for IFC-032). The token
   does not expire and is never printed by the script or the workflow.

Once both exist, apply with:

```bash
SM_API_URL=<from the Config tab> SM_ACCESS_TOKEN=<the access token> \
GRAFANA_URL=https://graysushi1880.grafana.net GRAFANA_SA_TOKEN=<grafana service account token> \
  node tools/scripts/observability/apply-synthetic-monitoring.mjs
```

or dispatch `.github/workflows/synthetic-monitoring.yml` by hand (optionally
with `dry_run: true` first, which only resolves probe names and reports whether
it would create or update — it writes nothing to either API).

Until both secrets exist, every run of the workflow fails with
`SM_API_URL and SM_ACCESS_TOKEN are required` and touches nothing.

### Validating the config

```bash
npx vitest run tools/scripts/__tests__/apply-synthetic-monitoring.test.ts
```

Covers: the committed config validates; the check targets `/health/ready` on a
1-5 minute frequency; bad check/alert-rule fields are reported; the SM check
payload and the Grafana alert rule are built correctly; the run refuses to start
without either API's credentials; an unknown probe name fails loudly instead of
silently monitoring from nowhere; dry run writes nothing; create vs. update is
chosen correctly for both the check and the alert rule; the rule group is never
replaced; a check that's been running with no live `probe_success` series fails
loudly; neither token is ever logged.

---

## 7. CI gate commands (used by `/exec` validation)

| Gate                | Command                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `integration-wired` | `grep -q "tracer.startActiveSpan('workflow.lead.route'" apps/api/src/services/LeadRoutingService.ts`                           |
| `real-trace-data`   | `npx tsx tools/scripts/observability/capture-trace-examples.ts && jq '.examples \| length' artifacts/misc/trace-examples.json` |
| `collector-sync`    | `npx tsx tools/scripts/observability/sync-collector-artifact.ts --check`                                                       |
| `alerts-shape`      | `npx tsx tools/scripts/observability/lint-alerts.ts`                                                                           |

---

## 8. Troubleshooting

- **No spans in Tempo**: confirm `OTEL_ENABLED=true` and that the collector is
  reachable from the app (gRPC on 4317 by default). `docker compose ps` must
  show all four services as `running`.
- **Spans appear but no log correlation**: verify that the log statement is
  inside an active span. `packages/observability/src/logging.ts` only injects
  `trace_id`/`span_id` when `trace.getActiveSpan()` returns a span.
- **`real-trace-data` gate fails locally**: run the capture script directly and
  inspect `artifacts/misc/trace-examples.json`. Common cause: stale build of
  `packages/observability` — rerun
  `pnpm --filter @intelliflow/observability build`.
- **`collector-sync` gate fails**: someone edited
  `artifacts/misc/otel-collector-config.yaml` directly. Re-run
  `npx tsx tools/scripts/observability/sync-collector-artifact.ts` to re-derive
  the artifact from the source.
- **Want to see what the AI worker emits?** `apps/ai-worker` only carries
  Node-level auto-instrumentation (HTTP/BullMQ). LangChain chain spans require a
  follow-up task (out of scope for IFC-032).
- **`synthetic-monitoring.yml` fails with
  `SM_API_URL and SM_ACCESS_TOKEN are required`**: expected until the owner
  completes the two steps in section 6. Not a bug — the apply script refuses to
  guess a token.
- **Synthetic Monitoring applied but the alert never fires on a real outage**:
  check the rule's `probe_success` series in Explore → Prometheus
  (`grafanacloud-prom`) with
  `avg_over_time(probe_success{job="ifc-prod-health-ready"}[5m])`. If it's flat
  at `1` while the endpoint is actually down, the check itself (not the alert)
  is the problem — Grafana Cloud → Synthetic Monitoring → Checks →
  `ifc-prod-health-ready`.

---

## 9. Related Documents

- **ADR-017** — `docs/architecture/adr/ADR-017-workflow-reliability.md`
  (governance contract for IFC-032)
- **Specification** —
  `.specify/sprints/sprint-18/specifications/IFC-032-spec.md`
- **Plan** — `.specify/sprints/sprint-18/planning/IFC-032-plan.md`
- **Schema** —
  `apps/project-tracker/docs/metrics/schemas/trace-examples.schema.json`
- **Source code** —
  - `apps/api/src/services/LeadRoutingService.ts` (workflow spans)
  - `packages/observability/src/index.ts` (OTel API + InMemorySpanExporter
    passthrough)
  - `tools/scripts/observability/{capture-trace-examples,sync-collector-artifact,lint-alerts}.ts`
- **Grafana Cloud (production, not the local stack above)** —
  - `infra/monitoring/grafana/cloud/alert-rules.json` +
    `tools/scripts/observability/apply-grafana-alert-rules.mjs` (IFC-032 span
    metric alerts, PR #804)
  - `infra/monitoring/grafana/cloud/synthetic-monitoring.json` +
    `tools/scripts/observability/apply-synthetic-monitoring.mjs` (the
    `/health/ready` uptime probe + alert rule, #811 — see section 6; not applied
    yet, pending the two owner steps there)
