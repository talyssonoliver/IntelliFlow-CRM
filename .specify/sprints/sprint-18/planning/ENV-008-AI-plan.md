# Execution Plan: ENV-008-AI — Automated Observability with Predictive Monitoring

**Sprint:** 18 · **Route:** RECONCILE-AND-ATTEST, re-scoped by owner ruling A (2026-10-22)
**Spec:** `.specify/sprints/sprint-18/specifications/ENV-008-AI-spec.md` (4/4 APPROVED)
**Hexagonal layer:** none. The task touches only infrastructure and tooling: `tools/scripts/**` (`.mjs`),
`.github/workflows/**`, `infra/monitoring/**` and docs. It changes no domain, validators, application, DB,
adapters, API or UI code, so the Domain → … → UI order does not apply. There is no Prisma migration.
**Dependency chain references:**
- `docs/architecture/diagrams/complete-dependency-chains.md:1793,1829,2161`
- `docs/architecture/diagrams/integrations-dependency-chain.md:98,109,148,170`

Step 19 updates the ENV-008-AI marks in both files to match the attestation.

## Revision log

- **r1 (draft):** reviewed by the plan-reviewer subagent. Verdict: REVISE, with 6 errors, 11 warnings and 3 info items.
- **r2 (this version):** applies every reviewer item. The mapping is in "Plan-Reviewer Sign-off" at the end.

## Lane rules (from the dispatch note and CLAUDE.md)

- **Node 22 on every Bash call:** `export PATH="/c/Users/talys/AppData/Roaming/nvm/v22.14.0:$PATH"`. The host
  default, v25, hangs pg writes.
- **One test process at a time.** Full-project test runs, builds and coverage runs go through
  `node C:/Users/talys/ops/test-slots/with-slot.mjs --label ENV-008-AI -- <cmd>`. This task has no DB tests.
- **Gates and artifacts:**
  - Never pipe a gate into `tail` or `head`.
  - Never use `/* istanbul ignore */`.
  - Never commit `*.log`, `*.coverage` or `*.tsbuildinfo`.
- **Never commit secret-shaped strings.**
  - Build test tokens at runtime from parts, for example `'gl' + 'sa_' + 'x'.repeat(32)` and `'Bear' + 'er '`.
  - Use `*.example.invalid` hosts.
  - The commit hook runs the staged gitleaks scan before every commit.
- **Never write to production from this machine** (owner ruling 2).
  - The only production calls allowed are read-only GETs: the optional dry runs in Steps 12 and 13.
  - They use the mechanism defined there, and the token is never printed.
- **Do not touch IFC-074's files** (api logger, incident runbook, Sentry config, ADR-086).

## Preflight Checks

1. [ ] `git status --short` shows only the known non-task changes.
   - Do not stage:
     - `apps/project-tracker/CLAUDE.md` (written by `next dev`)
     - the `.claude/skills/*` edits
     - `artifacts/reports/plan-lint-report.json` (find out what wrote it before any commit)
   - Only `Sprint_plan.csv` carries this lane's own status flip (row 13, `Spec Complete` → `Planning`).
     `Sprint_plan_A.csv` stays clean until a split regeneration (Step 19, or the status flips).
   - Run `git diff -- apps/project-tracker/docs/metrics/_global/` first and confirm that row 13 is the only hunk.
   - Later commits stage only this task's row-13 hunks plus the regenerated `Sprint_plan_A.csv`.
     `split-sprint-plan.ts` rewrites only the split that holds the changed row. After each regeneration,
     `git status` should show exactly those two files.
2. [ ] `node --version` prints v22.x with the PATH prefix above.
3. [ ] `pnpm install --frozen-lockfile` is a no-op, because NF-002 adds no dependency.
   - `js-yaml` and `@types/js-yaml` are already root devDependencies (`package.json:174,202,256`).
   - `js-yaml` is declared `^5.2.2`, but the root `pnpm.overrides` entry `"js-yaml": ">=4.3.2 <5"` resolves
     it to 4.3.2. That version has `load`.
4. [ ] Baseline: the existing suites pass before any change:
   `node C:/Users/talys/ops/test-slots/with-slot.mjs --label ENV-008-AI -- pnpm exec vitest run --project root tools/scripts/lib/grafana-provisioning.test.ts tools/scripts/__tests__/apply-grafana-alert-rules.test.ts tools/scripts/__tests__/apply-synthetic-monitoring.test.ts tools/scripts/security/__tests__/workflow-secret-lint.test.ts tools/scripts/observability/__tests__/`
5. [ ] `node tools/scripts/security/workflow-secret-lint.mjs` exits 0 on the base tree.
6. [ ] `gh run list --workflow ci.yml --branch main --limit 3` shows green runs (ENV-005-AI re-check).
7. [ ] `mkdir -p .specify/sprints/sprint-18/execution/ENV-008-AI` (the evidence directory used by Steps 12,
   13 and 20; it does not exist yet).

## Dependency Verification (deep)

| Dependency | Claim | Verified | Method |
|---|---|---|---|
| ENV-005-AI (CSV dependency, Sprint 0, attestation verdict COMPLETE) | The CI pipeline runs on main | TRUE | `gh run list --workflow ci.yml --branch main --limit 3` was green on 2026-10-21 (spec §Dependency Verification). Re-checked by Preflight 6 |
| IFC-032 (context, not a CSV dependency) | `grafana-alert-rules.yml` applies the rules | FALSE since 2026-10-06 (HTTP 503) | `gh run list --workflow grafana-alert-rules.yml`. This task fixes it (AC-001, Steps 9-10) because the new jobs depend on it. No separate follow-up |

No dependency claim blocks the plan.

## Implementation Reality Checks

| Surface | Production Consumer | Replaces / Blocks | Verification Command |
|---|---|---|---|
| `createApiClient` 503 retry + `sleep` option | `apply-grafana-alert-rules.mjs:106`, `apply-synthetic-monitoring.mjs:143-144`, and the new `apply-grafana-slos.mjs` and `apply-grafana-dashboard.mjs` | the current single attempt that throws on the first 503 (`querySeriesCount`, `grafana-provisioning.mjs:39`) | `pnpm exec vitest run --project root tools/scripts/lib/grafana-provisioning.test.ts` |
| `redactBody` | every `${res.text}` in a thrown message: `apply-grafana-alert-rules.mjs:127,141,155`, `apply-synthetic-monitoring.mjs:182,193,209`, and the new SLO and dashboard scripts | raw response bodies echoed into CI logs | the alert-rules and synthetic tests (Steps 2, 3), plus `grep -nE '\$\{[a-zA-Z]+\.text\}' tools/scripts/observability/*.mjs` printing nothing |
| `apply-grafana-slos.mjs` | `.github/workflows/grafana-alert-rules.yml` job `slos` | nothing (production has 0 SLOs) | `tools/scripts/__tests__/env008-workflows.test.ts` |
| `apply-grafana-dashboard.mjs` | `.github/workflows/grafana-alert-rules.yml` job `dashboard` | nothing (there is no service dashboard) | `env008-workflows.test.ts` |
| `apply-railway-self-healing.mjs` | `.github/workflows/railway-self-healing.yml`: push to main on its own two paths runs `--apply`; dispatch is read-only by default | the Sprint-0 `operator_action` playbooks (`self-healing-rules.yaml:13-41`), which Step 16 rewrites as descriptive | `env008-workflows.test.ts` |
| `self-healing-rules.yaml`, `anomaly-detection.json` | none, **by design**: each file says it is a descriptive record. They are referenced by path from the CSV `Artifacts To Track`, `apps/project-tracker/docs/metrics/plan-overrides.yaml:1670` and docs. `artifact-registry.ts:1210-1220` does **not** name them; they fall to its EP-001-AI fallback (this corrects the spec's citation) | the false claim that they configure a system | `tools/scripts/__tests__/env008-monitoring-content.test.ts` pins them to `DESIRED`, the `slos.json` uuids and `{api, ai-worker}` |
| `otel-config.yaml` | the **local-stack** collector config, mounted by the `docker run` at `packages/observability/README.md:138`. It is not used in production. It must stay a valid collector config, so the production description goes in YAML **comments only** | the implied claim that it is the production config | `env008-monitoring-content.test.ts`: comment text, plus the top-level keys stay `receivers, processors, exporters, extensions, service` |

## Estimated Effort

| Phase | Files | Estimate |
|---|---|---|
| RED (tests) | 3 extended + 5 new test files | 150-240 min |
| Issues (Step 11) | 5 gh issues + findings doc + ledger | 45-75 min |
| GREEN (implementation) | 1 lib + 2 scripts (+2 `.d.mts`) modified; 3 scripts + 3 `.d.mts` + 2 JSON + 1 workflow new; 1 workflow modified | 240-360 min |
| Descriptive files, docs, ADR, chain docs, CSV | 3 infra + 3 docs + ADR + 2 chain docs + CSV/split | 60-120 min |
| REFACTOR + VALIDATION + attestation | — | 60-120 min |
| **Total** | **37 files** (see Files Summary) | **9.3-15.3 h**. The CSV PERT figure of 90/180/360 min predates the re-scope; this breakdown replaces it |

## Execution Steps

### Phase 1: RED — write failing tests

#### Step 1: Extend the shared-client tests (AC-001, NF-001)
**Type:** test
**Files to Modify:**
- `tools/scripts/lib/grafana-provisioning.test.ts`

**Acceptance Criteria Addressed:** AC-001, NF-001
- [ ] A 503 then a 200 returns the 200 result and calls `sleep` once with `RETRY_DELAYS_MS[0]`.
- [ ] A 503 on every attempt makes exactly 8 fetches and returns the last 503 (the callers throw).
  - `sleep` is called 7 times with exactly `RETRY_DELAYS_MS` = `[5000, 10000, 20000, 40000, 60000, 60000, 60000]`.
  - The delays sum to 255000.
- [ ] A 500, a 401 and a 404 each make exactly 1 fetch (no retry).
- [ ] The default `sleep` (no option passed) resolves for a 1 ms delay, so the default path is covered.
- [ ] `redactBody`:
  - replaces `Bearer <token>`, `glsa_…` and any run of 32 or more base64 or URL-safe characters (each test
    value built at runtime) with `<redacted>`
  - truncates to 200 characters with a marker
  - returns `''` for `undefined` and `null`
- [ ] The existing `'series check for up: HTTP 500'` test still passes unchanged.

**Validation:**
- [ ] `pnpm exec vitest run --project root tools/scripts/lib/grafana-provisioning.test.ts` fails on the
      new cases only, because `RETRY_DELAYS_MS` and `redactBody` are not exported yet.

#### Step 2: Extend the alert-rules tests (AC-001, NF-001)
**Type:** test
**Files to Modify:**
- `tools/scripts/__tests__/apply-grafana-alert-rules.test.ts`

- [ ] A series check that answers 503 and then 200 passes under `run({ sleep: async () => {} })`. This
      proves that `sleep` is threaded through `run()`.
- [ ] A 400 on rule POST whose body contains a runtime-built `glsa_` token: the thrown message does not
      contain the token.
- [ ] Across a full successful `run()`, no `log` call contains `env.GRAFANA_SA_TOKEN`.

**Validation:**
- [ ] `pnpm exec vitest run --project root tools/scripts/__tests__/apply-grafana-alert-rules.test.ts`
      fails on the new cases.

#### Step 3: Extend the synthetic-monitoring tests (AC-001)
**Type:** test
**Files to Modify:**
- `tools/scripts/__tests__/apply-synthetic-monitoring.test.ts`

- [ ] A `run({ sleep })` that meets a 503 and then a 200 succeeds (`sleep` is threaded).
- [ ] A 400 with a token-shaped body at each of the three sites does not echo the token:
  - the apply-check call (L182)
  - create-folder (L193)
  - the alert-rule PUT/POST (L209)
- [ ] The existing "only applies on an explicit manual dispatch, never on push" test still passes. Its
      `it.each` over every job's sparse paths also still holds.

**Validation:**
- [ ] `pnpm exec vitest run --project root tools/scripts/__tests__/apply-synthetic-monitoring.test.ts`
      fails on the new cases.

#### Step 4: New SLO tests (AC-002, AC-003, AC-004, NF-001)
**Type:** test
**Files to Create:**
- `tools/scripts/__tests__/apply-grafana-slos.test.ts`

- [ ] The committed `infra/monitoring/grafana/cloud/slos.json` passes `validateConfig` with 0 errors.
- [ ] It has exactly 3 SLOs with these uuids and objectives:
  - `env008-api-availability`: 0.999 / 28d
  - `env008-api-latency`: 0.95 / 28d
  - `env008-ai-worker-llm-success`: 0.995 / 28d
- [ ] Availability and LLM use `query.type === 'ratio'`. Latency uses `freeform`, and its query contains
      `histogram_fraction(0, 0.2,` and `[$__rate_interval]`.
- [ ] Every API query contains `span_name!~"(GET|HEAD) (/api)?/health(/.*)?"` (the health exclusion) and
      `span_kind="SPAN_KIND_SERVER"`.
- [ ] `validateConfig` rejects each of these:
  - a query containing `_bucket`
  - a freeform range that is not `[$__rate_interval]` (for example `[5m]`)
  - a duplicate uuid
  - a missing required field (`uuid`, `name`, `description`, `query` or `objectives`)
  - a uuid that is not a path-safe segment
- [ ] AC-002 caveats appear in the descriptions:
  - availability mentions tRPC failures returned as 200 or 4xx, and requests slower than 30 s
  - LLM mentions the low call volume
- [ ] AC-004:
  - availability has `alerting.fastBurn` and `alerting.slowBurn`
  - latency and LLM have no `alerting` key
  - each of those two descriptions names its **own, different** gh issue, matched by `/#\d+/`. The latency
    SLO names issue 5 and the LLM SLO names issue 2 (Step 11). The two numbers must differ.
- [ ] A missing `GRAFANA_URL` or `GRAFANA_SA_TOKEN` makes `run()` reject with a message naming both, and no
      fetch is made.
- [ ] `--dry-run` sends GETs only (every recorded method is `GET`).
- [ ] A GET returning 404 is followed by a POST to `/api/plugins/grafana-slo-app/resources/v1/slo` carrying the
      body's `uuid`. A GET returning 200 is followed by a PUT to
      `/api/plugins/grafana-slo-app/resources/v1/slo/<uuid>`.
- [ ] A 400 on POST with a token-shaped body produces a redacted thrown message.
- [ ] No `log` call contains the env token.
- [ ] A GET that answers 503 and then 200 works with the injected `sleep`.

**Validation:**
- [ ] `pnpm exec vitest run --project root tools/scripts/__tests__/apply-grafana-slos.test.ts` fails
      (module missing).

#### Step 5: New dashboard tests (AC-005, AC-001, NF-001)
**Type:** test
**Files to Create:**
- `tools/scripts/__tests__/apply-grafana-dashboard.test.ts`

- [ ] The committed `dashboard-production.json` passes `validateConfig`.
  - Its uid is `env008-production` and its folder is `intelliflow-prod`.
  - It has exactly 5 panels.
- [ ] Metric rule: every panel target `expr` references only `traces_spanmetrics_calls_total` or
      `traces_spanmetrics_latency`, and never `_bucket`.
- [ ] Service rule: the matcher values are extracted with `/service(=~|=)"([^"]+)"/g`.
  - For `=`, the value must be `api` or `ai-worker`.
  - For `=~`, the value is split on `|`, and every alternative must be `api` or `ai-worker`.
  - Any other operator on `service` (`!=` or `!~`) is rejected.
- [ ] `validateConfig` rejects each of these: a foreign metric, a foreign service (both `=` and an
      alternative inside `=~`), and a wrong uid.
- [ ] Missing env is refused, with no fetch.
- [ ] `--dry-run` sends GETs only: the folder check and `GET /api/dashboards/uid/env008-production`.
- [ ] Apply sends `POST /api/dashboards/db` with
      `{ dashboard: {uid:'env008-production', …}, folderUid: 'intelliflow-prod', overwrite: true }`.
- [ ] A GET that answers 503 and then 200 works with the injected `sleep` (AC-001 for this script).
- [ ] A 412 or 400 response is surfaced as a redacted error.
- [ ] No `log` call contains the token.

**Validation:**
- [ ] `pnpm exec vitest run --project root tools/scripts/__tests__/apply-grafana-dashboard.test.ts` fails
      (module missing).

#### Step 6: New Railway self-healing tests (AC-007, NF-001)
**Type:** test
**Files to Create:**
- `tools/scripts/__tests__/apply-railway-self-healing.test.ts`

The tests run against a fake GraphQL `fetchImpl` that dispatches on the operation: project,
serviceInstance, variables or serviceInstanceUpdate. It follows the D2 introspection shape.
- [ ] Read-only by default: without `--apply` there are zero `serviceInstanceUpdate` calls, and the
      table still prints every `service | field | before | after` row.
- [ ] `--apply` with every field different sends one mutation per service, and its `input` holds exactly
      the differing `DESIRED` keys. A second run against the updated fake state sends zero mutations
      (idempotent).
- [ ] `--apply` with one field already equal leaves that key out of `input`.
- [ ] ai-worker health-check guard, three cases:
  - `PORT=5000` with `HEALTH_PORT` unset: the path is set.
  - `PORT=HEALTH_PORT=8080`: the path is set.
  - `PORT=8080, HEALTH_PORT=5000`: the path is skipped and the log says
    `healthcheck skipped: ai-worker serves health on HEALTH_PORT != PORT`.
- [ ] `variables` unreadable (a GraphQL `Not Authorized` error, or `null`):
  - the log says `healthcheck skipped: variables unreadable`
  - the restart policy is still set
  - `healthcheckPath` is never sent for ai-worker, so no PORT is guessed
- [ ] A variables payload with a runtime-built token-shaped value (for example `DATABASE_URL` built from
      parts) never appears in any `log` or `writeSummary` call.
- [ ] On a GraphQL error the log contains `extensions.code` and the message only if it is allow-listed;
      otherwise it says `<redacted>`. The raw message never appears.
- [ ] If service `api` or `ai-worker` is missing from the project, `run()` rejects before any mutation.
- [ ] A read-back after the mutation that differs from `DESIRED` makes `run()` reject (fail closed).
- [ ] A missing `RAILWAY_API_TOKEN` or `RAILWAY_PROJECT_ID` makes `run()` reject with no fetch.
- [ ] The summary text contains no project, environment or service ID (the fake IDs are built at runtime
      and asserted absent). It does contain `effective from the next deployment`.
- [ ] No request is a deploy or redeploy mutation: every operation name is in
      `{project, serviceInstance, variables, serviceInstanceUpdate}`.
- [ ] Every request carries `User-Agent: ifc-env008/1.0` and `Authorization: Bearer <token>`.
- [ ] The environment is selected by the name `production`. If it is missing, `run()` rejects.

**Validation:**
- [ ] `pnpm exec vitest run --project root tools/scripts/__tests__/apply-railway-self-healing.test.ts`
      fails (module missing).

#### Step 7: New workflow contract tests (AC-006, AC-008)
**Type:** test
**Files to Create:**
- `tools/scripts/__tests__/env008-workflows.test.ts`

Both workflows are parsed with `js-yaml` `load`. The file has two top-level `describe` blocks,
`describe('grafana-alert-rules.yml', …)` and `describe('railway-self-healing.yml', …)`, so Step 14 can run
the Grafana half alone with `-t`. The shared `pull_request*` and `schedule` checks run inside each block.
- [ ] `grafana-alert-rules.yml`:
  - Jobs `alert-rules`, `slos` and `dashboard` exist, and none has `needs`.
  - Each has `environment: Production` and `timeout-minutes: 12`.
  - Each has its own `actions/checkout@v7` with sparse paths `infra/monitoring/grafana/cloud`,
    `tools/scripts/observability` and `tools/scripts/lib`.
  - Each has its own `actions/setup-node@v7`.
- [ ] Workflow-level `permissions` is `{contents: read}`, and `concurrency.cancel-in-progress` is
      `false`.
- [ ] `on.push.paths` includes:
  - `tools/scripts/lib/grafana-provisioning.mjs`
  - `slos.json`
  - `dashboard-production.json`
  - `apply-grafana-slos.mjs`
  - `apply-grafana-dashboard.mjs`
  - the alert-rules files
  - the workflow itself
- [ ] `dry_run` reaches all three jobs (`--dry-run` appears in each `run`).
- [ ] `railway-self-healing.yml`:
  - `on.push.branches` is `['main']`.
  - `on.push.paths` is **exactly** `['tools/scripts/observability/apply-railway-self-healing.mjs',
    '.github/workflows/railway-self-healing.yml']`. The script imports nothing from `tools/scripts/lib`.
  - The sparse checkout is exactly `tools/scripts/observability`.
  - The push run uses `--apply`.
  - `workflow_dispatch.inputs.apply` is a boolean with default `false`.
  - `environment: Production`, `permissions: {contents: read}`, and cancel-in-progress is false.
  - `RAILWAY_API_TOKEN: ${{ secrets.RAILWAY_TOKEN }}` appears only under a step `env`, never inline in
    `run`.
  - `RAILWAY_PROJECT_ID` comes from `vars.RAILWAY_PROJECT_ID`.
  - Actions are pinned at `@v7`.
- [ ] Neither workflow has a `pull_request` or `pull_request_target` trigger.
- [ ] Neither workflow has a `schedule` trigger (Actions budget is $0).

**Validation:**
- [ ] `pnpm exec vitest run --project root tools/scripts/__tests__/env008-workflows.test.ts` fails,
      because the new jobs and workflow are missing.

#### Step 8: New descriptive-content tests (AC-009)
**Type:** test
**Files to Create:**
- `tools/scripts/__tests__/env008-monitoring-content.test.ts`

- [ ] `infra/monitoring/self-healing-rules.yaml` parses with js-yaml, and:
  - its `mode` is `descriptive`
  - its per-service settings deep-equal `DESIRED`, imported from `apply-railway-self-healing.mjs`
  - it names the workflow `railway-self-healing.yml`
  - it states crash-only restart and the deploy-gate health check
- [ ] `infra/monitoring/anomaly-detection.json` parses, and:
  - its `mode` is `descriptive`
  - its services equal `['api', 'ai-worker']`
  - it lists the Asserts rules `RequestRateAnomaly`, `ErrorRatioAnomaly` and `LatencyP95Anomaly`
  - its `slos` uuids equal the uuids in `slos.json`
- [ ] `infra/monitoring/otel-config.yaml` stays a valid collector config and carries the production note
      in comments:
  - It still parses with js-yaml.
  - Its top-level keys are exactly `receivers, processors, exporters, extensions, service`.
  - Its **raw text** (comments) contains `Production topology`, `local-stack reference`,
    `Grafana Cloud OTLP gateway`, `no collector`, `api` and `ai-worker`.
- [ ] Every repo path that any of the three files references exists on disk, and
      `infra/monitoring/otel-collector.yaml` still exists.
- [ ] None of the three files contains any of these (patterns built at runtime): an email address, a URL
      with a webhook path, a UUID-shaped Railway ID, `Bearer `, `glsa_`, or a long base64 run.

**Validation:**
- [ ] `pnpm exec vitest run --project root tools/scripts/__tests__/env008-monitoring-content.test.ts` fails.

> **Checkpoint (RED):** all 8 files compile and fail only on the new cases; the existing cases stay
> green. Command:
> `node C:/Users/talys/ops/test-slots/with-slot.mjs --label ENV-008-AI -- pnpm exec vitest run --project root tools/scripts/lib/grafana-provisioning.test.ts tools/scripts/__tests__/apply-grafana-alert-rules.test.ts tools/scripts/__tests__/apply-synthetic-monitoring.test.ts tools/scripts/__tests__/apply-grafana-slos.test.ts tools/scripts/__tests__/apply-grafana-dashboard.test.ts tools/scripts/__tests__/apply-railway-self-healing.test.ts tools/scripts/__tests__/env008-workflows.test.ts tools/scripts/__tests__/env008-monitoring-content.test.ts`

### Phase 2: GREEN — make the tests pass

#### Step 9: Retry, `sleep` and `redactBody` in the shared client (AC-001)
**Type:** implementation
**Files to Modify:**
- `tools/scripts/lib/grafana-provisioning.mjs`

- [ ] Export `RETRY_DELAYS_MS = [5000, 10000, 20000, 40000, 60000, 60000, 60000]`.
- [ ] Change the signature to `createApiClient(baseUrl, token, fetchImpl = fetch, { sleep = defaultSleep } = {})`.
  - Retry only when `res.status === 503`, for up to `RETRY_DELAYS_MS.length + 1` attempts, then return the
    last response.
  - Existing three-argument callers are unchanged.
- [ ] Export `redactBody(text)`: Bearer tokens, `glsa_` tokens and long-token runs become `<redacted>`, and the
      result is capped at 200 characters.
- [ ] Update the header comment to name the four callers.
- [ ] The lib has no `.d.mts` (the test imports the `.mjs` directly), so no type file is added.

**Validation:**
- [ ] `pnpm exec vitest run --project root tools/scripts/lib/grafana-provisioning.test.ts` passes.

#### Step 10: Thread `sleep` and redact in the two existing scripts (AC-001)
**Type:** implementation
**Files to Modify:**
- `tools/scripts/observability/apply-grafana-alert-rules.mjs`
- `tools/scripts/observability/apply-grafana-alert-rules.d.mts`
- `tools/scripts/observability/apply-synthetic-monitoring.mjs`
- `tools/scripts/observability/apply-synthetic-monitoring.d.mts`

- [ ] `run({ …, sleep })` passes `{ sleep }` to every `createApiClient` call (alert-rules L106; synthetic
      L143-144).
- [ ] Wrap each `${x.text}` in a thrown message with `redactBody(...)`: alert-rules L127, L141 and L155;
      synthetic L182, L193 and L209.
- [ ] Add `sleep?: (ms: number) => Promise<void>` to the `run` option type in both `.d.mts` files.

**Validation:**
- [ ] `pnpm exec vitest run --project root tools/scripts/__tests__/apply-grafana-alert-rules.test.ts tools/scripts/__tests__/apply-synthetic-monitoring.test.ts` passes.
- [ ] `grep -nE '\$\{[a-zA-Z]+\.text\}' tools/scripts/observability/*.mjs` prints nothing.

#### Step 11: File the out-of-scope issues before the SLO config needs their numbers (AC-011, AC-004)
**Type:** issue tracking + docs (outward-facing: GitHub issues only, no production change)
**Files to Create:**
- `.specify/sprints/sprint-18/findings/ENV-008-AI-findings.md`

**Files to Modify:**
- `artifacts/metrics/debt-ledger.yaml`

- [ ] Check for duplicates first: run `gh issue list --state all --search "<keywords>" --limit 20` for each
      item below. If a matching open issue exists, reuse it and record that.
- [ ] File **5** issues with `gh issue create --title … --body-file <scratchpad file>` (no AI attribution).
      Issue 5 extends the spec's AC-011 list of 4: AC-004 needs a separate issue for the latency SLO, and
      the findings doc records this extension.
  1. **Dead IFC-032 workflow alert rules.**
     - Evidence: `LeadRoutingService.ts:167-171` (`workflow.lead.route` is never emitted in production;
       only `capture-trace-examples.ts:201` sets the tracer); the p95 rule queries the absent
       `traces_spanmetrics_latency_bucket` (`alert-rules.json:49-50`).
     - Fix: wire `setWorkflowTracer` in the production container and query the native histogram.
  2. **ai-worker `llm.invoke` fails 100% in production** (F4; also 140 pg INSERT errors, related to #805).
     - Acceptance item: "enable `alerting` on SLO `env008-ai-worker-llm-success`".
  3. **Public `/health/detailed`, `/health/db` and `dbStats`** (`http-server.ts:346-367`, `health.router.ts:87`).
  4. **Account-wide, repository-level `RAILWAY_TOKEN` with no environment, and a CLI pinned only to its
     major version** (`@railway/cli@4`, `promote-production.yml:69-80,194`).
     - Fix: an environment-scoped project token and an exact CLI version.
  5. **api server-side p95 is 2.72 s against the 200 ms objective** (F2; `slo-definitions.md:56`).
     - Acceptance item: "enable `alerting` on SLO `env008-api-latency`".
- [ ] Findings doc: one section per issue (number, evidence, fix, owner lane). Also record:
  - the spec-citation correction for `artifact-registry.ts` (W8)
  - the stale script path in the `alert-rules.json` `_comment` (`tools/scripts/grafana/apply-alert-rules.mjs`;
    INFO, not fixed)
  - that web, ws, events-worker and ingestion-worker stay under EP-001-AI
- [ ] Ledger, one item per issue. Keys are `ENV008-DEAD-WORKFLOW-RULES-001`, `ENV008-LLM-INVOKE-ERRORS-001`,
      `ENV008-PUBLIC-HEALTH-DETAIL-001`, `ENV008-RAILWAY-TOKEN-SCOPE-001` and `ENV008-API-P95-LATENCY-001`.
      Each item carries the field set existing items use:
  - `origin_task: ENV-008-AI`
  - `owner` (DevOps Lead, AI Specialist, Security Lead, DevOps Lead and Backend Lead respectively)
  - `severity` (medium, high, medium, medium and medium)
  - `description`
  - `created_at: 2026-10-24`
  - `expiry_date: 2027-01-24` (mandatory: `tools/plan/src/domain/debt.py`, `tools/audit/sprint0_audit.py:406`)
  - `status: open`
  - `remediation_sprint: 19`
  - `remediation_plan`
  - `notes`, which holds the issue URL (`https://github.com/<repo>/issues/<n>`)
- [ ] Resolve `debt_002` (`artifacts/metrics/debt-ledger.yaml:5471`, ENV-008-AI, "predictive monitoring and
      self-healing deferred"):
  - set `status: resolved`
  - add `resolved_at: 2026-10-24T00:00:00.000Z`
  - add `resolution:`, naming this task, the SLO burn alerts, the Railway restart policy and ADR-087, and
    stating that the production proof follows merge (NEEDS_HUMAN in the attestation)
- [ ] Bump `last_updated` to the edit date.

**Validation:**
- [ ] `node -e "require('js-yaml').load(require('fs').readFileSync('artifacts/metrics/debt-ledger.yaml','utf8'))"` exits 0.
- [ ] `gh issue view <n> --json number,state` returns OPEN for all 5 issues.

#### Step 12: SLO config and apply script (AC-002, AC-003, AC-004)
**Type:** implementation
**Files to Create:**
- `infra/monitoring/grafana/cloud/slos.json`
- `tools/scripts/observability/apply-grafana-slos.mjs`
- `tools/scripts/observability/apply-grafana-slos.d.mts`

- [ ] `slos.json` follows spec §Interfaces exactly:
  - `folderUid: intelliflow-prod`
  - `destinationDatasourceUid: grafanacloud-prom`
  - 3 SLOs, with labels `source=env-008-ai` and `team=owner`
  - The latency description names issue 5 and the LLM description names issue 2 (from Step 11).
- [ ] `apply-grafana-slos.mjs`:
  - exports `validateConfig(config): string[]` and `run({ env, argv, fetchImpl, log, sleep })`
  - reads the config path relative to the module, using the same `fileURLToPath` pattern as alert-rules
  - sends GET `/v1/slo/<uuid>`, then POST or PUT
  - adds `folder: {uid}` and `destinationDatasource: {uid}` to each payload
  - applies `redactBody` to errors
  - ends with the same CLI guard pattern as `apply-grafana-alert-rules.mjs:170-175`, logging
    `[grafana-slos] <message>` and exiting 1
- [ ] The `.d.mts` declares the config types, `validateConfig` and `run`.

**Validation:**
- [ ] `pnpm exec vitest run --project root tools/scripts/__tests__/apply-grafana-slos.test.ts` passes in full.
- [ ] Optional, read-only evidence (GETs only). Only the two Grafana values are exported, so no other
      `.env.local` value (in particular not the production `DATABASE_URL`) enters the process. The token is
      never echoed:
  ```
  mkdir -p .specify/sprints/sprint-18/execution/ENV-008-AI
  ENVF=C:/Users/talys/projects/intelliFlow-CRM/.env.local
  GRAFANA_URL=https://graysushi1880.grafana.net \
  GRAFANA_SA_TOKEN="$(grep -E '^GRAFANA_SA_TOKEN=' "$ENVF" | cut -d= -f2- | tr -d '"\r')" \
  node tools/scripts/observability/apply-grafana-slos.mjs --dry-run \
    > .specify/sprints/sprint-18/execution/ENV-008-AI/slos-dry-run.txt
  ```
  - Expected: 3 lines saying `missing (would create)`.
  - Then `grep -c glsa_ .specify/sprints/sprint-18/execution/ENV-008-AI/slos-dry-run.txt` returns 0.

#### Step 13: Dashboard config and apply script (AC-005)
**Type:** implementation
**Files to Create:**
- `infra/monitoring/grafana/cloud/dashboard-production.json`
- `tools/scripts/observability/apply-grafana-dashboard.mjs`
- `tools/scripts/observability/apply-grafana-dashboard.d.mts`

- [ ] 5 panels:
  1. request rate by service:
     `sum by (service)(rate(traces_spanmetrics_calls_total{service=~"api|ai-worker", span_kind="SPAN_KIND_SERVER"}[$__rate_interval]))`
  2. error ratio by service
  3. api p95 latency:
     `histogram_quantile(0.95, sum(rate(traces_spanmetrics_latency{service="api",…}[$__rate_interval])))`
     (native histogram)
  4. ai-worker `llm.invoke` calls by status
  5. api availability against the 99.9% objective (stat panel)
- [ ] Datasource uid `grafanacloud-prom`. Panels set no `id` (Grafana assigns them).
- [ ] The script:
  - GETs the folder but does not create it (`intelliflow-prod` exists, and the alert-rules job owns it)
  - then sends `POST /api/dashboards/db` with `overwrite: true`, `folderUid` and the message
    `ENV-008-AI dashboard as code`
  - under `--dry-run`, sends GETs only
  - uses the same CLI guard pattern as Step 12
  - takes `sleep` and passes it to `createApiClient`

**Validation:**
- [ ] `pnpm exec vitest run --project root tools/scripts/__tests__/apply-grafana-dashboard.test.ts` passes.
- [ ] Optional, read-only `--dry-run` against production, using the mechanism from Step 12. Output goes to
      `.specify/sprints/sprint-18/execution/ENV-008-AI/dashboard-dry-run.txt`, then the `grep -c glsa_` check.

#### Step 14: Grafana workflow with three independent jobs (AC-006)
**Type:** implementation
**Files to Modify:**
- `.github/workflows/grafana-alert-rules.yml`

- [ ] Rename job `apply` to `alert-rules`, and add jobs `slos` and `dashboard`. Each job has:
  - its own checkout, with the same three sparse paths
  - its own setup-node (node `24`, as today)
  - `environment: Production`
  - `timeout-minutes: 12`
- [ ] Extend `on.push.paths` with the lib file, the two JSON files and the two scripts.
- [ ] `send_test` stays on the `alert-rules` job only. `dry_run` maps to `--dry-run` in all three jobs.
- [ ] Update the header comment: it should cover the three resources, the retry, and the fact that each
      job is independent.

**Validation:**
- [ ] `pnpm exec vitest run --project root tools/scripts/__tests__/env008-workflows.test.ts -t "grafana-alert-rules.yml"` passes. The Railway block stays red until Step 15 and is judged there.
- [ ] `pnpm exec vitest run --project root tools/scripts/__tests__/apply-synthetic-monitoring.test.ts` passes (the synthetic sparse-path `it.each` still holds).
- [ ] `node tools/scripts/security/workflow-secret-lint.mjs` exits 0.

#### Step 15: Railway self-healing script and workflow (AC-007, AC-008)
**Type:** implementation
**Files to Create:**
- `tools/scripts/observability/apply-railway-self-healing.mjs`
- `tools/scripts/observability/apply-railway-self-healing.d.mts`
- `.github/workflows/railway-self-healing.yml`

Script, following spec §Interfaces exactly. It is self-contained and imports nothing from
`tools/scripts/lib`:
- [ ] Exports `DESIRED`, `diffFields`, `aiWorkerHealthcheck` and `run({ env, argv, fetchImpl, log, writeSummary })`.
- [ ] Sends GraphQL to `https://backboard.railway.com/graphql/v2` with headers
      `User-Agent: ifc-env008/1.0` and `Authorization: Bearer <token>`.
- [ ] Refuses to run without `RAILWAY_API_TOKEN` or `RAILWAY_PROJECT_ID`, before any fetch.
- [ ] Selects the environment named `production` from `project.environments`. If it is missing, rejects.
- [ ] Looks up services `api` and `ai-worker` by name. If either is missing, rejects before any mutation.
- [ ] From `variables` it reads only `PORT` and `HEALTH_PORT`, and drops the object immediately.
- [ ] Applies the ai-worker health-check guard, including `healthcheck skipped: variables unreadable`.
- [ ] Without `--apply` it sends no mutation. With `--apply` it sends one `serviceInstanceUpdate` per
      service, whose `input` holds only the differing `DESIRED` keys.
- [ ] Reads back after each mutation and rejects on any difference from `DESIRED` (fail closed).
- [ ] Never sends a deploy or redeploy mutation. The log and summary say
      `effective from the next deployment`.
- [ ] The error logger prints `extensions.code` and only the allow-listed messages `Not Authorized` and
      `Problem processing request`; everything else is `<redacted>`.
- [ ] The default `writeSummary` appends to `process.env.GITHUB_STEP_SUMMARY` when that is set. The summary
      holds the `service | field | before | after` table and the skip lines, with no IDs.
- [ ] CLI guard: the same pattern as Step 12.

Workflow:
- [ ] Triggers:
  - `push: branches [main], paths [tools/scripts/observability/apply-railway-self-healing.mjs, .github/workflows/railway-self-healing.yml]`
    runs `--apply`
  - dispatch input `apply` (boolean, default false) adds `--apply` only when true
- [ ] `environment: Production`, `permissions: contents: read`, concurrency `railway-self-healing` with
      cancel-in-progress false, `timeout-minutes: 5`.
- [ ] Sparse checkout of exactly `tools/scripts/observability`, and setup-node `24`.
- [ ] Step `env`: `RAILWAY_API_TOKEN: ${{ secrets.RAILWAY_TOKEN }}` and
      `RAILWAY_PROJECT_ID: ${{ vars.RAILWAY_PROJECT_ID }}`. The repository variable exists (checked
      2026-10-24 with `gh variable list`).
- [ ] The header comment says:
  - CI owns these settings, so changing `DESIRED` changes production on merge.
  - The settings persist if the workflow is deleted.
  - The manual dispatch is the drift check.

**Validation:**
- [ ] `pnpm exec vitest run --project root tools/scripts/__tests__/apply-railway-self-healing.test.ts tools/scripts/__tests__/env008-workflows.test.ts` passes.
- [ ] `node tools/scripts/security/workflow-secret-lint.mjs` exits 0.

#### Step 16: Rewrite the three descriptive infra files in place (AC-009)
**Type:** implementation
**Files to Modify:**
- `infra/monitoring/self-healing-rules.yaml`
- `infra/monitoring/anomaly-detection.json`
- `infra/monitoring/otel-config.yaml`

- [ ] `self-healing-rules.yaml`:
  - `mode: descriptive`
  - `applied_by: .github/workflows/railway-self-healing.yml`
  - `source_of_truth: tools/scripts/observability/apply-railway-self-healing.mjs (DESIRED)`
  - a copy of the per-service values
  - `limits`: restart is crash-only, and the health check is a deploy gate, not a liveness probe
  - The Sprint-0 `operator_action` playbooks are removed.
- [ ] `anomaly-detection.json`:
  - `mode: descriptive`
  - `engine: grafana-asserts (plugin-managed)`
  - the rule names and source series (`traces_spanmetrics_*`)
  - services `["api","ai-worker"]`
  - an `slos` uuid list
  - the predictive-alerting mapping: the SLO burn rate on availability plus the IFC-032 rules
  - The placeholder `http_request_duration_seconds` and `ai_cost_usd` entries are removed.
- [ ] `otel-config.yaml`:
  - **Comments only. No new keys** (`packages/observability/README.md:138` mounts it as a real collector config).
  - Replace the two-line header with a comment block that contains:
    - `Production topology`
    - "this file is the local-stack reference"
    - "production uses no collector: the api and ai-worker SDKs export OTLP to the Grafana Cloud OTLP gateway"
    - the ai-worker `llm.*` span attributes (`apps/ai-worker/src/tracing/llm-tracer.ts:77-87`)
    - a pointer to ADR-087
  - The keys `receivers`, `processors`, `exporters`, `extensions` and `service` stay unchanged.
- [ ] The current references to `otel-config.yaml` are all docs or the local docker recipe. Check the list is
      unchanged before editing, with
      `grep -rn "otel-config.yaml" --include=*.yml --include=*.yaml --include=*.ts --include=*.mjs --include=*.json --include=*.md . | grep -v node_modules`:
  - `packages/observability/README.md:138` (docker run)
  - `infra/monitoring/README.md:124`
  - `apps/project-tracker/docs/metrics/plan-overrides.yaml:1670`
  - the ISO 27001 and ISO 42001 checklists
  - `docs/planning/sprint-18-otel-instrumentation.md`
  - `anomaly-detection.json:7` (rewritten here)
  - ADR-087

  No runtime code loads it.

**Validation:**
- [ ] `pnpm exec vitest run --project root tools/scripts/__tests__/env008-monitoring-content.test.ts` passes.
- [ ] `pnpm exec vitest run --project root tools/scripts/observability/__tests__/` passes
      (`sync-collector-artifact` and `lint-alerts` are unaffected).

#### Step 17: Production-topology docs (AC-010)
**Type:** docs
**Files to Modify:**
- `docs/architecture/observability/implementation-guide.md`
- `docs/architecture/observability/correlation-patterns.md`
- `docs/architecture/observability/instrumentation-checklist.md`

- [ ] Each doc gets a `## Production topology` section. The existing local-stack text is kept. The section
      covers:
  - SDK → `otlp-gateway-prod-gb-south-1.grafana.net` (Grafana Cloud stack), with no collector in production
  - the emitters, api and ai-worker
  - Loki receives ai-worker logs only (api logs belong to IFC-074)
  - links to ADR-087 and the `infra/monitoring/grafana/cloud/` files

**Validation:**
- [ ] `grep -c "^## Production topology" docs/architecture/observability/{implementation-guide,correlation-patterns,instrumentation-checklist}.md` prints 1 for each file.
- [ ] `grep -l "ADR-087" docs/architecture/observability/{implementation-guide,correlation-patterns,instrumentation-checklist}.md` lists all 3.
- [ ] `pnpm exec prettier --check docs/architecture/observability/*.md` passes.

#### Step 18: ADR-087 links (AC-010)
**Type:** docs
**Files to Modify:**
- `docs/architecture/adr/ADR-087-production-slos-anomaly-detection-and-self-healing.md`

- [ ] The ADR is already `Accepted` (spec consensus), and its README row exists (`README.md:271`).
  - Add the 5 issue numbers from Step 11 under Links.
  - Correct any file names that differ from the ADR text.
  - No status change.

**Validation:**
- [ ] `grep -n "^\*\*Status:\*\* Accepted" docs/architecture/adr/ADR-087-*.md` matches.
- [ ] `grep -c "ADR-087" docs/architecture/adr/README.md` prints 1.

> **Checkpoint (GREEN):** all 8 test files and the regression suites pass under the slot (Validation Matrix
> rows "Task tests" and "Regression").

### Phase 3: REFACTOR

#### Step 19: Clean up, dependency chains and CSV evidence path
**Type:** refactor + tracking
**Files to Modify:**
- `docs/architecture/diagrams/complete-dependency-chains.md`
- `docs/architecture/diagrams/integrations-dependency-chain.md`
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- `apps/project-tracker/docs/metrics/_global/Sprint_plan_A.csv` (regenerated, never edited by hand)

- [ ] Remove duplication between the SLO and dashboard scripts (folder GET, env check).
  - Extract to `grafana-provisioning.mjs` only if the same code appears in more than two places.
  - Otherwise leave it inline, as the existing two scripts do.
- [ ] No `istanbul ignore`.
- [ ] CLI guards keep the existing multi-line pattern, which prettier formats to 6 lines.
  - The spec's NF-003 "one line" wording cannot survive prettier. It is recorded as a spec deviation in the
    exec report.
  - Coverage budget: the 3 new guards add about 12 uncovered lines (only the guard body is uncovered). The
    changed `.mjs` lines are estimated at about 600, which keeps aggregate diff coverage well above 80%.
- [ ] Dependency chains, in both files:
  - `complete-dependency-chains.md`: L1793, L1829, L2161
  - `integrations-dependency-chain.md`: L98, L109, L148; L170 says "Already complete"
  - Keep `ENV-008-AI ✅` only if the attestation verdict is COMPLETE. Otherwise mark it ⏳ with the note
    "production evidence after merge", and reword L170 to match.
- [ ] CSV EVIDENCE path (Category A, AC-012):
  - Change it from `.specify/sprints/sprint-0/attestations/ENV-008-AI/attestation.json` to `sprint-18`.
  - Edit only the canonical CSV, then run `npx tsx tools/scripts/split-sprint-plan.ts`.
  - `git status` must then show only `Sprint_plan.csv` and `Sprint_plan_A.csv`.
  - Diff the split files against `origin/main` (memory: a merge can drop split-CSV rows).
- [ ] Run `pnpm exec eslint` and `pnpm exec prettier --check` on every touched `.mjs`, `.ts`, `.json`,
      `.yml` and `.md` file.

**Validation:**
- [ ] The Validation Matrix "Lint/format" row passes.

### Phase 4: VALIDATION

#### Step 20: Validation matrix, coverage, gates and attestation
**Type:** validation
**Files to Create:**
- `.specify/sprints/sprint-18/attestations/ENV-008-AI/attestation.json` (via `/exec-attestation`)

- [ ] Run every row of the Validation Matrix below, each under the slot where marked.
  - Save the logs under `.specify/sprints/sprint-18/execution/ENV-008-AI/`.
  - Use `.txt`, never `*.log`.
- [ ] Diff coverage on the changed `.mjs` lines is at least 80% (NF-003).
- [ ] NF-002: `git diff origin/main -- package.json pnpm-lock.yaml` prints nothing. Record the output.
- [ ] `npx tsx tools/scripts/validate-artifacts.ts ENV-008-AI` passes, after the EVIDENCE-path change.
- [ ] Walk every item from AC-001 to AC-012 and NF-001 to NF-003 against the evidence, and record each one
      in the exec report. Carry two recorded spec deviations into the exec report and the attestation
      notes (AC-012):
  - NF-003 CLI guards: multi-line, with the coverage budget from Step 19.
  - AC-011: 5 issues instead of 4.
- [ ] Attestation (AC-012) at `.specify/sprints/sprint-18/attestations/ENV-008-AI/attestation.json`:
  - Production items that exist only after merge are `NEEDS_HUMAN`. They are: SLOs present, dashboard
    present, the Railway read-back, and the Grafana workflow green again. Each names the workflow run to
    check:
    - `grafana-alert-rules.yml` (3 jobs)
    - `railway-self-healing.yml` (the push run, then a dispatch read)
  - The "100% services" KPI is `met:false`, with the scope wording from the spec overview.
  - No `ceremony_tier: light` (owner ruling via Aurora, 2026-10-23).

## Validation Matrix

| Scope | Purpose | Command |
|---|---|---|
| Task tests | the 8 new and extended files | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label ENV-008-AI -- pnpm exec vitest run --project root tools/scripts/lib/grafana-provisioning.test.ts tools/scripts/__tests__/apply-grafana-alert-rules.test.ts tools/scripts/__tests__/apply-synthetic-monitoring.test.ts tools/scripts/__tests__/apply-grafana-slos.test.ts tools/scripts/__tests__/apply-grafana-dashboard.test.ts tools/scripts/__tests__/apply-railway-self-healing.test.ts tools/scripts/__tests__/env008-workflows.test.ts tools/scripts/__tests__/env008-monitoring-content.test.ts` |
| Regression | the suites that the touched code feeds | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label ENV-008-AI -- pnpm exec vitest run --project root tools/scripts/security/__tests__/workflow-secret-lint.test.ts tools/scripts/observability/__tests__/` |
| Root project, full | everything under `tools/**` and the root include | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label ENV-008-AI -- pnpm exec vitest run --project root` |
| Workflow secret lint | NF-001, AC-008 | `node tools/scripts/security/workflow-secret-lint.mjs` |
| Diff coverage | NF-003: at least 80% of changed `.mjs` lines covered. `.d.mts` and `__tests__` are Sonar-excluded | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label ENV-008-AI -- pnpm exec vitest run --project root --coverage.enabled --coverage.reportsDirectory=artifacts/coverage-env008 --coverage.reporter=lcov --coverage.include=tools/scripts/lib/grafana-provisioning.mjs --coverage.include=tools/scripts/observability/*.mjs <the 8 task test files>`, then `DIFF_COVER_LCOV=artifacts/coverage-env008/lcov.info node scripts/check-diff-coverage.mjs` |
| Lint/format | the touched files | `pnpm exec eslint tools/scripts/lib/grafana-provisioning.mjs tools/scripts/observability/apply-*.mjs tools/scripts/__tests__/apply-grafana-*.test.ts tools/scripts/__tests__/apply-railway-self-healing.test.ts tools/scripts/__tests__/env008-*.test.ts tools/scripts/lib/grafana-provisioning.test.ts`, and `pnpm exec prettier --check` on the same files plus `infra/monitoring/grafana/cloud/*.json infra/monitoring/*.yaml infra/monitoring/anomaly-detection.json .github/workflows/grafana-alert-rules.yml .github/workflows/railway-self-healing.yml docs/architecture/observability/*.md docs/architecture/adr/ADR-087-*.md .specify/sprints/sprint-18/findings/ENV-008-AI-findings.md artifacts/metrics/debt-ledger.yaml` |
| Typecheck (test files) | the 8 test files and the `.d.mts` they import compile. Vitest does not type-check | `pnpm exec tsc --noEmit --skipLibCheck --strict --module nodenext --moduleResolution nodenext --target es2022 --types node,vitest/globals <the 8 task test files>`. First run it on the base tree's 3 existing test files to record baseline noise; the pass criterion is no new error in the 8 files |
| Typecheck (repo) | the mandatory 4-validation rule | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label ENV-008-AI -- pnpm run typecheck` (turbo plus the Sonar guard) |
| Build | the mandatory 4th validation. No package source changed; this proves nothing regressed | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label ENV-008-AI -- pnpm run build` |
| Artifacts | the CSV artifact contract | `npx tsx tools/scripts/validate-artifacts.ts ENV-008-AI` |
| No new dependency | NF-002 | `git diff origin/main -- package.json pnpm-lock.yaml` prints nothing |
| Secret scan | before every commit | the commit hook's staged gitleaks scan, plus `git diff --cached \| grep -nE 'glsa_\|Bearer [A-Za-z0-9]\|@[a-z]+\.(com\|dev)'` printing nothing |
| Semantic review | codex gate | `node scripts/codex-review.mjs` |
| Pre-ship | the full local CI mirror, once, at ship | runs through the exclusive slot from the `git push` hook; never bypassed |
| Production, read-only (optional, before merge) | dry runs | Steps 12 and 13 (two exported Grafana variables only; no token in the output) |
| Production, after merge (NEEDS_HUMAN) | AC-012 evidence | `gh run list --workflow grafana-alert-rules.yml --limit 1` is green with 3 jobs; the SLO API lists the 3 uuids; `GET /api/dashboards/uid/env008-production` returns 200; the `railway-self-healing.yml` push-run log shows before → after, and a dispatch read shows no diff |

## Integration Checkpoints Summary

| After Step | Verification | Command |
|---|---|---|
| 8 | RED: the new cases fail and the old cases pass | the Task tests row |
| 10 | the shared client and both existing scripts are green | `pnpm exec vitest run --project root tools/scripts/lib/grafana-provisioning.test.ts tools/scripts/__tests__/apply-grafana-alert-rules.test.ts tools/scripts/__tests__/apply-synthetic-monitoring.test.ts` |
| 11 | 5 issues are open and the ledger parses | `gh issue view <n>` ×5; the js-yaml one-liner |
| 15 | both workflows meet their contracts and the secret lint finds nothing | `pnpm exec vitest run --project root tools/scripts/__tests__/env008-workflows.test.ts` and `node tools/scripts/security/workflow-secret-lint.mjs` |
| 18 | all task tests are green | the Task tests row |
| 19 | lint and format are clean | the Lint/format row |
| 20 | the full matrix passes | every row above |

## CSV Artifact Alignment

`Artifacts To Track` for ENV-008-AI:

| CSV artifact | In plan | Note |
|---|---|---|
| `infra/monitoring/otel-config.yaml` | Step 16 | comments only |
| `infra/monitoring/anomaly-detection.json` | Step 16 | rewritten in place |
| `infra/monitoring/self-healing-rules.yaml` | Step 16 | rewritten in place |
| `docs/architecture/observability/correlation-patterns.md` | Step 17 | section added |
| `docs/architecture/observability/implementation-guide.md` | Step 17 | section added |
| `docs/architecture/observability/instrumentation-checklist.md` | Step 17 | section added |
| `EVIDENCE: .specify/sprints/sprint-0/attestations/ENV-008-AI/attestation.json` | Steps 19, 20 | path corrected to sprint-18 (AC-012, Category A); file created at Step 20 |

The new scripts, configs, workflows and tests are in the plan but not in the CSV (INFO). The attestation's
artifacts list will name them. The CSV keeps its 6 descriptive artifacts and the corrected EVIDENCE path.
`npx tsx tools/scripts/validate-artifacts.ts ENV-008-AI` runs at Step 20.

## Files Summary (37)

**Create (16):**
1. `tools/scripts/__tests__/apply-grafana-slos.test.ts`
2. `tools/scripts/__tests__/apply-grafana-dashboard.test.ts`
3. `tools/scripts/__tests__/apply-railway-self-healing.test.ts`
4. `tools/scripts/__tests__/env008-workflows.test.ts`
5. `tools/scripts/__tests__/env008-monitoring-content.test.ts`
6. `infra/monitoring/grafana/cloud/slos.json`
7. `tools/scripts/observability/apply-grafana-slos.mjs`
8. `tools/scripts/observability/apply-grafana-slos.d.mts`
9. `infra/monitoring/grafana/cloud/dashboard-production.json`
10. `tools/scripts/observability/apply-grafana-dashboard.mjs`
11. `tools/scripts/observability/apply-grafana-dashboard.d.mts`
12. `tools/scripts/observability/apply-railway-self-healing.mjs`
13. `tools/scripts/observability/apply-railway-self-healing.d.mts`
14. `.github/workflows/railway-self-healing.yml`
15. `.specify/sprints/sprint-18/findings/ENV-008-AI-findings.md`
16. `.specify/sprints/sprint-18/attestations/ENV-008-AI/attestation.json`

**Modify (21):**
1. `tools/scripts/lib/grafana-provisioning.mjs`
2. `tools/scripts/lib/grafana-provisioning.test.ts`
3. `tools/scripts/__tests__/apply-grafana-alert-rules.test.ts`
4. `tools/scripts/__tests__/apply-synthetic-monitoring.test.ts`
5. `tools/scripts/observability/apply-grafana-alert-rules.mjs`
6. `tools/scripts/observability/apply-grafana-alert-rules.d.mts`
7. `tools/scripts/observability/apply-synthetic-monitoring.mjs`
8. `tools/scripts/observability/apply-synthetic-monitoring.d.mts`
9. `.github/workflows/grafana-alert-rules.yml`
10. `infra/monitoring/self-healing-rules.yaml`
11. `infra/monitoring/anomaly-detection.json`
12. `infra/monitoring/otel-config.yaml`
13. `docs/architecture/observability/implementation-guide.md`
14. `docs/architecture/observability/correlation-patterns.md`
15. `docs/architecture/observability/instrumentation-checklist.md`
16. `docs/architecture/adr/ADR-087-production-slos-anomaly-detection-and-self-healing.md`
17. `artifacts/metrics/debt-ledger.yaml`
18. `docs/architecture/diagrams/complete-dependency-chains.md`
19. `docs/architecture/diagrams/integrations-dependency-chain.md`
20. `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
21. `apps/project-tracker/docs/metrics/_global/Sprint_plan_A.csv` (regenerated)

Out-of-tree outputs (not repo files): 5 GitHub issues (Step 11). The ADR README already has the ADR-087
row (commit `2f99c6c45`), so it needs no change. The `.specify/.../execution/ENV-008-AI/*.txt` evidence logs
are produced by exec and are not counted here.

## Traceability (AC/NF → steps)

| Item | Test step | Implementation step |
|---|---|---|
| AC-001 | 1, 2, 3, 4, 5 | 9, 10, 12, 13 |
| AC-002 | 4 | 12 |
| AC-003 | 4 | 12 |
| AC-004 | 4 (two distinct issue numbers) | 11, 12 |
| AC-005 | 5 | 13 |
| AC-006 | 7 | 14 |
| AC-007 | 6 | 15 |
| AC-008 | 7 | 15 |
| AC-009 | 8 | 16 |
| AC-010 | 17 and 18 (grep checks for the section, the ADR link and Accepted status; prettier) | 17, 18 |
| AC-011 | 11 (`gh issue view` ×5; ledger parse) | 11 |
| AC-012 | 20 | 19, 20 |
| NF-001 | 1-7 | 9, 10, 12, 13, 15 |
| NF-002 | Preflight 3; Step 20 (`git diff origin/main -- package.json pnpm-lock.yaml` prints nothing) | — |
| NF-003 | 20 (diff coverage) | 19 (guard wording recorded as a spec deviation) |

## Risks carried from the spec

| Risk | Plan mitigation |
|---|---|
| The live SLO API rejects the freeform `histogram_fraction` query | The optional dry run in Step 12 cannot prove a POST. If the API rejects it, the `slos` job fails visibly on merge. The fallback, an explicit good/total pair, is in the discussion log. The attestation records this as NEEDS_HUMAN |
| Railway settings take effect only on the next deployment | The log and summary say so; Step 6 asserts the wording |
| A push to main changes production | Intended (owner ruling 2). Merging needs the owner, and this lane never merges |
| Filing issues is outward-facing | GitHub issues only, after a duplicate search; no production change. The dispatch note's AC-011 calls for them |

## Plan-Reviewer Sign-off

<!-- plan-reviewer: subagent -->
reviewer_subagent: plan-reviewer (.claude/agents/plan-reviewer.md), spawned via the Agent tool in /plan-session Phase 4, 2026-10-24

**Final verdict (r3): APPROVE (0 errors, 0 warnings).**
- **r1:** REVISE (errors E1-E6, warning-level item E7, warnings W1-W11, info items I1-I3). All applied in r2.
- **r2:** REVISE. All three items are applied in r3:
  - 1 ERROR: the evidence directory was missing. Fixed by Preflight 7 and a `mkdir -p` in Step 12.
  - WARN: the Preflight 1 CSV wording was wrong. Corrected.
  - WARN: Step 14's command would fail on the Railway half. Fixed with `-t` scoping and two describe blocks
    in Step 7.
  - The r2 INFO items are carried into Step 20 (deviations noted in the exec report and the attestation).
