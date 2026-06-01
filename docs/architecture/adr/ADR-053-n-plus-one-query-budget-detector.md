# ADR-053: Request-Scoped N+1 Query-Budget Detector

**Status:** Accepted

**Date:** 2026-05-29 (proposed) · 2026-05-30 (accepted — implemented + validated
under IFC-314)

**Deciders:** Backend Lead, Data Engineer (STOA-Domain), DevOps Lead. Ratified
at exec-time: detector shipped in `packages/db/src/query-budget/`, static
scanner + CI baseline in `tools/scripts/`, and the full N+1 remediation
validated green across all packages (~17,700 tests). See
`docs/operations/nplus1-audit/NPLUS1_REMEDIATION_REPORT.md`.

**Technical Story:** N+1 query remediation initiative (Phase 0 audit:
[`docs/operations/nplus1-audit/NPLUS1_AUDIT.md`](../../operations/nplus1-audit/NPLUS1_AUDIT.md),
findings:
[`nplus1-findings.json`](../../operations/nplus1-audit/nplus1-findings.json)).

> **ℹ️ Complements the existing query observability.**
> `packages/db/src/client.ts` already has a `$on('query')`
> `QueryPerformanceTracker` (per-query latency, dev-only) and
> `packages/observability/src/metrics.ts` declares
> `intelliflow.db.query.count`/`.duration` instruments. ADR-053 does **not**
> replace either — it adds a **request-scoped count + budget** dimension and
> finally wires the declared `intelliflow.db.query.count` metric to the Prisma
> layer.

## Context and Problem Statement

The Phase 0 audit catalogued **35 confirmed Critical/High/Medium N+1 (or
sequential-per-element DB) patterns** across tRPC procedures, server actions,
and background jobs. The repo has **no mechanism to detect query-count
regressions** — per-query latency is tracked, but nobody measures "this request
issued N queries", and no test can assert a query-count ceiling. New N+1s
therefore ship undetected until they degrade production.

We need a detector that:

1. counts all Prisma operations within a request/job and compares against a
   budget;
2. **observes/reports only** in production initially (never blocks requests);
3. lets **tests assert** query counts (so each remediation gets a regression
   test);
4. gives **developers actionable dev-time signal**;
5. preserves the **hexagonal boundary** — `domain`/`application` must not gain a
   dependency on Prisma, Next.js, HTTP, or observability;
6. uses **modern Prisma Client query extensions**, not deprecated `$use`
   middleware.

## Decision Drivers

- **Hexagonal purity:** `grep` confirms `packages/domain/src/**` has zero
  Prisma/db/Next imports today. The detector must keep it that way.
- **Layer reachability:** `packages/db` is the lowest layer and **cannot import
  `apps/api`**, so it cannot reuse the API's existing `AsyncLocalStorage`
  correlation store (`apps/api/src/tracing/correlation.ts`) directly. The
  query-budget store must live where the Prisma extension lives.
- **Established seams:** `tracingMiddleware` already wraps **every** tRPC
  procedure in `runWithContext(...)`; ai-worker jobs already run inside
  `tenantContextStore.run(...)`. These are the natural seeding points.
- **Prisma 7 reality:** the client is already `$extends`-wrapped (field
  encryption). The detector must **compose**, and order so it counts encrypted
  ops too.
- **Safety:** must never throw in production initially; must never crash
  background jobs, seeds, migrations, or scripts (missing context = no-op).
- **No threshold-gaming:** over-budget is fixed by batching the query, not by
  raising the budget — except for explicitly justified, documented per-route
  overrides.

## Considered Options

- **Option 1 — Prisma Client `$allOperations` query extension + a `packages/db`
  request-scoped `AsyncLocalStorage` budget store, seeded by the API tRPC
  middleware and worker job entry. Observe/report by default; throw only in
  test.** _(chosen)_
- **Option 2 — Deprecated `prisma.$use(...)` middleware.** Rejected: `$use` is
  legacy/deprecated in Prisma 7's client-engine model and does not compose
  cleanly with `$extends`; the brief explicitly prefers query extensions.
- **Option 3 — OpenTelemetry span counting only** (count
  `prisma`-instrumentation spans per trace). Rejected as the _primary_
  mechanism: no test-mode assertion hook, no per-route budget, and couples
  detection to the OTel exporter being enabled. (We still emit OTel metrics as a
  _secondary_ output.)
- **Option 4 — Reuse the API correlation ALS for the counter.** Rejected: it
  lives in `apps/api`; `packages/db` cannot depend upward without inverting the
  dependency graph.
- **Option 5 — `proxy.ts` as the query counter.** Rejected and explicitly out of
  scope per the brief: `proxy.ts` is for request-ID propagation and boundary
  metadata only; it cannot see Prisma operations (which run in
  `apps/api`/workers, not in the Next proxy).

## Decision Outcome

**Chosen: Option 1.** New infra-only module `packages/db/src/query-budget/`:

| File           | Responsibility                                                                                                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `context.ts`   | `AsyncLocalStorage<QueryBudgetStore>` + `runWithQueryBudget(meta, fn)`, `getQueryBudgetStore()`, `recordQuery(model, action, durationMs)`. `meta` carries `requestId`, `route`, `method`, `queryBudget`, `context: 'request' \| 'background' \| 'unknown'`.                                                  |
| `config.ts`    | Default budget **15**; per-route overrides map (justification required); mode resolver `off \| observe \| throw` (prod→observe, test→throw, dev→observe+headers).                                                                                                                                            |
| `extension.ts` | `prisma.$extends({ query: { $allOperations({model, operation, args, query}) } })` — increments the active store, records `{model, action, durationMs, callerFingerprint, repeatedQueryFingerprint}`, and on over-budget invokes the reporter (and throws iff mode==='throw'). No-op when no store is active. |
| `reporter.ts`  | Structured over-budget event (logger + OTel `metricHelpers.recordDatabaseQuery`); dev-only `x-query-count`/`x-query-budget`/`x-query-exceeded` headers where the response is controllable.                                                                                                                   |

**Composition** (`packages/db/src/client.ts`): apply the query-budget extension
**after** `fieldEncryptionExtension` so every operation — including encrypted
models — is counted.

**Seeding** (no domain/app changes):

- `apps/api/src/tracing/middleware.ts` (already wraps all procedures) → nest
  `runWithQueryBudget({ requestId: getRequestId(), route: 'trpc.'+type+'.'+path, method: type, context:'request', queryBudget: budgetFor(path) }, ...)`.
- ai-worker / workers job entry →
  `runWithQueryBudget({ context:'background', route: jobName, queryBudget: ∞-or-large }, ...)`
  — counted, reported, **never throws**.
- `apps/web/proxy.ts` → inject `x-request-id` (boundary metadata only; not a
  counter).

**Modes:** `observe` (report-only) is the default in **every** environment —
including test — so the live detector never throws inside the general test suite
or blocks a production request. `throw` is strictly opt-in via
`QUERY_BUDGET_MODE=throw` (e.g. a dedicated CI guard job). Dev additionally
surfaces `x-query-*` response headers + an actionable console warning.
Background context never throws. Missing context is a silent no-op (protects
seeds/migrations/scripts). N+1 regression tests assert query COUNT via
`measureQueries` (budget = `Infinity`, never throws) — proving non-linear growth
without depending on the guard firing.

**Escape hatch:** a documented per-route budget override in `config.ts` (e.g.
the activity-feed unified view legitimately queries ≤7 source tables). Overrides
require an inline justification comment and a test asserting the documented
count — they are the _only_ sanctioned way to exceed the default, and raising a
budget to mask an unfixed N+1 is prohibited.

### Positive consequences

- Query-count regressions become a **first-class, testable** signal; each Phase
  4 batch ships a regression test that fails on the old code.
- Wires the orphaned `intelliflow.db.query.count` OTel metric to real data.
- Zero domain/application coupling; additive and backwards-compatible.
- Modern, composable Prisma extension — no deprecated `$use`.

### Negative consequences / risks

- Small per-operation overhead (an ALS lookup + counter increment). Mitigated:
  O(1), and the store is absent (no-op) outside seeded contexts.
- Stack-fingerprint capture has a cost → gate it behind dev/test or sampling in
  prod.
- A second ALS store alongside `correlation.ts` and `log-context.ts`. Accepted:
  it is purpose-scoped and lives in the correct (db) layer; a future
  consolidation is possible but not required.
- `$transaction` interactive callbacks: operations inside `tx` must also be
  counted — verified against the extension's `$allOperations` coverage in tests.

## Validation / tests (Phase 2 acceptance)

`tests/integration/query-budget/*`: counter increments; **context isolation
between concurrent requests**; over-budget reported; under-budget ignored;
**background execution never throws**; **missing context never crashes**;
transaction ops counted; extension composes with field encryption.

## Links

- Audit: `docs/operations/nplus1-audit/NPLUS1_AUDIT.md` · Findings:
  `docs/operations/nplus1-audit/nplus1-findings.json`
- Related: ADR-047 (hexagonal architecture), ADR-032
  (feature-flags/performance), ADR-018 (performance & load testing).
