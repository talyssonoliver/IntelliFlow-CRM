/**
 * The 60-second cache of Supabase-verified users in front of `auth.getUser` (egress audit 1126).
 *
 * Same harness as supabase.verify-token.test.ts: the real jose verifier against a local key, with
 * only the network faked. A symmetric (HS256) session is the case that reaches Supabase on every
 * request, so that is the token used here.
 *
 * Proves: a burst asks Supabase once; a session Supabase later refuses stops working within 60 s;
 * sign-out, a password reset, and a role or membership change (`invalidateUserSessions`) take
 * effect at once; refusals are never cached; a different token is never served another's user.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser, admin: { signOut: mocks.signOut } } }),
}));

const SUPABASE_URL = 'https://auth.example.invalid';
const ISSUER = `${SUPABASE_URL}/auth/v1`;

type Jose = typeof import('jose', { with: { 'resolution-mode': 'import' } });
let jose: Jose;

function signSymmetric(subject: string, expiresIn = '1h'): Promise<string> {
  return new jose.SignJWT({ email: `${subject}@example.invalid` })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode('0123456789abcdef0123456789abcdef'));
}

function allowJoseImport() {
  const RealFunction = globalThis.Function;
  const stub = function (...args: string[]) {
    return args[0] === 'return import("jose")' ? () => import('jose') : RealFunction(...args);
  };
  stub.prototype = RealFunction.prototype;
  vi.stubGlobal('Function', stub);
}

async function load() {
  const supabase = await import('../supabase.js');
  const cache = await import('../verified-token-cache.js');
  const sessionCache = await import('../../security/session-cache.js');
  return { ...supabase, ...cache, ...sessionCache };
}

const confirmed = (id: string) => ({
  data: { user: { id, email: `${id}@example.invalid` } },
  error: null,
});
const refused = () => ({ data: { user: null }, error: new Error('session revoked') });

beforeAll(async () => {
  jose = await import('jose');
});

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon-value-for-tests');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-value-for-tests');
  mocks.getUser.mockReset();
  mocks.signOut.mockReset().mockResolvedValue({ error: null });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  allowJoseImport();
  // The JWKS has no key: a symmetric token cannot be decided locally and goes to Supabase.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ keys: [] }))
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('verifyToken cache: fewer Supabase round trips', () => {
  it('a burst of requests with one token asks Supabase once', async () => {
    mocks.getUser.mockResolvedValue(confirmed('user-1'));
    const { verifyToken } = await load();
    const token = await signSymmetric('user-1');

    for (let i = 0; i < 25; i++) {
      const r = await verifyToken(token);
      expect(r.user?.id).toBe('user-1');
    }
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });

  it("two different tokens are each verified, and never served each other's user", async () => {
    mocks.getUser.mockImplementation(async (t: string) =>
      confirmed(t === tokenA ? 'user-a' : 'user-b')
    );
    const { verifyToken } = await load();
    const tokenA = await signSymmetric('user-a');
    const tokenB = await signSymmetric('user-b');

    expect((await verifyToken(tokenA)).user?.id).toBe('user-a');
    expect((await verifyToken(tokenB)).user?.id).toBe('user-b');
    expect((await verifyToken(tokenA)).user?.id).toBe('user-a');
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it('a locally verified session never touches the cache or Supabase', async () => {
    // not-a-JWT is refused without a network call and nothing is stored
    const { verifyToken, verifiedTokenCache } = await load();
    const r = await verifyToken('internal-shared-value-not-a-jwt');
    expect(r.user).toBeNull();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(verifiedTokenCache.size).toBe(0);
  });
});

describe('verifyToken cache: a revoked or signed-out session stops working', () => {
  it('a session Supabase refuses after being cached stops working within 60 s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    mocks.getUser.mockResolvedValueOnce(confirmed('user-1'));
    const { verifyToken } = await load();
    const token = await signSymmetric('user-1');

    expect((await verifyToken(token)).user?.id).toBe('user-1');

    // The session is revoked at Supabase from here on.
    mocks.getUser.mockResolvedValue(refused());

    vi.advanceTimersByTime(59_000);
    expect((await verifyToken(token)).user?.id).toBe('user-1'); // inside the 60 s bound

    vi.advanceTimersByTime(1_001);
    const after = await verifyToken(token);
    expect(after.user).toBeNull();
    expect(after.error?.message).toBe('session revoked');
  });

  it('a refusal is not cached: the next request asks Supabase again', async () => {
    mocks.getUser.mockResolvedValue(refused());
    const { verifyToken } = await load();
    const token = await signSymmetric('user-1');

    expect((await verifyToken(token)).user).toBeNull();
    expect((await verifyToken(token)).user).toBeNull();
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it("sign-out takes effect at once, for this token and the user's other tokens", async () => {
    mocks.getUser.mockResolvedValue(confirmed('user-1'));
    const { verifyToken, signOutUser } = await load();
    const tokenA = await signSymmetric('user-1');
    const tokenB = await signSymmetric('user-1', '2h');
    await verifyToken(tokenA);
    await verifyToken(tokenB);
    expect(mocks.getUser).toHaveBeenCalledTimes(2);

    await signOutUser(tokenA);
    mocks.getUser.mockResolvedValue(refused());

    expect((await verifyToken(tokenA)).user).toBeNull();
    expect((await verifyToken(tokenB)).user).toBeNull(); // global sign-out ends every session
    expect(mocks.signOut).toHaveBeenCalledWith(tokenA, 'global');
  });

  it('a role or membership change (invalidateUserSessions) applies at once', async () => {
    mocks.getUser.mockResolvedValue(confirmed('user-1'));
    const { verifyToken, invalidateUserSessions } = await load();
    const token = await signSymmetric('user-1');
    await verifyToken(token);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);

    // Supabase now answers with changed metadata; the cache must not hide it.
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', user_metadata: { role: 'ADMIN' } } },
      error: null,
    });
    invalidateUserSessions('user-1');

    const r = await verifyToken(token);
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
    expect((r.user as any).user_metadata.role).toBe('ADMIN');
  });

  it("invalidating one user leaves another user's cached session alone", async () => {
    mocks.getUser.mockImplementation(async (t: string) =>
      confirmed(t === tokenA ? 'user-a' : 'user-b')
    );
    const { verifyToken, invalidateUserSessions } = await load();
    const tokenA = await signSymmetric('user-a');
    const tokenB = await signSymmetric('user-b');
    await verifyToken(tokenA);
    await verifyToken(tokenB);

    invalidateUserSessions('user-a');
    await verifyToken(tokenA);
    await verifyToken(tokenB);

    expect(mocks.getUser).toHaveBeenCalledTimes(3); // a twice, b once
  });

  it("a password reset (updateUserPassword) forgets the user's cached tokens", async () => {
    mocks.getUser.mockResolvedValue(confirmed('user-1'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input).includes('/auth/v1/user') ? Response.json({}) : Response.json({ keys: [] })
      )
    );
    const { verifyToken, updateUserPassword } = await load();
    const token = await signSymmetric('user-1');
    await verifyToken(token);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);

    const result = await updateUserPassword(token, 'a-new-password-value');
    expect(result.error).toBeNull();

    mocks.getUser.mockResolvedValue(refused());
    expect((await verifyToken(token)).user).toBeNull();
  });

  it('a failed password update does not drop the cache', async () => {
    mocks.getUser.mockResolvedValue(confirmed('user-1'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input).includes('/auth/v1/user')
          ? Response.json({ msg: 'weak password' }, { status: 422 })
          : Response.json({ keys: [] })
      )
    );
    const { verifyToken, updateUserPassword } = await load();
    const token = await signSymmetric('user-1');
    await verifyToken(token);
    const result = await updateUserPassword(token, 'x');
    expect(result.error).not.toBeNull();
    await verifyToken(token);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });
});

describe('verifyToken cache: it never outlives the token', () => {
  it('stops serving a token the moment its own exp passes', async () => {
    mocks.getUser.mockResolvedValue(confirmed('user-1'));
    const { verifyToken } = await load();
    const token = await signSymmetric('user-1', '20s');
    await verifyToken(token);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 21_000);
    // Supabase refuses an expired token, so the answer after exp is a refusal, not the cache.
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('token expired') });
    const r = await verifyToken(token);
    expect(r.user).toBeNull();
  });
});

describe('verifyToken cache: races and tokens this API never verified', () => {
  it('a check already in flight when the user signs out does not put the session back', async () => {
    let release!: (v: unknown) => void;
    mocks.getUser.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)) // Supabase answers late: valid
    );
    const { verifyToken, signOutUser } = await load();
    const token = await signSymmetric('user-1');

    const inFlight = verifyToken(token); // asks Supabase, waits
    await vi.waitFor(() => expect(mocks.getUser).toHaveBeenCalledTimes(1));
    await signOutUser(token); // the sign-out lands first
    release(confirmed('user-1')); // the stale valid answer arrives after
    expect((await inFlight).user?.id).toBe('user-1'); // that one request was already answered

    // It must not have been cached: the next request asks Supabase again and is refused.
    mocks.getUser.mockResolvedValue(refused());
    expect((await verifyToken(token)).user).toBeNull();
  });

  it("a password reset with a recovery token this API never verified drops the user's cached sessions", async () => {
    mocks.getUser.mockResolvedValue(confirmed('user-1'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input).includes('/auth/v1/user') ? Response.json({}) : Response.json({ keys: [] })
      )
    );
    const { verifyToken, updateUserPassword } = await load();
    const session = await signSymmetric('user-1'); // an existing, cached session
    const recovery = await signSymmetric('user-1', '30m'); // the emailed link's token, never verified here
    await verifyToken(session);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);

    expect((await updateUserPassword(recovery, 'a-new-password-value')).error).toBeNull();

    mocks.getUser.mockResolvedValue(refused()); // the password change ended the other sessions
    expect((await verifyToken(session)).user).toBeNull();
  });

  it('a locally verified (ES256) session never reaches Supabase or the cache', async () => {
    const pair = await jose.generateKeyPair('ES256', { extractable: true });
    const jwk = { ...(await jose.exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ keys: [jwk] }))
    );
    const token = await new jose.SignJWT({ email: 'a@example.invalid' })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setSubject('user-1')
      .setIssuer(ISSUER)
      .setExpirationTime('1h')
      .sign(pair.privateKey);
    const { verifyToken, verifiedTokenCache } = await load();

    expect((await verifyToken(token)).user?.id).toBe('user-1');
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(verifiedTokenCache.size).toBe(0);
  });
});
