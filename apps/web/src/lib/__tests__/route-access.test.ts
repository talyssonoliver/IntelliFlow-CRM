import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
vi.mock('../session', () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

import {
  getVerifiedCaller,
  isOperator,
  refuseInProduction,
  requireOperator,
  requireSignedIn,
} from '../route-access';

const OPERATOR = 'ops@example.invalid';
const asEnv = (env: Record<string, string>) => env as unknown as NodeJS.ProcessEnv;
const confirmedUser = (email: string, extra: Record<string, unknown> = {}) => ({
  data: { user: { id: 'user-1', email, email_confirmed_at: '2026-01-01T00:00:00Z', ...extra } },
  error: null,
});
// A plain object: the test environment's Request drops the cookie header.
const withCookie = (cookie: string) => ({ headers: new Headers({ cookie }) }) as Request;
const withToken = () =>
  new Request('http://localhost/api/x', { headers: { authorization: 'Bearer abc' } });

beforeEach(() => {
  getUser.mockReset();
  vi.stubEnv('PLATFORM_ADMIN_EMAILS', OPERATOR);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getVerifiedCaller', () => {
  it('returns null and asks nobody when there is no token', async () => {
    expect(await getVerifiedCaller(new Request('http://localhost/api/x'))).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it('reads a bearer token', async () => {
    getUser.mockResolvedValue(confirmedUser('a@example.invalid'));
    const caller = await getVerifiedCaller(withToken());
    expect(getUser).toHaveBeenCalledWith('abc');
    expect(caller).toEqual({ id: 'user-1', email: 'a@example.invalid', emailConfirmed: true });
  });

  it('reads the access token cookie among others', async () => {
    getUser.mockResolvedValue(confirmedUser('a@example.invalid'));
    await getVerifiedCaller(withCookie('other=1; accessToken=abc%3D; last=2'));
    expect(getUser).toHaveBeenCalledWith('abc=');
  });

  it('ignores an empty cookie and a malformed authorization header', async () => {
    expect(await getVerifiedCaller(withCookie('accessToken='))).toBeNull();
    const malformed = new Request('http://localhost/api/x', {
      headers: { authorization: 'Bearer a b' },
    });
    expect(await getVerifiedCaller(malformed)).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it('refuses a token Supabase rejects', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('bad') });
    expect(await getVerifiedCaller(withToken())).toBeNull();
  });

  it('refuses when Supabase can not be reached', async () => {
    getUser.mockRejectedValue(new Error('down'));
    expect(await getVerifiedCaller(withToken())).toBeNull();
  });

  it('treats a missing email and confirmation as unconfirmed', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-2' } }, error: null });
    expect(await getVerifiedCaller(withToken())).toEqual({
      id: 'user-2',
      email: '',
      emailConfirmed: false,
    });
  });
});

describe('isOperator', () => {
  const caller = { id: 'u', email: OPERATOR, emailConfirmed: true };

  it('accepts a confirmed listed email, ignoring case and spaces', () => {
    const env = { PLATFORM_ADMIN_EMAILS: ` other@example.invalid , ${OPERATOR.toUpperCase()} ` };
    expect(isOperator(caller, asEnv(env))).toBe(true);
  });

  it('refuses an unconfirmed email even when listed', () => {
    expect(isOperator({ ...caller, emailConfirmed: false })).toBe(false);
  });

  it('refuses an unlisted email, an empty email and no caller', () => {
    expect(isOperator({ ...caller, email: 'a@example.invalid' })).toBe(false);
    expect(isOperator({ ...caller, email: ' ' })).toBe(false);
    expect(isOperator(null)).toBe(false);
  });

  it('allows nobody when the list is unset or empty', () => {
    expect(isOperator(caller, asEnv({}))).toBe(false);
    expect(isOperator(caller, asEnv({ PLATFORM_ADMIN_EMAILS: ' , ' }))).toBe(false);
  });
});

describe('requireSignedIn', () => {
  it('returns 401 without a caller', async () => {
    const response = await requireSignedIn(new Request('http://localhost/api/x'));
    expect(response?.status).toBe(401);
  });

  it('passes any verified caller', async () => {
    getUser.mockResolvedValue(confirmedUser('a@example.invalid'));
    expect(await requireSignedIn(withToken())).toBeNull();
  });
});

describe('requireOperator', () => {
  it('returns 401 without a caller', async () => {
    const response = await requireOperator(new Request('http://localhost/api/x'));
    expect(response?.status).toBe(401);
  });

  it('returns 403 for a signed-in customer, whatever their metadata says', async () => {
    getUser.mockResolvedValue(
      confirmedUser('a@example.invalid', { user_metadata: { role: 'ADMIN' } })
    );
    const response = await requireOperator(withToken());
    expect(response?.status).toBe(403);
  });

  it('passes an operator', async () => {
    getUser.mockResolvedValue(confirmedUser(OPERATOR));
    expect(await requireOperator(withToken())).toBeNull();
  });
});

describe('refuseInProduction', () => {
  it('refuses in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(refuseInProduction()?.status).toBe(403);
  });

  it('allows outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(refuseInProduction()).toBeNull();
  });
});
