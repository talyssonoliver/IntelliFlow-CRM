# Property Testing — Cross-Cutting Checklist

> Applies to every PR that adds or modifies files under `tests/property/`. Work
> through each section top-to-bottom before pushing.

---

## 1. Before Committing

### 1.1 ESLint configuration

- [ ] Confirm `tests/property/**` is covered by the project ESLint config. Open
      `eslint.config.js` (or `.eslintrc.*`) and verify the `files` glob includes
      `tests/property/**/*.ts`. If not, add an override block:
      `js     { files: ['tests/property/**/*.ts'], /* inherit base rules */ }     `
- [ ] Run `pnpm eslint --fix tests/property/` and stage any auto-fixed changes
      before the commit so the commit is clean.

### 1.2 TypeScript check

- [ ] Run `pnpm tsc --noEmit -p tests/property/tsconfig.json` (or the root
      tsconfig that includes `tests/property/`). Zero errors required.
- [ ] If a new import path was added (e.g. a direct deep import into
      `apps/api/src/…`), verify the path exists on disk and is not gitignored.

### 1.3 Staged-file pre-commit gate

- [ ] `git diff --name-only --cached` — inspect staged files. Only commit: test
      files you authored + any support barrel changes you were explicitly
      assigned. Never commit shared config files (`vitest.config.ts`,
      `tsconfig.json`, `tests/property/support/**`) unless you are the assigned
      config owner for that batch.

### 1.4 Commit message format (conventional commits, NO AI-coauthor trailers)

- [ ] Subject line follows `test(property): <short description>` convention.
      Examples: -
      `test(property): add audit-login-atomicity scheduler race test` -
      `test(property): cover contact tenant scope leak (RACE-DEDUP-05)`
- [ ] Body (optional) references the race-condition ID: `Covers: RACE-AUDIT-02`.
- [ ] **NEVER** append `Co-Authored-By: Claude …` or
      `🤖 Generated with     [Claude Code]` trailers. Repo policy enforces this
      via `.husky/commit-msg` and `tools/audit/commit_msg_lint.py`.
- [ ] One logical unit per commit. A "batch" of related tests that cover the
      same lane (e.g. all `audit-log` in-process mocks) may go in one commit;
      real-DB tests that require a migration go in a separate commit after the
      migration commit.

### 1.5 Per-batch commit sequencing

For a batch that includes a migration + adapter change + property test:

```
1. feat(db): add audit_log_entries eventId unique constraint
2. fix(adapters): make writeEntry idempotent via upsert (RACE-AUDIT-M2)
3. test(property): cover audit-entry-idempotent-write (RACE-AUDIT-M2)
```

Never bundle migration + test in the same commit.

---

## 2. CI Validation — property-tests.yml

### 2.1 On first push of a new test file

- [ ] Verify `.github/workflows/property-tests.yml` exists and includes the
      `--project property` flag.
- [ ] The workflow must run `pnpm vitest run --project property` (smoke tier by
      default; FC_TIER=full on schedule).
- [ ] Real-DB tests (`describeDb`/`itDb`) are gated by
      `RUN_DB_PROPERTY_TESTS=1`. Confirm the CI job that sets this env var also
      provisions the ephemeral pgvector container on `localhost:5433`, database
      `ifc_proptest`, with the appointment EXCLUDE constraint applied.
- [ ] Push the branch and confirm the `property-tests` job goes green before
      merging.

### 2.2 Typecheck step in CI

- [ ] The workflow must run `pnpm tsc --noEmit` for every package touched by the
      fix (not just the test file). Check the workflow matrix.

### 2.3 No secret leakage

- [ ] `TEST_DATABASE_URL` is injected as a GitHub Actions secret. Never hardcode
      a connection string in test files.

---

## 3. Deferred Fixes — Action Items

These are infrastructure-level items that must be resolved before the
property-testing suite is considered fully operational. Assign an owner and
target sprint before marking a race ID as "Done".

### 3.1 Integration harness — Prisma 7 constructor (RACE-TEST--M1)

- [ ] `tests/integration/ingestion/file-ingestion.e2e.test.ts` lines 125-131
      still uses the legacy `new PrismaClient({ datasources: { db: { url } } })`
      constructor which throws `PrismaClientInitializationError` under
      `engineType = "client"` (Prisma 7). **Action**: replace with the adapter
      pattern used in `tests/integration/setup.ts` lines 250-255:
      `ts     import { PrismaPg } from '@prisma/adapter-pg';     const _adapter = new PrismaPg({ connectionString: url });     prisma = new PrismaClient({ adapter: _adapter });     `
- [ ] After fixing, run:
      `pnpm vitest run --project property tests/property/unit/prisma-adapter-constructor.prop.test.ts`

### 3.2 Integration test worker isolation (RACE-TEST--M2)

- [ ] `vitest.config.ts` integration project currently sets `maxWorkers: 4`.
      Concurrent workers share a single testcontainer DB, causing
      TRUNCATE/INSERT races between test files. **Action**: change
      `maxWorkers: 4` to `maxWorkers: 1` in the integration project block only
      (do not touch the property project's `maxWorkers: 4`).

### 3.3 Test-runner count accumulation (RACE-TEST--M3)

- [ ] `scripts/run-tests.js` lines 58 and 63 use assignment (`=`) instead of
      accumulation (`+=`) for `testsPassedCount` / `testsFailedCount`. Later
      projects silently overwrite earlier counts; a multi-project run that fails
      early reports success if the last project passes. **Action**: change both
      lines from `= Number.parseInt(…)` to `+= Number.parseInt(…)` and apply the
      same fix to the fallback re-parse in the close handler.

### 3.4 Multi-process audit chain head (ADR-056)

- [ ] `DurableAuditLogAdapter` serialises chain appends via a per-process
      `chainTail` promise (RACE-AUDIT-01 — already fixed for single-process).
      Multi-process chain integrity (e.g. two Railway replicas appending
      concurrently) is NOT protected by the current in-memory mutex. **Action**:
      implement the Redis-backed distributed lock described in ADR-056 before
      enabling horizontal scaling of the API service. Owner: assign before
      Sprint scaling milestone.

---

## 4. Domain Bugs Found by Property Tests

The following real bugs were discovered by the property harness. Each must be
fixed in production code before the corresponding `test.skip` can be promoted to
a passing `test`.

| ID             | File                                                                 | Bug summary                                                                                                                                                                                                                                   | Linked test                                                    |
| -------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| RACE-PURE-01   | `packages/domain/src/shared/Money.ts`                                | `SUPPORTED_CURRENCIES` contains `'GBP'` twice and omits `'USD'` entirely. `Money.create(10, 'USD')` returns `isFailure=true`. Fix: `['USD','GBP','EUR','CAD','AUD','JPY']`.                                                                   | `tests/property/unit/shared/money.prop.test.ts`                |
| RACE-PURE-03   | `packages/domain/src/crm/opportunity/Opportunity.ts`                 | `weightedValue` getter uses float multiplication before `Money.create`, causing off-by-one-cent rounding (e.g. cents=5, probability=70% → 3 instead of 4). Fix: `Money.fromCents(Math.round(value.cents * probability.asDecimal), currency)`. | `tests/property/unit/crm/opportunity.prop.test.ts`             |
| RACE-PURE-08   | `packages/domain/src/crm/lead/Lead.ts`                               | `changeStatus()` has no transition table — any non-CONVERTED lead can move to any target status (e.g. LOST→NEW, UNQUALIFIED→CONVERTED). Fix: add `VALID_LEAD_TRANSITIONS` map and validate in `changeStatus()`.                               | `tests/property/unit/crm/lead-domain.prop.test.ts`             |
| RACE-PURE-09   | `packages/domain/src/crm/task/Task.ts`                               | `changeStatus('ARCHIVED')` bypasses `archive()` guard; `complete()` allows PENDING→COMPLETED skipping IN_PROGRESS.                                                                                                                            | `tests/property/unit/crm/task-domain.prop.test.ts`             |
| RACE-PURE-10   | `packages/domain/src/crm/ticket/Ticket.ts`                           | `changePriority()` guards only on `isClosed`; ARCHIVED tickets (also terminal) can have their priority mutated. Fix: use `isTerminalStatus()`.                                                                                                | `tests/property/unit/crm/ticket-domain.prop.test.ts`           |
| RACE-PURE-11   | `packages/domain/src/crm/ticket/Ticket.ts`                           | `resumeSla()` computes `pausedDuration = now - slaPausedAt` with no guard that `now >= slaPausedAt`; backward-clock inputs yield negative cumulative pause duration.                                                                          | `tests/property/unit/crm/ticket-domain.prop.test.ts`           |
| RACE-PURE-12   | `packages/domain/src/shared/ValueObject.ts`                          | `equals()` uses `JSON.stringify` which silently omits `undefined`-valued keys, making `{a:1, b:undefined}` equal to `{a:1}`.                                                                                                                  | `tests/property/unit/shared/value-objects.prop.test.ts`        |
| RACE-PURE-13   | `packages/domain/src/crm/billing/PaymentTerms.ts`                    | `calculateDueDate` uses `Date.setDate()` (local time) — crosses DST spring-forward boundary one UTC day early. Fix: use `Date.UTC(y, m, d + days)`.                                                                                           | `tests/property/unit/crm/payment-terms.prop.test.ts`           |
| RACE-PURE-M2   | `packages/domain/src/crm/task/Task.ts`                               | `assignToLead/Contact/Opportunity()` have no status guard — terminal tasks (COMPLETED, CANCELLED, ARCHIVED) can have CRM linkage changed without error.                                                                                       | `tests/property/unit/crm/task-domain.prop.test.ts`             |
| RACE-PURE-M1   | `packages/domain/src/crm/ticket/Ticket.ts`                           | `assign()` on ARCHIVED throws raw `Error` (not `Result.fail`); `assign()` on CLOSED succeeds silently; `unassign()` has no terminal-status guard.                                                                                             | `tests/property/unit/crm/ticket-domain.prop.test.ts`           |
| RACE-DEDUP-07a | `apps/api/src/shared/duplicate-rule-evaluator.ts`                    | `resolveFloor()` uses `threshold \|\| 100`; `threshold=0` maps to floor=100 instead of 0, silently disabling zero-threshold matching.                                                                                                         | `tests/property/unit/crm/dedup-evaluator.prop.test.ts`         |
| RACE-DEDUP-07b | `apps/api/src/shared/duplicate-rule-evaluator.ts`                    | Self-match guard `inputId && inputId === candidate.id` short-circuits to `false` when `inputId` is `undefined`, making the guard absent for id-less inputs.                                                                                   | `tests/property/unit/crm/dedup-evaluator.prop.test.ts`         |
| RACE-DEDUP-07c | `apps/api/src/shared/duplicate-rule-evaluator.ts`                    | Composite field extractors (`name_company`, `name_address`) return separator skeleton (`'\|'`, `'\|\|'`) when all sub-fields are absent, causing false-positive duplicate matches at score=100.                                               | `tests/property/unit/crm/dedup-evaluator.prop.test.ts`         |
| RACE-WORKE-04  | `packages/platform/src/queues/queue-factory.ts`                      | `enqueueAIScoring` calls `canRetry()` but never calls `consumeRetry()`, so the burst-protection budget counter is never decremented and the ceiling is permanently inoperative.                                                               | `tests/property/unit/platform/retry-budget.prop.test.ts`       |
| PROTO-ROUTE-01 | `packages/db/src/query-budget/config.ts`                             | `budgetForRoute` uses `ROUTE_BUDGETS[route] ?? fallback` on a plain object; prototype-property names (`toString`, `valueOf`) bypass `??` and return a `Function` instead of the numeric fallback. Fix: use `Object.hasOwn()` or a `Map`.      | `tests/property/unit/platform/query-budget-store.prop.test.ts` |
| RACE-ENTIT-M1  | `packages/adapters/src/repositories/PrismaTenantModuleRepository.ts` | `syncModulesToPlan` is additive-only; does not disable above-plan module rows, so a PROFESSIONAL→STARTER downgrade leaves LEGAL/COMMERCE enabled indefinitely.                                                                                | `tests/property/unit/platform/entitlement-sync.prop.test.ts`   |

---

## 5. Quick Reference — Verify Commands

```bash
# Run property suite (smoke tier, no DB)
pnpm vitest run --project property

# Run with real DB
RUN_DB_PROPERTY_TESTS=1 TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/ifc_proptest \
  pnpm vitest run --project property

# Typecheck a specific package after touching it
pnpm tsc --noEmit -p packages/adapters/tsconfig.json
pnpm tsc --noEmit -p apps/api/tsconfig.json
pnpm tsc --noEmit -p packages/domain/tsconfig.json

# ESLint fix on staged property tests
pnpm eslint --fix tests/property/

# Validate a single test file
pnpm vitest run --project property tests/property/concurrency/<file>.prop.test.ts
```
