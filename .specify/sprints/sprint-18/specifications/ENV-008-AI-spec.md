# Specification: ENV-008-AI — Automated Observability with Predictive Monitoring

**Sprint:** 18 · **Route:** RECONCILE-AND-ATTEST, re-scoped by owner ruling A (2026-10-22)
**Session:** subagent mode with 4 agents (DevOps-Lead, Security-Lead, Domain-Expert,
Test-Engineer). Discussion: `ENV-008-AI-discussion.md`.
**Inputs:** `context/ENV-008-AI/ENV-008-AI-owner-ruling.md` (rulings A and 2),
`ENV-008-AI-code-audit.md`, `ENV-008-AI-hydrated-context.md`.

## Overview

The CSV DoD reads: "OpenTelemetry AI-configured, predictive alerts set, anomaly detection
active, self-healing enabled". The Sprint-0 close rested on three files that nothing loads
(`self-healing-rules.yaml`, `anomaly-detection.json`, `otel-config.yaml`). Under ruling A, each
DoD item maps to something that runs in production and leaves production evidence:

| DoD / KPI item | Re-scoped meaning (ruling A) | Evidence |
|---|---|---|
| OpenTelemetry AI-configured | api and ai-worker export OTLP directly to Grafana Cloud. `otel-config.yaml` documents the real emitters, including the ai-worker `llm.*` span attributes (`apps/ai-worker/src/tracing/llm-tracer.ts:77-87`) | Grafana `target_info` (api, ai-worker) |
| Anomaly detection active | Grafana Asserts anomaly and prediction rules on span metrics (managed by the plugin) | Grafana provisioning API: Asserts rules present (read before and after) |
| Predictive alerts set | SLO burn-rate alerts (fast and slow) on api availability, plus the existing IFC-032 rules. Latency and LLM SLOs are defined **without** alerts until their gh issues are fixed (see AC-004) | SLO API listing after merge |
| Self-healing enabled | Railway `restartPolicyType: ON_FAILURE` (crash restart) on api and ai-worker, plus a deploy-time health check on the api | CI job log (before and after values) after merge |
| SLOs defined | 3 SLOs from `docs/operations/slo-definitions.md` | SLO API after merge |
| Dashboards live | **One** dashboard (ruling A) | Dashboard API after merge |
| 100% services emit traces/metrics/logs | **Not met, and not claimed.** 2 of 6 deployable apps send traces (api, ai-worker); 1 sends logs to Grafana (ai-worker). web, ws, events-worker and ingestion-worker are tracked under EP-001-AI; api logs are tracked under IFC-074 | Prometheus `target_info`; Loki `service_name` |

## Related Documents

| Type | Path | Status | Action |
|---|---|---|---|
| PRD | N/A | — | Infrastructure task, no user-facing feature |
| ADR | `docs/architecture/adr/ADR-087-production-slos-anomaly-detection-and-self-healing.md` | Proposed, becomes Accepted at consensus | Created |
| ADR | ADR-086, observability log pipeline and evidence (IFC-074 lane; the file exists only on that branch, not on main) | Accepted, on its branch | Referenced, not modified |
| SLO doc | `docs/operations/slo-definitions.md` (IFC-142) | Existing | Source of targets, not modified |

## Dependency Verification

| Dependency | Claim | Verified | Method |
|---|---|---|---|
| ENV-005-AI | CI pipeline runs | TRUE | `gh run list --workflow ci.yml --branch main`: green on 2026-10-21 |
| IFC-032 (context) | Alert-rules CI applies rules | **FALSE since 2026-10-06** | Every push run has failed with `HTTP 503` (instance asleep). The live rules still equal the repo, because #884 changed only `requireSeries`. Fixed here (AC-001), since the new jobs depend on it |

## Technical Approach

1. **Fix the red Grafana CI first (AC-001).**
   - `createApiClient` (`tools/scripts/lib/grafana-provisioning.mjs:9-30`) retries HTTP 503
     only: 8 attempts, delays 5, 10, 20, 40, 60, 60 and 60 s (255 s total, which covers the
     ~200 s cold start seen in F6).
   - `sleep` is injectable and is threaded through each `run()`.
   - Add a new export `redactBody(text)`. Raw `.text` in error messages
     (`apply-grafana-alert-rules.mjs:127,141,155`, `apply-synthetic-monitoring.mjs:182`) goes
     through it.
2. **SLOs as code (AC-002..AC-004).**
   - New file `infra/monitoring/grafana/cloud/slos.json`, applied by the new
     `tools/scripts/observability/apply-grafana-slos.mjs` through
     `/api/plugins/grafana-slo-app/resources/v1/slo[/{uuid}]`.
   - The script uses a fixed `uuid` for each SLO: GET by uuid, then POST on 404 or PUT on 200.
3. **One dashboard as code (AC-005).**
   - New files `infra/monitoring/grafana/cloud/dashboard-production.json` and
     `apply-grafana-dashboard.mjs`.
   - The script uses `POST /api/dashboards/db` with the fixed uid `env008-production`, folder
     `intelliflow-prod`, and `overwrite:true` limited to that uid. If a different uid already
     holds the title, Grafana's error is surfaced (redacted).
4. **Workflow (AC-006).**
   - `.github/workflows/grafana-alert-rules.yml` gets three jobs: `alert-rules` (the existing
     step), `slos` and `dashboard`. The jobs are independent, so a failed series check no
     longer blocks the SLOs.
   - The `paths:` filter gains the lib file, the two JSON files and the two scripts. An edit to
     any of them re-applies all three. The applies are idempotent, and this side effect is
     documented in ADR-087.
   - `timeout-minutes: 12` per job. `dry_run` passes `--dry-run` to all three jobs.
5. **Railway self-healing (AC-007, AC-008).**
   - New `tools/scripts/observability/apply-railway-self-healing.mjs`, which calls Railway's
     GraphQL API with Node `fetch` (no CLI).
   - New `.github/workflows/railway-self-healing.yml`, which runs on push to main for its own
     paths (`--apply`) and on `workflow_dispatch` (read-only unless `apply: true`).
6. **Rewrite the descriptive files in place (AC-009).**
   - Same paths. They are referenced by path from `artifact-registry.ts:1210-1220`.
   - Each states that it is descriptive, not loaded, and names the mechanism that runs.
   - `otel-collector.yaml` is untouched (`otel_validate`).
7. **Docs (AC-010).** Add a "Production topology" section to the three
   `docs/architecture/observability/*.md` docs. ADR-087 and its README row.
8. **Out-of-scope findings become issues (AC-011)**, plus `artifacts/metrics/debt-ledger.yaml`
   entries and a findings doc.

## Components

| File | Change | Owner-agent rationale |
|---|---|---|
| `tools/scripts/lib/grafana-provisioning.mjs` | modify: 503 retry, `sleep` option, `redactBody` export, exported `RETRY_DELAYS_MS` | DevOps (F6), Security (C3) |
| `tools/scripts/lib/grafana-provisioning.d.mts` (if present, else none needed; the test imports the `.mjs`) | modify types | Test |
| `tools/scripts/observability/apply-grafana-alert-rules.mjs` | modify: thread `sleep`; `redactBody` at L127/141/155 | Security |
| `tools/scripts/observability/apply-synthetic-monitoring.mjs` | modify: thread `sleep`; `redactBody` at L182 | Test C2 |
| `infra/monitoring/grafana/cloud/slos.json` | new | Domain |
| `tools/scripts/observability/apply-grafana-slos.mjs` + `.d.mts` | new | DevOps |
| `infra/monitoring/grafana/cloud/dashboard-production.json` | new | Domain |
| `tools/scripts/observability/apply-grafana-dashboard.mjs` + `.d.mts` | new | DevOps |
| `.github/workflows/grafana-alert-rules.yml` | modify (three jobs, paths, timeout) | DevOps |
| `tools/scripts/observability/apply-railway-self-healing.mjs` + `.d.mts` | new | DevOps, Security |
| `.github/workflows/railway-self-healing.yml` | new | DevOps, Security |
| `infra/monitoring/self-healing-rules.yaml`, `anomaly-detection.json`, `otel-config.yaml` | rewrite in place | Domain, Security |
| `docs/architecture/observability/{implementation-guide,correlation-patterns,instrumentation-checklist}.md` | add a section | DevOps |
| `docs/architecture/adr/ADR-087-production-slos-anomaly-detection-and-self-healing.md`, `docs/architecture/adr/README.md` | new / one row | all |
| Tests: see Test Requirements | new / extend | Test |

## Interfaces & Contracts

**`slos.json`** (validated by `validateConfig`; Grafana SLO OpenAPI v0_0 `Slo`):

```json
{ "folderUid": "intelliflow-prod", "destinationDatasourceUid": "grafanacloud-prom",
  "slos": [ { "uuid": "env008apiavail", "name": "...", "description": "...",
    "query": { "type": "ratio", "ratio": { "successMetric": {"prometheusMetric": "..."},
               "totalMetric": {"prometheusMetric": "..."} } },
    "objectives": [{ "value": 0.999, "window": "28d" }],
    "labels": [{"key":"source","value":"env-008-ai"},{"key":"team","value":"owner"}],
    "alerting": { "fastBurn": {...}, "slowBurn": {...} } } ] }
```

The API selector excludes health probes, which `slo-definitions.md:49` excludes:

```
API = service="api", span_kind="SPAN_KIND_SERVER", span_name!~"(GET|HEAD) (/api)?/health(/.*)?"
```

`OPTIONS` is kept, because the doc's exclusions are maintenance, 4xx and health
(L45-49).

| uuid | Objective / window | Query | Alerting |
|---|---|---|---|
| `env008apiavail` | 0.999 / 28d (L33) | ratio: success = `traces_spanmetrics_calls_total{API, status_code!="STATUS_CODE_ERROR"}`; total = `traces_spanmetrics_calls_total{API}` | fastBurn and slowBurn ON |
| `env008apip95` | 0.95 / 28d (L56: p95 < 200 ms as a request ratio, L62) | freeform: `histogram_fraction(0, 0.2, sum(rate(traces_spanmetrics_latency{API}[$__rate_interval])))` (native histogram; F2) | none (burning: 2.72 s p95); AC-004 |
| `env008llmsuccess` | 0.995 / 28d (L116) | ratio on `traces_spanmetrics_calls_total{service="ai-worker", span_name="llm.invoke"}` | none (F4: 100% ERROR); AC-004 |

Rules:

- No query may reference `_bucket`.
- A freeform range must be `[$__rate_interval]`.
- The window is 28 days rolling. The doc says 30 days calendar (L33, L143-145); Grafana
  supports rolling windows only, and ADR-087 records the difference.
- The 3x/2h burn rule and the 75%-budget rule (L189-190) are recorded gaps.

**`apply-grafana-slos.mjs` / `apply-grafana-dashboard.mjs`:**

- Signature: `run({ env, argv, fetchImpl, log, sleep })`.
- Env: `GRAFANA_URL`, `GRAFANA_SA_TOKEN`.
- `--dry-run` performs only GETs.
- Each exports `validateConfig(config)` and returns `string[]` errors.

**`apply-railway-self-healing.mjs`:**

- Signature: `run({ env, argv, fetchImpl, log, writeSummary })`.
- Env: `RAILWAY_API_TOKEN`, `RAILWAY_PROJECT_ID`.
- Flags: `--apply` (otherwise read-only).
- Exports `DESIRED`:

  ```
  api       = { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 10,
                healthcheckPath: '/api/health/live', healthcheckTimeout: 120 }
  ai-worker = { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 10 }
  ```

  ai-worker additionally gets `healthcheckPath: '/health/live'` only when its `PORT`
  equals its `HEALTH_PORT`, or when `HEALTH_PORT` is unset and `PORT == 5000`. Otherwise the
  script logs `healthcheck skipped: ai-worker serves health on HEALTH_PORT != PORT`.
- GraphQL (verified by introspection, D2):
  - `project(id){environments{edges{node{id name}}} services{edges{node{id name}}}}`
  - `serviceInstance(serviceId, environmentId){restartPolicyType restartPolicyMaxRetries healthcheckPath healthcheckTimeout}`
  - `variables(projectId, environmentId, serviceId)`. Only `PORT` and `HEALTH_PORT` are kept
    in memory; the rest is discarded and never logged.
  - `serviceInstanceUpdate(serviceId, environmentId, input)`. The input is built only from
    `DESIRED` keys whose values differ.
- Logging: only `service | field | before | after` (`null` is shown as `none`) and the skip
  line, written to stdout and the step summary. No IDs, no bodies. A GraphQL error logs
  `errors[].extensions.code` and an allow-listed message; otherwise `<redacted>`.
- A missing service, or a read-back that differs from `DESIRED`, exits 1 (fail closed).
- The script never triggers a redeploy. The settings take effect from the next deployment,
  and the log says so.

## Integration Points

- **GitHub secrets.** `GRAFANA_SA_TOKEN` comes from the Production environment
  (`grafana-alert-rules.yml:9-12`). `RAILWAY_TOKEN` is a repository secret passed as
  `RAILWAY_API_TOKEN` (`promote-production.yml:176-182`). `vars.RAILWAY_PROJECT_ID` is used
  as-is. **No new secret** is needed; the store is at its cap.
- **Grafana folder** `intelliflow-prod` already exists (`alert-rules.json:3`).
- **IFC-074 lane:** none of its files is touched (api logger, incident runbook, Sentry config,
  ADR-086). The one shared file is the ADR README, which gets one row.

## Runtime Wiring & Replacement Paths

| Surface | Must Be Called By | Replaces / Blocks | Notes |
|---|---|---|---|
| `apply-grafana-slos.mjs` | `grafana-alert-rules.yml` job `slos` (push to main on paths; dispatch) | nothing (0 SLOs today) | — |
| `apply-grafana-dashboard.mjs` | `grafana-alert-rules.yml` job `dashboard` | nothing | — |
| `createApiClient` retry | every Grafana script (alert-rules, synthetic, slos, dashboard) | the current "throw on first 503" (`grafana-provisioning.mjs:39` caller) | Fixes the red workflow |
| `apply-railway-self-healing.mjs` | `railway-self-healing.yml` | the Sprint-0 `operator_action` playbooks (`self-healing-rules.yaml:13-41`), now descriptive | — |
| `self-healing-rules.yaml`, `anomaly-detection.json`, `otel-config.yaml` | no runtime caller, **by design** (descriptive records, stated in each file) | the false claims that they configure a system | Content test pins them to `DESIRED` and `slos.json` |

## Navigation & Reachability

N/A (no UI).

## Acceptance Criteria

- **AC-001.** A 503 from Grafana is retried (8 attempts, 255 s schedule). Other statuses are
  not retried. Every Grafana script accepts `sleep`. `redactBody` is applied to every raw
  response body in thrown messages.
- **AC-002.** `slos.json` defines exactly the 3 SLOs above, with documented objectives, no
  `_bucket` series, and the health spans excluded. Each `description` states what its SLI does
  **not** count:
  - availability does not count tRPC failures returning 200 or 4xx (INTERNAL spans,
    `apps/api/src/tracing/middleware.ts:84-93`), nor requests slower than 30 s that did not
    error (`slo-definitions.md:42`)
  - LLM success has a very low call volume (about 10 calls a week, F4), so most evaluation
    steps have no data

  Tests assert that these caveats are present.
- **AC-003.** `apply-grafana-slos.mjs` creates a missing SLO (POST with its uuid) and updates
  an existing one (PUT). `--dry-run` sends only GETs. It refuses to run without env.
- **AC-004.** Availability has fast and slow burn alerts. Latency and LLM SLOs have no
  `alerting` block. Their descriptions say why and name the gh issue. Each of those issues
  carries the acceptance item "enable `alerting` on the SLO".
- **AC-005.** `dashboard-production.json` has uid `env008-production`, the folder
  `intelliflow-prod`, and 5 panels whose queries use only `traces_spanmetrics_calls_total` and
  `traces_spanmetrics_latency` with `service` in {api, ai-worker}.
- **AC-006.** `grafana-alert-rules.yml` has three independent jobs, each with its own
  `actions/checkout@v7` (same sparse paths) and `actions/setup-node@v7`, under the
  workflow-level no-cancel concurrency, the extended `paths:`
  filter, `timeout-minutes: 12`, `environment: Production` and `contents: read`. There is no
  `pull_request` or `pull_request_target` trigger.
  2026-10-25 exec amendment (plan r4/A2): delivered as three independent workflows
  (`grafana-alert-rules.yml`, `grafana-slos.yml`, `grafana-dashboard.yml`) instead of three jobs in one
  workflow, so SLO-only or dashboard-only changes never re-apply the alert rules.
- **AC-007.** `apply-railway-self-healing.mjs` reads the four fields for api and ai-worker,
  writes only differing `DESIRED` fields and only with `--apply`, verifies by read-back, and
  fails closed. It applies the ai-worker health-check guard and logs only the allow-listed
  fields.
- **AC-008.** `railway-self-healing.yml`:
  - push to main (own paths) runs `--apply`; dispatch is read-only by default
  - `environment: Production`, `contents: read`, no-cancel concurrency
  - secret passed via `env` only; no `pull_request*` trigger
  - `actions/*@v7`, as in the existing workflows
- **AC-009.** The three infra files are rewritten in place, are descriptive, and match
  `DESIRED`, `slos.json` and the real emitters `{api, ai-worker}`. Any path they reference
  exists. They contain no IDs, emails, webhook URLs or secret-shaped strings.
- **AC-010.** The docs carry a "Production topology" section (SDK → Grafana Cloud gateway, no
  collector). ADR-087 is Accepted and listed in the README.
- **AC-011.** gh issues are filed for:
  1. the dead IFC-032 rules (`LeadRoutingService.ts:167-171`, `alert-rules.json:49-50`); the
     proposed fix is to wire `setWorkflowTracer` in the production container and query the
     native histogram
  2. ai-worker `llm.invoke` failing 100% (F4)
  3. public `/health/detailed`, `/health/db` and `dbStats` (`http-server.ts:346-367`,
     `health.router.ts:87`)
  4. the account-wide repo-level `RAILWAY_TOKEN` and the unpinned CLI
     (`promote-production.yml:69-80,194`)

  Each is mirrored in `artifacts/metrics/debt-ledger.yaml` and
  `.specify/sprints/sprint-18/findings/ENV-008-AI-findings.md`. The silent workers stay under
  EP-001-AI.
- **AC-012.** The attestation is honest:
  - Production results that exist only after merge are `NEEDS_HUMAN`, with the workflow
    names to run: SLOs, dashboard and Railway self-healing.
  - The "100% services" KPI is `met:false`, with the scope wording above.
  - The CSV EVIDENCE path is corrected from sprint-0 to sprint-18 (Category A).

**Non-functional**

- **NF-001.** No token, ID or response body appears in any log or step summary. Tests prove it
  with runtime-built token-shaped strings.
- **NF-002.** No new npm dependency and no new GitHub secret.
- **NF-003.** Diff-coverage is at least 80% on changed `.mjs` lines. CLI guards are one line.

## Test Requirements

New or extended. All use the root vitest project; tests import the `.mjs` with a fake
`fetchImpl` and `sleep: async () => {}`.

- `tools/scripts/lib/grafana-provisioning.test.ts` (extend):
  - 503 then 200 succeeds; 503 on every attempt makes 8 attempts; 500, 401 and 404 make 1
  - the delay schedule equals `RETRY_DELAYS_MS`
  - the default sleep resolves (1 ms)
  - `redactBody` strips Bearer, `glsa_` and long base64 tokens, and truncates
  - the existing `'series check for up: HTTP 500'` test still holds
- `tools/scripts/__tests__/apply-grafana-alert-rules.test.ts` (extend): a 503-then-200 series
  check passes; a 400 body that contains a token-shaped string is not echoed; the env token
  never appears in any `log` call.
- `tools/scripts/__tests__/apply-synthetic-monitoring.test.ts` (extend): a 503-then-200 `run()`
  proves `sleep` is threaded through; a 400 at L182 with a token-shaped body is not echoed.
- `tools/scripts/__tests__/apply-grafana-slos.test.ts` (new):
  - the committed config is valid
  - 3 uuids and objectives
  - `_bucket` and non-`$__rate_interval` ranges are rejected
  - health exclusion present
  - env refusal
  - dry run sends GETs only
  - 404 → POST, 200 → PUT
  - HTTP error is redacted
  - token not in the log
- `tools/scripts/__tests__/apply-grafana-dashboard.test.ts` (new): config valid, uid and
  folder, queries use only the allowed metrics and services, dry run, upsert body, error
  redaction, token not logged.
- `tools/scripts/__tests__/apply-railway-self-healing.test.ts` (new), against a fake GraphQL
  of the D2 shape:
  - read-only by default (zero mutations)
  - `--apply` mutates only fields that differ; a second run is a no-op
  - the ai-worker guard: three PORT and HEALTH_PORT cases
  - variables containing a runtime-built token-shaped value are never logged
  - GraphQL errors are logged as code only
  - missing service and read-back mismatch → exit 1
  - missing env refused; the summary contains no IDs
  - `variables` unreadable (`Not Authorized` or null) → the ai-worker health check is skipped
    and logged `healthcheck skipped: variables unreadable`; the restart policy is still set;
    `PORT` is never guessed
- `tools/scripts/__tests__/env008-workflows.test.ts` (new): parse both workflows with js-yaml
  and assert AC-006 and AC-008, including no `pull_request*` triggers.
- `tools/scripts/__tests__/env008-monitoring-content.test.ts` (new): parse the 3 rewritten
  files and assert the structure equals `DESIRED`, the `slos.json` uuids and
  `{api, ai-worker}`; referenced paths exist; `otel-collector.yaml` exists; nothing
  secret-shaped (patterns built at runtime).

**Regression suites to rerun:**

- `tools/scripts/__tests__/apply-grafana-alert-rules.test.ts`
- `tools/scripts/__tests__/apply-synthetic-monitoring.test.ts`
- `tools/scripts/security/__tests__/workflow-secret-lint.test.ts`
- `tools/scripts/observability/__tests__/`

Command:
`pnpm exec vitest run --project root <files>`. Then
`node tools/scripts/security/workflow-secret-lint.mjs`, the root-project full run, and
diff-coverage.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Railway update applies only to the next deployment | Evidence says "effective from next deployment"; the attestation is NEEDS_HUMAN until a deploy plus read-back |
| `ON_FAILURE` covers crashes, not hangs | ADR-087 and `self-healing-rules.yaml` say so; the health check is a deploy gate only (F8) |
| Freeform `histogram_fraction` rejected by the live SLO API | Rejected at the first apply → the `slos` job fails visibly; the fallback is the explicit good/total pair (discussion, Round 2). Cannot be proven before merge (NEEDS_HUMAN) |
| SLOs burn from day one (latency 2.72 s, LLM 0%) | Truthful state; no tuning (D5); alerts withheld with an issue link (AC-004) |
| Account-wide Railway token at repo scope | Unchanged here (secret cap); issue (AC-011), recorded in ADR-087 |
| Settings remain if the workflow is deleted | Stated in ADR-087 ("CI owns; settings persist") |
| Production environment protection rules unknown | The existing Grafana job already uses Production; the first run confirms |
| No drift detection after the first apply | A weekly read-only schedule was rejected because of the Actions $0 budget (memory: secret-scan/Actions budget); a manual dispatch re-reads |

## Agent Sign-offs

Round 4 CONSENSUS: **4/4 APPROVED (100%, threshold 66%)**. The votes are verbatim in
`ENV-008-AI-discussion.md`. Each agent's minor modifications are folded in above.

| Agent | Vote | Modifications folded in |
|---|---|---|
| DevOps-Lead | APPROVED | per-job checkout and setup-node (AC-006); token-in-log assertion; ADR-087 drift-check note |
| Security-Lead | APPROVED | variables-unreadable fail-closed (Test Requirements); runtime token-shaped variable value; secret-lint regression; ADR-087 "changing DESIRED changes prod on merge"; CODEOWNERS left out (accepted) |
| Domain-Expert | APPROVED | SLI caveats in descriptions plus tests (AC-002); issue 1 fix wording (AC-011) |
| Test-Engineer | APPROVED | synthetic test extension; alert-rules test added to regression; exact command |
