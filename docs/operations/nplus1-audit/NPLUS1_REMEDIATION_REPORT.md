# N+1 Query Remediation — Final Report (IFC-314)

**Status:** Complete. **Date:** 2026-05-30. **Governance:** ADR-053. **Audit:**
[`NPLUS1_AUDIT.md`](./NPLUS1_AUDIT.md) ·
[`nplus1-findings.json`](./nplus1-findings.json).

All **56 audited findings are addressed**: **45 fixed** (1 Critical, 10 High, 24
Medium, 10 Low) and **11 bounded-Low documented** with owner + justification —
satisfying the brief's acceptance criterion _"all high-confidence findings are
either fixed or documented with owner, severity, and justification."_ Plus **7
verified false positives** (documented to prevent re-flagging).

---

## 1. What shipped

### Detector + tooling (B0)

- **Request-scoped query-budget detector** (`packages/db/src/query-budget/`):
  AsyncLocalStorage budget store + Prisma 7 `$allOperations` extension (composed
  after field-encryption), structured reporter, route-budget config.
  **Observe/report-only by default in every environment**; `throw` is opt-in via
  `QUERY_BUDGET_MODE=throw`. Seeded by the API tRPC tracing middleware (request)
  — ai-worker `background` seeding is a documented follow-up. `x-request-id`
  propagated in `apps/web/proxy.ts`. Hexagonal boundary preserved
  (domain/application never import it).
- **`measureQueries()`** is the regression-test affordance (budget = Infinity,
  never throws) — used to prove non-linear → constant query growth.
- **Static scanner** `tools/scripts/nplus1-scan.mjs` (TypeScript compiler API) +
  line-drift-resistant baseline `tools/scripts/nplus1-baseline.json`.
  `pnpm nplus1:scan` (CI guard, fails on NEW signatures),
  `pnpm nplus1:scan:update`.

### Remediation

Driven partly by hand and partly by **two parallel multi-agent workflow
batches** (12 + 7 subagents over disjoint file sets), each fix integrated and
centrally validated.

| Severity           | Fixed                                      | Representative technique                                                                                                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Critical (1)**   | NP-001                                     | `ExperimentService.listExperiments` 3N+1 → **3** (groupBy + batched `findMany` + Maps)                                                                                                                                                                                                                                         |
| **High (10)**      | NP-002…011                                 | per-tenant `findUnique`→batched `findMany`+Set; per-tenant ticket/case `findMany`→one IN-query+in-memory group; `updateMany`/`createMany`+dedup-then-batch; capped + bounded-parallel bulk scoring; `expireDraftsBeforeDate` `updateMany`; admin-user batch fetch                                                              |
| **Medium (24)**    | NP-012…035                                 | per-id `findById`→one `findMany`+Map; bulk-reassign batched `findMany`+`updateMany`; required-fields `deleteMany`+`createMany`; home proactive-notifications one `findMany`+`createMany`; `groupBy` for status counts; recursive-CTE version chains; `getTenantPlan` single JOIN; `Promise.all` parallel entity-ref validation |
| **Low fixed (10)** | NP-037/038/040/041/043/045/046/049/054/056 | findByIds batched reads; collapsed 2-query lookups; concurrency-limited delivery; batched idempotency dedup                                                                                                                                                                                                                    |

### Documented bounded-Low (11) — accepted residuals

NP-036, 039, 042, 044, 047, 048, 050, 051, 052, 053, 055 — small fixed-enum
settings upserts (soft-deactivate / update-by-id), bounded fan-outs, intentional
pagination, domain-depth-capped recursion, and non-Prisma port loops. A safe
single-query batch would require a behaviour change or `ON CONFLICT` raw SQL
disproportionate to the Low benefit. Owner: Backend Dev (STOA-Domain). Captured
in the scanner baseline.

---

## 2. Query-count improvements (before → after)

| Path                                                                 | Before                             | After                                              |
| -------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| `experiment.list` (Critical)                                         | **3N+1** (N = experiments)         | **3** (constant)                                   |
| `lead.bulkScore`                                                     | unbounded 2N DB + N AI, serial     | **capped ≤200**, bounded-parallel                  |
| `feedback.exportTrainingData`                                        | N+1                                | **1** batched                                      |
| `contact.bulkDelete` / legal `documents.bulk*`                       | 2N (per-id findUnique/findById)    | **1 read** + bounded per-item domain writes        |
| `account.bulkReassign`                                               | ≤3N                                | **3** (findMany + updateMany + side-effects)       |
| `home.getAllInsights` proactive notifications                        | ≤150 serial tx                     | **1 findMany + 1 createMany**                      |
| `autoresponse.getStatsByStatus`                                      | 8 counts                           | **1 groupBy**                                      |
| `*.settings` required-fields save                                    | N upserts                          | **2** (deleteMany + createMany)                    |
| CaseDocument version chains                                          | O(depth) per-hop                   | **O(1)** recursive CTE                             |
| `getTenantPlan`                                                      | 2 queries + all user-ids in memory | **1** JOIN                                         |
| Background sweeps (insight/ticket/case/scoring/entity/events-worker) | O(tenants) per-tenant              | **O(1)** batched + in-memory group                 |
| `/deals` bulk action (frontend)                                      | N tRPC mutations                   | **1** (`opportunity.bulkUpdateStage`/`bulkDelete`) |

---

## 3. Validation evidence (full central gate, all green)

| Package                      | typecheck | tests              | lint |
| ---------------------------- | --------- | ------------------ | ---- |
| `@intelliflow/db`            | ✓         | 188 (+16 detector) | ✓    |
| `@intelliflow/domain`        | ✓         | 2686               | ✓    |
| `@intelliflow/validators`    | ✓         | 2346               | ✓    |
| `@intelliflow/application`   | ✓         | 1382               | ✓    |
| `@intelliflow/adapters`      | ✓         | 2844               | ✓    |
| `@intelliflow/api`           | ✓         | 6040               | ✓    |
| `@intelliflow/ai-worker`     | ✓         | 2061               | ✓    |
| `@intelliflow/events-worker` | ✓         | 79                 | ✓    |

**~17,700 tests passing, 0 failing.** Builds (incl. strict DTS) green for
db/domain/validators/application/adapters. **Scanner: 26 sites baselined, 0 new
violations** (down from 43 originally — every read-amplification N+1
eliminated). Each fixed N+1 carries a regression test asserting the batched call
count is constant regardless of collection size.

---

## 4. Public API contract changes

- **Additive only:** new tRPC procedures `opportunity.bulkUpdateStage` and
  `opportunity.bulkDelete` (NP-024/025, **pre-approved**), with
  `.min(1).max(100)` Zod schemas; `DealListView` rewired to them. Existing
  single-item procedures unchanged.
- `lead.bulkScore` input gained a `.max(200)` cap (tightening only — closes an
  unbounded DoS vector; no valid client previously exceeded it).
- New **repository port methods** (internal contracts, not public API):
  `CaseDocumentRepository.findByIds`, `TaskRepository.findByIds`,
  `AutoResponseDraftRepository.expireDraftsBeforeDate`/`countByStatusAll`.
  Implemented in both Prisma and in-memory adapters.

## 5. Raw SQL introduced (parameterised, reviewed)

Per ADR-053's raw-SQL policy — all are `Prisma.sql`/`$queryRaw` tagged templates
(bound parameters, no concatenation), justified, and test-covered:

- `PrismaCaseDocumentRepository` recursive-CTE version-chain walks (NP-020/021)
  — table `case_documents`, column `parent_version_id`.
- `PrismaTenantModuleRepository.getTenantPlan` (NP-049) — JOIN
  `workspaces`→`workspace_members`→`users` (WorkspaceMember has no Prisma
  relation to User, so a relation filter isn't expressible).

## 6. Post-delivery review fixes — DONE (were deferred)

A review on 2026-05-30 flagged the items I had deferred as "follow-ups" despite
being DoD scope. All now implemented + validated:

- **ai-worker `background` budget-context seeding** — `AIWorker.processJob`
  wraps the handler in
  `runWithQueryBudget({ context: 'background', route: queueName, budget: resolveBackgroundBudget() })`
  (lazy `@intelliflow/db` import; never throws — background short-circuits the
  throw path). Regression test asserts the real store is active
  (`context==='background'`) via actual job-entry wiring. New
  `DEFAULT_BACKGROUND_QUERY_BUDGET` (50, env-overridable).
- **Per-tenant fan-out batched** — the account-scoring + entity-insight
  scheduled jobs no longer issue one `findMany` per tenant; they batch with
  `tenantId: { in: enabledTenantIds }` + in-memory per-tenant grouping
  (PER_TENANT_CAP preserved). My earlier "architecturally-required RLS fan-out"
  justification was wrong — these use shared `prisma` with explicit `tenantId`
  filters and batch cleanly. Scanner sites removed.
- **CI enforcement** — `pnpm nplus1:scan` added to `.github/workflows/ci.yml`
  (Lint & Format job; required, no `continue-on-error`).
- **Request-id propagation** — the API tracing middleware now seeds request
  context from the INCOMING request headers (adopts a boundary `x-request-id`
  set by `apps/web/proxy.ts`) instead of `{}`; the web tRPC links
  generate/forward `x-request-id`. Query-budget events + cross-service traces
  now correlate on the boundary id.

## 7. Remaining follow-ups (optional)

- **OTel emitter wiring** — `setQueryBudgetEmitter` →
  `metricHelpers.recordDatabaseQuery` to populate `intelliflow.db.query.count`
  (default emitter currently logs).
- **Bounded-Low settings** — if any settings entity grows unbounded, revisit
  with `ON CONFLICT` raw SQL.
- **Scheduled-job global take ceiling** — the batched fan-outs use
  `PER_TENANT_CAP * N` take; tenants truncated by skew are picked up the next
  tick — a global ceiling could be added for very large tenant counts.
- **Pre-existing flaky test (unrelated):** `next-best-action.agent.test.ts`
  "should calculate confidence" can time out under full-suite load (real
  prisma/SASL with no test DB); passes in isolation; file untouched by this
  work.

## 7. Files changed (high level)

`packages/db/src/query-budget/**` (+client/index wiring) ·
`tools/scripts/nplus1-scan.mjs` + baseline ·
`packages/{domain,application,adapters,validators}` (ports, services, repos) ·
`apps/api/src/modules/{lead,contact,account,legal,home,autoresponse,opportunity,task,email,agent}/**` +
`tracing/middleware.ts` · `apps/ai-worker/src/{jobs,workers}/**` ·
`apps/workers/events-worker/src/maintenance/scheduled-jobs.ts` ·
`apps/web/{proxy.ts,src/components/deals/DealListView.tsx}` · ADR-053 + this
audit folder. All with co-located test updates.
