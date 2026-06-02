/**
 * Real-database sandbox for repository/application concurrency tests.
 *
 * Two hard requirements drove this module (audit findings RACE-TEST--M1/M3):
 *
 *  1. **Multiple connection pools.** A single shared `PrismaClient` serialises
 *     row-level locks at the client, so concurrent transactions never actually
 *     contend and a race silently "passes". Each concurrent actor in a race test
 *     MUST own an isolated `PrismaClient` (its own `pg` pool). `createIsolatedClient`
 *     builds one with the Prisma-7 `@prisma/adapter-pg` driver adapter (NOT the
 *     Prisma-5 `datasources.db.url` API, which throws under `engineType="client"`).
 *
 *  2. **Graceful skip.** When no `DATABASE_URL`/`TEST_DATABASE_URL` is present
 *     (e.g. local dev without Docker) these tests SKIP rather than fail — mirrors
 *     `tests/integration/setup.ts`. Use `describeDb`/`itDb` so CI without a DB
 *     stays green instead of flaky-red.
 *
 * Imports are lazy so importing the support barrel never constructs a client or
 * a pool when no DB is configured.
 *
 * @module tests/property/support/database
 */

import { describe, it } from 'vitest';

/** Any Prisma client (raw, un-extended) — kept loose to avoid a generated-type import. */
export type RawPrismaClient = {
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
  $disconnect: () => Promise<void>;
  [key: string]: unknown;
};

/**
 * True only when DB property tests are EXPLICITLY enabled against a throwaway
 * database. These tests TRUNCATE tables and fire concurrent writes, so they must
 * never touch a dev/prod database. The root Vitest config injects `DATABASE_URL`
 * from `.env*`, so we deliberately do NOT key off `DATABASE_URL` — only an opt-in
 * flag plus a dedicated `TEST_DATABASE_URL`.
 */
export function isDbAvailable(): boolean {
  return process.env.RUN_DB_PROPERTY_TESTS === '1' && Boolean(process.env.TEST_DATABASE_URL);
}

/** `describe` that skips (not fails) when no test database is configured. */
export const describeDb = (name: string, fn: () => void): void => {
  if (isDbAvailable()) describe(name, fn);
  else describe.skip(`${name} [skipped: no TEST_DATABASE_URL]`, fn);
};

/** `it` that skips (not fails) when no test database is configured. */
export const itDb = (name: string, fn: () => void | Promise<void>, timeout?: number): void => {
  if (isDbAvailable()) it(name, fn, timeout);
  else it.skip(`${name} [skipped: no TEST_DATABASE_URL]`, fn, timeout);
};

function connectionString(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'createIsolatedClient requires a throwaway TEST_DATABASE_URL (and RUN_DB_PROPERTY_TESTS=1). ' +
        'Guard concurrency tests with describeDb/itDb so they skip when it is absent.'
    );
  }
  return url;
}

async function loadDeps(): Promise<{
  PrismaClient: new (opts: unknown) => RawPrismaClient;
  PrismaPg: new (opts: unknown) => unknown;
}> {
  const [db, adapter] = await Promise.all([
    // Static specifier so the Vitest `@intelliflow/db` alias resolves at runtime.
    import('@intelliflow/db'),
    import('@prisma/adapter-pg'),
  ]);
  return {
    PrismaClient: (db as unknown as { PrismaClient: new (opts: unknown) => RawPrismaClient })
      .PrismaClient,
    PrismaPg: (adapter as unknown as { PrismaPg: new (opts: unknown) => unknown }).PrismaPg,
  };
}

/**
 * Build a fresh, raw `PrismaClient` with its OWN `pg` connection pool via the
 * Prisma-7 driver adapter. Each call = an independent actor capable of holding
 * its own row locks. ALWAYS `$disconnect()` it (or use `withIsolatedClients`).
 */
export async function createIsolatedClient(): Promise<RawPrismaClient> {
  const { PrismaClient, PrismaPg } = await loadDeps();
  const adapter = new PrismaPg({ connectionString: connectionString() });
  return new PrismaClient({ adapter });
}

/**
 * Create `n` isolated clients (n independent pools), run `fn` with them, and
 * disconnect them all in `finally`. The standard setup for "N concurrent writers".
 */
export async function withIsolatedClients<T>(
  n: number,
  fn: (clients: RawPrismaClient[]) => Promise<T>
): Promise<T> {
  const clients = await Promise.all(Array.from({ length: n }, () => createIsolatedClient()));
  try {
    return await fn(clients);
  } finally {
    await Promise.allSettled(clients.map((c) => c.$disconnect()));
  }
}

/**
 * Truncate the given tables (CASCADE, identity restart) on a client — fast
 * per-test isolation without dropping the schema. Pass physical table names
 * (the `@@map` value), e.g. `appointments`, `domain_events`.
 */
export async function truncate(client: RawPrismaClient, tables: string[]): Promise<void> {
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t}"`).join(', ');
  await client.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
}
