# ADR-054: Property-Based and Race-Condition Testing Strategy

**Status:** Proposed

**Date:** 2026-05-29

**Deciders:** Backend Lead, QA Lead, DevOps Lead — _pending ratification._

**Technical Story:** Phase 0 property-based and race-condition audit
(`docs/operations/property-testing/race-condition-findings.json`); audit
narrative: `docs/operations/property-testing/PROPERTY_TESTING_AUDIT.md`;
invariant ledger: `docs/operations/property-testing/invariant-ledger.md`;
roadmap: `docs/operations/property-testing/property-test-roadmap.md`;
test-infrastructure findings RACE-TEST--01 through RACE-TEST--M3.

> **ℹ️ Addresses a zero-coverage gap.** The repo has 30 000+ Vitest tests and
> Istanbul coverage meeting 90 % thresholds, yet `fast-check` is not a direct
> dependency, zero `fc.assert` / `test.prop` calls exist anywhere, and the
> integration test harness exposes a single shared `PrismaClient` singleton —
> making it structurally impossible to write concurrent-connection race tests
> today.

## Context and Problem Statement

A verified Phase 0 audit of the IntelliFlow CRM codebase confirmed **107
race-condition and property-gap findings** (out of 111 raised; 4 dismissed as
already-guarded false positives) across 11 audit lanes:

| Severity | Count |
| -------- | ----- |
| Critical | 6     |
| High     | 36    |
| Medium   | 40    |
| Low      | 25    |

The six **Critical** findings are directly reachable in production today:

- **RACE-AUDIT-01** — `DurableAuditLogAdapter.previousHash` shared mutable
  field: concurrent `logSecurityEvent` calls silently produce duplicate
  `previousHash` values, destroying the tamper-detection chain
  (`packages/adapters/src/audit/DurableAuditLogAdapter.ts:110,147`).
- **RACE-RBAC-M1** — Consumed MFA backup code never persisted to DB; same code
  reusable after cache eviction or process restart
  (`apps/api/src/services/mfa.service.ts:466–518`).
- **RACE-ENTIT-03** — `handleSubscriptionWebhook` is a `publicProcedure` with no
  Stripe-signature verification and no idempotency table; spoofed downgrade
  webhooks disable paid modules
  (`apps/api/src/modules/billing/billing.router.ts:1469,1473`).
- **RACE-ENTIT-04** — `ensureCustomer` check-then-act on `stripeCustomerId`
  creates duplicate Stripe customer objects under double-submit
  (`apps/api/src/modules/billing/billing.router.ts:902–931`).
- **RACE-BOOKI-01** — Double-confirm race on appointment status: bare
  `findUnique`+`update` with no transaction or conditional
  `WHERE status='SCHEDULED'`
  (`apps/api/src/modules/legal/appointments.router.ts:720–748`).
- **RACE-BOOKI-02** — Slot double-booking: conflict-check and slot creation are
  not in a single serialisable transaction
  (`packages/application/src/usecases/scheduling/ScheduleAppointment.ts:107–115`).

The audit additionally catalogued **43 property-based test candidates** across
value objects, state machines, and pure-function invariants where no
generator-driven coverage exists.

The root cause of the coverage gap is structural: `fast-check` and
`@fast-check/vitest` are absent as direct dependencies (RACE-TEST--01);
`tests/property/` does not exist (RACE-TEST--02); the integration test harness
returns a singleton `PrismaClient` incapable of simulating concurrent-connection
races (RACE-TEST--03, RACE-TEST--M1); and no CI tier runs property tests
(RACE-TEST--06).

We need a strategy that:

1. installs fast-check as a first-class, versioned dependency with
   `@fast-check/vitest` integration;
2. defines three reproducible test tiers (smoke / standard / stress) with clear
   CI gate assignments;
3. tests pure domain invariants without any infrastructure dependency
   (preserving hexagonal boundaries);
4. tests application-layer state machines with in-memory port implementations;
5. verifies repository-layer concurrency invariants against a **real**
   PostgreSQL database using multiple isolated `PrismaClient` connections;
6. records and replays failure seeds deterministically so CI red means the same
   failure locally;
7. guarantees that a flaky property test blocks merge.

## Decision Drivers

- **Hexagonal purity:** `packages/domain/**` must remain free of Prisma,
  Next.js, and infrastructure imports. Property tests for domain aggregates must
  use only in-memory value objects and port fakes.
- **Real-database concurrency:** `FOR UPDATE SKIP LOCKED`, optimistic-lock
  version columns, and atomic `updateMany WHERE currentCapacity < maxCapacity`
  guards cannot be verified against a mocked `PrismaClient`. A real `pg`
  connection is mandatory for RACE-class findings.
- **Reproducibility:** CI failures that are non-reproducible locally create a
  flaky-test culture. Every fast-check failure must log its seed; engineers must
  be able to replay with `FC_SEED=<n> pnpm test:property`.
- **Tier economics:** stress-level (10 000-run) suites are too slow for PR
  gates. A three-tier model lets us gate PRs on a 50-run smoke tier while
  running the exhaustive tier nightly.
- **No-flaky-tests rule:** a property test that fails intermittently without a
  reproducible seed is treated the same as a broken unit test — it blocks merge.
- **Prisma 7 adapter-pg:** every `new PrismaClient()` in tests **must** supply
  `{ adapter: new PrismaPg({ connectionString }) }`. Constructing without the
  adapter throws at runtime (packages/db/CLAUDE.md). The existing integration
  harness incorrectly uses the Prisma 5 `datasources.db.url` API (RACE-TEST--M1
  — High severity).

## Considered Options

- **Option 1 — fast-check + @fast-check/vitest, three-tier
  (smoke/standard/stress), multi-client Postgres sandbox, fc.scheduler for async
  interleavings.** _(chosen)_
- **Option 2 — Stress-loop only (run each existing unit test N times).**
  Rejected: loop repetition does not generate structurally different inputs,
  cannot model interleaved concurrent schedules, and produces no shrunk
  counterexamples. It would find zero of the 43 property candidates or any of
  the six Critical races.
- **Option 3 — Jest-fuzz (jest-fast-check).** Rejected: the codebase is already
  on Vitest 4.x with Istanbul coverage. Introducing Jest would create two test
  runners, two coverage providers, and two CI jobs. `@fast-check/vitest`
  provides an equivalent `test.prop` API natively.
- **Option 4 — Stryker mutation testing instead of property testing.** Rejected
  as a substitute: Stryker verifies that existing assertions detect mutations in
  already-written tests; it does not generate novel inputs or model concurrent
  schedules. It is a useful complement but cannot replace generator-driven
  concurrency testing.
- **Option 5 — Formal verification (TLA+ / Alloy) for critical races.** Rejected
  for Phase 1: high tooling overhead, steep learning curve, and no integration
  with the existing Vitest/CI pipeline. The identified races are amenable to
  model-based property tests rather than formal proofs.

## Decision Outcome

**Chosen: Option 1.**

### 1. Dependency installation

```
pnpm add -D fast-check @fast-check/vitest
```

Both packages are pinned in the workspace root `package.json`.
`@fast-check/vitest` provides the `test.prop` shim that integrates with Vitest's
`expect` and `--reporter` output.

### 2. Directory structure

```
tests/property/
├── support/
│   ├── arbitraries.ts       # fc.Arbitrary<CreateLeadProps>, <Money>, <TimeSlot>, etc.
│   ├── commands.ts          # fc.Command wrappers for domain aggregate state machines
│   ├── model.ts             # Reference model implementations for model-based tests
│   ├── scheduler.ts         # fc.scheduler() helpers for async interleaving tests
│   ├── database.ts          # createIsolatedPrismaClient(), runConcurrent(), withTestTransaction()
│   └── assertions.ts        # assertNoPhantomRecords(), assertTenantIsolation(), assertIdempotentUpsert()
├── domain/                  # Pure-domain property tests (no Prisma)
├── application/             # Model-based tests via in-memory port fakes
├── repository/              # Real-Postgres concurrency tests
└── scheduler-race/          # fc.scheduler() async interleaving tests
```

The `tests/property/` tree is registered as a named Vitest project (`property`)
in the root `vitest.config.ts`, with `globalSetup` reading `FC_SEED` and calling
`fc.configureGlobal({ seed: parseInt(process.env.FC_SEED ?? '0') })` before
tests run.

### 3. Test tiers

| Tier         | `FC_NUM_RUNS` | npm script             | CI gate                            | When                           |
| ------------ | ------------- | ---------------------- | ---------------------------------- | ------------------------------ |
| **smoke**    | 50            | `test:property:smoke`  | PR (`needs: test`)                 | Every pull request             |
| **standard** | 500           | `test:property`        | `main` push (ci.yml)               | Every push to `main`/`develop` |
| **stress**   | 10 000        | `test:property:stress` | Nightly (system-audit-nightly.yml) | `cron: '0 3 * * *'`            |

A separate `test:concurrency` script drives only the `repository/` and
`scheduler-race/` suites against the live testcontainer.

### 4. Test categories by hexagonal layer

#### 4a. Pure-domain property tests (no infrastructure)

- **Location:** `tests/property/domain/`
- **Dependencies:** `packages/domain` only; no Prisma, no HTTP.
- **Coverage targets (from audit):** Money arithmetic (`RACE-PURE-01`,
  `RACE-PURE-02`), Invoice accounting invariant (`RACE-PURE-04`,
  `RACE-PURE-06`), Lead/Ticket/Task state machines (`RACE-PURE-08`,
  `RACE-PURE-09`), Opportunity.weightedValue (`RACE-PURE-03`), TaxRate.calculate
  (`RACE-PURE-05`), ValueObject equality reflexivity/symmetry (`RACE-PURE-12`).
- **Pattern:**

  ```typescript
  import { test } from '@fast-check/vitest';
  import * as fc from 'fast-check';

  test.prop([
    fc.integer({ min: 0, max: 10_000_000 }),
    fc.integer({ min: 0, max: 10_000_000 }),
  ])('Money.add is commutative', (a, b) => {
    const ma = Money.fromCents(a, 'GBP');
    const mb = Money.fromCents(b, 'GBP');
    expect(ma.add(mb).value!.cents).toBe(mb.add(ma).value!.cents);
  });
  ```

#### 4b. Application model-based tests (in-memory port fakes)

- **Location:** `tests/property/application/`
- **Dependencies:** `packages/application` + `packages/domain`; repository ports
  fulfilled by in-memory fakes.
- **Coverage targets:** `ScheduleAppointmentUseCase` conflict gate invariant
  (`RACE-BOOKI-02` property candidate); `RescheduleAppointmentUseCase`
  optimistic-lock sequence; Invoice `recordPayment` / `processRefund` lifecycle.
- **Pattern:** `fc.commands()` drives sequences of domain operations against
  both the real use-case and a reference model;
  `fc.assert(fc.property(fc.commands(cmds), checkPostCondition))`.

#### 4c. Repository/concurrency tests (real Postgres)

- **Location:** `tests/property/repository/`
- **Infrastructure:** testcontainers `PostgreSqlContainer` (reuses the setup
  from `tests/integration/setup.ts`), corrected to use
  `new PrismaPg({ connectionString })` per Prisma 7 requirements.
- **Multi-client helper:** `runConcurrent(n, async (prismaClient) => { ... })`
  in `tests/property/support/database.ts` creates `n` fully independent
  `PrismaClient` instances (each with its own `PrismaPg` adapter), runs them in
  parallel via `Promise.all`, then destroys all clients in `afterAll`.
- **Coverage targets:** Appointment double-confirm (`RACE-BOOKI-01`), slot
  double-booking (`RACE-BOOKI-02`), agent capacity ceiling (`RACE-QUOTA-03`,
  `RACE-ROUTI-02`), outbox duplicate-row (`RACE-WEBHO-01`, `RACE-WEBHO-M1`),
  contact uniqueness (`RACE-DEDUP-01`), ZepMemoryAdapter episode count
  (`RACE-QUOTA-01`).

#### 4d. Async scheduler-race tests (fc.scheduler)

- **Location:** `tests/property/scheduler-race/`
- **Pattern:** `fc.scheduler()` models all possible interleavings of async
  operations within a single Node.js event loop, without requiring real
  concurrency. Used for `SessionService.enforceSessionLimit` (`RACE-RBAC-01`),
  `MfaService.verifyChallenge`, `WebhookFramework.IdempotencyStore`
  (`RACE-WEBHO-03`), `MaintenanceScheduler` duplicate notification paths
  (`RACE-WORKE-01`, `RACE-WORKE-02`).

### 5. Seed / replay infrastructure

- `globalSetup` logs `FC_SEED` and the fast-check global config to
  `process.env.GITHUB_STEP_SUMMARY` and `console.info` at the start of every
  property test run.
- CI passes `FC_SEED: ${{ github.run_id }}` so failures are pinned to a stable
  seed for that run.
- Local replay: `FC_SEED=<seed> pnpm test:property:smoke`.
- Documentation: `docs/claude-refs/property-test-replay.md` describes the replay
  workflow.

### 6. Flaky-test policy

A property test that fails on any seed in the smoke tier (50 runs) blocks merge
identically to a unit test failure. The seed is always logged, so "flaky" is
operationally defined as "fails on seed X but passes on seed Y with no code
change" — treated as a genuine bug in either the production code or the test's
arbitrary generation. Skipping (`test.skip`) requires a linked issue;
commented-out tests are rejected by the `no-skipped-tests` ESLint rule already
enforced in CI.

### 7. Prisma 7 constructor correction

All test files that construct `PrismaClient` are updated from the Prisma 5/6
`datasources.db.url` API to the Prisma 7 adapter-pg pattern:

```typescript
// Before (throws at runtime with Prisma 7 engineType='client')
new PrismaClient({ datasources: { db: { url: databaseUrl } } });

// After
import { PrismaPg } from '@prisma/adapter-pg';
const adapter = new PrismaPg({ connectionString: databaseUrl });
new PrismaClient({ adapter });
```

Affected files: `tests/integration/setup.ts:237–245`,
`tests/integration/ingestion/file-ingestion.e2e.test.ts:125–131`. A lint rule
(`grep 'new PrismaClient' | grep -v adapter`) is added to the architecture test
job to prevent regressions.

### 8. New npm scripts

Added to root `package.json`:

```json
"test:property":        "vitest run --project=property",
"test:property:smoke":  "FC_NUM_RUNS=50  vitest run --project=property",
"test:property:stress": "FC_NUM_RUNS=10000 vitest run --project=property",
"test:concurrency":     "vitest run --project=concurrency"
```

### Positive Consequences

- The six Critical races (RACE-AUDIT-01, RACE-RBAC-M1, RACE-ENTIT-03,
  RACE-ENTIT-04, RACE-BOOKI-01, RACE-BOOKI-02) each get a regression test that
  fails on the current code and passes after the fix, closing the fix–test gap
  permanently.
- 43 pure-domain property candidates gain generator-driven coverage, replacing
  example-based tests that by design cannot discover boundary conditions.
- Multi-client Postgres sandbox enables genuine concurrent-connection tests for
  all repository-layer races, filling the gap that mocked `PrismaClient` tests
  cannot address.
- CI tier separation keeps PR gate time below 2 minutes (smoke, 50 runs) while
  nightly stress runs provide exhaustive coverage.
- Seed/replay infrastructure converts non-reproducible CI failures into locally
  debuggable counterexamples.
- Hexagonal boundaries are preserved: domain property tests carry zero
  infrastructure imports, enforced by the existing
  `tests/architecture/boundaries.test.ts` suite.

### Negative Consequences / Risks

- **Setup overhead:** the `tests/property/support/` tree and multi-client
  database helper must be built before any lane can write tests. Estimated
  effort: one sprint.
- **Testcontainer latency:** repository-layer concurrency tests require a
  running Postgres container, adding ~30 s to the `test:concurrency` job.
  Mitigated by running only `test:property:smoke` (in-memory only) on PR gates.
- **Slow-shrinking on concurrent tests:** fast-check's shrinking can be slow
  when counterexamples involve real DB round-trips. Mitigated by a 10 s per-test
  timeout on the concurrency project and by using deterministic seeds for the
  standard tier.
- **Integration test isolation regression (RACE-TEST--M2):** the integration
  project currently runs with `maxWorkers=4` against a shared Postgres
  container. Concurrent `beforeEach TRUNCATE` calls can race. Short-term
  mitigation: set `maxWorkers=1` for the integration project until per-worker
  schema isolation is implemented.
- **Maintenance burden:** property tests with badly scoped arbitraries can
  generate inputs the domain correctly rejects, producing spurious test
  failures. Mitigated by co-locating arbitrary definitions with the domain
  constants they must satisfy (`LEAD_STATUSES`, `SUPPORTED_CURRENCIES`, etc.)
  and by the `fc.pre()` pre-condition filter.

## Compliance with Existing Rules

- **No fake data:** property tests that exercise tRPC procedures use the real
  Prisma adapter against testcontainers, not hardcoded stub values.
- **No-skip / no-flaky:** flaky property tests block merge. Seeds are logged.
- **Hexagonal boundary tests:** the architecture test job
  (`tests/architecture/`) will assert that `tests/property/domain/**` imports
  nothing from `packages/adapters/**`, `packages/db/**`, or `apps/**`.
- **Build validation:** `fast-check` and `@fast-check/vitest` are added to
  `devDependencies` only; they do not appear in any production bundle.

## Alternatives Considered

### Stress-loop only

Running each existing unit test 1 000 times finds non-determinism in test
harness setup but cannot generate novel inputs, model concurrent schedules, or
produce shrunk counterexamples. It would not have detected any of the 43
property-based candidates in the audit.

### Jest-fuzz / jest-fast-check

Viable fast-check integration, but requires introducing Jest as a second test
runner alongside Vitest 4.x. Two runners mean two Istanbul coverage providers,
two `--reporter` configurations, and split CI jobs. Rejected on operational
complexity grounds.

### Stryker mutation testing

Verifies that existing assertions catch mutations in already-written code.
Valuable for checking assertion quality but orthogonal to this ADR: it cannot
generate novel inputs, cannot model concurrent schedules, and provides no output
for the 43 candidates or the six Critical races. Recommended as a complementary
ADR after property tests are in place.

### Formal verification (TLA+ / Alloy)

The Critical races (especially RACE-AUDIT-01 hash-chain and RACE-BOOKI-02
exclusion constraint) are amenable to TLA+ modelling. However, formal
verification requires a separate toolchain with no CI integration, high
authoring cost, and no connection to the Vitest regression-test requirement.
Deferred to a future ADR for security-critical paths only.

## Links

- Audit data (machine-readable):
  `docs/operations/property-testing/race-condition-findings.json`
- Audit narrative: `docs/operations/property-testing/PROPERTY_TESTING_AUDIT.md`
- Invariant ledger: `docs/operations/property-testing/invariant-ledger.md`
- Roadmap & batch plan:
  `docs/operations/property-testing/property-test-roadmap.md`
- Seed replay guide: `docs/claude-refs/property-test-replay.md` _(to be created
  in Phase 1)_
- Related: ADR-047 (Hexagonal Architecture — boundary enforcement)
- Related: ADR-053 (N+1 Query Budget Detector — same hexagonal-boundary
  discipline)
- Related: ADR-011 (Outbox pattern — idempotency key design referenced in
  RACE-WEBHO-01)
- Related: ADR-050 (Duplicate-detection runtime — advisory-only account dedup
  referenced in RACE-DEDUP-06)
- Integration test harness: `tests/integration/setup.ts`
- Property test support tree: `tests/property/support/` _(Phase 1 deliverable)_
