/**
 * createContext resolves a session only for a JWT-shaped Bearer (#1130). The shared
 * internal secret is checked by the inbound routes from the request itself.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ verifyToken: vi.fn() }));

vi.mock('../container', () => ({
  container: {},
  containerReady: Promise.resolve(),
  apiPrisma: {},
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {},
  verifyToken: mocks.verifyToken,
}));

import { createContext } from '../context';

const INTERNAL_SECRET = ['internal', 'shared', 'value', 'not', 'a', 'jwt'].join('-');

function request(token: string) {
  return new Request('http://localhost/api/trpc/x', {
    headers: { authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  mocks.verifyToken.mockReset();
  mocks.verifyToken.mockResolvedValue({ user: null, error: new Error('refused') });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('createContext Bearer handling (#1130)', () => {
  it('does not verify the internal secret, and leaves it on the request for the route', async () => {
    const req = request(INTERNAL_SECRET);

    const ctx = await createContext({ req });

    expect(mocks.verifyToken).not.toHaveBeenCalled();
    expect(ctx.user).toBeNull();
    expect(ctx.req?.headers.get('authorization')).toBe(`Bearer ${INTERNAL_SECRET}`);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('does not grant the dev fallback user to a non-JWT Bearer', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ALLOW_DEV_AUTH_FALLBACK', 'true');

    const ctx = await createContext({ req: request(INTERNAL_SECRET) });

    expect(ctx.user).toBeNull();
  });

  it('still verifies a JWT-shaped Bearer', async () => {
    await createContext({ req: request('header.payload.signature') });

    expect(mocks.verifyToken).toHaveBeenCalledWith('header.payload.signature');
  });

  it('does not verify a partner key', async () => {
    await createContext({ req: request('pk_live.value.here') });

    expect(mocks.verifyToken).not.toHaveBeenCalled();
  });
});
