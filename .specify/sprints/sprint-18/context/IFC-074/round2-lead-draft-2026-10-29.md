# IFC-074: 2026-10-29 addendum, Round 2 PROPOSAL (lead draft, input to Round 3 CHALLENGE)

Base: `agent/IFC-074-observability` = origin/main `9e378fbb0` (#1062) plus the 2026-10-22 IFC-074 commits, cherry-picked.
Round 1 inputs are five Explore subagents (Backend-Architect, DevOps-Lead, Domain-Expert, Test-Engineer,
Security-Lead), summarised in `IFC-074-discussion.md` under "2026-10-29 addendum".

This is an addendum, not a rewrite. The 2026-10-22 spec, its ACs and its consensus stand. Where they describe the old base,
the addendum adds a dated note.

## What changed since 2026-10-22 (verified)
- #1040 added the span rule `ifc074-error-spans-direct`, and #1062 added the Loki rule `ifc074-error-logs-direct` with
  `datasourceUid: grafanacloud-logs` (`alert-rules.json:74-101`). #1062 was applied to production on merge: run
  40846555065 logged "created ifc074-error-logs-direct", with 1 live stream for `{service_name="ai-worker"}`.
- combined-worker runs sha-9e378fbb0. Its latency and drift lines now log `alertSeverity` and `driftSeverity` instead of
  a top-level `severity`.
- Owner ruling 3 (2026-10-28/29, relayed by the coordinator): "ship code, gate KPI after". The attestation is
  NEEDS_HUMAN with the MTTD KPI `met:false`. MTTD < 120 s is measured after deploy, over at least 72 h or 10 real
  error episodes.

## Proposals

P1. Collector routes each repo rule to its own datasource (the bug every Round 1 agent confirmed).
- The kind comes from `DATASOURCE_KINDS[rule.datasourceUid ?? config.datasourceUid]`, imported from
  `grafana-provisioning.mjs:114`. An unknown uid is reported as `not_checked: unknown_datasource` and does not abort
  the run.
- For Loki rules:
  - `trueAtProbe` uses a new `lokiInstantQuery(get, uid, query, timeNs)` (`/loki/api/v1/query`).
  - `conditionTimeline` and `conditionHeld` use `lokiQueryRange` on the metric expression with `step=60s`, counting
    the steps whose value meets the rule's operator and threshold. LogQL has no `[Ns:60s]` subquery, so the
    Prometheus subquery is not reused.
- The service label depends on the kind: `service` for Prometheus, `service_name` for Loki. A missing label no longer
  matches every episode: it matches only when the episode has no service.
- `repo_rule_checks[]` gains `datasource_kind` (`prometheus` | `loki`), added to the output allowlist.
- `datasourceProxy(uid)` rejects a uid outside `^[A-Za-z0-9_-]{1,64}$` (Security R1).

P2. The Loki rule stays ai-worker only in this PR.
- Error records are written for every failed procedure, including client errors (UNAUTHORIZED, NOT_FOUND,
  BAD_REQUEST); the level split is tracked as F11. Widening the selector to the api now would page on client errors.
- Widening to `{service_name=~"ai-worker|api"}` is a post-deploy step, done once F11 or a code filter keeps client
  errors out. It is tracked as a new finding, F14.
- Until then, the api's MTTD depends on the span rule, modelled at 162-203 s. The addendum says so and does not claim
  #1062 detects api errors.

P3. Measuring the KPI after deploy: a dispatch-only CI job (DevOps and Security R1: no agent path exists today).
- NEW `.github/workflows/observability-evidence.yml`:
  - `workflow_dispatch` only, inputs `since` and `services`;
  - `environment: Production`, `permissions: contents: read`, `GRAFANA_URL` and `GRAFANA_SA_TOKEN` from the
    environment;
  - runs `collect-observability-evidence.mjs` and uploads the two outputs plus their SHA-256 values as a run artifact.
    It never commits.
- The collector header changes from "local only, never in CI" to "run locally by the owner or via the
  dispatch-only workflow; never on push or PR". F7 (Viewer token) stays open and is cited.
- Cost: one dispatch is about 1-2 runner minutes, run at most a few times.

P4. Evidence honesty (Domain R1).
- `mttr-baseline.json` and `correlation-test.csv` are NOT regenerated in this PR: that needs a token. They keep their
  2026-10-22 values, and the addendum says so with a date.
- The rules' `why` numbers (36-61 s, 162-203 s, 9/13) are labelled "modelled replay, not measured". They come from the
  #1040 and #1062 PR bodies, not from a committed evidence file.
- The KPI statistic going forward is the per-episode first alert from any rule (commit `7c85d4b2b`). The addendum
  records this change from the spec's per-incident mean and the reason: one error episode raises several rule
  incidents, so averaging incidents double-counts.
- Attestation `kpi_results`:
  - MTTD: `actual: "268.7 s mean per incident, 2026-10-22, before #1040/#1062; post-deploy per-episode measurement pending"`,
    with `met: false`.
  - traces_correlating: `met: false` with the api row NOT_OBSERVED (the schema has no null).

P5. Records.
- Append "Owner ruling 3" to `IFC-074-owner-ruling.md`, dated and marked as relayed.
- `task-tracking.json` blocker 6 is answered by ruling 3, recorded append-only.
- The CSV row's evidence moves to the sprint-18 attestation once one exists. The sprint-1 attestation is never
  rewritten.
- ADR-086 gets a dated amendment listing #1040 and #1062 as detection paths, stating that the api is not yet in the
  Loki rule, and describing the dispatch workflow.

P6. api runtime impact, written into the PR body and ADR-086.
- **Idle api:** logs are written only inside a tRPC call (`middleware.ts:165-222`), and the batch timer starts only
  while records are buffered and is unref'd (`BatchLogRecordProcessorBase.js:228-257`). An idle api therefore sends no
  log traffic.
- **Metrics:** the NodeSDK's default metrics reader exports every 60 s whenever OTLP is on. That is pre-existing, not
  added here, and is stated as such.
- **Test:** NEW in `packages/observability`, using fake timers and the real BatchLogRecordProcessor, idle means zero
  pending timers, and after one record any timer is unref'd.
- **Volume:** about 0.3 KB per line and 1.5-2 lines per request. The PR body gives the formula against the 50 GB/month
  free-tier figure. The real request rate comes from span metrics after deploy (via the P3 workflow, or a reading of
  `traces_spanmetrics_calls_total{service="api"}`). A volume tripwire is finding F15, not fixed here.

P7. tenantId and userId on api records (Security R1, High).
- These keys are already in the 2026-10-22 consensus spec (`spec:177`, "added by the mixin").
- The lead proposes keeping tenantId (it scopes root cause to a tenant) and keeping userId out of the api request
  records: the trace already carries `user.id` in Tempo, and data minimisation favours not repeating it.
- Implementation: `apiLog` passes `userId: undefined`, overriding the mixin key. A test with a protectedProcedure log
  context asserts the exact key set.
- This is open to challenge.

## Files (proposed)
- MODIFY `tools/scripts/observability/collect-observability-evidence.mjs` (+ `.d.mts`) for P1, and its header for P3.
- MODIFY `tools/scripts/lib/grafana-provisioning.mjs`: `lokiInstantQuery` and the `datasourceProxy` uid check.
- MODIFY the tests `tools/scripts/__tests__/collect-observability-evidence.test.ts` (a Loki branch in `fakeGrafana`,
  with path assertions on `grafana.calls`) and `tools/scripts/lib/grafana-provisioning.test.ts`.
- NEW `.github/workflows/observability-evidence.yml`, plus a workflow-lint test if the repo has that pattern.
- MODIFY `apps/api/src/tracing/logger.ts` or `middleware.ts` (P7), and `middleware.test.ts`.
- NEW an idle-timer test in `packages/observability/src/` (P6).
- DOCS: `ADR-086` amendment, `IFC-074-owner-ruling.md` ruling 3, a spec addendum section, `task-tracking.json` append,
  findings F14 and F15 (gh issue + debt-ledger + findings doc).

## Runtime consumers
- The collector's Loki routing is called by `checkRepoRules`, which `main` runs (the collector CLI). In turn that is run by
  the new dispatch workflow (P3) or by the owner.
- `lokiInstantQuery` is called by `trueAtProbe`.
- The api logger change is called by `tracingMiddleware` on every tRPC procedure (`trpc.ts:102…598`).
