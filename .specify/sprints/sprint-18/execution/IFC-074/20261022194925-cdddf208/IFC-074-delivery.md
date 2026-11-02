# IFC-074 — Delivery Report (run 20261022194925-cdddf208)

**Task:** IFC-074 PHASE-040: Full Stack Observability · **Sprint:** 18 · **Branch:** `feat/ifc-074-ifc074`
**Spec:** `.specify/sprints/sprint-18/specifications/IFC-074-spec.md` (5/5 APPROVED) · **Plan:**
`.specify/sprints/sprint-18/planning/IFC-074-plan.md` (plan-reviewer APPROVE, iteration 3)
**Owner rulings:** `.specify/sprints/sprint-18/context/IFC-074/IFC-074-owner-ruling.md` — (1) option A, fix + real
evidence, row stays In Progress until a post-deploy collector run; (2) ship blocker #1000 fixed in a separate PR first.

**Outcome:** implementation and evidence delivered; **not complete**. AC-002 (api log/trace correlation in
production) needs the change merged and deployed, one real tRPC call, and a collector re-run. The MTTD KPI is
measured and **not met** (mean 268.7 s vs < 120 s).

## Commits (origin/main..HEAD)

| SHA | Subject |
|-----|---------|
| 5cbdc139a | docs(ifc-074): spec session for full stack observability rebuild |
| 7b5b9108e | docs(ifc-074): tdd execution plan for observability rebuild |
| 9593be8b0 | feat(observability): api request logs via pino to loki and a read-only evidence collector |
| c91095db7 | fix(observability): never let structured logging fail or alter a request |
| 7605b2be1 | fix(observability): remember a failed api logger build instead of retrying per request |
| 82281b414 | fix(observability): redact nested userEmail, accessToken, refreshToken and api_key |
| bcdfcbc76 | docs(ifc-074): truthful sentry config, docs, findings and regenerated evidence |
| 943a0f36b | fix(observability): pin logger level in record tests so they pass under the root config |

## What changed

- **api** — `apps/api/src/tracing/logger.ts` (new): lazy pino logger + guarded `apiLog()`;
  `apps/api/src/tracing/middleware.ts`: `trpc.request` / `trpc.slow` / `trpc.error` records via `apiLog`, emitted
  before `span.end()`, no error message/stack/cause/request id, allowlisted path and error name. Replaces the three
  `console.*` request logs. Runtime consumer: every tRPC procedure builder in `apps/api/src/trpc.ts`.
- **observability** — `createLogger` pino `redact` (top-level + nested credential/email keys). Tests: real-record,
  redaction, and an OTLP interop test proving instrumentation-pino exports the record with the active span's ids
  (CJS load path, as production). devDependencies `@opentelemetry/instrumentation-pino` 0.68.0,
  `@opentelemetry/sdk-logs` 0.219.0 (lockfile +6 lines).
- **tools** — GET-only Grafana read client with backoff (`tools/scripts/lib/grafana-provisioning.mjs`) and
  `tools/scripts/observability/collect-observability-evidence.mjs`: correlation (Loki → Tempo → span metrics) and
  MTTD (alert state history → earliest error span), allowlist-validated, fail-closed, atomic writes.
- **evidence** — `artifacts/reports/correlation-test.csv` and `artifacts/reports/mttr-baseline.json` regenerated
  from production (replacing hand-written / simulated files). `infra/monitoring/sentry-project-config.json`
  rewritten to the real wiring. Docs corrected; ADR-086 accepted; findings F1–F13 tracked (#987–#999).

## TDD log

| Step | RED (observed) | GREEN (observed) |
|------|----------------|------------------|
| 2 logging redact/real records | 19 failed (redact missing) | 30/30 after `redact` |
| 3 OTLP interop | ESM import not patched → rewrote to CJS load; characterisation PASS | 2/2 |
| 4 logger | 7/7 failed (module missing) | 7/7 |
| 5 middleware + trpc | 15 failed (logger module missing) | 70/70 tracing + trpc |
| 6 lib read helpers | 19 failed (helpers missing) | 28/28, then 30/30 (getRuleGroup) |
| 7 collector | file failed (module missing) | 49 → 51/51 |

## Evidence (production, read-only, 2026-10-22, final collector run at 82281b414)

| Item | Result | Source |
|------|--------|--------|
| ai-worker correlation | 10/10 PASS (trace in Tempo, span found, service match, span-metrics series) | `correlation-test.csv` sha256 `ae9a15d1…ffe8e` |
| api correlation | NOT_OBSERVED (api logs never reached Loki before this change) | same |
| Independent spot check | row 002: span found in Tempo (ai-worker), 1 Loki line with that trace_id | manual curl |
| MTTD | 223 transitions → 66 incidents, 63 anchored; mean 268.739 s, median 239.955 s, p90 359.275 s, 0 % < 120 s; KPI **not met** | `mttr-baseline.json` sha256 `3e33b48f…72f88` |
| Exclusions | IFC-032 delivery test ×1, asserts_up ×3 | same |

## Validation (commands actually run; logs in `logs/`)

| Check | Result | Log |
|-------|--------|-----|
| Typecheck observability / api | exit 0 / exit 0 | 18-*-typecheck.txt |
| Lint observability / api / tools files | exit 0 ×3 | 18-*-lint.txt, 18-tools-eslint.txt |
| observability full suite | 44/44 | 19-observability-test.txt |
| api full suite | 316 files, 7996 passed, 18 skipped | 19-api-test.txt |
| tools matrix (collector, lib, 2 sibling Grafana scripts) | 113/113 | 19-tools-test.txt |
| Build observability / api | exit 0 / exit 0 | 19-*-build.txt |
| pnpm test:coverage | all projects passed except observability (26 failures from `.env.test` LOG_LEVEL=error under the root config); fixed in 943a0f36b and re-run 44/44 under the root config with coverage; 5 projects below global thresholds with all tests passing (runner reports pre-existing debt) | 19-test-coverage-summary.txt, 19-observability-coverage-rerun.txt |
| diff-coverage | 92.5 % (collector 91.3, middleware 92.9, logger 95.7, lib 100) ≥ 80 % | 19-diff-coverage.txt |
| Codex semantic review | iter 1–3 FAIL (3 real defects fixed), iter 4 PASS (Claude fallback), iter 5 PASS (codex, full diff) | 19-codex-review-iter*.txt |
| gitleaks + host/email grep on evidence | clean / 0 hits | 12-collector-run.txt context |
| /code-review quick (api, observability) | 0 TS errors, 0 lint problems | `.specify/sprints/sprint-18/reports/code-review/20261022-2150*` |

## MATOP

STOA verdicts (`matop/stoa-verdicts/`): Automation PASS, Foundation PASS, Quality PASS (re-verified), Security
**FAIL** — solely `pnpm audit --audit-level=high` on main (#1000, pre-existing, not in this diff). Aggregate: FAIL
until #1000 lands (`matop/aggregate-verdict.json`).

## Acceptance criteria

| AC | Status |
|----|--------|
| AC-001 ai-worker correlation | MET (10/10 PASS) |
| AC-002 api correlation | **NEEDS_HUMAN** — deploy, one real tRPC call, collector `--since <deploy>` |
| AC-003 api pino records | MET (logger, middleware, logger-failure, OTLP interop tests) |
| AC-004 MTTD measured from real transitions | MET (measured; KPI value not met) |
| AC-005 root cause identifiable | MET for ai-worker (first error trace + span name per anchored incident); api post-deploy |
| AC-006 Sentry config truthful | MET |
| AC-007 fabricated entries removed | MET (task-tracking KPIs measured, blockers 1–3 resolved with hashes) |
| AC-008 ADR + docs | MET (ADR-086 accepted, docs + chains corrected) |
| AC-009 row stays In Progress | MET |

## Deviations from the plan (recorded)

- Step 3's interop test loads `logging.ts` through Node's CJS loader (vitest's ESM import of pino bypasses the CJS
  require hook); the loader became a shared test helper (`packages/observability/src/test-utils/`, excluded from
  the package tsconfig like test files).
- Step 6 wording: the read client has no method parameter, so "a non-GET use throws" became "only ever issues GET".
- Step 16 path: task-tracking.json moved from sprint-1 to sprint-18 (row Target Sprint 18), same as IFC-032.
- Codex review added the guarded `apiLog()` and remembered-failure behaviour (not in the plan; real defects).
- Hand-typed timestamps in early tracking entries were corrected to tool-derived times before commit.

## Not done / follow-ups

- AC-002 post-deploy collector run (owner deploy).
- #1000 dependency fix: separate branch `fix/1000-audit-criticals` (ad3b1fb35), owner ruling 2.
- F1–F13 (#987–#999); MTTD target vs detection tuning is the owner's call.
