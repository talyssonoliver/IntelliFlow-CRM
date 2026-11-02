/**
 * Serialised schema changes for integration suites.
 *
 * CI builds its test database with `prisma db push`, so several suites apply their
 * migration-only SQL (CHECKs, RLS, rebuilt tables) themselves in `beforeAll`. Vitest
 * runs those files in parallel against the one database, and a `DROP TABLE ... CASCADE`
 * takes AccessExclusive locks child-first while ordinary writes elsewhere (a tenant
 * delete cascading to its children) lock parent-first. Main went red on exactly that:
 * Postgres 40P01 between `DROP TABLE "availability_hours" ... CASCADE` and another
 * suite's `DELETE FROM "tenants"`.
 *
 * Every schema change therefore runs on one dedicated connection that:
 *  1. holds a session advisory lock shared by every DDL suite, so no two suites change
 *     the schema at once. It is taken by polling the try-variant with no transaction
 *     open, so a running `CREATE INDEX CONCURRENTLY` (which waits for every older
 *     transaction to end) never waits on a suite that is queued behind it;
 *  2. runs the DDL as one transaction that first locks, in a single `LOCK TABLE`, every
 *     table the statements name, the tables those reference, and the tables referencing
 *     any table being dropped, so the DDL never holds one table while waiting for another;
 *  3. bounds every lock wait with `lock_timeout` below Postgres's default 1s
 *     `deadlock_timeout`, so if a cycle forms the DDL gives up first and other suites'
 *     writes are never chosen as the deadlock victim;
 *  4. retries that transaction (DDL is transactional in Postgres) after a lock timeout or
 *     a deadlock.
 *
 * `CREATE INDEX CONCURRENTLY` cannot run in a transaction: `createIndexConcurrently` runs
 * it on the same kind of connection, under the same advisory lock, outside any transaction.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';

/** Advisory-lock key shared by every integration suite that changes the schema. */
export const SCHEMA_LOCK_KEY = 202_610_190;

/**
 * Advisory-lock key held by the integration blocks that purge expired unverified DSAR
 * requests. The purge (and the deadline sweep that runs it) works across every firm, so
 * two suites running it in parallel delete each other's rows and race for the sweep's
 * own lock.
 */
export const DSAR_PURGE_SUITE_LOCK_KEY = 202_610_280;

/** Below the server's 1s deadlock_timeout: a waiting DDL times out before any check. */
const LOCK_TIMEOUT = '400ms';
/** Caps the whole up-front LOCK TABLE (it may wait once per table). */
const LOCK_STATEMENT_TIMEOUT = '800ms';
const MAX_ATTEMPTS = 40;
const ADVISORY_DEADLINE_MS = 50_000;

/** Lock-not-available, deadlock, and the LOCK TABLE statement timeout. */
const RETRYABLE = new Set(['55P03', '40P01', '57014']);

/** Postgres SQLSTATE of a failed raw query, whatever layer wrapped it. */
export function sqlState(error: unknown): string | undefined {
  const meta = (error as { meta?: { code?: string } })?.meta;
  if (meta?.code && /^[0-9A-Z]{5}$/.test(meta.code)) return meta.code;
  const message = String((error as { message?: string })?.message ?? '');
  const raw = /Code: `?([0-9A-Z]{5})`?/.exec(message);
  if (raw) return raw[1];
  const text = JSON.stringify(error, Object.getOwnPropertyNames(error as object)) ?? '';
  const nested = /"(?:code|originalCode)":"([0-9A-Z]{5})"/.exec(text);
  return nested?.[1];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (base: number) => base + Math.floor(Math.random() * base);

/** Every double-quoted identifier in the statements; the database decides which are tables. */
function quotedIdentifiers(statements: string[]): string[] {
  const names = new Set<string>();
  for (const stmt of statements) {
    for (const match of stmt.matchAll(/"([^"]+)"/g)) names.add(match[1]);
  }
  return [...names];
}

/** Tables named by `DROP TABLE` statements: dropping one also drops the FKs into it. */
function droppedTables(statements: string[]): string[] {
  return statements
    .filter((stmt) => /^DROP TABLE/i.test(stmt.trim()))
    .flatMap((stmt) => quotedIdentifiers([stmt]));
}

const TABLES_TO_LOCK = `
  WITH named AS (
    SELECT c.oid, c.relname = ANY($2::text[]) AS dropped FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema() AND c.relkind IN ('r', 'p') AND c.relname = ANY($1::text[])
  ), related AS (
    SELECT oid FROM named
    UNION SELECT confrelid FROM pg_constraint WHERE contype = 'f' AND conrelid IN (SELECT oid FROM named)
    UNION SELECT conrelid FROM pg_constraint
      WHERE contype = 'f' AND confrelid IN (SELECT oid FROM named WHERE dropped)
  )
  SELECT c.relname AS name FROM pg_class c WHERE c.oid IN (SELECT oid FROM related) ORDER BY 1`;

/** Poll the try-variant of a session advisory lock until it is held or the deadline passes. */
async function pollAdvisoryLock(session: any, key: number, deadlineMs: number): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    const rows: Array<{ locked: boolean }> = await session.$queryRawUnsafe(
      'SELECT pg_try_advisory_lock($1) AS locked',
      key
    );
    if (rows[0]?.locked) return;
    if (Date.now() > deadline) {
      throw new Error(`advisory lock ${key} not acquired in ${deadlineMs}ms`);
    }
    await sleep(jitter(50));
  }
}

/**
 * Hold a session advisory lock on its own connection until the returned release runs.
 * Suites call it in `beforeAll` and release in `afterAll` to keep a block of tests from
 * overlapping the same block in another file.
 */
export async function holdSuiteLock(
  connectionString: string,
  key: number,
  deadlineMs: number = ADVISORY_DEADLINE_MS
): Promise<() => Promise<void>> {
  const session = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) });
  try {
    await pollAdvisoryLock(session, key, deadlineMs);
  } catch (error) {
    await session.$disconnect();
    throw error;
  }
  return async () => {
    try {
      await session.$queryRawUnsafe('SELECT pg_advisory_unlock($1) AS unlocked', key);
    } finally {
      await session.$disconnect();
    }
  };
}

/**
 * Run `fn` on a dedicated single connection that holds the shared advisory lock.
 * The lock is polled with autocommit statements, so no transaction stays open while
 * this suite waits for another one to finish its schema change.
 */
async function withSchemaLock<T>(
  connectionString: string,
  fn: (session: any) => Promise<T>
): Promise<T> {
  const session = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) });
  try {
    await pollAdvisoryLock(session, SCHEMA_LOCK_KEY, ADVISORY_DEADLINE_MS);
    try {
      return await fn(session);
    } finally {
      await session.$queryRawUnsafe('SELECT pg_advisory_unlock($1) AS unlocked', SCHEMA_LOCK_KEY);
    }
  } finally {
    await session.$disconnect();
  }
}

async function runLocked(
  tx: any,
  statements: string[],
  lockTables: Array<{ name: string }>,
  tolerate: Set<string>
): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
  if (lockTables.length > 0) {
    const list = lockTables.map((t) => `"${t.name.replaceAll('"', '""')}"`).join(', ');
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${LOCK_STATEMENT_TIMEOUT}'`);
    await tx.$executeRawUnsafe(`LOCK TABLE ${list} IN ACCESS EXCLUSIVE MODE`);
    await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 0');
  }
  for (const stmt of statements) {
    if (tolerate.size === 0) {
      await tx.$executeRawUnsafe(stmt);
      continue;
    }
    await tx.$executeRawUnsafe('SAVEPOINT schema_stmt');
    try {
      await tx.$executeRawUnsafe(stmt);
      await tx.$executeRawUnsafe('RELEASE SAVEPOINT schema_stmt');
    } catch (error) {
      const code = sqlState(error);
      if (!code || !tolerate.has(code)) throw error;
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT schema_stmt');
    }
  }
}

export interface ApplySchemaSqlOptions {
  /** SQLSTATEs a single statement may fail with and be skipped (e.g. "already exists"). */
  tolerate?: string[];
}

/** Apply migration-only DDL under the shared schema lock; see the module comment. */
export async function applySchemaSql(
  connectionString: string,
  statements: string[],
  options: ApplySchemaSqlOptions = {}
): Promise<void> {
  if (statements.length === 0) return;
  const tolerate = new Set(options.tolerate ?? []);
  await withSchemaLock(connectionString, async (session) => {
    const lockTables: Array<{ name: string }> = await session.$queryRawUnsafe(
      TABLES_TO_LOCK,
      quotedIdentifiers(statements),
      droppedTables(statements)
    );
    for (let attempt = 1; ; attempt++) {
      try {
        await session.$transaction((tx: any) => runLocked(tx, statements, lockTables, tolerate), {
          maxWait: 10_000,
          timeout: 30_000,
        });
        return;
      } catch (error) {
        const code = sqlState(error);
        if (!code || !RETRYABLE.has(code) || attempt >= MAX_ATTEMPTS) throw error;
        await sleep(jitter(100 * Math.min(attempt, 5)));
      }
    }
  });
}

/** Run one `CREATE INDEX CONCURRENTLY` statement under the shared schema lock. */
export async function createIndexConcurrently(
  connectionString: string,
  statement: string
): Promise<void> {
  await withSchemaLock(connectionString, (session) => session.$executeRawUnsafe(statement));
}
