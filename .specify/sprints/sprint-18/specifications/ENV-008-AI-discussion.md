# ENV-008-AI — spec session discussion log

**Session:** 2026-10-22 to 2026-10-23 · **Mode:** subagent. `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
is set, but this session has no TeamCreate tool, so the session fell back to subagent mode.
**Agents:** DevOps-Lead, Security-Lead, Domain-Expert, Test-Engineer
(`.specify/sprints/sprint-18/context/ENV-008-AI/ENV-008-AI-agent-selection.json`).
Each agent ran as one subagent that was resumed for every round, so it kept the files it had
read.

## Before Round 1

### Phase 0: context hydration

- Ran `hydrateContextCli('ENV-008-AI')` (tools/scripts/lib/stoa/context-hydration.ts:813).
  It reported 0 codebase patterns because its shell grep fails on this Windows host. The
  addendum in `ENV-008-AI-hydrated-context.md` lists the patterns found by hand.

### Pre-session owner rulings

Recorded in `ENV-008-AI-owner-ruling.md`:

- **Ruling A:** re-scope to what really runs in production.
- **Ruling 2:** set Railway self-healing through CI on merge, because every local Railway
  credential is revoked and the GitHub secret works.

### Pre-session code audit

`/task-code-audit` produced `ENV-008-AI-code-audit.md`:

- 2 Lens-7 blocks: `self-healing-rules.yaml` and `anomaly-detection.json` are loaded by
  nothing.
- 2 warnings: no SLOs and no dashboard; three services emit nothing.

### Phase 0.75: exploration

Four Explore subagents ran, each reading 6 to 13 files. Each report lists the files it read,
with line numbers.

- **DevOps-Lead:** the CI apply pattern, Railway Terraform limits, and the health routes
  (`http-server.ts:297-363`, `ai-worker.ts:163-170`).
- **Security-Lead:** workflow permissions; `RAILWAY_TOKEN` is account-wide with no
  environment (`promote-production.yml:69-80, 176-181`); unpinned CLI (`:194`); raw response
  bodies in error messages (`apply-grafana-alert-rules.mjs:127,141,155`); public
  `/health/detailed`.
- **Domain-Expert:** SLO targets (`slo-definitions.md:29-57,112-118,183-193`). Found that
  `workflow.lead.route` is never emitted in production (`LeadRoutingService.ts:167-171`; only
  `capture-trace-examples.ts:201` sets the tracer).
- **Test-Engineer:** the fake-fetch test pattern (`apply-grafana-alert-rules.test.ts:14-43`);
  the root vitest project covers `tools/**` `.mjs` (`vitest.config.ts:308`); diff-coverage
  counts `.mjs` but not yaml/json/md (`diff-coverage.mjs:41`); `otel_validate` only checks
  that `otel-collector.yaml` exists.

### Lead production reads (shared facts F1-F9)

1. **F1:** the services are `api` and `ai-worker` only.
2. **F2:** latency is a native histogram; api SERVER p95 is 2.72 s over 1 day.
3. **F4:** every ai-worker `llm.invoke` span is ERROR.
4. **F5:** 0 SLOs; Asserts is active.
5. **F6:** `grafana-alert-rules.yml` has been red on main since 2026-10-06 with `HTTP 503`
   (the Grafana instance was asleep).
6. **F8:** Railway's health check gates deploys; it is not a liveness probe.

### Phase 0.95: dependency check

- ENV-005-AI claims a CI/CD pipeline. `ci.yml` on main is green (runs on 2026-10-21). TRUE.

### Phase 0.97: governance documents

- PRD: N/A (infrastructure task).
- ADR: created ADR-087. ADR-083 to ADR-086 are claimed by sibling lanes; IFC-074 holds
  ADR-086.

## Round 1: ANALYSIS

- **DevOps-Lead:**
  - Asserts is not mentioned anywhere in the repo.
  - Nothing sets `restartPolicy` or `healthcheckPath`.
  - The p95 alert rule queries `traces_spanmetrics_latency_bucket`, which does not exist
    (`alert-rules.json:49-50`). Its `requireSeries:false` hides that.
  - Q: who owns the settings, Terraform or CI? Q: ai-worker PORT? Q: write trigger?
- **Security-Lead:**
  - Writing with an account-wide token outside the Production environment.
  - The Admin role on the Grafana service account.
  - Response-body logging.
  - Health-detail exposure (`health.service.ts:60,84,93-94,115,162,203,234`).
  - Do not edit `.gitleaks/shared.toml`.
- **Domain-Expert:** an honest SLO set is api availability 99.9% (L33), api latency
  p95 < 200 ms (L56, kept even though it burns), and ai-worker LLM success 99.5% (L116). The
  three `workflow.*` rules are dead.
- **Test-Engineer:**
  - Use the import-based tests.
  - The retry needs an injectable sleep.
  - The paths filter (`grafana-alert-rules.yml:16-19`) misses the lib file.
  - Evidence must be split into before and after merge.

**Lead decisions D1-D8** (answers to the Round 1 questions):

- **D1:** CI owns the Railway settings.
- **D2:** Railway GraphQL shape verified by introspection.
- **D3:** writes only on push to main, and only for fields that differ.
- **D4:** api health check path `/api/health/live`. The ai-worker health check needs
  PORT == HEALTH_PORT.
- **D5:** documented SLO targets, no tuning.
- **D6:** dead IFC-032 rules get a gh issue; they are not modified here.
- **D7:** the 503 retry goes in `createApiClient`.
- **D8:** health exposure and the account-wide token get gh issues.

## Round 2: PROPOSAL

The merged result is in the Round 2 digest, reproduced in the spec as Technical Approach and
Components. Points of note:

- **Security-Lead:**
  - Field allow-list and read-back verify.
  - The `variables` query returns secrets, so keep only PORT and HEALTH_PORT in memory.
  - Add `redactBody` in `grafana-provisioning.mjs`.
- **Domain-Expert:**
  - The exact SLIs and the health-span exclusion regex. OPTIONS is kept, because the doc
    excludes only maintenance, 4xx and health checks (L45-49).
  - The 3x/2h burn rule and the 75%-budget rule are gaps, recorded and not built.
  - Proposed burn alerts ON only for availability.
- **DevOps-Lead:**
  - One Grafana workflow gets the SLO and dashboard steps.
  - A separate Railway workflow, because it uses a different secret and triggers redeploys.
- **Test-Engineer:** six test files and the commands; production evidence only after merge.

Lead verification after Round 2:

- **Grafana SLO OpenAPI** (grafana.com slo-api.yaml, v0_0): `Query.type` is freeform or
  ratio; `FreeformQuery{query}`; `Slo.required = uuid, name, description, query, objectives`;
  `Alerting{fastBurn, slowBurn}`; no "paused" field.
- The api binds `process.env.PORT` (`http-server.ts:25`). Production `/api/health/live`
  answers 200 in 0.25 s.

## Round 3: CHALLENGE

- **DevOps-Lead:**
  - `apply-grafana-alert-rules.mjs:162-166` throws after applying whenever ai-worker is silent.
    In a single job, that blocks the SLO and dashboard steps.
  - Matching SLOs by name is fragile; use a fixed uuid.
  - `serviceInstanceUpdate` may only take effect on the next deployment.
  - `/api/health/live` is served before the container is ready (`http-server.ts:335-337,553-557`).
  - `ON_FAILURE` does not catch hangs.
  - Raise `timeout-minutes` (5 is too short for three steps under retries).
  - Fail closed on a missing service.
- **Security-Lead:**
  - CODEOWNERS has no rule for `tools/scripts/observability/` (`.github/CODEOWNERS:15-31`).
  - `redactBody` can miss tokens; for Railway, log only `extensions.code` plus an allow-list.
  - The step summary must not contain IDs.
  - `overwrite:true` on the dashboard needs a fixed uid.
  - Add a contract test that there is no `pull_request*` trigger.
  - The retry window vs the 5-minute timeout.
  - A `variables` read may be refused.
- **Domain-Expert:**
  - "Predictive alerts" is honest only if the attestation says alerting covers availability
    only.
  - Use `ratio` (not freeform) for availability and LLM.
  - Use `[$__rate_interval]`, never a fixed range.
  - Zero traffic gives NaN; the LLM volume is about 10 calls a week.
  - The "100%" KPI is not met; give the honest wording.
  - "AI-configured" has no defined meaning yet.
  - The CSV EVIDENCE path still points to sprint-0.
- **Test-Engineer:**
  - `sleep` must be threaded through every `run()`, or tests wait about 3 minutes (past the
    30 s project timeout, `vitest.config.ts:180`).
  - No existing test asserts the error text being changed.
  - Content tests should be structural, not string greps.
  - Keep CLI guards to one line.
  - 3 minutes does not cover the ~200 s cold start; make it about 5 minutes.
  - List of items not provable before merge.

**Resolutions** (all folded into the spec):

- Three independent jobs, `timeout-minutes: 12`.
- Fixed uuids (GET, then POST or PUT).
- `ratio` for availability and LLM; freeform plus `$__rate_interval` for latency.
- 8 attempts over 255 s.
- Railway errors logged as code plus an allow-list; no IDs in the summary.
- Fail closed on a missing service or a read-back mismatch.
- "Effective from next deployment" wording; crash-only self-healing stated in ADR-087.
- No `pull_request*` triggers, with a contract test.
- Fixed dashboard uid.
- Honest KPI wording; "AI-configured" defined.
- EVIDENCE path correction (AC-012).
- CODEOWNERS not adopted (solo-owner repo). Security-Lead accepted this in Round 4.
- Weekly drift schedule rejected because of the Actions budget; manual dispatch documented.

## Round 4: CONSENSUS (votes verbatim, first line)

| Agent | Vote |
|---|---|
| DevOps-Lead | `APPROVED` (minor: per-job checkout/setup-node; token-in-log assertion; ADR drift note) |
| Security-Lead | `APPROVED` (minor: variables-unreadable fail-closed; runtime token-shaped variable test; secret-lint regression; accepts no CODEOWNERS) |
| Domain-Expert | `APPROVED` (required text: SLI caveats in descriptions plus tests; issue-1 fix wording) |
| Test-Engineer | `APPROVED` (minor: synthetic test extension; alert-rules test in regression; exact command) |

**Result:** 4/4 approved (100% against the 66% threshold). No critical unresolved issues. All
modifications are folded into the spec and ADR-087, which is now Accepted.
