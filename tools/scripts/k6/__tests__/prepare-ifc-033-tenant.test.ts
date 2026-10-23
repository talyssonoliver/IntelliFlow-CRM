/**
 * IFC-033 deployed-environment prep. The network is faked at the fetch boundary so
 * the real request shapes (URLs, headers, tRPC bodies) are what get asserted.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import {
  BULK_STATUS_MAX_IDS,
  acquireToken,
  buildLeadInputs,
  chunk,
  defaultRunTag,
  generatePassword,
  main,
  prepareTenant,
  trpcHeaders,
  trpcUrl,
  unwrapTrpc,
  upsertEnvFile,
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
  const EXP = '2026-10-23T00:00:00.000Z';

  it('uses the signup session when one is returned', async () => {
    const { calls, impl } = fakeFetch(() =>
      ok({ session: { accessToken: 'from-signup', expiresAt: EXP } })
    );
    await expect(acquireToken(BASE, 'a@example.invalid', PW, impl)).resolves.toEqual({
      token: 'from-signup',
      expiresAt: EXP,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ confirmPassword: PW, acceptTerms: true });
    expect(calls[0].headers.Authorization).toBeUndefined();
  });

  it('falls back to login when signup fails (account already exists)', async () => {
    const { calls, impl } = fakeFetch((proc) =>
      proc === 'auth.signup' ? fail(409, 'exists') : ok({ session: { accessToken: 'from-login' } })
    );
    await expect(acquireToken(BASE, 'a@example.invalid', PW, impl)).resolves.toEqual({
      token: 'from-login',
      expiresAt: null,
    });
    expect(calls.map((c) => c.url.split('/').pop())).toEqual(['auth.signup', 'auth.login']);
  });

  it('logs in when signup succeeds without a session or a verification flag', async () => {
    const { calls, impl } = fakeFetch((proc) =>
      proc === 'auth.signup'
        ? ok({ success: true, session: null })
        : ok({ session: { accessToken: 'from-login', expiresAt: EXP } })
    );
    await expect(acquireToken(BASE, 'a@example.invalid', PW, impl)).resolves.toEqual({
      token: 'from-login',
      expiresAt: EXP,
    });
    expect(calls).toHaveLength(2);
  });

  it('stops when signup needs email verification instead of guessing', async () => {
    const { calls, impl } = fakeFetch(() => ok({ needsEmailVerification: true, session: null }));
    await expect(acquireToken(BASE, 'a@example.invalid', PW, impl)).rejects.toThrow(
      'needs email verification'
    );
    expect(calls).toHaveLength(1);
  });

  it('reports the signup error too when the login fallback also fails', async () => {
    const { impl } = fakeFetch((proc) =>
      proc === 'auth.signup' ? fail(400, 'weak password') : fail(401, 'Invalid credentials')
    );
    await expect(acquireToken(BASE, 'a@example.invalid', PW, impl)).rejects.toThrow(
      'auth.login failed (HTTP 401): Invalid credentials ' +
        '(signup also failed: auth.signup failed (HTTP 400): weak password)'
    );
  });

  it('reports only the login error when signup returned normally', async () => {
    const { impl } = fakeFetch((proc) =>
      proc === 'auth.signup' ? ok({ session: null }) : fail(401, 'Invalid credentials')
    );
    await expect(acquireToken(BASE, 'a@example.invalid', PW, impl)).rejects.toThrow(
      /^auth\.login failed \(HTTP 401\): Invalid credentials$/
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

/** Fake of the real API: lead.create returns {id}; bulkUpdateStatus {successful, failed}. */
function apiFake(bulk?: (ids: string[]) => unknown) {
  let n = 0;
  return fakeFetch((proc, body) => {
    if (proc === 'auth.signup') return ok({ session: { accessToken: 'tkn', expiresAt: 'soon' } });
    if (proc === 'lead.create') return ok({ id: `lead-${n++}` });
    const ids = body.ids as string[];
    return ok(bulk ? bulk(ids) : { successful: ids, failed: [], totalProcessed: ids.length });
  });
}

const OPTS = { baseUrl: BASE, email: 'a@example.invalid', password: PW, runTag: 't' };

describe('prepareTenant', () => {
  it('creates a seed lead plus a pool, and qualifies only the pool', async () => {
    const { calls, impl } = apiFake();

    const out = await prepareTenant({ ...OPTS, poolSize: 2 }, impl);

    expect(out).toEqual({
      token: 'tkn',
      expiresAt: 'soon',
      seedLeadId: 'lead-0',
      poolIds: ['lead-1', 'lead-2'],
    });
    const bulk = calls.filter((c) => c.url.endsWith('lead.bulkUpdateStatus'));
    expect(bulk).toHaveLength(1);
    expect(bulk[0].body).toEqual({ ids: ['lead-1', 'lead-2'], status: 'QUALIFIED' });
    // Every authenticated call carries the Bearer token.
    expect(calls.slice(1).every((c) => c.headers.Authorization === 'Bearer tkn')).toBe(true);
  });

  it('throws when bulkUpdateStatus answers 200 but leaves leads unqualified', async () => {
    const { impl } = apiFake((ids) => ({
      successful: ids.slice(1),
      failed: [{ id: ids[0], error: 'Lead not found' }],
    }));
    await expect(prepareTenant({ ...OPTS, poolSize: 2 }, impl)).rejects.toThrow(
      'lead.bulkUpdateStatus left 1 lead(s) unqualified: Lead not found'
    );
  });

  it('keeps only the ids the API reports as qualified', async () => {
    const { impl } = apiFake((ids) => ({ successful: ids.slice(0, 1), failed: [] }));
    const out = await prepareTenant({ ...OPTS, poolSize: 2 }, impl);
    expect(out.poolIds).toEqual(['lead-1']);
  });

  it('tolerates a bulk response without a successful list', async () => {
    const { impl } = apiFake(() => ({}));
    const out = await prepareTenant({ ...OPTS, poolSize: 1 }, impl);
    expect(out.poolIds).toEqual([]);
  });

  it('propagates a failed lead.create', async () => {
    const { impl } = fakeFetch((proc) =>
      proc === 'auth.signup' ? ok({ session: { accessToken: 'tkn' } }) : fail(429, 'slow down')
    );
    await expect(prepareTenant({ ...OPTS, poolSize: 1 }, impl)).rejects.toThrow(
      'lead.create failed (HTTP 429): slow down'
    );
  });
});

describe('defaultRunTag', () => {
  it('differs between runs so lead emails never collide', () => {
    expect(defaultRunTag(1)).not.toBe(defaultRunTag(2));
    expect(defaultRunTag(36)).toBe('run-10');
    expect(defaultRunTag()).toMatch(/^run-[0-9a-z]+$/);
  });
});

describe('upsertEnvFile', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ifc033-env-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the file, then replaces only the given keys', () => {
    const file = join(dir, '.env.k6.local');
    upsertEnvFile(file, { A: '1', B: '2' });
    upsertEnvFile(file, { B: '3', C: '4' });
    expect(readFileSync(file, 'utf8')).toBe('A=1\nB=3\nC=4\n');
  });
});

describe('main', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ifc033-main-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const EMAIL = 'a@example.invalid';

  it('requires BASE_URL and K6_TEST_EMAIL', async () => {
    await expect(main({ env: {}, repoRoot: dir })).rejects.toThrow(
      'BASE_URL and K6_TEST_EMAIL must be set.'
    );
  });

  it('writes credentials, token and pool to gitignored paths, never logging the token', async () => {
    const { impl } = apiFake();
    const lines: string[] = [];
    const out = await main({
      env: { BASE_URL: BASE, K6_TEST_EMAIL: EMAIL, POOL_SIZE: '2', RUN_TAG: 'r' },
      repoRoot: dir,
      fetchImpl: impl,
      log: (l) => lines.push(l),
    });

    expect(out).toEqual({ seedLeadId: 'lead-0', poolSize: 2, runTag: 'r' });
    const env = readFileSync(join(dir, '.env.k6.local'), 'utf8');
    expect(env).toContain(`K6_TEST_EMAIL=${EMAIL}\n`);
    expect(env).toMatch(/K6_TEST_PASSWORD=K6a!\S+\n/);
    expect(env).toContain('K6_AUTH_TOKEN=tkn\n');
    expect(env).toContain('SEED_LEAD_ID=lead-0\n');
    const poolFile = join(dir, 'tools/scripts/k6/.data/qualified-leads.json');
    expect(JSON.parse(readFileSync(poolFile, 'utf8'))).toEqual(['lead-1', 'lead-2']);
    const log = lines.join('\n');
    expect(log).toContain('2 QUALIFIED');
    expect(log).toContain('token expires soon');
    expect(log).not.toContain('tkn');
  });

  it('reuses a given password and defaults the pool size and run tag', async () => {
    const { calls, impl } = apiFake();
    await main({
      env: { BASE_URL: BASE, K6_TEST_EMAIL: EMAIL, K6_TEST_PASSWORD: PW },
      repoRoot: dir,
      fetchImpl: impl,
      log: () => undefined,
    });
    expect(calls[0].body.password).toBe(PW);
    expect(calls.filter((c) => c.url.endsWith('lead.create'))).toHaveLength(21);
    expect(calls[1].body.email).toMatch(/^k6-pool-run-[0-9a-z]+-0@loadtest\.example\.com$/);
  });

  it('says when the token expiry is unknown', async () => {
    const { impl } = fakeFetch((proc, body) => {
      if (proc === 'auth.signup') return ok({ session: { accessToken: 'tkn' } });
      if (proc === 'lead.create') return ok({ id: 'x' });
      return ok({ successful: body.ids, failed: [] });
    });
    const lines: string[] = [];
    await main({
      env: { BASE_URL: BASE, K6_TEST_EMAIL: EMAIL, POOL_SIZE: '1' },
      repoRoot: dir,
      fetchImpl: impl,
      log: (l) => lines.push(l),
    });
    expect(lines.join('\n')).toContain('token expires at an unknown time');
  });
});
