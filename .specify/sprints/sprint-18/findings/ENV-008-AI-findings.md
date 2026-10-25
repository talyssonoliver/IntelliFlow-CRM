# ENV-008-AI findings (production observability, 2026-10-25)

These are red flags and out-of-scope defects found while making the production SLOs, dashboard and Railway self-healing real. Each one is either fixed in this task, or tracked in all three places: a gh issue, `artifacts/metrics/debt-ledger.yaml`, and this file.

## Fixed in ENV-008-AI

| # | Finding | Evidence | Fix |
|---|---|---|---|
| F1 | `grafana-alert-rules.yml` had been red on main since 2026-10-06. While the Grafana Cloud instance woke up, it answered HTTP 503, and the shared client threw on the first one. | `gh run list --workflow grafana-alert-rules.yml`; old `grafana-provisioning.mjs` `createApiClient` (single attempt) | 503 retry in `createApiClient`: 8 attempts over 255 s, other statuses untouched (AC-001) |
| F2 | Grafana scripts echoed raw response bodies into thrown errors, so into CI logs (`${res.text}` at 6 sites). | old `apply-grafana-alert-rules.mjs` and `apply-synthetic-monitoring.mjs` error messages | `redactBody` in the shared lib, applied at every site, including the new scripts (NF-001) |
| F3 | No running system loads `self-healing-rules.yaml` or `anomaly-detection.json`, yet both read as configuration. | code audit, Lens 7 | Both rewritten as descriptive records, pinned by tests to `DESIRED` and `slos.json` (AC-009) |

## Tracked (out of scope)

| # | Finding | gh issue | Debt ledger | Owner lane |
|---|---|---|---|---|
| T1 | Three IFC-032 rules watch `workflow.lead.route`, which production never emits (`LeadRoutingService.ts:167-171`; only `capture-trace-examples.ts:201` sets the tracer). The p95 rule also queries the absent `traces_spanmetrics_latency_bucket` (`alert-rules.json:49-50`). | #1028 | `ENV008-DEAD-WORKFLOW-RULES-001` | DevOps Lead. `alert-rules.json` belongs to the IFC-074-B2 lane, so this task does not edit it |
| T2 | Every ai-worker `llm.invoke` span fails in production (read 2026-10-22), alongside about 140 failed pg INSERTs. | #1029 (related #805) | `ENV008-LLM-INVOKE-ERRORS-001` | AI Specialist |
| T3 | `/health/detailed`, `/health/db` (`http-server.ts:346-368`) and `health.dbStats` (`health.router.ts:87`) are public. | #1030 | `ENV008-PUBLIC-HEALTH-DETAIL-001` | Security Lead |
| T4 | `RAILWAY_TOKEN` is an account-wide repository secret, and the Railway CLI is pinned only to `@railway/cli@4` (`promote-production.yml:178-181,194`). | #1031 | `ENV008-RAILWAY-TOKEN-SCOPE-001` | DevOps Lead + owner |
| T5 | api server-side p95 was 2.72 s against the 200 ms objective (`slo-definitions.md:56`). | #1001 (existing, reused; acceptance item added as a comment) | `ENV008-API-P95-LATENCY-001` | Backend Lead |

T1 to T5 extend the spec's AC-011 list of four to five. AC-004 needs a separate issue for the latency SLO, and an open one already existed (#1001), so it is reused rather than duplicated.

## Notes (no defect, recorded on purpose)

- **Spec citation corrected.** `apps/project-tracker/lib/artifact-registry.ts:1210-1220` does **not** name the three infra files; they fall to its EP-001-AI fallback. The files are referenced by path from the CSV `Artifacts To Track`, `apps/project-tracker/docs/metrics/plan-overrides.yaml:1670` and the docs.
- **Stale script path (INFO, not fixed).** The `_comment` in `infra/monitoring/grafana/cloud/alert-rules.json` names `tools/scripts/grafana/apply-alert-rules.mjs`. The real script is `tools/scripts/observability/apply-grafana-alert-rules.mjs`. The file belongs to IFC-074-B2, so it is left alone.
- **Debt-ledger structure (INFO, not fixed).** 51 strategic items (`debt_001` and later, including `debt_002`, which this task resolves) are indented under the top-level `alerts:` key, not `items:`. Readers that walk `items` miss them. The `summary` block is also stale: it counts 439 items, against 463 under `items` before this task. Both predate this task. A ledger-wide move belongs to the ledger owner, not to a feature lane.
- **Out of reach.** web, ws, events-worker and ingestion-worker emit no telemetry. Enabling them needs OTLP secrets on those Railway services, which redeploys them, so it is owner-only. It stays under EP-001-AI. The "100% services" KPI is therefore not met (ADR-087).
- **Spec deviations** (recorded in the exec report and the attestation):
  - NF-003: CLI guards stay multi-line (prettier).
  - AC-011: 5 issues.
  - AC-006: three independent workflows instead of three jobs (lane-lead constraint 2026-10-25, plan r4/A2).
  - AC-007: the api health check is set only after a live 200 from `/api/health/live` (plan r4/A1). `grafana-alert-rules.yml` timeout goes from 5 to 12 minutes.
