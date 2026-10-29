# IFC-074 — Spec session discussion log (2026-10-22)

Mode: subagent (5 agents, each a persistent Explore subagent resumed per round). Lead: IFC-074 lane.
Agents: DevOps-Lead, Backend-Architect, Security-Lead, Test-Engineer, Domain-Expert
(`.specify/sprints/sprint-18/context/IFC-074/IFC-074-agent-selection.json`).
Round inputs written by the lead: `context/IFC-074/round2-lead-draft.md`, `round3-consolidated-proposal.md`,
`round4-resolutions.md`. Owner ruling: `context/IFC-074/IFC-074-owner-ruling.md` (option A).

## Lead pre-work (live, read-only)
- Grafana Cloud: Loki `service_name` 7 d = `["ai-worker"]`; ai-worker lines with `trace_id` = 44; Tempo services
  `api`, `ai-worker`; alert-history Alerting counts 30 d: ErrorRatioBreach 209, LatencyP95Breach 2, LatencyP95Anomaly 1,
  asserts_up 3, IFC-032 delivery test 1. Alert-history line keys include `ruleUID, fingerprint, previous, current,
  labels`; Tempo search returns `traceID`, spans with `spanID`, `startTimeUnixNano`.
- Sentry org token: project listing refused (permission). Railway API: `project` query Not Authorized. SENTRY_DSN wiring
  taken from Terraform (IFC-314, applied 2026-06-08).
- Hydration (`IFC-074-hydrated-context.*`): pattern scanner returned 0 patterns on Windows ("The system cannot find the
  path specified"); codebase context supplied by the exploration agents instead.
- Dependency IFC-003 verified on disk. IFC-074 absent from the Observability Stack chain diagram.

## Phase 0.75 — Exploration (each agent read ≥ 2 files, cited file:line)
- **Backend-Architect**: middleware.ts:84-217 logs via console (success :161, slow :154, error :202), after span.end;
  logging.ts mixin :100-112 adds trace ids, no `redact`, default logger lazily named "default"; api imports the
  observability root only at trpc.ts:20, after instrument (CJS order safe); ai-worker builds its own pino
  (utils/logger.ts:24-59). Proposed a lazy api logger + pino calls before span.end.
- **Test-Engineer**: middleware.test.ts:128 and trpc.test.ts:189,206 assert console output; setup.ts:45-63 mocks
  @opentelemetry/api without getActiveSpan → real mixin would throw; logging.test.ts tests a copied mixin, not a real
  record; tools tests run in the root project with injected fetch; observability src is coverage-excluded, tools are not.
- **Security-Lead**: no pino redact; tenantId/userId in log context; error.message free text; gitleaks flags logfmt
  `... trace_id=<hex>` and `token,<hex>` but not JSON/quoted CSV; committed evidence must exclude hosts/PII/raw lines.
- **Domain-Expert**: close rule (tracking blocker 4); correlation CSV and MTTR baseline fabricated; Sentry config a
  template; repo alert rules have `for` 5–15 min (cannot meet < 2 min); IFC-032 COMPLETE; no observability PRD.
- **DevOps-Lead**: Tempo "api" name not from code/Terraform (hand-set drift); no existing Tempo/Loki reader; reuse
  `createApiClient`/`querySeriesCount`; artifacts fabricated; ErrorRatioBreach not in repo.

## Round 1 — ANALYSIS
- **Backend**: confirmed root cause; questions: success at info vs debug, drop error.message, logContext on more
  procedures; concerns: import order, mocks, duplicate logs, PII.
- **DevOps**: query plan per datasource; MTTD = transition − first error span; risks: sleeping stack (503), rate limits,
  Loki range caps, never write empty passes; Sentry config → truthful, secret-free description.
- **Security**: allow pseudonymous tenantId/userId (gdpr-compliance.md:89); error line = code + error name; add pino redact
  now; evidence allowlist + gitleaks acceptance; token header-only.
- **Test**: TDD order (real createLogger test first); global logger mock; collector test list; Node 22.14.0 required.
- **Domain**: what is satisfiable now vs post-deploy; asserts firings are real alerts (collapse into incidents); stale
  docs in scope; ADR warranted for the log standard + evidence rule; report MTTD honestly if > 2 min.

## Round 2 — PROPOSAL (on round2-lead-draft.md)
- **Backend**: `getApiLogger()` + reset helper; record shapes; proposed warn for client TRPC codes; top-level redact
  paths; also stub `getActiveSpan`.
- **DevOps**: endpoints per step, CLI, retry 429/502/503/504 ×5, CSV/JSON schemas; reuse 1h `querySeriesCount`; atomic
  writes; 7-day alert-history slices; corrected Sentry facts (ai-worker never inits Sentry).
- **Security**: full redact list; errorName regex; corrected regexes (title regex rejected real titles → alertname);
  column-name rule; no response bodies in errors; gitleaks commands.
- **Test**: concrete test list; temp-file capture; global mock shape surviving mockReset; inject `sleep`; logger test must
  unmock.
- **Domain**: AC-001…AC-009; proposed median KPI; rebuild of fabricated KPIs; ADR-086 scope.

## Round 3 — CHALLENGE (on round3-consolidated-proposal.md)
- **Backend**: read instrumentation-pino 0.68 / sdk-node 0.219 sources: patching at `pino()` call (lazy logger OK),
  mixins merged, OTLP stream added, logs exporter defaults to otlp; Loki label = resource service.name; add OTLP interop
  test; SIGTERM race; LOG_LEVEL precondition.
- **DevOps**: `spss` ≠ earliest span (use limit=50 + min); Pending→Alerting; structured-metadata filter; clock skew → 
  unanchored; zero data → met null; `ENVIRONMENT` mislabel; **DOA risk**: api row needs a real tRPC call post-deploy;
  add `--since`.
- **Security**: correlationId server-generated, requestId client-supplied (never log); validate path; free-text only from
  constants; temp cleanup; Admin token residual risk; 9 negative tests; print SHA-256.
- **Test**: regression sweep (only the two known assertions); avoid temp-file EBUSY (spy pino.destination); fake only
  Date; keep pino-pretty out of logger.test; direct tests for lib helpers.
- **Domain**: metric leg must be tied to log_ts/span; root cause needs the failing operation named; **withdrew median →
  mean**; client-code split is over-scope; null (not delete) fabricated values; collector exit 2 on missing evidence.

## Round 4 — CONSENSUS (on round4-resolutions.md)
| Agent | Vote | Non-blocking modifications |
|-------|------|----------------------------|
| Domain-Expert | APPROVED | null the fabricated `execution` block; rank F8 high |
| Backend-Architect | APPROVED | F9 wording; keep the OTLP interop test mandatory |
| Test-Engineer | APPROVED | exact-pinned devDeps instrumentation-pino + sdk-logs; exit codes via `run()` return |
| Security-Lead | APPROVED (conditional, folded in) | span-name redaction: UUID, ≥8 hex run, ≥6-digit segment + tests |
| DevOps-Lead | APPROVED | `count(count_over_time(...))`; warm-up = Grafana `/api/health` |

Result: 5/5 APPROVED (100 %), consensus in the first CONSENSUS round. All modifications are reflected in
`IFC-074-spec.md`.

---

# 2026-10-29 addendum: spec session on the new base

The Sprint_plan status stays **In Progress** rather than being reset to Specifying, for two reasons: owner ruling 1 keeps the row In Progress until the post-deploy re-run, and this run is an addendum to a task already in progress.

## Phase 0 / 0.5
- **Hydration** was re-run, giving `context/IFC-074/IFC-074-hydrated-context-2026-10-29.{json,md}` (hash 60942e289944fd221d6c195711c8737ec84906cfbd7e52f92ccb93ed4ab0b3ef, 1 dependency, 0 patterns).
- **Agent selection** is in `IFC-074-agent-selection-2026-10-29.json`: Backend-Architect, DevOps-Lead, Domain-Expert and Test-Engineer. The lead added Security-Lead (logging redaction, token handling), as on 2026-10-22.

## Phase 0.75 + Round 1: exploration and analysis (Explore subagents)

### Backend-Architect: Round 1 (exploration + analysis), Explore subagent, 18 tool uses

Key findings, with citations as the agent reported them:
- **api log path:** the logger is lazy (`logger.ts:30-35`) and a failed build is remembered (`:49-57`). `tracingMiddleware` runs on every procedure builder (`trpc.ts:102,252,272,316,348,575,598`). Each call writes:
  - `trpc.request` at info (`middleware.ts:180-191`);
  - `trpc.slow` at warn when slower than 50 ms (`:166-179`);
  - `trpc.error` at error, with code and errorName only (`:207-222`).

  Every record is written before `span.end()` (`:192,223`). Admin auth rejections are not logged (`trpc.ts:316`).
- **OTel SDK:** NodeSDK gets no explicit exporters (`otel.ts:118-121`). Logs and metrics default to otlp (`sdk.js:266-269`, `:29-32`). The logs timer starts only while records are buffered (`BatchLogRecordProcessorBase.js:235-237`), so an idle api sends no log traffic. The metrics `PeriodicExportingMetricReader` exports on its interval even when idle (`sdk.js:39-40`). It is pre-existing and the only periodic outbound traffic.
- **Collector (high):** `loadRepoRules` ignores `datasourceUid` (`collect…mjs:1114-1122`). The Loki rule goes to Prometheus through `conditionHeld` (`:664-667`), `conditionTimeline` (`:687-690`) and `trueAtProbe` (`:709`), each wrapped as `(expr) > 0` (`:626-627`). There is no catch in `checkRepoRules` (`:733-751`), so the whole run likely aborts (not run to confirm). `sameService` and `seriesService` read `metric.service`, and a missing label matches everything (`:624,628-629`). Loki series carry `service_name`. `storedRuleDifferences` is already right for Loki (`:654`, `grafana-provisioning.mjs:136-153`).
- **Shared lib:** a write client (503 only) and a read-only client (429/502/503/504) live side by side. `DATASOURCE_KINDS` (`:114-117`) is not imported by the collector, which keeps its own `DS` map (`:42-47`).
- **Spec drift:**
  - The spec's MTTD method (`spec:97-112`) does not name the direct rules or the collector's repo-rule fields.
  - The Loki rule selects ai-worker only (`alert-rules.json:93`), while the collector's `LOG_RULE_SERVICES` includes api (`:836`).
  - The api's Loki `service_name` (`api` or `intelliflow-api`) is unresolved (`spec:55,284`).

Questions:
1. Widen the Loki selector to the api now, or later?
2. Should the collector probe Loki rules through `lokiQueryRange`, or skip them?
3. What is the api's deployed `OTEL_SERVICE_NAME`?

Concerns: H, the collector routes the Loki rule to Prometheus. M, the Loki rule excludes the api. L, one info record per call with no sampling, which costs volume. L, admin auth rejections go unlogged.

### DevOps-Lead: Round 1 (exploration + analysis), Explore subagent, 25 tool uses

- **How the api is deployed:**
  - Railway runs a GHCR image (`infra/terraform/modules/railway/main.tf:34-40`, `production/terraform.tfvars:75-77`). It moves only through the manual `promote-production.yml` (`:154-213`). Vercel hosts the web app only (`tfvars:64-65`).
  - No railway.toml/json or app-sleeping or serverless setting exists in the repo. Self-healing sets only the restart policy and health check (`apply-railway-self-healing.mjs:47-57`).
  - Production sets `OTEL_EXPORTER_OTLP_ENDPOINT` to the Grafana gateway (`tfvars:153`, `monitoring/main.tf:20,26-28`, `railway/main.tf:96-113`). `OTEL_LOGS_EXPORTER` is unset, so the SDK default is otlp (`otel.ts:19-22`).
- **Sleeping api:** logs are written only inside a tRPC call (`middleware.ts:165-222`), so log export follows inbound traffic and never creates it. The default metrics reader (about every 60 s, `metrics.ts:141`) is pre-existing outbound traffic; the logs add no new wake source.
- **Volume:**
  - No Grafana free-tier limit is documented in `docs/` or `infra/monitoring`; the only mention is ADR-086:84.
  - A line is about 250-350 B of JSON before OTLP resource attributes. A request writes about 1.5-2 lines, because calls slower than 50 ms add `trpc.slow` and api p95 is already over budget (#1001, ADR-087:121-122).
  - There is no volume budget or tripwire (`usage-alerts-config.yaml` has a dollar tripwire only). If the free tier is exceeded, ingestion is dropped, which silently breaks Loki detection.
  - The api replica count lives in the Railway dashboard: `tfvars:77` says 2, but the module ignores it (`railway/main.tf:30-33`).
- **Post-deploy measurement:** the collector is "local only, never in CI" and needs `GRAFANA_SA_TOKEN` (`collect-observability-evidence.mjs:15-19`). No workflow runs it. The `grafana-alert-rules.yml` dry run only validates rules and live series (`:32-35,66`). There is no CI or agent path for the post-deploy MTTD re-run.
- **ADRs:** ADR-086:70-74 records #1040 but not #1062. ADR-086:55-58 says api records reach Loki, yet the #1062 rule is ai-worker only (`alert-rules.json:90,91,94,100`). ADR-087 does not touch these rules (`:13-14`).

Questions:
1. Widen the Loki selector to the api once the api image is promoted? Otherwise api MTTD rests on the span rule (modelled 162-203 s).
2. What is the api's Loki `service_name` (`api` or `intelliflow-api`, spec F5 at `:284`, `logger.ts:32`)?
3. Would the owner accept a `workflow_dispatch` collector job in the Production environment (this reverses "never in CI"; F7 applies)?
4. Keep the `!= "Latency alert generated"` exclusion until a 24 h zero-false-alarm check after the alertSeverity promotion?

Concerns:
- H: don't claim #1062 detects api errors.
- H: the KPI can't be re-measured by CI or agents, so NEEDS_HUMAN has no automated close.
- M: no log-volume tripwire.
- M: replica count drift.
- L: the prod project name says "dev" (`tfvars:72`).
- L: `metricsMiddleware` still uses `console.*` (`middleware.ts:262-285`).

### Domain-Expert: Round 1 (exploration + analysis), Explore subagent, 13 tool uses

- **ACs:** AC-001 to AC-009 (`spec:204-223`). The delivery report has AC-002 NEEDS_HUMAN and the rest MET, with AC-005 met for ai-worker only (`delivery.md:90-98`). No AC covers the detection rules. The spec's only answer to a missed KPI is "report met:false, don't redefine" (`spec:276`).
- **Statistic drift:** the spec defines MTTD as the mean per rule incident (`spec:103,111`). Commit 7c85d4b2b changed the unit to the per-episode first alert from any rule, and the spec was not updated.
- **Rulings:** `IFC-074-owner-ruling.md` holds only the 2026-10-22 rulings. The 2026-10-28/29 "ship code, gate KPI after" ruling is not recorded anywhere in `.specify`.
- **Verdicts on record:**
  - No sprint-18 attestation.json exists.
  - The MATOP aggregate is FAIL only because of #1000 (clears when #1000 merges).
  - The CSV row's evidence still points at the sprint-1 attestation, which is PARTIAL and carries a fabricated `actual "<2min", met: true` (`sprint-1 attestation.json:7,64-69`).
- **Rule `why` text has no committed evidence:**
  - `mttr-baseline.json` dates from 2026-10-22, before both rules existed: mean 268.739 s, `met:false` (`:1019-1032`), no episode field.
  - No "run 7" report is committed.
  - The span rule claims a modelled 162-203 s (`alert-rules.json:77`), which is above target. The Loki rule claims a modelled 36-61 s for 9 of 13 episodes (`:91`).
- **Close rule:** blockers 4, 5 and 6 are open (`task-tracking.json:34-44`). Blocker 6 asks for an "owner decision on detection tuning vs target", and the new ruling answers it. KPIs: `mttd_target` is 4.479 min with `met:false`; `traces_correlating` has `met:null` (`:69-81`).
- **Schema:**
  - The verdict enum includes NEEDS_HUMAN (`attestation.schema.json:39`).
  - kpi_results needs `target` and `actual` as strings and `met` as a boolean, with no extra fields (`:238-252`). So `met:null` is invalid, and the measurement window has to go in notes or manual_verification.

Questions:
1. Append "Owner ruling 3" to `IFC-074-owner-ruling.md`?
2. Which MTTD statistic applies: per incident or per episode?
3. What goes in kpi_results.actual while the measurement is pending?
4. Should the CSV evidence move from the sprint-1 attestation to the sprint-18 one?

Concerns: H, modelled numbers presented without evidence. H, the CSV evidence carries a fabricated met:true. M, blocker 6 is answered but not recorded. M, api errors and the 4 of 13 episodes with no error-level line rely on the slower span rule. L, the MATOP FAIL carry-over from #1000.

### Test-Engineer: Round 1 (exploration + analysis), Explore subagent, 24 tool uses

- **Bug confirmed:** `loadRepoRules` keeps every rule with an expr (`collect…mjs:1115`). `conditionHeld` (`:664-668`, a `[Ns:60s]` subquery that is invalid in LogQL), `conditionTimeline` (`:687-694`) and `trueAtProbe` (`:709`) all use DS.prom. `storedCheck` (`:654`) is correct.
- **Coverage:** `collect-observability-evidence.test.ts:907-1061,1201-1227,1314-1346` covers repo-rule checks. No test feeds a grafanacloud-logs rule (the only uids are grafanacloud-prom and other-ds). The default REPO_RULES fixture has no expr (`:307-313`).
- **The fake hides the bug:** `promBody` answers any path ending in /api/v1/query(_range) (`:286,294`), so a Loki path would still get a Prometheus answer. A new test must assert the `grafana.calls` paths (the logs proxy uid plus `/loki/api/v1/query*`) and add a Loki instant branch to `fakeGrafana` (`:78-163`).
- **Reuse from #1062:**
  - `DATASOURCE_KINDS` (`grafana-provisioning.mjs:114`).
  - `lokiQueryRange` (`:265`).
  - Tests at `grafana-provisioning.test.ts:297-336,385-402,574-590` and `apply-grafana-alert-rules.test.ts:171-205,353-376`.
  - Missing: a Loki instant-query helper.
- **api tests:** `logger.test.ts:36-51,87-101,118-129`, `middleware.logger-failure.test.ts:75,89-102` and `middleware.test.ts:190,318-348` prove failure handling and the order of records and span end. No test asserts that the idle api has no timer and makes no background export.
- **Regression commands:**
  - `pnpm exec vitest run --project root tools/scripts/__tests__/collect-observability-evidence.test.ts tools/scripts/__tests__/apply-grafana-alert-rules.test.ts tools/scripts/lib/grafana-provisioning.test.ts`
  - `pnpm exec vitest run --project api apps/api/src/tracing`
- **Artifacts (2026-10-22):**
  - `mttr-baseline.json` lists only 3 Grafana-managed rules (`:12-28`), with mean 268.739 s and met:false (`:1018-1033`).
  - `correlation-test.csv` has the api row NOT_OBSERVED and 10 ai-worker rows PASS.

Questions:
1. Route Loki rules to Loki, or skip them as "not checked"?
2. Add a datasource kind to `repo_rule_checks`?
3. Regenerate `mttr-baseline.json` now, or keep the 2026-10-22 result?

Concerns: the fake masks the bug. In production, a 400 on the LogQL query likely makes the collector exit 1 and write nothing, or it reports "never true", which is misleading. No idle-timer test.

### Security-Lead: Round 1 (Explore subagent, 29 tool uses)
- **api records:**
  - Each carries type, correlationId (server-generated randomUUID, `correlation.ts:92`), path (allowlisted, `middleware.ts:54-56`), method, durationMs and status. Errors add code and errorName (allowlisted, `:59-62`), with no message, stack or cause.
  - On protected and tenant procedures, the pino mixin (`logging.ts:133-144`) adds tenantId and userId (`trpc.ts:111-119,248-253,267-273`). The redact list does not cover them (`logging.ts:80-105`). Email is redacted.
- **Read-only client and collector:**
  - The read-only client hard-codes GET (`grafana-provisioning.mjs:229-237`), and its errors are `HTTP <status> <name>` only (`:241,:247`).
  - The collector scrubs the token (`collect…mjs:1160-1161,1231`), checks output keys against an allowlist (`:100-114,397-416`) and rejects secret-shaped keys (`:1098-1105`).
  - The committed outputs grep clean; the only hit is a route name.
- **Credentials:** env-only (`:1159,:1163`). No workflow runs the collector. The Grafana workflows have `contents: read` and use an Admin-role token (`grafana-alert-rules.yml:9,37-38,63`).
- **Fixtures:** the token is `'q'.repeat(32)`, hosts are `*.example.invalid`, and the email is `u1@example.com`.
- **Injection:** query params go through URLSearchParams (`:254-259`), and service and trace id are validated. `datasourceProxy(uid)` is not validated (`:252`).
- **Concerns:**
  - High: tenantId and userId go to Loki.
  - High: there is no CI path for the collector.
  - Medium: the proxy uid is unvalidated.
  - Medium: Loki rules are queried in the wrong query language.

## Round 2: proposal
The lead draft is `context/IFC-074/round2-lead-draft-2026-10-29.md` (P1-P7).

## Round 3: challenge (role subagents)

### DevOps-Lead: Round 3 CHALLENGE (devops-lead subagent, 21 tool uses)

1. **Action pins.** The Grafana workflows use the mutable `@v7` tags (`grafana-alert-rules.yml:51,57`), and no gate enforces SHA pins. Follow `@v7`.
2. **The artifact upload is the new risk.** It defaults to 90 days and is readable by anyone with repo read access, outside the Production gate. Set `retention-days: 7` (the pattern at `ci.yml:373-380`), and add a hard AC: a token-shaped string fed through the collector is absent from both outputs.
3. **Token privilege.** The collector would reuse the Admin-role `GRAFANA_SA_TOKEN` (`grafana-alert-rules.yml:9-10`) for a read-only job. Either make the Viewer token (F7) a prerequisite, or accept and record the Admin use explicitly.
4. **No guard covers the new workflow.** workflow-secret-lint checks only DB/password keys (`workflow-secret-lint.mjs:57-64,93-94`), and actionlint is advisory or skipped (`pre-ship.mjs:352-356`).
5. **Script injection.** Pass the `since` and `services` inputs through `env:`, quote them, and regex-validate them. Never put `${{ inputs.* }}` inside `run:`.
6. **P2.** Correct. Every thrown procedure logs at error (`middleware.ts:209-222`), `trpc.slow` is warn (`:167`), and the rule covers ai-worker only.
7. **P6 volume.**
   - 1-2 lines per request is solid (`middleware.ts:166-191`).
   - The 0.3 KB per line figure has no source, so label it an assumption.
   - Say "log records are written only inside tRPC calls", not "an idle api sends nothing": metrics and traces are still exported, and health probes are requests.

Edge cases:
- A sleeping Grafana answers 503 for up to 255 s per call, so set `timeout-minutes: 12`.
- Add a concurrency group.
- Change the `datasource_kind` output schema together with the `.d.mts` and its allowlist tests.

Integration: the deploy order for AC-002.
1. Merge.
2. `build-images` produces `sha-<merge>`.
3. Dispatch `promote-production` with `api`.
4. The uptime check passes (`promote-production.yml:187`).
5. The OTLP endpoint is set on the api (`otel.ts:66-68`).
6. Dispatch the evidence workflow.

A `workflow_dispatch` workflow is dispatchable only once it is on the default branch.

Dead-on-arrival: H, the 72 h window measures a stale api if the promotion is skipped. M, the token and artifact concerns, and the workflow can't be tested from the branch.

### Domain-Expert: Round 3 CHALLENGE (domain-expert subagent, 6 tool uses)

1. **P4 is a redefinition.**
   - AC-004 (`spec:212-214`) fixes the KPI as the mean per incident, and the risk line at `spec:276` forbids redefining it. Switching to a per-episode statistic after a miss reads as moving the goalposts.
   - It is defensible only through ruling 3, which is relayed and not yet on file.
   - The addendum must record the change as a supersession, dated, citing ruling 3 and 7c85d4b2b. It must give an exact definition of "episode" and "first alert", committed before any post-deploy data exists (pre-registration).
   - The per-incident mean is co-reported, the 2026-10-22 figure is marked as not comparable, and the change is not called a "correction" until double-counting is shown on real data. It needs the Category B old→new/evidence/impact record and independent review.
2. **The `actual` string fits the schema but is not honest.**
   - Suggested `actual`: "NOT MEASURED on the post-#1040/#1062 stack. Last measurement 2026-10-22 (per-incident mean, 268.7 s, n=63, not met) predates both rules. Post-deploy per-episode measurement pending (>=72 h or >=10 episodes)."
   - Suggested `target`: "< 120 s mean per-episode first alert".
   - `met` stays false, and a note says this means "target not demonstrated". The task-tracking 4.479 min stays, with a dated note added.
3. **Over-claims to fix.**
   - The api is expected to miss the target, because the span rule is modelled at 162-203 s.
   - The PR-body numbers must be labelled "unverified here, no committed file".
   - The CI-run claims have no committed evidence.
   - The volume figures are estimates.
4. **P7 deviates from `spec:177`.** It needs an AC and a dated note. The test must check the emitted line's exact key set, because the merge order is fragile.
5. **Smaller points.**
   - Blocker 6 mixes AC-002 with tuning; ruling 3 answers only the tuning part.
   - Blockers 4 and 5 stay open.
   - Ruling 3 does not lift AC-009.

Proposed ACs:
- **AC-010:** the collector routes each rule by DATASOURCE_KINDS, with path assertions in the tests. An unknown uid gives `not_checked` without aborting, and `datasource_kind` is allowlisted.
- **AC-011:** the `datasourceProxy` uid is validated (`../`, empty and 65-char cases tested). The label is chosen by kind. A rule with no label matches only an episode with no service.
- **AC-012:** the workflow is dispatch-only, with `contents: read`, the Production environment and no push. It uploads an artifact with SHA-256 values. A test fails on any push, pull_request or schedule trigger.
- **AC-013 (NEEDS_HUMAN):** the per-episode first-alert mean, co-reported with the per-incident mean, judged over a window of at least 72 h or 10 episodes. The dispatch artifact's SHA-256 goes into the attestation.
- **AC-014:** the addendum records the statistic change, labels the unverified numbers, and states that the api is expected to exceed 120 s.
- **AC-015:** the api records carry tenantId and no userId, proven by an exact key-set test on a protectedProcedure.

Integration:
- AC-013 cannot close in this PR.
- With the Admin token, the GET-only check is the only guard, so add a workflow test that no step makes a non-GET request.
- The `.d.mts` and the allowlist change together.
- Append ruling 3 before citing it.

### Backend-Architect: Round 3 (backend-architect subagent, 13 tool uses)
- **P1-a:** `fetchTransitions` reads only `labels.service` (`collect…mjs:449`). Loki alerts therefore become `unknown` and never anchor to an episode (dead-on-arrival risk: High).
- **P1-b:** the combined worker's spans are named `intelliflow-ai-worker` (`apps/ai-worker/src/tracing/otel.ts:48`), but its logs say `ai-worker`, so an alias is needed. `sameService` treats a missing label as a match (`:628-629`), and changing that would also change Prometheus rules, so Loki needs a separate matcher.
- **P1-c:** a query_range at step 60 gives faithful values. The 3-day lookback (`:663`) is too heavy for Loki, so cap it.
- **P1-d:** `lokiInstantQuery` is not needed; a range query with start=end does the same job.
- **P7:** pino's merge (`pino/lib/proto.js:202-203`) lets the call object override the mixin. `userId: undefined` disappears only because serialisation drops it, and it covers only `apiLog`. Reject the override.
- **P6:** the idle test is feasible with InMemoryLogRecordExporter, but timers re-arm after each export.

### Test-Engineer: Round 3 (test-engineer subagent, 13 tool uses)
- `fakeGrafana`'s promBody answers any `/api/v1/query*` (`collect…test.ts:294`), and lokiBody falls through (`:166-174`). The fake must be strict per uid, and tests must assert on `grafana.calls`.
- The P7 key-set test in `middleware.test.ts` proves nothing, because the logger is mocked (`setup.ts:86-96`). Use real pino in `logger.test.ts`.
- The P6 idle test would only test the library (the constructor schedules nothing). Drop it.
- New collector branches put diff-coverage at risk. The agent gave the exact test list and six mutation checks.

### Security-Lead: Round 3 (security-lead subagent, 16 tool uses)
- Only protected and tenant procedures get tenantId and userId (`trpc.ts:111-120,251-252,271-272`). Public, admin, partner and auth procedures carry neither.
- ai-worker passes `userId: undefined` because its jobs have no user (`apps/ai-worker/src/ai-worker.ts:1072`). Dropping userId only on the api would split the services, and would only cover `apiLog`.
- **Recommendation on P7: (a) keep both.** userId is already in Tempo as `user.id`, and access is owner-only. If minimisation is ever wanted, do it once for all services.
- P3: an Admin token has a wide blast radius. The Production environment's protection can't be verified from the repo. Use step-level env. The artifact is public, because the repo is public.
- The uid regex is enough. Validate it inside `datasourceProxy`, with an error that does not echo the value.

The lead's resolutions are in `context/IFC-074/round3-resolutions-2026-10-29.md`: P7 reversed to keep both keys, the idle test dropped, and the Production environment checked through the API (no protection rules, no branch policy).

Owner questions sent through the coordinator on 2026-10-29: Q1, the KPI statistic; Q2, the measurement token. The working assumption is B for both.

## Round 4: consensus (same five agents, resumed)

| Agent | Vote | Modifications |
|-------|------|---------------|
| Backend-Architect | APPROVED | alias in transition normalisation, plus an `intelliflow-ai-worker` episode test; regex-only uid check; `lookback_s` on every Loki check |
| DevOps-Lead | APPROVED | the Viewer token needs the owner; the branch-policy item stays open; the promotion is the owner's |
| Security-Lead | APPROVED (blocking: the collector must accept `GRAFANA_VIEWER_TOKEN`, so the workflow never names `GRAFANA_SA_TOKEN`) | the runbook notes which procedures have no tenantId |
| Test-Engineer | APPROVED (blocking: `schema_version` is already 2.2.0 at `:1191`, so bump it to 2.3.0 with a test that pins it) | a `service_name`-aware `seriesService`; a distinct matcher name; `not_checked` tests; alias and fallback mutations |
| Domain-Expert | APPROVED | label the assumptions as pending the owner; include the AC-013/014/015 text; check the alias against `LOG_RULE_SERVICES` |

Result: 5/5 APPROVED (100%) in the first CONSENSUS round. Both blocking conditions are folded into the spec addendum (D1, D4, AC-011, AC-012).
