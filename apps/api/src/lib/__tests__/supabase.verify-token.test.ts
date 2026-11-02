/**
 * Which tokens may leave the API for a remote Supabase check (#1130).
 *
 * Runs the real jose verifier against a locally generated key. Only the network is
 * faked: the JWKS response and the Supabase client's getUser.
 *
 * supabase.ts loads jose through `Function('return import("jose")')`, which Node refuses
 * inside vitest's module runner, so the suite routes that one call to a normal import.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser } }),
}));

const SUPABASE_URL = 'https://auth.example.invalid';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;
const KID = 'current-key';
// Shaped like the shared internal secret: long, opaque, no dots.
const INTERNAL_SECRET = ['internal', 'shared', 'value', 'not', 'a', 'jwt'].join('-');

// jose is ESM-only and this package compiles as CommonJS, so it loads dynamically here too.
type Jose = typeof import('jose', { with: { 'resolution-mode': 'import' } });
type SigningKey = Parameters<InstanceType<Jose['SignJWT']>['sign']>[0];

let jose: Jose;
let privateKey: SigningKey;
let publicJwk: Record<string, unknown>;
let otherPrivateKey: SigningKey;

function sign(
  key: SigningKey,
  {
    kid = KID,
    issuer = ISSUER,
    expiresIn = '1h',
  }: Partial<Record<'kid' | 'issuer' | 'expiresIn', string>> = {}
): Promise<string> {
  return new jose.SignJWT({ email: 'lead@example.invalid', role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid })
    .setSubject('user-1')
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

function signSymmetric(): Promise<string> {
  // How a Supabase stack with no asymmetric signing key signs sessions.
  return new jose.SignJWT({ email: 'lead@example.invalid' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('user-1')
    .setIssuer(ISSUER)
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode('0123456789abcdef0123456789abcdef'));
}

function fakeFetch(respond: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    expect(String(input instanceof Request ? input.url : input)).toBe(JWKS_URL);
    return respond();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const jwksResponse = () => Response.json({ keys: [publicJwk] });

/** Lets the jose import in supabase.ts work under vitest; every other call is untouched. */
function allowJoseImport() {
  const RealFunction = globalThis.Function;
  const stub = function (...args: string[]) {
    return args[0] === 'return import("jose")' ? () => import('jose') : RealFunction(...args);
  };
  stub.prototype = RealFunction.prototype;
  vi.stubGlobal('Function', stub);
}

async function loadVerifyToken() {
  const { verifyToken } = await import('../supabase.js');
  return verifyToken;
}

beforeAll(async () => {
  jose = await import('jose');
  const pair = await jose.generateKeyPair('ES256', { extractable: true });
  privateKey = pair.privateKey;
  publicJwk = { ...(await jose.exportJWK(pair.publicKey)), kid: KID, alg: 'ES256', use: 'sig' };
  otherPrivateKey = (await jose.generateKeyPair('ES256')).privateKey;
});

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon-value-for-tests');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-value-for-tests');
  mocks.getUser.mockReset();
  mocks.getUser.mockResolvedValue({
    data: { user: null },
    error: new Error('remote rejected the token'),
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  allowJoseImport();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('verifyToken: tokens that are never sent to Supabase', () => {
  it('rejects a Bearer that is not a JWT without any network call', async () => {
    const fetchMock = fakeFetch(jwksResponse);
    const verifyToken = await loadVerifyToken();

    const result = await verifyToken(INTERNAL_SECRET);

    expect(result.user).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-JWT Bearer without a remote call when jose cannot load', async () => {
    vi.unstubAllGlobals();
    const verifyToken = await loadVerifyToken();

    const result = await verifyToken(INTERNAL_SECRET);

    expect(result.user).toBeNull();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it.each([
    ['three segments of junk', async () => 'aaa.bbb.ccc'],
    ['an expired session', () => sign(privateKey, { expiresIn: '-1h' })],
    ['a signature from another key', () => sign(otherPrivateKey)],
    [
      'the wrong issuer',
      () => sign(privateKey, { issuer: 'https://other.example.invalid/auth/v1' }),
    ],
  ])('rejects %s locally', async (_label, makeToken) => {
    fakeFetch(jwksResponse);
    const verifyToken = await loadVerifyToken();

    const result = await verifyToken(await makeToken());

    expect(result.user).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});

describe('verifyToken: valid sessions', () => {
  it('resolves a valid ES256 session locally', async () => {
    fakeFetch(jwksResponse);
    const verifyToken = await loadVerifyToken();

    const result = await verifyToken(await sign(privateKey));

    expect(result.error).toBeNull();
    expect(result.user?.id).toBe('user-1');
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});

describe('verifyToken: when local verification cannot decide, Supabase does', () => {
  const remoteUser = { id: 'remote-user', email: 'lead@example.invalid' };

  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: remoteUser }, error: null });
  });

  it('asks Supabase about a key id the JWKS does not list yet (key rotation)', async () => {
    fakeFetch(jwksResponse);
    const verifyToken = await loadVerifyToken();
    const token = await sign(privateKey, { kid: 'next-key' });

    const result = await verifyToken(token);

    expect(mocks.getUser).toHaveBeenCalledWith(token);
    expect(result.user?.id).toBe('remote-user');
  });

  it('asks Supabase about a symmetric session (local Supabase stack)', async () => {
    fakeFetch(() => Response.json({ keys: [] }));
    const verifyToken = await loadVerifyToken();
    const token = await signSymmetric();

    const result = await verifyToken(token);

    expect(mocks.getUser).toHaveBeenCalledWith(token);
    expect(result.user?.id).toBe('remote-user');
  });

  it('asks Supabase when the JWKS cannot be fetched', async () => {
    fakeFetch(() => new Response('unavailable', { status: 503 }));
    const verifyToken = await loadVerifyToken();
    const token = await sign(privateKey);

    const result = await verifyToken(token);

    expect(mocks.getUser).toHaveBeenCalledWith(token);
    expect(result.user?.id).toBe('remote-user');
  });

  it('asks Supabase when the JWKS request throws', async () => {
    fakeFetch(() => {
      throw new TypeError('network down');
    });
    const verifyToken = await loadVerifyToken();
    const token = await sign(privateKey);

    const result = await verifyToken(token);

    expect(mocks.getUser).toHaveBeenCalledWith(token);
    expect(result.user?.id).toBe('remote-user');
  });

  it('asks Supabase about a JWT when jose cannot load', async () => {
    vi.unstubAllGlobals();
    const verifyToken = await loadVerifyToken();
    const token = await sign(privateKey);

    const result = await verifyToken(token);

    expect(mocks.getUser).toHaveBeenCalledWith(token);
    expect(result.user?.id).toBe('remote-user');
  });

  it('returns the remote rejection when Supabase also refuses', async () => {
    fakeFetch(jwksResponse);
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('refused') });
    const verifyToken = await loadVerifyToken();

    const result = await verifyToken(await sign(privateKey, { kid: 'next-key' }));

    expect(result.user).toBeNull();
    expect(result.error?.message).toBe('refused');
  });
});
