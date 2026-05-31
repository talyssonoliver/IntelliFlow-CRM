# Property & Race-Condition Test — Authoring & Replay Guide

Companion to
[ADR-054](../architecture/adr/ADR-054-property-based-race-condition-testing.md),
the [audit](../operations/property-testing/PROPERTY_TESTING_AUDIT.md), and the
[invariant ledger](../operations/property-testing/invariant-ledger.md).

Property tests live under `tests/property/` and run in the dedicated `property`
Vitest project (registered in the root `vitest.config.ts`). They use
[`fast-check`](https://fast-check.dev) + `@fast-check/vitest`.

## Layout

```
tests/property/
  vitest.config.ts        # the `property` project (FC_TIER-aware)
  tsconfig.json           # type-checks the tree (extends the shared base)
  support/
    config.ts             # tier -> numRuns; propertyParams()
    seed-reporter.ts      # FC_SEED/FC_PATH replay helpers
    setup.ts              # configureGlobal() per tier (loaded via setupFiles)
    concurrent.ts         # runConcurrently / tally (real-DB contention)
    scheduler.ts          # fc.scheduler() interleaving harness
    assertions.ts         # expectExactlyOneFulfilled / expectNeverNegative / ...
    database.ts           # isolated multi-client Prisma sandbox (describeDb/itDb)
    arbitraries/          # domain arbitraries (primitives, temporal, ...)
    model/ , commands/    # model-based testing helpers
  unit/                   # pure-domain property tests (no infra)
  integration/            # application-layer (ports / test adapters)
  concurrency/            # real-DB race tests (require a database)
```

Test files MUST be named `*.prop.test.ts` to be picked up by the project.

## Tiers

Run count scales with `FC_TIER`; the properties are identical across tiers, so a
failure reproduces in every tier given the same seed.

| Tier     | `FC_TIER`  | runs/property  | Where it runs  | Command                       |
| -------- | ---------- | -------------- | -------------- | ----------------------------- |
| Smoke    | `smoke`    | 25             | PR gate        | `pnpm test:property:smoke`    |
| Standard | `standard` | 200            | push to `main` | `pnpm test:property:standard` |
| Stress   | `stress`   | 1000 (60s cap) | nightly cron   | `pnpm test:property:stress`   |

`pnpm test:property` runs the project at the default (smoke) tier.
`pnpm test:concurrency` runs only `tests/property/concurrency/**`.

## Replaying a failure (deterministic)

fast-check prints the failing `seed` and `path` in its banner, e.g.:

```
Property failed after 12 tests
{ seed: 1846294759, path: "7:2:1", endOnFailure: true }
Counterexample: [ ... shrunk input ... ]
```

Reproduce that exact case by pinning the seed (and optionally the path):

```bash
FC_TIER=smoke FC_SEED=1846294759 FC_PATH=7:2:1 pnpm test:property
```

`support/setup.ts` reads `FC_SEED`/`FC_PATH` and feeds them to
`fc.configureGlobal`, so CI red == local red. Use `replayCommand(seed, path)`
from `support/seed-reporter.ts` to render this string programmatically.

> **Never** hide a flaky property by lowering `numRuns` or raising timeouts. If
> a property is flaky, it has found a real non-determinism — fix the code or
> quarantine the test with an owner + issue link (per ADR-054).

## Writing a pure-domain property (no infra)

```ts
import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { Money } from '@intelliflow/domain';

describe('Money (property)', () => {
  test.prop([fc.integer({ min: 0 }), fc.constantFrom('GBP', 'EUR')])(
    'fromCents round-trips',
    (cents, cur) => {
      const m = Money.fromCents(cents, cur).value;
      expect(m.cents).toBe(cents);
    }
  );
});
```

## Writing a real-DB concurrency test

Requires an explicit opt-in: `RUN_DB_PROPERTY_TESTS=1` **and** a throwaway
`TEST_DATABASE_URL`. These tests `TRUNCATE` tables and write concurrently, so
they deliberately ignore the ambient `DATABASE_URL` (which the root Vitest
config injects from `.env*` and may point at a dev database). Guard with
`describeDb`/`itDb` so the test SKIPS — never fails — when the opt-in is absent.
`support/setup.ts` also pins the `@intelliflow/db` singleton to
`TEST_DATABASE_URL` so repository-level tests can never reach a dev/prod DB.

```ts
import fc from 'fast-check';
import { expect } from 'vitest';
import {
  describeDb,
  itDb,
  withIsolatedClients,
  truncate,
  runAllConcurrently,
  expectExactlyOneFulfilled,
  propertyParams,
} from '../support';

describeDb('Appointment double-booking', () => {
  itDb('at most one of N concurrent confirms wins', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 8 }), async (n) => {
        await withIsolatedClients(n, async (clients) => {
          // ...seed a slot, fire N concurrent confirms (one per client)...
          const tally = await runAllConcurrently(
            clients.map((c) => () => confirm(c))
          );
          expectExactlyOneFulfilled(tally, 'appointment confirm');
        });
      }),
      propertyParams()
    );
  });
});
```

Each concurrent actor gets its OWN `PrismaClient` (own pool) via
`createIsolatedClient` — a single shared client serialises row locks and would
make a real race silently pass.

## Local prerequisites for concurrency tests

```bash
# bring up a throwaway pgvector Postgres and point the tests at it
docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test \
  -e POSTGRES_DB=ifc_proptest --name ifc-proptest pgvector/pgvector:pg16
export TEST_DATABASE_URL=postgresql://test:test@localhost:5433/ifc_proptest
psql "$TEST_DATABASE_URL" -c 'CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS btree_gist; CREATE EXTENSION IF NOT EXISTS pg_trgm;'
pnpm --filter @intelliflow/db exec prisma db push --url "$TEST_DATABASE_URL"
# apply EXCLUDE constraints that schema.prisma can't express (e.g. no double-booking)
psql "$TEST_DATABASE_URL" -f packages/db/prisma/migrations/20260530000000_appointment_no_overlap_exclusion/migration.sql
pnpm test:concurrency   # already sets RUN_DB_PROPERTY_TESTS=1 + FC_TIER=standard
```

> `db push` provisions the schema but NOT the raw-SQL EXCLUDE constraints —
> apply those migration files explicitly (as above), or use
> `prisma migrate deploy`.
