/**
 * createContext refuses a signed, unexpired token whose Supabase session has ended.
 *
 * The check is one indexed lookup in `auth.sessions` per session-cache miss. An ended session's
 * token keeps working only while a cached resolution is still fresh: at most the cache TTL on an
 * instance that did not end it, and not at all on the instance that did (it evicts the user).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    tenantMembership: { findMany: vi.fn() },
    partnerLoginGrant: { findFirst: vi.fn(), findMany: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  };
  return { prisma, verifyToken: vi.fn() };
});

vi.mock('../container', () => ({
  container: {},
  containerReady: Promise.resolve(),
  apiPrisma: mocks.prisma,
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: { auth: { admin: { updateUserById: vi.fn().mockResolvedValue({}) } } },
  verifyToken: mocks.verifyToken,
}));

import { createContext } from '../context';
import {
  SESSION_CACHE_TTL_MS,
  clearAllSessionCaches,
  invalidateUserSessions,
} from '../security/session-cache';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const dbUser = {
  id: USER_ID,
  email: 'member@example.com',
  name: 'Member',
  role: 'SALES_REP',
  tenantId: 'tenant-home',
  stripeCustomerId: null,
  timezone: 'Europe/London',
  avatarUrl: null,
  emailVerified: true,
};

function token(payload: Record<string, unknown>) {
  return `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
}
/** `null` builds a token with no `session_id` claim. */
const sessionToken = (sessionId: string | null = SESSION) =>
  token({ sub: USER_ID, ...(sessionId ? { session_id: sessionId } : {}), amr: [] });

const request = (t: string) =>
  new Request('http://localhost/api/trpc/x', { headers: { authorization: `Bearer ${t}` } });

const alive = () => mocks.prisma.$queryRaw.mockResolvedValue([{ alive: 1 }]);
const ended = () => mocks.prisma.$queryRaw.mockResolvedValue([]);

/** SQL text and parameters of the n-th `$queryRaw` call. */
function lookup(index = 0) {
  const [strings, ...values] = mocks.prisma.$queryRaw.mock.calls[index] as [
    TemplateStringsArray,
    ...unknown[],
  ];
  return { sql: strings.join('?'), values };
}

beforeEach(() => {
  clearAllSessionCaches();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.prisma.user.findUnique.mockResolvedValue(dbUser);
  mocks.prisma.user.update.mockResolvedValue(dbUser);
  mocks.prisma.tenantMembership.findMany.mockResolvedValue([]);
  mocks.prisma.partnerLoginGrant.findFirst.mockResolvedValue(null);
  mocks.prisma.partnerLoginGrant.findMany.mockResolvedValue([]);
  mocks.verifyToken.mockResolvedValue({
    user: { id: USER_ID, email: dbUser.email, user_metadata: {}, email_confirmed_at: '2026-01-01' },
    error: null,
  });
  alive();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('createContext: ended Supabase sessions', () => {
  it('passes a live session with one indexed lookup, then serves it from the cache', async () => {
    const first = await createContext({ req: request(sessionToken()) });
    const second = await createContext({ req: request(sessionToken()) });

    expect(first.user?.userId).toBe(USER_ID);
    expect(second.user?.userId).toBe(USER_ID);
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(1);

    const { sql, values } = lookup();
    expect(sql).toContain('FROM auth.sessions');
    expect(sql).toContain('id = ?::uuid');
    expect(sql).toContain('user_id = ?::uuid');
    expect(sql).toContain('LIMIT 1');
    expect(values).toEqual([SESSION, USER_ID]);
  });

  it('refuses a token whose session has ended', async () => {
    ended();
    const ctx = await createContext({ req: request(sessionToken()) });
    expect(ctx.user).toBeNull();
    expect(ctx.pendingUser).toBeUndefined();
  });

  it('refuses the token once the cached resolution expires, on an instance that did not end it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));

    expect((await createContext({ req: request(sessionToken()) })).user).not.toBeNull();

    // The session ends elsewhere (another instance handled the revoke).
    ended();

    // Within the TTL the cached resolution still answers, with no new lookup.
    vi.setSystemTime(new Date(Date.now() + SESSION_CACHE_TTL_MS - 1_000));
    expect((await createContext({ req: request(sessionToken()) })).user).not.toBeNull();
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(1);

    // After the TTL the check runs again and refuses it.
    vi.setSystemTime(new Date(Date.now() + 2_000));
    expect((await createContext({ req: request(sessionToken()) })).user).toBeNull();
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('refuses the token at once on the instance that ended the session (it evicts the user)', async () => {
    expect((await createContext({ req: request(sessionToken()) })).user).not.toBeNull();

    ended();
    invalidateUserSessions(USER_ID);

    expect((await createContext({ req: request(sessionToken()) })).user).toBeNull();
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('refuses a session id that is not a UUID without querying', async () => {
    const ctx = await createContext({ req: request(sessionToken('not-a-session-id')) });
    expect(ctx.user).toBeNull();
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('passes a token that carries no session id, with no lookup', async () => {
    const ctx = await createContext({ req: request(sessionToken(null)) });
    expect(ctx.user?.userId).toBe(USER_ID);
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('treats the request as signed out in production when the sessions table cannot be read', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mocks.prisma.$queryRaw.mockRejectedValue(new Error('relation "auth.sessions" does not exist'));

    const ctx = await createContext({ req: request(sessionToken()) });
    expect(ctx.user).toBeNull();
  });

  it('treats any other lookup failure as signed out, outside production too', async () => {
    mocks.prisma.$queryRaw.mockRejectedValue(new Error('connection terminated'));

    const ctx = await createContext({ req: request(sessionToken()) });
    expect(ctx.user).toBeNull();
  });

  it('skips the check outside production when the database has no auth schema', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    mocks.prisma.$queryRaw.mockRejectedValue(new Error('relation "auth.sessions" does not exist'));

    const ctx = await createContext({ req: request(sessionToken()) });
    expect(ctx.user?.userId).toBe(USER_ID);
  });
});
