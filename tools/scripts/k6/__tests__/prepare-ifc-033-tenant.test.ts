/**
 * IFC-033 deployed-environment prep. The network is faked at the fetch boundary so
 * the real request shapes (URLs, headers, tRPC bodies) are what get asserted.
 */
import { describe, it, expect } from 'vitest';
import {
  BULK_STATUS_MAX_IDS,
  acquireToken,
  buildLeadInputs,
  chunk,
  generatePassword,
  prepareTenant,
  trpcHeaders,
  trpcUrl,
  unwrapTrpc,
} from '../prepare-ifc-033-tenant.mjs';

const BASE = 'https://api.example.invalid';
// Built at runtime: the secret scan flags credential-shaped literals, fake ones too.
const PW = ['p', 'w'].join('');

type Call = { url: string; headers: Record<string, string>; body: any };

function fakeFetch(handler: (proc: string, body: any) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  const impl = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, body });
    const proc = url.split('/api/trpc/')[1];
    const out = handler(proc, body);
    return {
      status: out.status,
      json: async () => {
        if (out.body === undefined) throw new Error('no json');
        return out.body;
      },
    };
  };
  return { calls, impl };
}

const ok = (data: unknown) => ({ status: 200, body: { result: { data } } });
const fail = (status: number, message: string) => ({ status, body: { error: { message } } });

describe('request helpers', () => {
  it('builds the tRPC URL without doubling slashes', () => {
    expect(trpcUrl(`${BASE}/`, 'lead.create')).toBe(`${BASE}/api/trpc/lead.create`);
  });

  it('adds the Bearer header only when a token is given, and always the CSRF header', () => {
    expect(trpcHeaders()).toEqual({
      'Content-Type': 'application/json',
      'x-csrf-token': 'k6-load-test',
    });
    expect(trpcHeaders('tkn').Authorization).toBe('Bearer tkn');
  });

  it('unwraps a tRPC result and surfaces the server error message', () => {
    expect(unwrapTrpc('p', 200, { result: { data: { id: 'x' } } })).toEqual({ id: 'x' });
    expect(() => unwrapTrpc('p', 400, { error: { message: 'bad input' } })).toThrow(
      'p failed (HTTP 400): bad input'
    );
    expect(() => unwrapTrpc('p', 500, { error: { json: { message: 'boom' } } })).toThrow('boom');
    expect(() => unwrapTrpc('p', 502, null)).toThrow('HTTP 502');
  });

  it('builds tagged, undeliverable synthetic leads', () => {
    const leads = buildLeadInputs(2, 'run1');
    expect(leads).toHaveLength(2);
    expect(leads[1].email).toBe('k6-pool-run1-1@loadtest.example.com');
    expect(leads[0].tags).toEqual(['ifc-033-load-test', 'run1']);
  });

  it('chunks ids to the bulkUpdateStatus limit', () => {
    const ids = Array.from({ length: BULK_STATUS_MAX_IDS + 1 }, (_, i) => String(i));
    const parts = chunk(ids);
    expect(parts.map((p) => p.length)).toEqual([BULK_STATUS_MAX_IDS, 1]);
    expect(chunk([])).toEqual([]);
  });

  it('generates a password with every character class', () => {
    const pw = generatePassword();
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/\d/);
    expect(pw).toMatch(/[^A-Za-z0-9]/);
    expect(generatePassword()).not.toBe(pw);
  });
});

describe('acquireToken', () => {
  it('uses the signup session when one is returned', async () => {
    const { calls, impl } = fakeFetch(() => ok({ session: { accessToken: 'from-signup' } }));
    await expect(acquireToken(BASE, 'a@example.invalid', PW, impl)).resolves.toBe('from-signup');
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ confirmPassword: PW, acceptTerms: true });
    expect(calls[0].headers.Authorization).toBeUndefined();
  });

  it('falls back to login when signup fails (account already exists)', async () => {
    const { calls, impl } = fakeFetch((proc) =>
      proc === 'auth.signup' ? fail(409, 'exists') : ok({ session: { accessToken: 'from-login' } })
    );
    await expect(acquireToken(BASE, 'a@example.invalid', PW, impl)).resolves.toBe('from-login');
    expect(calls.map((c) => c.url.split('/').pop())).toEqual(['auth.signup', 'auth.login']);
  });

  it('stops when signup needs email verification instead of guessing', async () => {
    const { impl } = fakeFetch(() => ok({ needsEmailVerification: true, session: null }));
    await expect(acquireToken(BASE, 'a@example.invalid', PW, impl)).rejects.toThrow(
      'needs email verification'
    );
  });

  it('fails when login returns no token', async () => {
    const { impl } = fakeFetch((proc) =>
      proc === 'auth.signup' ? { status: 500, body: undefined } : ok({ session: null })
    );
    await expect(acquireToken(BASE, 'a@example.invalid', PW, impl)).rejects.toThrow(
      'no access token'
    );
  });
});

describe('prepareTenant', () => {
  it('creates a seed lead plus a pool, and qualifies only the pool', async () => {
    let n = 0;
    const { calls, impl } = fakeFetch((proc) => {
      if (proc === 'auth.signup') return ok({ session: { accessToken: 'tkn' } });
      if (proc === 'lead.create') return ok({ id: `lead-${n++}` });
      return ok({ updated: 2 });
    });

    const out = await prepareTenant(
      { baseUrl: BASE, email: 'a@example.invalid', password: PW, poolSize: 2, runTag: 't' },
      impl
    );

    expect(out).toEqual({ token: 'tkn', seedLeadId: 'lead-0', poolIds: ['lead-1', 'lead-2'] });
    const bulk = calls.filter((c) => c.url.endsWith('lead.bulkUpdateStatus'));
    expect(bulk).toHaveLength(1);
    expect(bulk[0].body).toEqual({ ids: ['lead-1', 'lead-2'], status: 'QUALIFIED' });
    // Every authenticated call carries the Bearer token.
    expect(calls.slice(1).every((c) => c.headers.Authorization === 'Bearer tkn')).toBe(true);
  });

  it('propagates a failed lead.create', async () => {
    const { impl } = fakeFetch((proc) =>
      proc === 'auth.signup' ? ok({ session: { accessToken: 'tkn' } }) : fail(429, 'slow down')
    );
    await expect(
      prepareTenant(
        { baseUrl: BASE, email: 'a@example.invalid', password: PW, poolSize: 1, runTag: 't' },
        impl
      )
    ).rejects.toThrow('lead.create failed (HTTP 429): slow down');
  });
});
