# IFC-074: delivery report, 2026-10-29 addendum

**Run:** `20261029-addendum`

**Branch:** `agent/IFC-074-observability`, which is origin/main `9e378fbb0` (#1062) plus the 2026-10-22 commits,
cherry-picked. The old `feat/ifc-074-ifc074` branch is kept.

**Status:** code complete for the addendum. The MTTD KPI is not demonstrated (AC-013, NEEDS_HUMAN, post-deploy).
Not pushed yet: pre-ship and the push wait for the coordinator's slot GO.

**Inputs:**
- spec addendum: `specifications/IFC-074-spec.md`, from "Addendum, 2026-10-29" on;
- plan addendum: `planning/IFC-074-plan.md`, steps A1-A14, approved by the plan-reviewer subagent on iteration 3;
- owner rulings 3 and 4: `context/IFC-074/IFC-074-owner-ruling.md`.

## Preflight
`logs/preflight.txt`. All checks exit 0 except Gate 4b, which blocks with "branch not yet pushed".

The push is the runner's step after pre-ship, as in PG-204, PG-205 and PG-207. Gate 4b is re-run in A14 after the push.

## Commits (addendum)

| Commit | Step | What |
|--------|------|------|
| `5aa92bc64` | spec | Spec addendum, 5/5 consensus |
| `7dea5067e` | spec | Owner ruling 4, D4 superseded, D7-D9, AC-012 (new), AC-016 |
| `abce7dfaf` | plan | Plan A1-A14 (reviewer: REVISE, REVISE, APPROVE) |
| `b1ec09b6f` | A1, A2, A6, A7 | Collector reads each repo rule through its own datasource; `datasourceProxy` uid check; schema 2.3.0 |
| `63a78bc1a` | A3, A8 | "MTTD per error episode (live proxy)" panel; per-datasource dashboard validator |
| `ea2a117b8` | A4, A9 | KPI `source` (Zod + generator fragment); IFC-074 KPIs `met: false`, caveated `mttd_target.actual` |
| `09efaeaef` | A5 | Real-pino key-set test for api request records |
| `4e0b81407` | A10, A11 | ADR-086 amendment; F14-F18 gh issues #1067-#1071, ledger and findings; F19 in the ledger only |

## TDD log
`logs/a-red.txt` holds the RED output, captured before each GREEN step:
- A1: 10 failing;
- A2: 5 failing;
- A3: 9 failing;
- A4: 4 failing.

A5 is a characterisation test: it documents existing behaviour (D5 keeps both keys).

Mutation checks (`logs/mutations-a1-a2.txt`, `logs/mutations-a3-a8.txt`): 9 of 9 mutants killed.
- Collector and lib (6):
  - Loki routed through Prometheus;
  - step 60 dropped;
  - `service` instead of `service_name`;
  - transition `service_name` fallback removed;
  - unknown datasource treated as Prometheus;
  - uid regex removed.
- Dashboard validator (3):
  - unknown datasource accepted;
  - any Loki stream accepted;
  - Loki target checked as PromQL.

## Acceptance criteria (addendum)

| AC | Status | Evidence |
|----|--------|----------|
| AC-010 Loki rule routed to the logs datasource, `step=60`, unknown uid gives `not_checked` | MET | `collect-observability-evidence.test.ts`, "a repo rule on the Loki datasource" (10 tests). The fake is strict per datasource uid, and the tests assert paths and query params. |
| AC-011 `service_name` anchoring, unlabelled Loki series, uid rejection, schema 2.3.0 | MET | the same suite, plus `grafana-provisioning.test.ts` (uid it.each); the regression test keeps the span-rule episode anchored |
| AC-012 KPI `source` in the schema; `met: false`; cache **kpis subtree** valid | MET (narrowed) | `task-status-kpi-schema.test.ts` (8); `logs/a9-cache-kpi-check.txt`: 0 KPI errors under Ajv and Zod. The rest of the cache is not claimed valid (F17). |
| AC-013 per-episode MTTD < 120 s over ≥72 h or ≥10 real error episodes | NEEDS_HUMAN | Post-deploy; Aurora's local collector run, then the task KPI |
| AC-014 supersession, non-comparability, model labels, expected api miss, runtime impact | MET (docs) | spec addendum, ADR-086 amendment; the PR body follows in A14 |
| AC-015 exact key set of a request record | MET | `packages/observability/src/logging.test.ts` (2 new tests) |
| AC-016 panel and validator | MET pre-merge | `apply-grafana-dashboard.test.ts` (31). The post-merge apply is the live check, and the LogQL is unproven until then. |

AC-002 and AC-009, and task-tracking blockers 4 and 5, stay open. Ruling 3 answers the tuning half of blocker 6.

## Validation (commands actually run in this session)

| Check | Command | Result |
|-------|---------|--------|
| Collector + lib + alert-rules | `npx vitest run --project root tools/scripts/__tests__/collect-observability-evidence.test.ts tools/scripts/lib/grafana-provisioning.test.ts tools/scripts/__tests__/apply-grafana-alert-rules.test.ts` | 176/176 |
| Dashboard | `npx vitest run --project root tools/scripts/__tests__/apply-grafana-dashboard.test.ts` | 31/31 (re-run after the $__interval fix) |
| KPI schema | `npx vitest run --project root tools/scripts/__tests__/task-status-kpi-schema.test.ts` | 8/8 |
| Observability package (full) | `node with-slot.mjs --label IFC-074 -- pnpm --filter @intelliflow/observability test` | 46/46 (4 files) |
| Typecheck (all) | `node with-slot.mjs --label IFC-074 -- pnpm run typecheck` | 40/40 turbo tasks; sonar-guard skipped (no TS/TSX changed) (`logs/typecheck.txt`) |
| Lint | `npx eslint` on every changed `.mjs`/`.ts` | 0 problems |
| Format | `npx prettier --check` on changed files | clean |
| Codex review ×2 | `node scripts/codex-review.mjs --base=origin/main` | PASS, 0 findings, both runs (`logs/codex-review-{1,2}.txt`); 11 of 84 files in scope |
| Independent review of tools/infra | general-purpose subagent | see the section below |

Codex reviews only 11 of the 84 changed files, because its scope excludes `tools/` and `infra/`. The collector,
dashboard and schema code was therefore reviewed separately.

Not run here:
- Pre-ship (the coordinator's slot GO, behind PG-203 and PG-208).
- The `grafana-dashboard.yml` dry run. It can only be dispatched on a pushed branch, and it would only check that the
  config is valid and that the dashboard exists. It runs after the push.

## Independent review (tools/ and infra/, outside codex scope)

A general-purpose subagent reviewed commits `b1ec09b6f`, `63a78bc1a`, `ea2a117b8` and `09efaeaef` by reading the code.
It ran no tests and queried no live backend, and found no defects. It checked and confirmed:
- Loki ns and second units;
- the `(expr) > 0` LogQL validity;
- the label and anchoring logic;
- no regression on the Prometheus path;
- the uid path-injection guard;
- the panel's LogQL field names against the state-history lines the collector parses;
- that the key-set tests would fail on a leak.

It flagged one thing it could not confirm without a live Loki: a `start == end` probe. Loki rejects only `end < start`.

It made two low-severity observations:
1. **The panel undersampled wide time ranges** because its `[1m]` windows were fixed. **Fixed:** all three targets now use
   `[$__interval]`, the panel minimum interval is `1m`, and tests were added.
2. **Lookback windows differ.** The Loki condition looks back 6 h and the Prometheus one 3 days. **Kept** by design.
   `lookback_s` is reported beside the counts, and the `.d.mts` documents it.

## Deviations from the plan
- **Spec D1:** the `intelliflow-ai-worker` alias was dropped on later evidence. The coordinator's live check
  (2026-10-29) found that the combined worker runs with `OTEL_SERVICE_NAME=ai-worker`, and that Tempo, span metrics and
  Loki list only `ai-worker` and `api`; this was relayed, and no evidence file is committed. The 2026-10-29 sign-offs'
  alias condition (Backend-Architect, Test-Engineer) is therefore dropped.
- **A4:** the JSON half of the schema test reads the generated KPI object structurally rather than through Ajv.
  The cache check in `logs/a9-cache-kpi-check.txt` does use Ajv, together with Zod.
- **A9:** `pnpm generate:schemas` rewrote all 11 schema files (Zod drift, F18). The coordinator restored them, and
  only the generator's exact `source` fragment was added.
- **A5:** `packages/observability/src/test-utils/load-logging-cjs.ts` gained a loader that bundles `createLogger` and
  `runWithLogContext` together (log-context keeps its AsyncLocalStorage per module). That is one more modified file.
- **A11:** the findings went into the existing `.specify/sprints/sprint-18/findings/IFC-074-findings.md`, not a new
  run-directory `findings.md`. That is one fewer created file.
- **Worktree install:** after the cherry-pick, `pnpm install --frozen-lockfile` was needed to link the 2026-10-22
  devDependencies (`@opentelemetry/sdk-logs`, `instrumentation-pino`).

## Runtime impact on the api (condition 3; accepted by the coordinator)
- api log records are written only inside tRPC calls (`apps/api/src/tracing/middleware.ts`): one `info` per call, plus
  one `warn` when slower than 50 ms.
- `@opentelemetry/sdk-logs` 0.219.0 `BatchLogRecordProcessorBase._maybeStartTimer` (`:228-257`) arms its timer only
  while records are buffered, and unrefs it. So these logs add no outbound traffic to an idle api.
- Live (coordinator, 2026-10-29): the api deployment is SLEEPING, and Grafana has no api OTel metric series. The
  pre-existing metrics reader would matter only if metrics export were enabled (F19).
- Volume: about 1-2 lines per request at a few hundred bytes. This is an estimate. There is no tripwire yet (F15).

## Findings
F14-F19: see `.specify/sprints/sprint-18/findings/IFC-074-findings.md`, the "Addendum 2026-10-29" section.
