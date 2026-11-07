/**
 * The sessions list and revoke over Supabase Auth sessions (`auth.sessions`).
 *
 * A user can end another of their own sessions, never the one making the request, and
 * never another user's: the delete is scoped to the user, so another user's session id
 * removes nothing and is answered like a missing one. The legacy app SessionService is
 * still covered below until its table is removed (#1209).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authRouter } from '../auth.router';
import { getSessionService, resetSessionService } from '../../../services/session.service';
import { createTestContext, prismaMock, TEST_UUIDS } from '../../../test/setup';

const audit = vi.hoisted(() => ({ log: vi.fn().mockResolvedValue(undefined) }));

vi.mock('../../../security/audit-logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../security/audit-logger')>()),
  getAuditLogger: () => audit,
}));

const ME = TEST_UUIDS.user1;
const OTHER = TEST_UUIDS.user2;
const UNKNOWN_ID = 'ab'.repeat(32);

const service = () => getSessionService(prismaMock as never);
const session = (userId: string) =>
  service().createSession({ userId, tenantId: TEST_UUIDS.tenant });

function dbRow(id: string, userId: string) {
  const now = new Date();
  return {
    id,
    userId,
    tenantId: TEST_UUIDS.tenant,
    deviceInfo: {},
    ipAddress: null,
    userAgent: null,
    refreshToken: null,
    rememberMe: false,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 3_600_000),
    createdAt: now,
  };
}

beforeEach(() => {
  resetSessionService();
  audit.log.mockClear();
  prismaMock.session.upsert.mockResolvedValue({} as never);
  prismaMock.session.findMany.mockResolvedValue([]);
  prismaMock.session.findUnique.mockResolvedValue(null);
  prismaMock.session.delete.mockClear();
});

/** Supabase Auth session ids (the token's `session_id`). */
const CURRENT_SESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_DEVICE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** `null` gives a request with no Supabase session id. */
const callerOnSession = (sessionId: string | null = CURRENT_SESSION) => {
  const base = createTestContext();
  return authRouter.createCaller({
    ...base,
    user: { ...base.user!, ...(sessionId ? { sessionId } : {}) },
  });
};

/** The SQL text of a Prisma tagged-template call, with its parameters. */
function rawCall(mock: { mock: { calls: unknown[][] } }, index = 0) {
  const [strings, ...values] = mock.mock.calls[index] as [TemplateStringsArray, ...unknown[]];
  return { sql: strings.join('?'), values };
}

describe('auth.getSessions (Supabase Auth sessions)', () => {
  it('lists the live sessions, most recent first, marking the one making the request', async () => {
    const old = new Date('2026-11-01T10:00:00Z');
    const recent = new Date('2026-11-06T10:00:00Z');
    prismaMock.$queryRaw.mockResolvedValue([
      {
        id: CURRENT_SESSION,
        created_at: old,
        updated_at: old,
        refreshed_at: null,
        user_agent: 'Mozilla/5.0',
        ip: '203.0.113.7',
        not_after: null,
      },
      {
        id: OTHER_DEVICE,
        created_at: old,
        updated_at: recent,
        refreshed_at: null,
        user_agent: null,
        ip: null,
        not_after: null,
      },
    ] as never);

    const { sessions } = await callerOnSession().getSessions();

    expect(sessions.map((s) => [s.id, s.isCurrent])).toEqual([
      [OTHER_DEVICE, false],
      [CURRENT_SESSION, true],
    ]);
    const { sql, values } = rawCall(prismaMock.$queryRaw);
    expect(sql).toContain('FROM auth.sessions');
    expect(sql).toContain('user_id = ?::uuid');
    expect(values).toEqual([ME]);
  });
});

describe('auth.revokeSession (Supabase Auth sessions)', () => {
  it("ends another of the user's sessions, scoped to the user, and audits it", async () => {
    prismaMock.$executeRaw.mockResolvedValue(1 as never);

    await expect(callerOnSession().revokeSession({ sessionId: OTHER_DEVICE })).resolves.toEqual({
      success: true,
    });

    const { sql, values } = rawCall(prismaMock.$executeRaw);
    expect(sql).toContain('DELETE FROM auth.sessions');
    expect(sql).toContain('id = ?::uuid');
    expect(sql).toContain('user_id = ?::uuid');
    expect(values).toEqual([OTHER_DEVICE, ME, CURRENT_SESSION]);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'SessionRevoked',
        resourceId: OTHER_DEVICE,
        actorId: ME,
      })
    );
  });

  it("answers another user's session id NOT_FOUND: the user-scoped delete removes nothing", async () => {
    prismaMock.$executeRaw.mockResolvedValue(0 as never);

    await expect(
      callerOnSession().revokeSession({ sessionId: OTHER_DEVICE })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Session not found' });

    expect(rawCall(prismaMock.$executeRaw).values).toEqual([OTHER_DEVICE, ME, CURRENT_SESSION]);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('never ends the session making the request, even spelled in upper case', async () => {
    await expect(
      callerOnSession().revokeSession({ sessionId: CURRENT_SESSION.toUpperCase() })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it('never ends the session making the request', async () => {
    await expect(
      callerOnSession().revokeSession({ sessionId: CURRENT_SESSION })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it.each([
    ['an app session id', 'ab'.repeat(32)],
    ['a cuid', 'c1234567890abcdef'],
    ['an empty string', ''],
  ])('refuses %s at input validation', async (_name, sessionId) => {
    await expect(callerOnSession().revokeSession({ sessionId })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('auth.revokeOtherSessions', () => {
  it('ends every other session of the user and keeps this one', async () => {
    prismaMock.$executeRaw.mockResolvedValue(2 as never);

    await expect(callerOnSession().revokeOtherSessions()).resolves.toEqual({ ended: 2 });

    const { sql, values } = rawCall(prismaMock.$executeRaw);
    expect(sql).toContain('DELETE FROM auth.sessions');
    expect(sql).toContain('id <> ?::uuid');
    expect(values).toEqual([ME, CURRENT_SESSION]);
  });

  it('refuses when the request has no session to keep, ending nothing', async () => {
    await expect(callerOnSession(null).revokeOtherSessions()).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('SessionService.revokeUserSession', () => {
  it('revokes the own session and removes it from the user list', async () => {
    const mine = await session(ME);

    await expect(service().revokeUserSession(ME, mine.id)).resolves.toBe(true);

    expect((await service().getUserSessions(ME)).map((s) => s.id)).not.toContain(mine.id);
  });

  it("does not revoke another user's session", async () => {
    const theirs = await session(OTHER);

    await expect(service().revokeUserSession(ME, theirs.id)).resolves.toBe(false);

    expect((await service().getUserSessions(OTHER)).map((s) => s.id)).toContain(theirs.id);
  });

  it('returns false for an unknown session', async () => {
    await expect(service().revokeUserSession(ME, UNKNOWN_ID)).resolves.toBe(false);
  });

  // Sessions live in this process's memory and the database, so a session created
  // on another instance is only in the database.
  it('revokes the own session when it is only in the database', async () => {
    prismaMock.session.findUnique.mockResolvedValue(dbRow(UNKNOWN_ID, ME) as never);

    await expect(service().revokeUserSession(ME, UNKNOWN_ID)).resolves.toBe(true);

    expect(prismaMock.session.delete).toHaveBeenCalledWith({ where: { id: UNKNOWN_ID } });
  });

  it("does not revoke another user's session that is only in the database", async () => {
    prismaMock.session.findUnique.mockResolvedValue(dbRow(UNKNOWN_ID, OTHER) as never);

    await expect(service().revokeUserSession(ME, UNKNOWN_ID)).resolves.toBe(false);

    expect(prismaMock.session.delete).not.toHaveBeenCalled();
  });
});
