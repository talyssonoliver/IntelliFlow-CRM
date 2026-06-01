# N+1 Query Remediation — Phase 0 Audit

**Status:** Phase 0 complete (read-only). No code patched. **Date:** 2026-05-29
**Scope:** Whole monorepo — `apps/{web,api,ai-worker,workers}`,
`packages/{adapters,application,db,domain,webhooks}`. **Stack:** Next.js 16.2
(`apps/web/proxy.ts`), Prisma **7.4.2** (`@prisma/adapter-pg`,
`engineType=client`), Postgres/Supabase, tRPC, hexagonal architecture.
**Method:** Multi-agent audit — 14 bounded-context readers + 3 infra-inventory
sweeps + adversarial verification of every Critical/High finding + a
completeness critic (61 agents, ~2.9M tokens). Machine-readable results:
[`nplus1-findings.json`](./nplus1-findings.json).

> Companion documents (to be produced in later phases): ADR-053 (detector
> decision — **Proposed**, see
> `docs/architecture/adr/ADR-053-n-plus-one-query-budget-detector.md`), and
> `NPLUS1_REMEDIATION_REPORT.md` (final, Phase 5).

---

## 1. Executive summary

- **56 distinct patterns** catalogued after adversarial verification and
  de-duplication: **1 Critical, 10 High, 24 Medium, 21 Low**, plus **7 verified
  false positives** documented so they are not re-flagged.
- The adversarial pass did real work — it demoted several raw-scanner "Critical"
  hits that were **not** N+1s: an in-memory `.filter()` over a single
  `findMany`, `Promise.all` over fixed enum/array widths, time-series fan-outs
  bounded by router caps, and bulk endpoints already hard-capped by Zod
  `.max(100)`.
- **The single Critical** is `ExperimentService.listExperiments` — a `3N+1` on
  the user-facing experiments-list tRPC query with **no pagination**.
- The **completeness critic found a glob gap**: the entire `apps/workers/`
  subtree (events-worker `scheduled-jobs.ts` — 5 batched-loop hotspots) plus
  `case-deadline-monitor.job.ts` and `memory-retention.job.ts` were outside the
  initial scan globs. These are now included (NP-008..NP-011, NP-029..NP-033).
- **Hexagonal boundary is clean**: `grep` for
  `prisma | @intelliflow/db | @prisma/client` across `packages/domain/src/**`
  returned **zero** matches. The detector design preserves this.
- **No new unsafe raw SQL** is required. Three existing `$queryRawUnsafe` sites
  are allowlist-guarded but interpolated (flagged in §7).

---

## 2. Infrastructure inventory (detector-relevant)

### 2.1 Prisma client

- **Canonical singleton:** `packages/db/src/client.ts` → `export const prisma`
  (via `createPrismaClient()` + `globalThis.__prisma` hot-reload guard). All
  consumers import from `@intelliflow/db`.
- Already composes a `$extends(fieldEncryptionExtension)` (AES-256-GCM) and a
  `$on('query')` listener feeding an in-memory `QueryPerformanceTracker` (active
  in dev / `TRACK_QUERY_PERFORMANCE=true`; warns on >20 ms queries).
- **Direct `new PrismaClient` sites** (all adapter-correct):
  `apps/workers/events-worker/src/main.ts` (outbox), seeds, `tools/scripts/*`.
  Legacy test paths (`tests/integration/setup.ts`,
  `apps/api/src/test/integration-setup.ts`, `file-ingestion.e2e.test.ts`) still
  use the **Prisma 5** `datasources.db.url` form without an adapter — out of
  scope here but noted.

### 2.2 Request context — **two AsyncLocalStorage stores already exist**

- `apps/api/src/tracing/correlation.ts` — `AsyncLocalStorage<RequestContext>`
  (`correlationId`, `requestId`, `userId`, `startTime`). Seeded by
  `tracingMiddleware` (`apps/api/src/tracing/middleware.ts`), applied to **all**
  tRPC procedures.
- `packages/observability/src/log-context.ts` —
  `AsyncLocalStorage<LogRequestContext>` (pino mixin), seeded by
  `logContextMiddleware` in `apps/api/src/trpc.ts`.
- `apps/ai-worker/src/tracing/tenant-context.ts` —
  `AsyncLocalStorage<{tenantId}>` seeded at BullMQ job entry.
- **This is the key enabler:** the query-budget detector plugs into an
  established ALS + tRPC-middleware seam rather than inventing a new propagation
  mechanism.

### 2.3 Metrics already declared but **not wired**

- `packages/observability/src/metrics.ts` declares `intelliflow.db.query.count`
  and `intelliflow.db.query.duration` instruments and a
  `metricHelpers.recordDatabaseQuery` helper — but **nothing calls it from the
  Prisma layer**. The detector extension is the natural place to wire it.

### 2.4 Existing DB-access tests / query counters

- No test counts real SQL round-trips via a `$on('query')` spy. The closest
  existing query-count assertions: `PrismaActivityFeedRepository.stats.test.ts`
  (`$queryRaw` called once — UNION ALL), `PrismaAnalyticsRepository.test.ts`,
  `PrismaExperimentRepository.test.ts` (`count` ×2).
  `packages/db/src/__tests__/query-performance.test.ts` tests the tracker in
  isolation (no DB). **There is no harness today to assert "this request issued
  ≤ N queries"** — the detector must provide one for test mode.

### 2.5 `proxy.ts`

- `apps/web/proxy.ts` propagates `x-user-id/email/role` + a CSP `x-nonce`, but
  **does not inject a correlation/request ID**. The security middleware mints a
  separate `req_<ts>_<rand>` id disconnected from the crypto-UUID
  `correlation.ts` system. Phase 1 adds `x-request-id` propagation in `proxy.ts`
  for boundary metadata (per the brief: _proxy is for correlation + boundary
  metadata, not the query counter_).

---

## 3. Route-to-query map (entry point → query growth)

| Entry point                                                          | Path                         | Growth                        | Bound                   | Severity     | Finding                    |
| -------------------------------------------------------------------- | ---------------------------- | ----------------------------- | ----------------------- | ------------ | -------------------------- |
| `experiment.list`                                                    | tRPC query                   | **3N+1**                      | none (no pagination)    | **Critical** | NP-001                     |
| `lead.bulkScore`                                                     | tRPC mutation                | 2N DB + N AI                  | none (`.max()` missing) | High         | NP-002                     |
| `feedback.exportTrainingData`                                        | tRPC mutation                | N+1                           | date-range (none)       | High         | NP-003                     |
| `contact.bulkDelete`                                                 | tRPC mutation                | 2N                            | `.max(100)`             | Medium       | NP-012                     |
| `account.bulkReassign`                                               | tRPC mutation                | ≤3N                           | `.max(100)`             | Medium       | NP-013                     |
| `legal.documents.bulkDownload/Archive/Delete`                        | tRPC mutation                | 1–2N                          | `.max(100)`             | Medium/Low   | NP-014/037/038             |
| `home.getAIInsights` / `getAllInsights`                              | tRPC query (fire-and-forget) | ≤150 serial tx                | `take` 2–50             | Medium       | NP-015/016/041             |
| `autoresponse.getStatsByStatus`                                      | tRPC query                   | 8 counts                      | fixed 8                 | Low          | NP-043                     |
| `task.create/update`                                                 | tRPC mutation                | 3 serial finds                | fixed 3                 | Medium       | NP-035                     |
| `analytics.exportMetrics`                                            | tRPC mutation                | metrics×months serial         | metrics≤4               | Medium       | NP-023                     |
| `/deals` bulk action                                                 | web → N tRPC mutations       | N HTTP + N writes             | page selection          | Medium       | NP-024/025                 |
| `*.settings` required-field/stage/rule save                          | tRPC mutation                | N upserts                     | user-supplied / enum    | Medium/Low   | NP-026/027/028/036/048/056 |
| module-entitlement check                                             | tRPC (`getTenantPlan`)       | 2 queries + load all user ids | n/a                     | Low          | NP-049                     |
| **Background — insight-generation**                                  | BullMQ                       | O(tenants)×~6                 | unbounded tenants       | High         | NP-005/006                 |
| **Background — ticket SLA monitor / auto-close**                     | BullMQ (5 min)               | O(tenants)                    | unbounded tenants       | High/Low     | NP-007/039                 |
| **Background — case-deadline-monitor**                               | BullMQ                       | O(tenants)+O(cases)           | unbounded               | High         | NP-010/011                 |
| **Background — events-worker scheduled-jobs**                        | BullMQ                       | 2N per sweep ×5 jobs          | take 30/50              | High/Medium  | NP-008/009/029–032         |
| **Background — AutoResponse.processExpiredDrafts**                   | scheduler                    | N writes                      | unbounded               | High         | NP-004                     |
| **Background — NotificationService.processScheduled/Retries**        | scheduler                    | ≤200                          | take 100                | Medium/Low   | NP-019/040                 |
| **Background — account-scoring / entity-insight / memory-retention** | BullMQ                       | O(tenants)                    | unbounded               | Medium       | NP-017/018/033             |

---

## 4. Severity ranking (post-verification)

**Critical (1)** — fix first; user-facing, unbounded:

- **NP-001** `ExperimentService.listExperiments` — 3N+1, no pagination.

**High (10)** — unbounded growth (request paths NP-002/003; background
NP-004..NP-011): NP-002 `lead.bulkScore`, NP-003 `feedback.exportTrainingData`,
NP-004 `processExpiredDrafts`, NP-005/006 `insight-generation` per-tenant,
NP-007 `ticket-sla-monitor` per-tenant, NP-008/009 events-worker SLA loops,
NP-010/011 `case-deadline-monitor`.

**Medium (24)** — real but bounded by Zod `.max(100)` / `take` / fixed enums, or
latent (no caller): NP-012..NP-035 (see JSON).

**Low (21)** — fixed-arity fan-outs, small-enum in-tx upserts, port loops,
intentional pagination, idempotency loops: NP-036..NP-056.

**Verified false positives (7)** — documented to prevent re-flagging (lead stats
in-memory filter, analytics time-series buckets, already-batched
insight/topPerformer paths, RFC-bounded recipient loop, `saveAll` bulk-write).
See JSON `verifiedFalsePositives`.

---

## 5. Detector architecture (Phase 1 — proposed, mapped to this repo)

Design goal: a request-scoped query-budget detector that **observes and
reports** (never blocks in prod initially), preserves hexagonal boundaries, and
gives tests an assertable query count. Decision recorded in **ADR-053**.

```
apps/web/proxy.ts ── injects x-request-id (boundary metadata only)
        │
apps/api tracingMiddleware ─ seeds query-budget ALS  ┐
ai-worker job entry ─ seeds ALS as { context:'background' } ┤
        │                                                   │
        ▼                                                   ▼
packages/db/src/query-budget/context.ts   ← AsyncLocalStorage<QueryBudgetStore>  (infra layer)
packages/db/src/query-budget/config.ts    ← default budget 15 + per-route overrides + mode
packages/db/src/query-budget/extension.ts ← prisma.$extends({ query:{ $allOperations } })
packages/db/src/query-budget/reporter.ts  ← structured over-budget events + dev headers/logs
        │
packages/db/src/client.ts  ← compose extension AFTER fieldEncryptionExtension
```

**Why `packages/db` for the ALS + extension:** `packages/db` is the lowest infra
layer; it cannot import `apps/api`, so it cannot reuse the API's correlation ALS
directly. The query-budget store therefore lives in `packages/db` and is
_seeded_ by the API middleware / worker entry. `domain` and `application` never
import it — boundary preserved. The extension uses Prisma Client
**`$allOperations` query extensions** (the modern replacement for deprecated
`$use` middleware), composed _after_ the field-encryption `$extends` so it
counts every operation.

**Per-operation event shape** (emitted by the extension): `requestId`,
`route/pathname`, `method`, `model`, `action`, `durationMs`, `queryCount`,
`queryBudget`, `exceeded`, `callerFingerprint` (top app-frame of the stack),
`repeatedQueryFingerprint` (model+action+arg-shape hash, to spotlight N+1
specifically), `timestamp`, `environment`,
`context: request | background | unknown`.

**Modes** (`query-budget.config.ts`): `off | observe | throw`. Default
**observe** (report-only) in **every** environment — including test — emitting a
warn-only structured log + OTel `intelliflow.db.query.count`, plus
`x-query-count`/`x-query-budget`/`x-query-exceeded` response headers in dev.
`throw` is strictly **opt-in** via `QUERY_BUDGET_MODE=throw` (a dedicated CI
guard job) so the live detector never breaks unrelated integration tests or
blocks a production request. **Background** context is counted and reported but
**never throws**, and missing context is a no-op (must not crash
seeds/scripts/migrations). N+1 regression tests assert query **count** via
`measureQueries` (budget = `Infinity`).

**Budgets:** default **15** queries/request; per-route overrides only with
written justification (e.g. activity-feed unified view legitimately fans out to
≤7 sources → documented override, not a blanket raise). The brief's rule holds:
**do not silence the detector by raising thresholds** except for explicitly
justified routes.

**Tests the detector must ship** (`tests/integration/query-budget/*`): counter
increments; context isolated between concurrent requests (interleaved
`AsyncLocalStorage.run`); over-budget request reported; under-budget ignored;
background execution does not throw; missing context does not crash.

---

## 6. Static scanner (Phase 3 — proposed)

- `tools/scripts/nplus1-scan.mjs` (matches repo `tools/scripts/` convention),
  AST-based (`ts-morph` if available, else high-confidence regex fallback),
  detecting: `await prisma.*`/repo/`tx.` inside
  `for`/`for…of`/`for await`/`while`; Prisma/repo calls inside
  `.map`/`.flatMap`/`.reduce`/`.forEach`;
  `Promise.all(collection.map(…prisma…))`; nested per-row calls after a parent
  `findMany`; repeated `findUnique`-by-id in iteration.
- Output per match: `file`, `line`, inferred `model.action`, `patternType`,
  `severity`, `suggestedBatchingStrategy`.
- **CI guard:** fail on **new** high-confidence violations; existing ones
  baselined in `tools/scripts/nplus1-baseline.json` (owner: Backend Dev /
  STOA-Domain). The baseline shrinks as batches land. (Wires into the existing
  audit-ratchet pattern, e.g. PR #102.)
- **Implemented (B0c):** AST-based scanner via the TypeScript compiler API
  (`tools/scripts/nplus1-scan.mjs`). Baseline captured **43 sites / 62
  signatures**. Run with `pnpm nplus1:scan` (exit 1 on any net-new signature)
  and `pnpm nplus1:scan:update` to re-baseline after a batch removes sites. **CI
  integration:** add a `pnpm nplus1:scan` step to the quality/PR-checks workflow
  (non-`continue-on-error`) — it is line-drift-resistant (signatures keyed by
  `file::pattern::receiver.action`, not line numbers).

---

## 7. Raw SQL note (existing, allowlist-guarded but interpolated)

Not introduced by this work, flagged for the security reviewer; any
recursive-CTE remediation (NP-020/021, account ancestors) **must** use
parameterised `Prisma.sql` templates + tests:

- `apps/api/src/security/tenant-context.ts:154` —
  `SET app.current_tenant_id = '${tenantId}'` → recommend
  `set_config($1,$2,true)` bound form.
- `packages/adapters/.../PrismaFeedbackSurveyRepository.ts:136,184` —
  `granularity`/`typeFilter` interpolated after Set allowlist; primary args
  already positional.

---

## 8. Remediation batch plan (Phase 4 — by bounded context)

Each batch ≤ ~10 findings, one bounded context, TDD: **(1)** add a query-count
regression test that fails on the current code, **(2)** apply the smallest safe
batch-query refactor preserving ordering / null semantics / tenancy /
authorization, **(3)** run the full gate (typecheck, lint, unit, integration,
query-budget, scanner, build), **(4)** write a batch report. Preserve order
explicitly after `findMany({id:{in:dedup(ids)}})`; dedupe ids; paginate before
relation loading.

| Batch  | Context                                                                           | Findings                                                               | Public-contract impact                                                             |
| ------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **B0** | Detector + ADR-053 + static scanner (Phases 1–3)                                  | infra                                                                  | none (additive)                                                                    |
| **B1** | Bulk tRPC reads/writes (lead/contact/account/task services)                       | NP-002, NP-012, NP-013, NP-022                                         | NP-002 needs a `.max()` input cap (documented)                                     |
| **B2** | Deal bulk operations                                                              | NP-024, NP-025                                                         | **API addition** — new `opportunity.bulkUpdateStage`/`bulkDelete` (needs sign-off) |
| **B3** | Settings replace-pattern (required-fields/stages/rules → deleteMany+createMany)   | NP-026, NP-027, NP-028, NP-036, NP-048, NP-056                         | none (behaviour-preserving)                                                        |
| **B4** | Home + analytics dashboards                                                       | NP-015, NP-016, NP-023, NP-041                                         | none                                                                               |
| **B5** | Legal documents + case-document version chains                                    | NP-014, NP-020, NP-021, NP-037, NP-038                                 | none; introduces parameterised recursive CTE (review)                              |
| **B6** | AI / intelligence (Experiment, Feedback, agent store, insight dedup)              | **NP-001**, NP-003, NP-034, NP-042                                     | none                                                                               |
| **B7** | Background jobs (workers + ai-worker jobs + notification/autoresponse schedulers) | NP-004..NP-011, NP-017, NP-018, NP-019, NP-029..NP-033, NP-039, NP-040 | none                                                                               |
| **B8** | Quick parallelisations / groupBy cleanups                                         | NP-035, NP-043, NP-049, NP-055                                         | none                                                                               |
| **B9** | Low / deferred (connection-pool caps, idempotency, pagination, audit flush)       | NP-044, NP-045, NP-046, NP-047, NP-050, NP-051, NP-052, NP-053, NP-054 | none                                                                               |

**Suggested order:** B0 → B6 (Critical) → B1 → B7 → B4/B5 → B3/B8 → B2
(contract) → B9.

---

## 9. Acceptance criteria tracking (from the brief)

| Criterion                                                                 | Status after Phase 0                                  |
| ------------------------------------------------------------------------- | ----------------------------------------------------- |
| Read-only audit of whole codebase first                                   | ✅ done (this doc + JSON)                             |
| Remediation plan before patching                                          | ✅ §8                                                 |
| Detector exists + tested                                                  | ⏳ designed (§5), Phase 2                             |
| Each fixed N+1 has a query-count regression test                          | ⏳ per-batch (Phase 4)                                |
| Domain depends on no infra (Prisma/Next/headers/observability)            | ✅ verified clean; detector design preserves it       |
| No public contract change without ADR + migration notes                   | ⚠️ only B2 (deal bulk procedures) — gated on sign-off |
| No unsafe raw SQL                                                         | ✅ none introduced; existing sites flagged (§7)       |
| Coverage ≥ 90%, Sonar ≥ A, 4 validations                                  | ⏳ enforced per batch                                 |
| All high-confidence findings fixed or documented w/ owner+severity        | ✅ documented here; fixes Phase 4                     |
| Final report (fixed files, residual risk, query-count deltas, follow-ups) | ⏳ `NPLUS1_REMEDIATION_REPORT.md` (Phase 5)           |

---

## 10. Next decision (gate before any code change)

Per the brief's non-negotiable rule ("**do not start by editing code**; produce
a plan before patching") **and** repo governance (mandatory ADR for
architectural choices, plan-reviewer, 4-validation gates, attestations),
patching has **not** begun. The open decisions for the user: (a) accept
ADR-053 + build the detector first (B0); (b) remediation scope (Critical+High
only, or full); (c) whether to register this as a formal Sprint task via
`/create-task` given the tracking discipline; (d) sign-off for the B2 API
additions.
