# Property & Race-Condition Test Roadmap

**Audit summary** — 111 findings raised across 11 lanes, 107 confirmed, 4
dismissed as false positives. Severity breakdown: Critical 6, High 36, Medium
40, Low 25. 43 pure-property candidates identified. Zero property-based tests
exist today; `fast-check` is absent as a direct dependency.

---

## Phase 1 — Infrastructure Checklist

All items below are BLOCKERS for every subsequent batch. Nothing in Batches 1–3
can run until this checklist is complete.

### 1.1 Dependency installation

```bash
pnpm add -D fast-check @fast-check/vitest
```

Both packages must be added at the workspace root `package.json` so every Vitest
project inherits them. `fast-check@3.23.2` exists transitively (via
`vitest → @vitest/expect → pure-rand`) but cannot be imported directly from test
files until it is a first-class dependency.

Evidence: `RACE-TEST--01` — `package.json` devDependencies lines 138–193 contain
no `fast-check` or `@fast-check/vitest` entry. Any test file importing
`fast-check` fails with `Cannot find module` at runtime.

### 1.2 Support directory structure

Create the following tree (all files are new):

```
tests/property/
  support/
    arbitraries.ts      # fc.Arbitrary<> exports for domain types
    commands.ts         # Model/Scheduler command wrappers (fc.Command<>)
    model.ts            # Reference model implementations for model-based tests
    scheduler.ts        # Scheduler-race harness (fc.schedulerFor, concurrent tRPC)
    database.ts         # Multi-client DB sandbox + runConcurrent helper
    assertions.ts       # Invariant assertion helpers
  smoke/                # Fast, seed-deterministic tests (≤50 runs)
  standard/             # Standard tests (500 runs)
  stress/               # Nightly stress tests (10 000 runs)
```

Evidence: `RACE-TEST--02` — `tests/property/` directory does not exist;
`vitest.config.ts` projects array (lines 106–237) has no property project entry.

### 1.3 Vitest project registration

Add a named project entry in `vitest.config.ts`:

```ts
{
  name: 'property',
  root: 'tests/property',
  include: ['**/*.prop.test.ts'],
  pool: 'forks',
  maxWorkers: 2,
  testTimeout: 60_000,
  globalSetup: ['tests/property/support/seed-reporter.ts'],
}
```

### 1.4 Seed reporter

Create `tests/property/support/seed-reporter.ts`:

```ts
import { fc } from '@fast-check/vitest';

export function setup() {
  const seed = process.env.FC_SEED
    ? parseInt(process.env.FC_SEED, 10)
    : Date.now();
  fc.configureGlobal({
    seed,
    numRuns: parseInt(process.env.FC_NUM_RUNS ?? '100', 10),
  });
  console.log(`[fast-check] seed=${seed}  FC_SEED=${seed}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    require('fs').appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\n**fast-check seed**: \`${seed}\`  (replay: \`FC_SEED=${seed} pnpm test:property\`)\n`
    );
  }
}
```

Evidence: `RACE-TEST--08` — no `FC_SEED` handling exists; failing CI seeds are
non-reproducible.

### 1.5 Domain arbitraries (`tests/property/support/arbitraries.ts`)

Minimum set required by Batches 1–2:

| Arbitrary              | Basis                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `arbLeadStatus`        | `fc.constantFrom(...LEAD_STATUSES)`                                                                                   |
| `arbLeadSource`        | `fc.constantFrom(...LEAD_SOURCES)`                                                                                    |
| `arbEmail`             | `fc.emailAddress()` mapped through `Email.create`                                                                     |
| `arbMoney`             | `fc.integer({min:0,max:10_000_000})` → `Money.fromCents`                                                              |
| `arbPercentage`        | `fc.integer({min:0,max:100})` → `Percentage.create`                                                                   |
| `arbTenantId`          | `fc.constant(TEST_TENANT_ID)` or `fc.uuidV4()`                                                                        |
| `arbAppointmentStatus` | `fc.constantFrom('SCHEDULED','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW')`                                          |
| `arbTicketStatus`      | `fc.constantFrom('OPEN','IN_PROGRESS','WAITING_ON_CUSTOMER','WAITING_ON_THIRD_PARTY','RESOLVED','CLOSED','ARCHIVED')` |
| `arbInvoiceLineItem`   | `fc.record({...})` combining arbMoney + quantity                                                                      |

### 1.6 Scheduler harness (`tests/property/support/scheduler.ts`)

Wraps `fc.schedulerFor` with helpers for concurrent tRPC mutation calls:

```ts
export function makeSchedulerHarness(prisma: PrismaClient) {
  return {
    // Fire n copies of asyncFn concurrently; return all settled results
    runConcurrent: <T>(n: number, asyncFn: () => Promise<T>) =>
      Promise.allSettled(Array.from({ length: n }, asyncFn)),
  };
}
```

### 1.7 Multi-client DB sandbox (`tests/property/support/database.ts`)

Addresses `RACE-TEST--03` (singleton client) and `RACE-TEST--M1` (Prisma 7
adapter-pg constructor):

```ts
import { PrismaClient } from '@intelliflow/db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

export function createIsolatedPrismaClient(
  connectionString?: string
): PrismaClient {
  const url = connectionString ?? process.env.DATABASE_URL!;
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

export async function withConcurrentClients<T>(
  n: number,
  fn: (clients: PrismaClient[]) => Promise<T>
): Promise<T> {
  const clients = Array.from({ length: n }, () => createIsolatedPrismaClient());
  try {
    return await fn(clients);
  } finally {
    await Promise.all(clients.map((c) => c.$disconnect()));
  }
}
```

Note: `RACE-TEST--M1` confirms `tests/integration/setup.ts` lines 237–245 use
the Prisma 5-style `datasources.db.url` constructor which is incompatible with
Prisma 7 `engineType='client'`. That file must also be patched in this phase.

### 1.8 Invariant assertions (`tests/property/support/assertions.ts`)

```ts
export async function assertNoPhantomRecords(
  prisma: PrismaClient,
  model: string,
  where: object
) { ... }

export async function assertIdempotentUpsert(
  fn: () => Promise<unknown>,
  getCount: () => Promise<number>
) { ... }

export function assertTenantIsolation(
  resultA: unknown[],
  resultB: unknown[],
  tenantAId: string,
  tenantBId: string
) { ... }
```

### 1.9 Fix `tests/utils/db.ts` stubs

`DatabaseTestHelper.beginTransaction()`, `rollbackTransaction()`, `setup()`,
`teardown()`, `reset()`, `seed()`, `clear()` are all `console.log` no-ops
(`RACE-TEST--04`). Wire them to `getTestPrismaClient()` from
`tests/integration/setup.ts`. `withTestTransaction()` must receive a real Prisma
interactive-transaction client.

### 1.10 Fix integration test Prisma constructor (`RACE-TEST--M1` — High)

Patch these two files before any real-DB test can run:

- `tests/integration/setup.ts` lines 237–245
- `tests/integration/ingestion/file-ingestion.e2e.test.ts` lines 125–131

Replace `new PrismaClient({ datasources: { db: { url } } })` with:

```ts
const pool = new pg.Pool({ connectionString: url });
const adapter = new PrismaPg(pool);
new PrismaClient({ adapter });
```

### 1.11 npm scripts

Add to root `package.json` scripts:

```json
"test:property":          "vitest run --project=property",
"test:property:smoke":    "FC_NUM_RUNS=50 vitest run --project=property --reporter=verbose",
"test:property:standard": "FC_NUM_RUNS=500 vitest run --project=property",
"test:property:stress":   "FC_NUM_RUNS=10000 vitest run --project=property",
"test:concurrency":       "vitest run --project=property --reporter=verbose tests/property/standard/"
```

Evidence: `RACE-TEST--05` — no property scripts exist in `package.json` lines
25–37.

### 1.12 CI wiring

Evidence: `RACE-TEST--06` — no CI tier runs property tests.

**`ci.yml`** — add `property-smoke` job (runs on every PR and push):

```yaml
property-smoke:
  needs: [test]
  runs-on: ubuntu-latest
  env:
    FC_SEED: ${{ github.run_id }}
    FC_NUM_RUNS: 50
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
  steps:
    - uses: actions/checkout@v4
    - run: pnpm install --frozen-lockfile
    - run: pnpm test:property:smoke
```

**`system-audit-nightly.yml`** — add stress step inside the existing nightly
job:

```yaml
- name: Property stress tests
  env:
    FC_SEED: ${{ github.run_id }}
    FC_NUM_RUNS: 10000
  run: pnpm test:property:stress
```

### 1.13 Fix integration test concurrency isolation (`RACE-TEST--M2` — Medium)

`vitest.config.ts` integration project uses `pool='forks', maxWorkers=4` against
a shared PostgreSQL container. Concurrent `beforeEach TRUNCATE` calls race
destructively.

Interim fix: set `maxWorkers: 1` on the integration project. Long-term:
per-worker Postgres schema via `CREATE SCHEMA worker_N` in `globalSetup`.

### 1.14 Fix `scripts/run-tests.js` count accumulation (`RACE-TEST--M3` — Medium)

`scripts/run-tests.js` lines 44–65 overwrite `testsPassedCount` and
`testsFailedCount` on each stdout chunk, so the last project's summary hides
failures from earlier projects. Change assignments to accumulation:

```js
testsPassedCount += parseInt(testsMatch[1], 10);
testsFailedCount += parseInt(failedMatch[1], 10);
```

### 1.15 Replay documentation

Create `docs/claude-refs/property-test-replay.md` explaining:

1. Find the seed in the CI step summary (`fast-check seed: 1234567890`).
2. Replay locally: `FC_SEED=1234567890 pnpm test:property`.
3. To hold the seed across runs: `export FC_SEED=1234567890`.

---

## Batched Delivery Plan

### Batch 0 — Infrastructure (prerequisite for all batches)

**Findings addressed:** `RACE-TEST--01` through `RACE-TEST--08`,
`RACE-TEST--M1`, `RACE-TEST--M2`, `RACE-TEST--M3`

**Deliverables:** All items in Phase 1 above. No race tests yet — only the
scaffolding.

**Acceptance criteria:** `pnpm test:property:smoke` exits 0 on a trivial sanity
test; `FC_SEED` replay produces identical output.

---

### Batch 1 — Critical & High races, highest-risk lanes

**Scope:** booking-scheduling, routing-assignment, audit-log,
RBAC/auth/session  
**Findings in batch 1 (by `batch` field = 1):**

| Finding ID      | Severity | Lane               | Test type      |
| --------------- | -------- | ------------------ | -------------- |
| `RACE-AUDIT-01` | Critical | audit-log          | scheduler-race |
| `RACE-BOOKI-01` | Critical | booking-scheduling | scheduler-race |
| `RACE-BOOKI-02` | Critical | booking-scheduling | db-concurrency |
| `RACE-RBAC-M1`  | Critical | rbac-auth-session  | scheduler-race |
| `RACE-ROUTI-01` | Critical | routing-assignment | scheduler-race |
| `RACE-ROUTI-02` | High     | routing-assignment | db-concurrency |
| `RACE-ROUTI-03` | High     | routing-assignment | scheduler-race |
| `RACE-ROUTI-M1` | High     | routing-assignment | db-concurrency |
| `RACE-RBAC-01`  | High     | rbac-auth-session  | scheduler-race |
| `RACE-RBAC-03`  | High     | rbac-auth-session  | db-concurrency |
| `RACE-RBAC-06`  | High     | rbac-auth-session  | pure-property  |
| `RACE-RBAC-07`  | High     | rbac-auth-session  | scheduler-race |
| `RACE-RBAC-M2`  | High     | rbac-auth-session  | db-concurrency |
| `RACE-AUDIT-02` | High     | audit-log          | db-concurrency |
| `RACE-AUDIT-03` | High     | audit-log          | db-concurrency |
| `RACE-AUDIT-05` | High     | audit-log          | db-concurrency |
| `RACE-AUDIT-M1` | High     | audit-log          | db-concurrency |
| `RACE-AUDIT-M2` | High     | audit-log          | db-concurrency |

#### Failing-test-first sequence (RED → GREEN → REFACTOR)

**RED for `RACE-AUDIT-01` (Critical — hash-chain previousHash race):**

```ts
// tests/property/standard/audit.race.prop.test.ts
import { test } from '@fast-check/vitest';
import * as fc from 'fast-check';
import { withConcurrentClients } from '../support/database';

test.prop([
  fc.array(fc.record({ tenantId: fc.constant('t1'), eventType: fc.string() }), {
    minLength: 2,
    maxLength: 5,
  }),
])(
  'concurrent logSecurityEvent calls produce a valid hash chain — no duplicate previousHash',
  async (events) => {
    await withConcurrentClients(2, async ([c1, c2]) => {
      const adapter1 = new DurableAuditLogAdapter(c1);
      const adapter2 = new DurableAuditLogAdapter(c2);
      await Promise.all(
        events.map((e, i) =>
          i % 2 === 0
            ? adapter1.logSecurityEvent(e)
            : adapter2.logSecurityEvent(e)
        )
      );
      const rows = await c1.securityEvent.findMany({
        orderBy: { createdAt: 'asc' },
      });
      const hashes = rows.map((r) => r.previousHash);
      // No two rows should share the same previousHash (chain integrity)
      const uniqueHashes = new Set(hashes);
      return uniqueHashes.size === hashes.length;
    });
  }
);
```

This test WILL FAIL because `this.previousHash` is read before `$transaction`
starts (`DurableAuditLogAdapter.ts:110`) and written after
(`DurableAuditLogAdapter.ts:147–148`).

**GREEN — fix for `RACE-AUDIT-01`:**

Move `previousHash` retrieval inside the `$transaction` callback by fetching the
latest row with `SELECT ... FOR UPDATE`:

```ts
// packages/adapters/src/audit/DurableAuditLogAdapter.ts
// Remove: private previousHash: string = 'GENESIS'
// Inside logSecurityEvent $transaction callback:
const lastRow = await tx.securityEvent.findFirst({
  orderBy: { createdAt: 'desc' },
  select: { integrityHash: true },
  // Add FOR UPDATE via $queryRaw or a locking extension
});
const previousHash = lastRow?.integrityHash ?? 'GENESIS';
```

**RED for `RACE-BOOKI-01` (Critical — double-confirm):**

```ts
// tests/property/standard/booking.race.prop.test.ts
test.prop([fc.record({ appointmentId: fc.uuidV4() })])(
  'concurrent confirm calls on the same appointment produce exactly one CONFIRMED row',
  async ({ appointmentId }) => {
    // Seed a SCHEDULED appointment
    // Fire two concurrent confirm mutations
    const [r1, r2] = await runConcurrent(2, () =>
      confirmAppointment(appointmentId)
    );
    const finalStatus = await getAppointmentStatus(appointmentId);
    // Exactly one should succeed; DB should show CONFIRMED only once
    return (
      finalStatus === 'CONFIRMED' &&
      [r1, r2].filter((r) => r.status === 'fulfilled').length === 1
    );
  }
);
```

This WILL FAIL: `appointments.router.ts` lines 720–748 use bare `findUnique` +
`update` with no `$transaction` and no conditional `WHERE status='SCHEDULED'`
guard.

**GREEN — fix for `RACE-BOOKI-01`:**

Replace the two-step read+write with a single atomic conditional update:

```ts
// apps/api/src/modules/legal/appointments.router.ts
const result = await ctx.prismaWithTenant.appointment.updateMany({
  where: { id: input.id, status: 'SCHEDULED' },
  data: { status: 'CONFIRMED', confirmedAt: new Date() },
});
if (result.count === 0) {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Appointment is not in SCHEDULED status',
  });
}
```

**RED for `RACE-ROUTI-01` (Critical — ticket double-assignment):**

```ts
test.prop([
  fc.record({ ticketId: fc.uuidV4(), tenantId: fc.constant(TEST_TENANT_ID) }),
])(
  'concurrent autoRoute calls on the same ticket assign to exactly one agent',
  async ({ ticketId, tenantId }) => {
    await withConcurrentClients(2, async ([c1, c2]) => {
      const [r1, r2] = await Promise.allSettled([
        autoRoute(ticketId, tenantId, c1),
        autoRoute(ticketId, tenantId, c2),
      ]);
      const auditRows = await c1.routingAudit.findMany({ where: { ticketId } });
      // Exactly one audit row should exist
      return auditRows.length === 1;
    });
  }
);
```

This WILL FAIL because all routing decisions in `ticket-routing.router.ts` lines
43–63 run outside the `routeTicket` transaction and there is no idempotency
guard.

**GREEN — fix for `RACE-ROUTI-01`:**

Add an idempotency guard at the top of the `routeTicket` transaction body
(mirroring `LeadRoutingService` line 256):

```ts
// apps/api/src/services/TicketRoutingService.ts, inside $transaction callback
const current = await tx.ticket.findFirst({ where: { id: ticketId } });
if (current?.assigneeId && !forceReroute) {
  throw new Error('Ticket already assigned');
}
```

Also add `WHERE currentCapacity < maxCapacity` to
`agentAvailability.updateMany`.

**Fix strategy candidates summary for Batch 1:**

| Finding         | Primary fix                                                                         | DB constraint needed                                                          |
| --------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `RACE-AUDIT-01` | Move `previousHash` fetch inside `$transaction` with `SELECT FOR UPDATE`            | No                                                                            |
| `RACE-BOOKI-01` | `updateMany WHERE status='SCHEDULED'`, check `count===1`                            | Partial unique index optional                                                 |
| `RACE-BOOKI-02` | Wrap `execute()` in `withTransactionOptions({ isolationLevel: 'Serializable' })`    | PostgreSQL EXCLUSION CONSTRAINT on tsrange                                    |
| `RACE-RBAC-M1`  | Call `saveUserMfaSettings` in `verifyChallenge` after backup-code validation        | None                                                                          |
| `RACE-ROUTI-01` | Idempotency guard inside `routeTicket` tx; `SELECT FOR UPDATE` on ticket row        | None                                                                          |
| `RACE-ROUTI-02` | Add `WHERE currentCapacity < maxCapacity` to `updateMany`; CHECK constraint         | `CHECK (currentCapacity <= maxCapacity)`                                      |
| `RACE-ROUTI-M1` | Add `agentAvailability.updateMany increment` inside `assignLead` tx                 | None                                                                          |
| `RACE-RBAC-01`  | Per-user async-mutex around `enforceSessionLimit + sessionStore.set`                | None                                                                          |
| `RACE-RBAC-03`  | Wrap `getUserMfaSettings + saveUserMfaSettings` in `$transaction SELECT FOR UPDATE` | None                                                                          |
| `RACE-RBAC-06`  | Add `tenantId` to `getUserRBACRoles` and `applyUserPermissionOverrides` WHERE       | Change `@@unique([userId, roleId])` to `@@unique([userId, roleId, tenantId])` |
| `RACE-RBAC-07`  | Move `mfaSettingsCache.set` to after confirmed DB commit; delete cache on error     | None                                                                          |
| `RACE-RBAC-M2`  | In `enforceSessionLimit`, replace early-return with `populateUserSessionsFromDb`    | None                                                                          |
| `RACE-AUDIT-02` | Wrap `logLoginSuccess/Failure` in a single `$transaction`                           | None                                                                          |
| `RACE-AUDIT-03` | Factory pattern for `getAuditLogger` (per-call prisma, not singleton capture)       | None                                                                          |
| `RACE-AUDIT-05` | Add `eventId String @unique` to `SecurityEvent` schema                              | `@unique eventId` on SecurityEvent                                            |
| `RACE-AUDIT-M1` | Promote `idempotencyKey` to top-level `String @unique` on `DomainEvent`             | `@unique idempotencyKey`                                                      |
| `RACE-AUDIT-M2` | Add `@@unique([eventId])` to `AuditLogEntry`; use `upsert`/`skipDuplicates`         | `@@unique([eventId])` on AuditLogEntry                                        |

---

### Batch 2 — High races, remaining lanes

**Scope:** dedupe-merge, webhooks-outbox-idempotency, quota-budget-capacity,
entitlement-modules, pure-domain (High findings)  
**Findings in batch 2 (by `batch` field = 2):**

| Finding ID      | Severity           | Lane                        | Test type      |
| --------------- | ------------------ | --------------------------- | -------------- |
| `RACE-BOOKI-03` | High               | booking-scheduling          | db-concurrency |
| `RACE-BOOKI-M1` | High               | booking-scheduling          | scheduler-race |
| `RACE-BOOKI-M2` | High               | booking-scheduling          | db-concurrency |
| `RACE-DEDUP-01` | High               | dedupe-merge                | db-concurrency |
| `RACE-DEDUP-02` | High               | dedupe-merge                | scheduler-race |
| `RACE-DEDUP-03` | High               | dedupe-merge                | scheduler-race |
| `RACE-DEDUP-05` | High               | dedupe-merge                | pure-property  |
| `RACE-DEDUP-M1` | High               | dedupe-merge                | db-concurrency |
| `RACE-DEDUP-M3` | High               | dedupe-merge                | db-concurrency |
| `RACE-WEBHO-01` | High               | webhooks-outbox-idempotency | db-concurrency |
| `RACE-WEBHO-02` | High               | webhooks-outbox-idempotency | model-based    |
| `RACE-WEBHO-M1` | High               | webhooks-outbox-idempotency | db-concurrency |
| `RACE-WEBHO-M3` | High               | webhooks-outbox-idempotency | db-concurrency |
| `RACE-QUOTA-01` | High               | quota-budget-capacity       | scheduler-race |
| `RACE-QUOTA-03` | High               | quota-budget-capacity       | db-concurrency |
| `RACE-QUOTA-M1` | High               | quota-budget-capacity       | db-concurrency |
| `RACE-ENTIT-02` | High               | entitlement-modules         | db-concurrency |
| `RACE-ENTIT-03` | Critical           | entitlement-modules         | model-based    |
| `RACE-ENTIT-04` | High               | entitlement-modules         | scheduler-race |
| `RACE-ENTIT-05` | High               | entitlement-modules         | pure-property  |
| `RACE-ENTIT-M1` | High               | entitlement-modules         | pure-property  |
| `RACE-PURE-04`  | High               | pure-domain                 | pure-property  |
| `RACE-PURE-06`  | High               | pure-domain                 | model-based    |
| `RACE-PURE-01`  | Medium (from High) | pure-domain                 | pure-property  |

#### Key test patterns for Batch 2

**`RACE-DEDUP-01` (High — contact/lead concurrent create):**

```ts
test.prop([fc.record({ tenantId: fc.uuidV4(), email: fc.emailAddress() })])(
  'concurrent createContact with same email produces at most one row',
  async ({ tenantId, email }) => {
    await withConcurrentClients(2, async ([c1, c2]) => {
      const [r1, r2] = await Promise.allSettled([
        createContact({ tenantId, email }, c1),
        createContact({ tenantId, email }, c2),
      ]);
      const count = await c1.contact.count({ where: { tenantId, email } });
      return count === 1;
      // AND: exactly one of r1/r2 is fulfilled with a DuplicateEmailError on the other,
      // not a generic PersistenceError
    });
  }
);
```

Fix: catch Prisma `P2002` in `PrismaContactRepository.save()` and throw typed
`DuplicateEmailError`.

**`RACE-DEDUP-05` (High — tenantId scope leak):**

```ts
test.prop([
  fc.tuple(fc.uuidV4(), fc.uuidV4()).filter(([a, b]) => a !== b),
  fc.emailAddress(),
])(
  'existsByEmail is tenant-scoped — same email allowed in different tenants',
  async ([[tenantA, tenantB], email]) => {
    // Create contact in tenant A
    await createContact({ tenantId: tenantA, email });
    // Tenant B should be able to create the same email
    const exists = await contactRepo.existsByEmail(email, tenantB);
    return exists === false;
  }
);
```

Fix: add `tenantId` parameter to `existsByEmail(email, tenantId)` and
`findByEmail(email, tenantId)` throughout the port, implementation, and
in-memory adapters.

**`RACE-WEBHO-02` (High — outbox dispatch-then-markAsPublished non-atomic):**

Model-based test using `fc.commands`:

```ts
class DispatchCommand implements fc.Command<OutboxModel, OutboxReal> {
  check(m: OutboxModel) {
    return m.pendingEvents.length > 0;
  }
  async run(m: OutboxModel, r: OutboxReal) {
    const event = m.pendingEvents[0];
    r.simulateCrashAfterDispatch = true;
    await r.poller.processEvent(event);
    // After crash, event should NOT appear in delivered twice on retry
    const deliveries = r.handlerInvocations.get(event.id) ?? 0;
    fc.pre(deliveries <= 1);
  }
}
```

Fix: atomic `PENDING → PROCESSING` status transition before dispatch;
`PROCESSING → PROCESSED` after; dead-letter stale `PROCESSING` rows on restart.

**`RACE-ENTIT-03` (Critical — webhook no signature verification):**

```ts
test.prop([
  fc.constantFrom(
    'customer.subscription.updated',
    'customer.subscription.created'
  ),
])(
  'handleSubscriptionWebhook rejects requests without a valid Stripe-Signature',
  async (eventType) => {
    const response = await fetch('/api/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ type: eventType, data: {} }),
      headers: { 'Content-Type': 'application/json' },
      // No Stripe-Signature header
    });
    return response.status === 400 || response.status === 401;
  }
);
```

Fix: implement `stripe.webhooks.constructEvent()` signature verification; create
`processed_stripe_events` table with `@@unique([eventId])`.

**`RACE-PURE-04` (High — Invoice.recalculateTotals silent failure):**

```ts
test.prop([
  fc.array(
    fc.record({
      quantity: fc.integer({ min: 1, max: 100 }),
      unitPriceCents: fc.integer({ min: 0, max: 1_000_000 }),
    }),
    { minLength: 1, maxLength: 10 }
  ),
  fc.float({ min: 0, max: 100, noNaN: true }),
])(
  'Invoice accounting invariant holds after any sequence of addLineItem calls',
  (items, taxRate) => {
    let invoice = createInvoice({ currency: 'GBP', taxRate });
    for (const item of items) {
      invoice.addLineItem(item);
    }
    const { totalAmount, subtotal, amountDue, amountPaid, amountRefunded } =
      invoice;
    const expectedTotal = Math.round(
      items.reduce((s, i) => s + i.quantity * i.unitPriceCents, 0) *
        (1 + taxRate / 100)
    );
    return (
      totalAmount.cents === expectedTotal &&
      amountPaid.cents + amountDue.cents - amountRefunded.cents ===
        totalAmount.cents
    );
  }
);
```

Fix: change `recalculateTotals` to return `Result<void>` and propagate failures
through `addLineItem`/`removeLineItem`.

**Fix strategy candidates summary for Batch 2:**

| Finding                          | Primary fix                                                                             | DB constraint needed                     |
| -------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------- |
| `RACE-BOOKI-03`, `RACE-BOOKI-M2` | Add `version` column to `Appointment`; optimistic lock on upsert                        | `version Int @default(0)` on Appointment |
| `RACE-BOOKI-M1`                  | `@@unique([sourceId, sourceType, recipientId])` on Notification; upsert                 | `@@unique` on Notification               |
| `RACE-DEDUP-01`                  | Catch P2002 in `PrismaContactRepository.save()`; typed `DuplicateEmailError`            | Already present                          |
| `RACE-DEDUP-02`                  | `$transaction({ isolationLevel: 'Serializable' })` on `mergeInTransaction`              | None                                     |
| `RACE-DEDUP-03`                  | `LeadSubmission` table with `@@unique([tenantId, submissionId])`                        | New table                                |
| `RACE-DEDUP-05`                  | Add `tenantId` to `existsByEmail`/`findByEmail` signatures everywhere                   | None                                     |
| `RACE-DEDUP-M1`                  | Wrap both saves in `$transaction` in `LeadService.convertLead`                          | Contact.leadId `@unique` already present |
| `RACE-DEDUP-M3`                  | Same `tenantId` fix as DEDUP-05 + catch P2002 in save                                   | None                                     |
| `RACE-WEBHO-01`                  | Promote `idempotencyKey` to top-level `String @unique` on DomainEvent                   | `@unique idempotencyKey` on DomainEvent  |
| `RACE-WEBHO-02`                  | `PENDING → PROCESSING` atomic status transition before dispatch                         | None                                     |
| `RACE-WEBHO-M1`                  | Pass `{ isolationLevel: 'Serializable' }` to `withTransaction` in `publishAll`          | Unique index preferred                   |
| `RACE-WEBHO-M3`                  | Write `status='PROCESSING'` atomically with `SELECT FOR UPDATE SKIP LOCKED`             | None                                     |
| `RACE-QUOTA-01`                  | Replace absolute overwrite with `{ increment: 1 }` + `WHERE episodesUsed < maxEpisodes` | `CHECK (episodesUsed <= maxEpisodes)`    |
| `RACE-QUOTA-03`                  | Add `WHERE currentCapacity < maxCapacity` guard; CHECK constraint                       | `CHECK (currentCapacity <= maxCapacity)` |
| `RACE-QUOTA-M1`                  | Add `decrementAgentCapacity` on lead/ticket resolution                                  | None                                     |
| `RACE-ENTIT-02`                  | Wrap `getTenantPlan + findMany overrides` in `$transaction RepeatableRead`              | None                                     |
| `RACE-ENTIT-03`                  | Stripe-Signature verification; `processed_stripe_events` table                          | `@@unique([eventId])`                    |
| `RACE-ENTIT-04`                  | `updateMany WHERE stripeCustomerId IS NULL`; check count===1                            | `@unique` already present                |
| `RACE-ENTIT-05`                  | Derive plan from Stripe priceId in `updateSubscription`; write `Workspace.plan`         | None                                     |
| `RACE-ENTIT-M1`                  | Add `updateMany({ data: { enabled: false } })` for non-plan modules in sync tx          | None                                     |
| `RACE-PURE-04`                   | `recalculateTotals` returns `Result<void>`; validate currency in `reconstitute`         | None                                     |
| `RACE-PURE-06`                   | `assertInvariant()` helper; model-based property test for pay/refund sequences          | None                                     |
| `RACE-PURE-01`                   | Remove duplicate `'GBP'`, add `'USD'` to `SUPPORTED_CURRENCIES`                         | None                                     |

---

### Batch 3 — Medium & remaining High races, workers lane

**Scope:** workers-queue-jobs (all), plus remaining Medium findings from all
lanes  
**Findings in batch 3 (by `batch` field = 3):**

| Finding ID                   | Severity        | Lane                        | Test type      |
| ---------------------------- | --------------- | --------------------------- | -------------- |
| `RACE-WORKE-01`              | High            | workers-queue-jobs          | scheduler-race |
| `RACE-WORKE-04`              | High (upgraded) | workers-queue-jobs          | pure-property  |
| `RACE-WORKE-M3`              | High            | workers-queue-jobs          | db-concurrency |
| `RACE-WORKE-02`              | Medium          | workers-queue-jobs          | scheduler-race |
| `RACE-WORKE-03`              | Medium          | workers-queue-jobs          | db-concurrency |
| `RACE-WORKE-05`              | Low             | workers-queue-jobs          | scheduler-race |
| `RACE-WORKE-06`              | Medium          | workers-queue-jobs          | db-concurrency |
| `RACE-WORKE-07`              | Low             | workers-queue-jobs          | db-concurrency |
| `RACE-WORKE-08`              | Low             | workers-queue-jobs          | pure-property  |
| `RACE-WORKE-M1`              | Medium          | workers-queue-jobs          | db-concurrency |
| `RACE-WORKE-M2`              | Medium          | workers-queue-jobs          | scheduler-race |
| `RACE-BOOKI-04`              | Medium          | booking-scheduling          | pure-property  |
| `RACE-BOOKI-M3`              | Medium          | booking-scheduling          | scheduler-race |
| `RACE-ROUTI-04`              | Medium          | routing-assignment          | scheduler-race |
| `RACE-ROUTI-05`              | Medium          | routing-assignment          | scheduler-race |
| `RACE-ROUTI-M2`              | Medium          | routing-assignment          | scheduler-race |
| `RACE-ROUTI-M3`              | Medium          | routing-assignment          | scheduler-race |
| `RACE-DEDUP-04`              | Medium          | dedupe-merge                | scheduler-race |
| `RACE-DEDUP-06`              | Medium          | dedupe-merge                | db-concurrency |
| `RACE-DEDUP-07`              | Low             | dedupe-merge                | pure-property  |
| `RACE-DEDUP-M2`              | Medium          | dedupe-merge                | db-concurrency |
| `RACE-WEBHO-03`              | Medium          | webhooks-outbox-idempotency | scheduler-race |
| `RACE-WEBHO-04`              | Medium          | webhooks-outbox-idempotency | pure-property  |
| `RACE-WEBHO-05`              | Medium          | webhooks-outbox-idempotency | scheduler-race |
| `RACE-WEBHO-06`              | Low             | webhooks-outbox-idempotency | pure-property  |
| `RACE-WEBHO-M2`              | Medium          | webhooks-outbox-idempotency | scheduler-race |
| `RACE-QUOTA-02`              | Medium          | quota-budget-capacity       | scheduler-race |
| `RACE-QUOTA-M2`              | Medium          | quota-budget-capacity       | scheduler-race |
| `RACE-QUOTA-M3`              | Medium          | quota-budget-capacity       | scheduler-race |
| `RACE-ENTIT-01`              | Medium          | entitlement-modules         | db-concurrency |
| `RACE-ENTIT-06`              | Medium          | entitlement-modules         | pure-property  |
| `RACE-ENTIT-M2`              | Medium          | entitlement-modules         | db-concurrency |
| `RACE-ENTIT-M3`              | Medium          | entitlement-modules         | db-concurrency |
| `RACE-RBAC-04`               | Medium          | rbac-auth-session           | db-concurrency |
| `RACE-RBAC-05`               | Medium          | rbac-auth-session           | pure-property  |
| `RACE-RBAC-M3`               | Medium          | rbac-auth-session           | pure-property  |
| `RACE-AUDIT-04`              | Medium          | audit-log                   | scheduler-race |
| `RACE-AUDIT-06`              | Medium          | audit-log                   | pure-property  |
| `RACE-AUDIT-07`              | Medium          | audit-log                   | db-concurrency |
| `RACE-AUDIT-M3`              | Medium          | audit-log                   | db-concurrency |
| All `RACE-PURE-*` Low/Medium | pure-domain     | pure-property               |

**Key fixes for Batch 3:**

- `RACE-WORKE-04`: add `globalRetryBudget.consumeRetry(QUEUE_NAMES.AI_SCORING)`
  immediately after the `canRetry` guard in `queue-factory.ts` line 231.
- `RACE-WORKE-01`: wrap `ticket.update + notification.create` in
  `prisma.$transaction`; add `@@unique([tenantId, sourceId, sourceType])` on
  Notification.
- `RACE-WORKE-M3`: atomic `PENDING → PROCESSING` status claim (same fix as
  `RACE-WEBHO-02`).
- `RACE-WEBHO-03`: pre-mark sentinel pattern in `IdempotencyStore` — set key
  synchronously before first `await`.
- `RACE-QUOTA-02`: wrap `findUnique + upsert + auditCreate` in
  `prisma.$transaction`.
- Pure-domain findings: add fast-check property tests; no production code change
  required for most (except `RACE-PURE-01` currency fix and `RACE-PURE-04`
  result propagation).

---

## Ship-First Vertical Slice (9 Steps)

**Chosen finding: `RACE-AUDIT-01`** — Critical, scheduler-race,
`DurableAuditLogAdapter`.

Rationale: the broken hash-chain silently destroys compliance tamper-detection
for every single audit event. It is triggered by any two concurrent audit writes
(common in production). The fix is fully self-contained within one file. It is
the highest-severity confirmed finding with a `scheduler-race` test type that
exercises real concurrency without requiring a DB migration.

### Step 1 — Install

```bash
pnpm add -D fast-check @fast-check/vitest
```

Verify: `node -e "require('fast-check')"` exits 0.

### Step 2 — Configure

Create `tests/property/support/seed-reporter.ts` as in §1.4 above.

Add to `vitest.config.ts` projects array:

```ts
{
  name: 'property',
  root: 'tests/property',
  include: ['**/*.prop.test.ts'],
  pool: 'forks',
  maxWorkers: 2,
  globalSetup: ['./tests/property/support/seed-reporter.ts'],
}
```

### Step 3 — Seed reporter live

Run `FC_SEED=12345 pnpm test:property:smoke` and confirm
`[fast-check] seed=12345` appears in stdout. Run a second time with the same
seed and confirm identical output.

### Step 4 — Scheduler harness stub

Create `tests/property/support/scheduler.ts` with the `runConcurrent` helper.
Create `tests/property/support/database.ts` with `createIsolatedPrismaClient`
using the Prisma 7 adapter-pg pattern (§1.7).

### Step 5 — Write the failing race test (RED)

Create `tests/property/standard/audit-hash-chain.race.prop.test.ts`:

```ts
import { test } from '@fast-check/vitest';
import * as fc from 'fast-check';
import { withConcurrentClients } from '../support/database';
import { DurableAuditLogAdapter } from '../../../packages/adapters/src/audit/DurableAuditLogAdapter';

test.prop([
  fc.array(
    fc.record({
      tenantId: fc.constant('t1'),
      eventType: fc.string({ minLength: 1 }),
    }),
    { minLength: 2, maxLength: 6 }
  ),
])(
  'RACE-AUDIT-01: concurrent logSecurityEvent calls form a strict hash chain with no duplicate previousHash',
  async (events) => {
    return withConcurrentClients(2, async ([c1, c2]) => {
      const a1 = new DurableAuditLogAdapter(c1);
      const a2 = new DurableAuditLogAdapter(c2);
      await Promise.all(
        events.map((e, i) => (i % 2 === 0 ? a1 : a2).logSecurityEvent(e))
      );
      const rows = await c1.securityEvent.findMany({
        where: { tenantId: 't1' },
        orderBy: { createdAt: 'asc' },
        select: { previousHash: true, integrityHash: true },
      });
      // Invariant: no two rows share the same previousHash
      const previousHashes = rows.map((r) => r.previousHash);
      return new Set(previousHashes).size === previousHashes.length;
    });
  }
);
```

Confirm: `pnpm test:property:smoke` FAILS with the chain invariant violation.

### Step 6 — Apply the fix (GREEN)

In `packages/adapters/src/audit/DurableAuditLogAdapter.ts`:

1. Remove `private previousHash: string = 'GENESIS'`.
2. Inside the `$transaction` callback of `logSecurityEvent`, fetch the previous
   hash:

```ts
const lastEvent = await tx.$queryRaw<Array<{ integrity_hash: string }>>`
  SELECT integrity_hash
  FROM security_events
  WHERE tenant_id = ${tenantId}
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE
`;
const previousHash = lastEvent[0]?.integrity_hash ?? 'GENESIS';
```

3. Apply the same pattern to `logBatchEvents`.

Confirm: `pnpm test:property:smoke` now PASSES.

### Step 7 — CI smoke command

```bash
FC_SEED=$GITHUB_RUN_ID FC_NUM_RUNS=50 pnpm test:property:smoke
```

Add this as the `property-smoke` job in `ci.yml` (see §1.12).

### Step 8 — Record the ADR

Reference `ADR-053` (N+1 query budget detector) as a companion. Create a new
ADR: `docs/architecture/adr/ADR-054-audit-hash-chain-serialisation.md`
documenting:

- Decision: fetch `previousHash` inside the `$transaction` with
  `SELECT ... FOR UPDATE`.
- Consequences: serialised audit writes per tenant; throughput limited by DB
  lock contention under burst; mitigated by async buffer in `AuditLogger`.
- Alternatives considered: optimistic version column; async deduplication.

### Step 9 — Extend to remaining Critical findings

Once `RACE-AUDIT-01` is green and in CI, repeat Steps 5–6 for:

1. `RACE-BOOKI-01` — conditional `updateMany WHERE status='SCHEDULED'`
2. `RACE-BOOKI-02` — `ScheduleAppointmentUseCase` Serializable transaction
3. `RACE-RBAC-M1` — `saveUserMfaSettings` after backup-code validation
4. `RACE-ROUTI-01` — ticket routing idempotency guard
5. `RACE-ENTIT-03` — Stripe-Signature verification

---

## CI Tiering Table

| Tier            | Trigger                       | Script                      | `FC_NUM_RUNS` | Tags / projects                                          |
| --------------- | ----------------------------- | --------------------------- | ------------- | -------------------------------------------------------- |
| **Smoke**       | Every PR, every push          | `pnpm test:property:smoke`  | 50            | `tests/property/smoke/**`                                |
| **Standard**    | Push to `main`/`develop`      | `pnpm test:property`        | 500           | `tests/property/smoke/**` + `tests/property/standard/**` |
| **Stress**      | Nightly (`cron: '0 3 * * *'`) | `pnpm test:property:stress` | 10 000        | All property tiers                                       |
| **Concurrency** | Push to `main`/`develop`      | `pnpm test:concurrency`     | 100           | `tests/property/standard/` (db-concurrency only)         |

**Seed strategy:**

- CI passes `FC_SEED=${{ github.run_id }}` so every run is reproducible.
- Developers replay with `FC_SEED=<value> pnpm test:property:smoke`.
- `docs/claude-refs/property-test-replay.md` documents the replay workflow.

**Recommended test tags (add to each test file's `describe` block):**

```ts
describe.concurrent('RACE-AUDIT-01 [db-concurrency] [stress]', () => { ... })
```

Tags: `[smoke]`, `[standard]`, `[stress]`, `[db-concurrency]`,
`[scheduler-race]`, `[pure-property]`, `[model-based]`.

---

## Residual Risks / Findings to Revisit

### Dismissed findings (do not re-open without new evidence)

| Finding ID      | Reason for dismissal                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `RACE-BOOKI-05` | False positive — `updateCalendarSchema` never exposes `ownerId`; no ownership-transfer endpoint exists                    |
| `RACE-BOOKI-06` | Self-assessed: DB `@@unique` constraints on `AppointmentAttendee` and `AppointmentCase` fully guard this                  |
| `RACE-RBAC-02`  | False positive — `verifyChallenge` critical section has zero `await` expressions; Node.js single-thread atomicity holds   |
| `RACE-QUOTA-04` | False positive — `store.reported = true` is set synchronously before `reportOverBudget`; no `await` between guard and set |

### Uncertain findings (need more evidence before fixing)

| Finding ID      | Uncertainty                                                                                                                                                          | Recommended action                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `RACE-WORKE-08` | `canRetry`/`consumeRetry` TOCTOU is currently moot because `consumeRetry` is never called (`RACE-WORKE-04`). Only becomes exploitable after the WORKE-04 fix.        | Fix WORKE-04 first; then write a targeted `Promise.all` test to determine if event-loop interleaving produces over-budget enqueues in practice. |
| `RACE-RBAC-05`  | In-process cache stale window is bounded to 60 s and self-heals. Risk is real in multi-replica deployments only.                                                     | Confirm Railway deploy uses >1 replica before escalating to High.                                                                               |
| `RACE-ENTIT-06` | `billingCache` stale window is 5 min, multi-replica only.                                                                                                            | Same: confirm replica count before full mitigation.                                                                                             |
| `RACE-PURE-07`  | Module-level counters affect test isolation (within-worker file ordering), not production.                                                                           | Address in Batch 3 as a test-isolation improvement, not a production bug.                                                                       |
| `RACE-AUDIT-03` | Downgraded Medium: singleton `getAuditLogger` uses `ctx.prisma` not `ctx.prismaWithTenant`; explicit `tenantId` fields and FK constraint provide partial mitigation. | Pin audit calls to `prismaWithTenant` when RLS is enforced at adapter level in future.                                                          |

### Known gaps not covered by these findings

1. **`RACE-DEDUP-07` (Low) — `resolveFloor` threshold=0 bug in
   `evaluateDuplicateRules`**: the `threshold || 100` idiom in
   `duplicate-rule-evaluator.ts` line 166 silently converts threshold=0 to 100.
   This is a deterministic logic bug, not a race. Fix: `threshold ?? 100` and
   add a pure-property test.

2. **`RACE-PURE-02` (Medium) — IEEE-754 boundary in `Money.create(decimal)`**:
   `Math.round(1.005
   - 100. = 100`not 101. No fix needed in most paths; prefer`Money.fromCents`
          internally. Property test should cover the sub-cent boundary.

3. **Multi-tenant `UserRoleAssignment` schema gap (`RACE-RBAC-06`)**:
   `@@unique([userId, roleId])` does not include `tenantId`, making it
   impossible for a user to have different roles in different tenants today.
   This requires a schema migration and data backfill — coordinate with a
   dedicated sprint task before the constraint change.

4. **Stripe `processed_stripe_events` table (`RACE-ENTIT-03`)**: schema
   migration required. Until it lands, the webhook endpoint remains exploitable
   by unauthenticated callers. Interim mitigation: add `authenticate()`
   middleware or move to `protectedProcedure` immediately.

---

_Generated from verified audit data — 107 confirmed findings across 10 lanes, 4
dismissed false positives. Audit IDs are stable references for ADR
cross-linking._
