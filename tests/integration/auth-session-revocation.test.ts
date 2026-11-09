/**
 * Ended sessions against a real Postgres (#1216 item 1, after #1217).
 *
 * `createContext` refuses a signed, unexpired token whose Supabase session has ended, by asking
 * `isAuthSessionAlive` (apps/api/src/security/auth-sessions.ts). The wiring is unit-tested with a
 * mocked database (apps/api/src/__tests__/context.ended-session.test.ts). This suite runs the
 * module's real SQL: the uuid casts, the `not_after` check, the per-user scoping, and the guard
 * that a request cannot end its own session.
 *
 * The test database is plain Postgres without GoTrue, so each test builds `auth.sessions` with
 * the columns GoTrue defines and this module reads, inside one transaction that always rolls
 * back. Postgres DDL is transactional: no other suite ever sees the table, and nothing remains.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createIsolatedTestPrismaClient } from './setup';
import {
  endAuthSession,
  endOtherAuthSessions,
  isAuthSessionAlive,
  listAuthSessions,
} from '../../apps/api/src/security/auth-sessions';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

class Rollback extends Error {}

describeDb('ended sessions on a real database', () => {
  let prisma: any;

  beforeAll(() => {
    prisma = createIsolatedTestPrismaClient();
  });

  // No client when the harness cannot load the database package (the local coverage run,
  // #1117): skip, as the other real-database suites do. The silent-skip gate holds CI to
  // running every test (tools/scripts/infra-skip-gate.registry.json).
  beforeEach((ctx) => {
    if (!prisma) ctx.skip();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  /** Run `fn` against a fresh auth.sessions table, then roll everything back. */
  async function withSessionsTable(fn: (tx: any) => Promise<void>): Promise<void> {
    const existing = await prisma.$queryRawUnsafe(
      `SELECT to_regclass('auth.sessions') IS NOT NULL AS present`
    );
    // A Supabase database has the real table, whose user_id references auth.users; the CI and
    // ephemeral pre-ship databases do not. Building a second one there would be wrong.
    expect(existing[0].present, 'expects a database without GoTrue').toBe(false);
    try {
      await prisma.$transaction(async (tx: any) => {
        await tx.$executeRawUnsafe('CREATE SCHEMA auth');
        await tx.$executeRawUnsafe(`
          CREATE TABLE auth.sessions (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz,
            refreshed_at timestamp without time zone,
            user_agent text,
            ip inet,
            not_after timestamptz
          )`);
        await fn(tx);
        throw new Rollback();
      });
    } catch (err) {
      if (!(err instanceof Rollback)) throw err;
    }
  }

  async function addSession(
    tx: any,
    userId: string,
    notAfter: string | null = null
  ): Promise<string> {
    const id = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO auth.sessions (id, user_id, ip, user_agent, not_after)
       VALUES ($1::uuid, $2::uuid, '192.0.2.10', 'test-agent', $3::timestamptz)`,
      id,
      userId,
      notAfter
    );
    return id;
  }

  it('a session ended from the sessions list is no longer alive, so its token is refused', async () => {
    await withSessionsTable(async (tx) => {
      const user = randomUUID();
      const current = await addSession(tx, user);
      const other = await addSession(tx, user);

      expect(await isAuthSessionAlive(tx, user, other)).toBe(true);
      expect(await endAuthSession(tx, user, other, current)).toBe('ENDED');
      expect(await isAuthSessionAlive(tx, user, other)).toBe(false);
      expect(await isAuthSessionAlive(tx, user, current)).toBe(true);
    });
  });

  it('a session past not_after is refused and not listed', async () => {
    await withSessionsTable(async (tx) => {
      const user = randomUUID();
      const expired = await addSession(tx, user, '2000-01-01T00:00:00Z');
      const live = await addSession(tx, user);

      expect(await isAuthSessionAlive(tx, user, expired)).toBe(false);
      const listed = await listAuthSessions(tx, user, live);
      expect(listed.map((s) => s.id)).toEqual([live]);
      expect(listed[0]).toMatchObject({ isCurrent: true, ipAddress: '192.0.2.10' });
    });
  });

  it("another user's session id is neither alive for this user nor ended by them", async () => {
    await withSessionsTable(async (tx) => {
      const owner = randomUUID();
      const intruder = randomUUID();
      const ownerSession = await addSession(tx, owner);
      const intruderSession = await addSession(tx, intruder);

      expect(await isAuthSessionAlive(tx, intruder, ownerSession)).toBe(false);
      expect(await endAuthSession(tx, intruder, ownerSession, intruderSession)).toBe('NOT_FOUND');
      expect(await isAuthSessionAlive(tx, owner, ownerSession)).toBe(true);
    });
  });

  it('ending the other sessions keeps the current one, in any letter case', async () => {
    await withSessionsTable(async (tx) => {
      const user = randomUUID();
      const current = await addSession(tx, user);
      const a = await addSession(tx, user);
      const b = await addSession(tx, user);

      expect(await endAuthSession(tx, user, current.toUpperCase(), current)).toBe('CURRENT');
      expect(await endOtherAuthSessions(tx, user, current)).toBe(2);
      expect(await isAuthSessionAlive(tx, user, current)).toBe(true);
      expect(await isAuthSessionAlive(tx, user, a)).toBe(false);
      expect(await isAuthSessionAlive(tx, user, b)).toBe(false);
    });
  });
});
