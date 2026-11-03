/**
 * Revoking one session (#1145, #1146): the real router over the real SessionService.
 *
 * A user can revoke a session that getSessions listed, whatever its generated id
 * looks like, and only a session of their own. Another user's session is answered
 * like a missing one and stays valid.
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

const caller = () => authRouter.createCaller(createTestContext());
const service = () => getSessionService(prismaMock as never);
const session = (userId: string) =>
  service().createSession({ userId, tenantId: TEST_UUIDS.tenant });

/** A real generated id that the old id format refused: most of them. */
async function sessionNotStartingWithC(userId: string) {
  let created = await session(userId);
  while (created.id.startsWith('c')) {
    await service().revokeSession(created.id);
    created = await session(userId);
  }
  return created;
}

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

describe('auth.revokeSession', () => {
  it('revokes a session that getSessions listed, for an id not starting with c', async () => {
    const created = await sessionNotStartingWithC(ME);

    const { sessions } = await caller().getSessions();
    const listed = sessions.find((s) => s.id === created.id);
    expect(listed?.id.startsWith('c')).toBe(false);

    await expect(caller().revokeSession({ sessionId: listed!.id })).resolves.toEqual({
      success: true,
    });

    expect((await caller().getSessions()).sessions.map((s) => s.id)).not.toContain(created.id);
    expect(prismaMock.session.delete).toHaveBeenCalledWith({ where: { id: created.id } });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'SessionRevoked',
        resourceId: created.id,
        actorId: ME,
      })
    );
  });

  it("answers another user's session NOT_FOUND, like a missing one, and leaves it", async () => {
    const theirs = await sessionNotStartingWithC(OTHER);

    const foreign = await caller()
      .revokeSession({ sessionId: theirs.id })
      .catch((e: unknown) => e);
    const missing = await caller()
      .revokeSession({ sessionId: UNKNOWN_ID })
      .catch((e: unknown) => e);

    expect(foreign).toMatchObject({ code: 'NOT_FOUND', message: 'Session not found' });
    expect(missing).toMatchObject({ code: 'NOT_FOUND', message: 'Session not found' });

    expect((await service().validateSession(theirs.id)).valid).toBe(true);
    expect(prismaMock.session.delete).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it.each([
    ['a uuid', '550e8400-e29b-41d4-a716-446655440000'],
    ['a cuid', 'c1234567890abcdef'],
    ['a short hex id', 'ab'.repeat(31)],
    ['upper-case hex', 'AB'.repeat(32)],
  ])('refuses %s at input validation', async (_name, sessionId) => {
    await expect(caller().revokeSession({ sessionId })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
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
