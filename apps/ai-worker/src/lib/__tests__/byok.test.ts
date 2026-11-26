/**
 * byok.ts - PG-199 BYOK routing, tenant isolation, caching and key-failure behaviour.
 * The database is a mock; fake keys are built at runtime from repeated characters.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const db = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('@intelliflow/db', () => ({
  prisma: { tenantAIProviderKey: { findFirst: db.findFirst, updateMany: db.updateMany } },
}));

import {
  ByokKeyError,
  byokFailureMessage,
  classifyByokFailure,
  getCachedByokModel,
  invalidateByok,
  isByokFailure,
  isByokKeyError,
  markByokStatus,
  resolveByokCredential,
  routeForTenant,
  withByokFailureHandling,
  type ByokCredential,
} from '../byok';

const KEY_A = 'a'.repeat(30) + 'AAAA';
const KEY_B = 'b'.repeat(30) + 'BBBB';
const REVISION_A = Date.UTC(2026, 10, 20);
const REVISION_B = Date.UTC(2026, 10, 25);

function row(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'openai',
    apiKey: KEY_A,
    last4: 'AAAA',
    createdAt: new Date(REVISION_A),
    status: 'ACTIVE',
    allowFallback: false,
    ...overrides,
  };
}

function credential(overrides: Partial<ByokCredential> = {}): ByokCredential {
  return {
    tenantId: 'tenant-a',
    provider: 'openai',
    apiKey: KEY_A,
    last4: 'AAAA',
    revision: REVISION_A,
    status: 'ACTIVE',
    allowFallback: false,
    ...overrides,
  };
}

function httpError(status: number, message = 'provider said no') {
  return Object.assign(new Error(message), { status });
}

/** A model double with plain and structured invoke. */
function fakeModel(impl: () => Promise<unknown>) {
  const invoke = vi.fn().mockImplementation(impl);
  const structuredInvoke = vi.fn().mockImplementation(impl);
  return {
    invoke,
    structuredInvoke,
    model: {
      invoke,
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: structuredInvoke }),
    } as never,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  invalidateByok();
  db.findFirst.mockResolvedValue(null);
  db.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resolveByokCredential', () => {
  it('reads only the tenant row and returns null when there is none', async () => {
    await expect(resolveByokCredential('tenant-a')).resolves.toBeNull();
    expect(db.findFirst.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-a' });
  });

  it('returns the decrypted credential for that tenant', async () => {
    db.findFirst.mockResolvedValue(row());
    await expect(resolveByokCredential('tenant-a')).resolves.toEqual(credential());
  });

  it('isolates tenants: each tenant is looked up by its own id and sees only its own key', async () => {
    db.findFirst.mockImplementation(async ({ where }: { where: { tenantId: string } }) =>
      where.tenantId === 'tenant-a' ? row() : null
    );
    expect((await resolveByokCredential('tenant-a'))?.apiKey).toBe(KEY_A);
    expect(await resolveByokCredential('tenant-b')).toBeNull();
  });

  it('caches for 30 s, then re-reads (a change is picked up within the TTL)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    db.findFirst.mockResolvedValue(row());
    await resolveByokCredential('tenant-a');
    await resolveByokCredential('tenant-a');
    expect(db.findFirst).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 31_000);
    db.findFirst.mockResolvedValue(row({ apiKey: KEY_B, last4: 'BBBB' }));
    expect((await resolveByokCredential('tenant-a'))?.apiKey).toBe(KEY_B);
    expect(db.findFirst).toHaveBeenCalledTimes(2);
  });

  it('invalidateByok(tenant) forces the next read to hit the database', async () => {
    db.findFirst.mockResolvedValue(row());
    await resolveByokCredential('tenant-a');
    invalidateByok('tenant-a');
    await resolveByokCredential('tenant-a');
    expect(db.findFirst).toHaveBeenCalledTimes(2);
  });

  it('ignores a row with an unknown provider or status', async () => {
    db.findFirst.mockResolvedValue(row({ provider: 'mystery' }));
    await expect(resolveByokCredential('tenant-a')).resolves.toBeNull();
    invalidateByok();
    db.findFirst.mockResolvedValue(row({ status: 'WEIRD' }));
    await expect(resolveByokCredential('tenant-a')).resolves.toBeNull();
  });

  it('on a database error keeps the last known value, and fails closed for a tenant with none', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    db.findFirst.mockResolvedValueOnce(row());
    await resolveByokCredential('tenant-a');
    vi.setSystemTime(Date.now() + 31_000);
    db.findFirst.mockRejectedValue(new Error('db down'));
    expect((await resolveByokCredential('tenant-a'))?.apiKey).toBe(KEY_A);
    await expect(resolveByokCredential('tenant-z')).rejects.toMatchObject({
      keyStatus: 'UNREADABLE',
    });
  });

  it('treats a missing table (migration not applied) as no credential', async () => {
    db.findFirst.mockRejectedValue(Object.assign(new Error('no table'), { code: 'P2021' }));
    await expect(resolveByokCredential('tenant-a')).resolves.toBeNull();
  });
});

describe('routeForTenant - how routing decides', () => {
  it('no credential: platform', async () => {
    await expect(routeForTenant('tenant-a')).resolves.toEqual({ kind: 'platform' });
  });

  it('a credential: the tenant key', async () => {
    db.findFirst.mockResolvedValue(row());
    await expect(routeForTenant('tenant-a')).resolves.toEqual({
      kind: 'byok',
      credential: credential(),
    });
  });

  it('another tenant stays on the platform', async () => {
    db.findFirst.mockImplementation(async ({ where }: { where: { tenantId: string } }) =>
      where.tenantId === 'tenant-a' ? row() : null
    );
    await expect(routeForTenant('tenant-b')).resolves.toEqual({ kind: 'platform' });
  });

  it.each(['unknown', '__system', ''])(
    '"%s" is not a real tenant: platform, no lookup',
    async (id) => {
      await expect(routeForTenant(id)).resolves.toEqual({ kind: 'platform' });
      expect(db.findFirst).not.toHaveBeenCalled();
    }
  );

  it('RATE_LIMITED and QUOTA_EXCEEDED keys are still tried (they heal on success)', async () => {
    for (const status of ['RATE_LIMITED', 'QUOTA_EXCEEDED']) {
      invalidateByok();
      db.findFirst.mockResolvedValue(row({ status }));
      expect((await routeForTenant('tenant-a')).kind).toBe('byok');
    }
  });

  it('an INVALID key without fallback fails with a clear, key-free error (after its one probe)', async () => {
    db.findFirst.mockResolvedValue(row({ status: 'INVALID' }));
    // The first call after a rejection is the probe: it runs on the key to see if it heals.
    expect((await routeForTenant('tenant-a')).kind).toBe('byok');
    const err = await routeForTenant('tenant-a').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ByokKeyError);
    expect((err as Error).message).toMatch(/rejected by the provider/);
    expect((err as Error).message).not.toContain(KEY_A);
    expect(isByokKeyError(err)).toBe(true);
  });

  it('an INVALID key with fallback allowed uses the platform (after its one probe)', async () => {
    db.findFirst.mockResolvedValue(row({ status: 'INVALID', allowFallback: true }));
    expect((await routeForTenant('tenant-a')).kind).toBe('byok');
    await expect(routeForTenant('tenant-a')).resolves.toEqual({ kind: 'platform' });
  });

  it('an INVALID key is probed again only every 10 minutes, and a probe that works heals it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    db.findFirst.mockResolvedValue(row({ status: 'INVALID' }));
    expect((await routeForTenant('tenant-a')).kind).toBe('byok');
    await expect(routeForTenant('tenant-a')).rejects.toBeInstanceOf(ByokKeyError);
    vi.setSystemTime(Date.now() + 11 * 60_000);
    const route = await routeForTenant('tenant-a');
    expect(route.kind).toBe('byok');

    // The probe call succeeds: the status heals to ACTIVE.
    const { model } = fakeModel(async () => ({ content: 'ok' }));
    const wrapped = withByokFailureHandling(model, {
      credential: (route as { credential: ByokCredential }).credential,
      fallback: null,
    });
    await wrapped.invoke('hi');
    expect(db.updateMany.mock.calls.at(-1)![0].data).toMatchObject({
      status: 'ACTIVE',
      statusDetail: null,
    });
  });

  it('an unreadable key (decrypt failure) follows the tenant own fallback choice, never the platform by default', async () => {
    const decryptFailure = new Error('Unsupported state or unable to authenticate data');
    db.findFirst.mockImplementation(async ({ select }: { select: Record<string, boolean> }) => {
      if (select['apiKey']) throw decryptFailure;
      return { allowFallback: false };
    });
    const err = await routeForTenant('tenant-a').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ByokKeyError);
    expect((err as ByokKeyError).keyStatus).toBe('UNREADABLE');
    expect((err as Error).message).not.toContain(KEY_A);

    invalidateByok();
    db.findFirst.mockImplementation(async ({ select }: { select: Record<string, boolean> }) => {
      if (select['apiKey']) throw decryptFailure;
      return { allowFallback: true };
    });
    await expect(routeForTenant('tenant-a')).resolves.toEqual({ kind: 'platform' });

    invalidateByok();
    db.findFirst.mockImplementation(async ({ select }: { select: Record<string, boolean> }) => {
      if (select['apiKey']) throw decryptFailure;
      return null;
    });
    await expect(routeForTenant('tenant-a')).resolves.toEqual({ kind: 'platform' });
  });

  it('with the database down: a known key is served for a minute past its TTL, then fails closed; an unseen tenant fails closed too', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    db.findFirst.mockResolvedValueOnce(row());
    await routeForTenant('tenant-a');
    db.findFirst.mockRejectedValue(new Error('db down'));

    vi.setSystemTime(Date.now() + 31_000);
    expect((await routeForTenant('tenant-a')).kind).toBe('byok');

    vi.setSystemTime(Date.now() + 120_000);
    const err = await routeForTenant('tenant-a').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ByokKeyError);
    expect((err as ByokKeyError).keyStatus).toBe('UNREADABLE');

    // A cold worker cannot tell a tenant with a key (and no fallback consent) from one without.
    await expect(routeForTenant('tenant-never-seen')).rejects.toMatchObject({
      keyStatus: 'UNREADABLE',
    });
  });

  it('an explicit provider override (job-level fallback) is refused unless fallback is allowed', async () => {
    db.findFirst.mockResolvedValue(row());
    await expect(routeForTenant('tenant-a', { explicitProvider: true })).rejects.toBeInstanceOf(
      ByokKeyError
    );
    invalidateByok();
    db.findFirst.mockResolvedValue(row({ allowFallback: true }));
    await expect(routeForTenant('tenant-a', { explicitProvider: true })).resolves.toEqual({
      kind: 'platform',
    });
  });
});

describe('classifyByokFailure', () => {
  it('an empty balance on a 400 (Anthropic) or with no status is QUOTA_EXCEEDED, not passed through', () => {
    expect(
      classifyByokFailure(httpError(400, 'Your credit balance is too low to access the API'))
    ).toBe('QUOTA_EXCEEDED');
  });

  it('an error with no HTTP status is never a key failure, whatever its text says', () => {
    expect(classifyByokFailure(new Error('You exceeded your current quota'))).toBeNull();
    expect(classifyByokFailure(new Error('Failed to parse. Text: billing'))).toBeNull();
    expect(
      classifyByokFailure(
        Object.assign(new Error("Invalid enum: received 'billing'"), { name: 'ZodError' })
      )
    ).toBeNull();
    expect(
      classifyByokFailure(
        Object.assign(new Error('insufficient_quota'), { code: 'insufficient_quota' })
      )
    ).toBeNull();
  });

  it('CRM text that mentions billing is not an empty balance, even on an HTTP status', () => {
    expect(classifyByokFailure(httpError(400, 'unexpected category: billing'))).toBeNull();
    expect(classifyByokFailure(httpError(429, 'ticket about billing'))).toBe('RATE_LIMITED');
  });

  it('a parse failure is never a key failure, even with a status-like field', () => {
    const parse = Object.assign(new Error('Failed to parse. Text: credit balance is too low'), {
      name: 'OutputParserException',
      status: 400,
    });
    expect(classifyByokFailure(parse)).toBeNull();
  });

  it('Google answers a bad key at run time with 400 "API key not valid": INVALID, only for Google', () => {
    const bad = httpError(400, 'API key not valid. Please pass a valid API key.');
    expect(classifyByokFailure(bad, 'google')).toBe('INVALID');
    expect(classifyByokFailure(bad, 'openai')).toBeNull();
    expect(classifyByokFailure(httpError(400, 'bad request'), 'google')).toBeNull();
  });

  it.each([
    [httpError(401), 'INVALID'],
    [httpError(403, 'Your API key does not have permission to use this resource'), 'INVALID'],
    [httpError(402), 'QUOTA_EXCEEDED'],
    [httpError(429), 'RATE_LIMITED'],
    [
      httpError(429, 'You exceeded your current quota, please check your plan and billing'),
      'QUOTA_EXCEEDED',
    ],
    [httpError(429, 'Your credit balance is too low'), 'QUOTA_EXCEEDED'],
    [Object.assign(new Error('x'), { error: { status: 401 } }), 'INVALID'],
    [
      Object.assign(new Error('insufficient_quota'), { code: 'insufficient_quota', status: 429 }),
      'QUOTA_EXCEEDED',
    ],
  ])('%#: %s', (err, expected) => {
    expect(classifyByokFailure(err)).toBe(expected);
  });

  it.each([[httpError(500)], [httpError(503)], [new Error('timed out')], [httpError(400)], [null]])(
    '%# is not a key failure',
    (err) => {
      expect(classifyByokFailure(err)).toBeNull();
    }
  );
});

describe('markByokStatus', () => {
  it('marks only the key that failed, with a fixed detail (never the provider message)', async () => {
    await markByokStatus(credential(), 'INVALID');
    const args = db.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({
      tenantId: 'tenant-a',
      provider: 'openai',
      createdAt: new Date(REVISION_A),
    });
    expect(args.data.status).toBe('INVALID');
    expect(args.data.statusDetail).not.toContain(KEY_A);
  });

  it('never throws when the write fails', async () => {
    db.updateMany.mockRejectedValue(new Error('db down'));
    await expect(markByokStatus(credential(), 'RATE_LIMITED')).resolves.toBeUndefined();
  });

  it('writes the same status at most once a minute per tenant, and updates the cache in place', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    db.findFirst.mockResolvedValue(row());
    await resolveByokCredential('tenant-a');
    await markByokStatus(credential(), 'RATE_LIMITED');
    await markByokStatus(credential(), 'RATE_LIMITED');
    await markByokStatus(credential(), 'RATE_LIMITED');
    expect(db.updateMany).toHaveBeenCalledTimes(1);
    // A failing key costs no extra database read: the cached credential carries the status.
    expect((await resolveByokCredential('tenant-a'))?.status).toBe('RATE_LIMITED');
    expect(db.findFirst).toHaveBeenCalledTimes(1);

    await markByokStatus(credential(), 'QUOTA_EXCEEDED');
    expect(db.updateMany).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + 61_000);
    await markByokStatus(credential(), 'QUOTA_EXCEEDED');
    expect(db.updateMany).toHaveBeenCalledTimes(3);
  });
});

describe('getCachedByokModel', () => {
  it('builds once per tenant, key and shape, and rebuilds when the key changes', () => {
    const build = vi.fn().mockImplementation(() => ({}) as never);
    const a1 = getCachedByokModel(credential(), 'scoring:free', build);
    const a2 = getCachedByokModel(credential(), 'scoring:free', build);
    expect(a1).toBe(a2);
    expect(build).toHaveBeenCalledTimes(1);
    getCachedByokModel(credential({ apiKey: KEY_B, last4: 'BBBB' }), 'scoring:free', build);
    getCachedByokModel(credential(), 'email:free', build);
    expect(build).toHaveBeenCalledTimes(3);
  });

  it('never shares a model between tenants', () => {
    const build = vi.fn().mockImplementation(() => ({}) as never);
    const a = getCachedByokModel(credential({ tenantId: 'tenant-a' }), 's', build);
    const b = getCachedByokModel(credential({ tenantId: 'tenant-b' }), 's', build);
    expect(a).not.toBe(b);
  });

  it('expires after the TTL and is dropped by invalidateByok', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const build = vi.fn().mockImplementation(() => ({}) as never);
    getCachedByokModel(credential(), 's', build);
    invalidateByok('tenant-a');
    getCachedByokModel(credential(), 's', build);
    expect(build).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + 6 * 60_000);
    getCachedByokModel(credential(), 's', build);
    expect(build).toHaveBeenCalledTimes(3);
  });
});

describe('withByokFailureHandling', () => {
  it('passes a successful call through and stamps lastUsedAt', async () => {
    const { model, invoke } = fakeModel(async () => ({ content: 'ok' }));
    const wrapped = withByokFailureHandling(model, { credential: credential(), fallback: null });
    await expect(wrapped.invoke('hi')).resolves.toEqual({ content: 'ok' });
    expect(invoke).toHaveBeenCalledWith('hi', undefined);
    expect(db.updateMany).toHaveBeenCalledTimes(1);
    expect(db.updateMany.mock.calls[0][0].data.lastUsedAt).toBeInstanceOf(Date);
    expect(db.updateMany.mock.calls[0][0].data.status).toBeUndefined();
  });

  it('heals a non-ACTIVE key on the next successful call', async () => {
    const { model } = fakeModel(async () => ({ content: 'ok' }));
    const wrapped = withByokFailureHandling(model, {
      credential: credential({ status: 'RATE_LIMITED' }),
      fallback: null,
    });
    await wrapped.invoke('hi');
    expect(db.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'ACTIVE',
      statusDetail: null,
    });
  });

  it('a 401 with fallback off marks the key INVALID and fails with a clear error (no fallback call)', async () => {
    const fallback = vi.fn();
    const { model } = fakeModel(async () => {
      throw httpError(401, `Incorrect API key provided: ${KEY_A}`);
    });
    const wrapped = withByokFailureHandling(model, { credential: credential(), fallback: null });
    const err = await wrapped.invoke('hi').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ByokKeyError);
    expect((err as ByokKeyError).keyStatus).toBe('INVALID');
    expect((err as Error).message).toBe(byokFailureMessage('openai', 'INVALID'));
    expect((err as Error).message).not.toContain(KEY_A);
    expect(JSON.stringify(err)).not.toContain(KEY_A);
    expect(db.updateMany.mock.calls[0][0].data.status).toBe('INVALID');
    expect(fallback).not.toHaveBeenCalled();
  });

  it.each([
    [429, 'RATE_LIMITED'],
    [402, 'QUOTA_EXCEEDED'],
  ])('a %i marks the key %s', async (status, expected) => {
    const { model } = fakeModel(async () => {
      throw httpError(status);
    });
    const wrapped = withByokFailureHandling(model, { credential: credential(), fallback: null });
    await expect(wrapped.invoke('hi')).rejects.toMatchObject({ keyStatus: expected });
    expect(db.updateMany.mock.calls[0][0].data.status).toBe(expected);
  });

  it('with fallback allowed, a key failure marks the key then runs on the platform model', async () => {
    const platform = fakeModel(async () => ({ content: 'platform answer' }));
    const fallback = vi.fn().mockResolvedValue(platform.model);
    const { model } = fakeModel(async () => {
      throw httpError(429);
    });
    const wrapped = withByokFailureHandling(model, { credential: credential(), fallback });
    await expect(wrapped.invoke('hi')).resolves.toEqual({ content: 'platform answer' });
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(db.updateMany.mock.calls[0][0].data.status).toBe('RATE_LIMITED');
  });

  it('structured output follows the same rules (fail, and fallback)', async () => {
    const failing = fakeModel(async () => {
      throw httpError(401);
    });
    const noFallback = withByokFailureHandling(failing.model, {
      credential: credential(),
      fallback: null,
    });
    await expect(
      (
        noFallback as never as {
          withStructuredOutput: (s: unknown) => { invoke: (i: unknown) => Promise<unknown> };
        }
      )
        .withStructuredOutput({})
        .invoke('hi')
    ).rejects.toBeInstanceOf(ByokKeyError);

    const platform = fakeModel(async () => ({ score: 7 }));
    const withFallback = withByokFailureHandling(failing.model, {
      credential: credential(),
      fallback: async () => platform.model,
    });
    await expect(
      (
        withFallback as never as {
          withStructuredOutput: (s: unknown) => { invoke: (i: unknown) => Promise<unknown> };
        }
      )
        .withStructuredOutput({})
        .invoke('hi')
    ).resolves.toEqual({ score: 7 });
  });

  it('a non-key error (500, timeout) is rethrown unchanged, never marked, and tagged as BYOK-origin', async () => {
    const boom = httpError(500);
    const { model } = fakeModel(async () => {
      throw boom;
    });
    const fallback = vi.fn();
    const wrapped = withByokFailureHandling(model, { credential: credential(), fallback });
    await expect(wrapped.invoke('hi')).rejects.toBe(boom);
    expect(db.updateMany).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
    expect(isByokKeyError(boom)).toBe(false);
    expect(isByokFailure(boom)).toBe(true);
    expect(isByokFailure(new Error('platform failure'))).toBe(false);
  });
});

describe('isByokFailure', () => {
  it('follows the cause chain, so a chain that re-wraps the error keeps the tag', async () => {
    const boom = httpError(500);
    const { model } = fakeModel(async () => {
      throw boom;
    });
    const wrapped = withByokFailureHandling(model, { credential: credential(), fallback: null });
    await wrapped.invoke('hi').catch(() => undefined);
    const rewrapped = new Error('chain failed', { cause: new Error('inner', { cause: boom }) });
    expect(isByokFailure(rewrapped)).toBe(true);
    expect(isByokFailure(new Error('plain', { cause: new Error('x') }))).toBe(false);
  });
});

describe('shared circuit breakers never count a BYOK failure', () => {
  it('ten BYOK failures leave the breaker closed; five platform failures open it', async () => {
    const { CircuitBreaker } = await import('../../utils/circuit-breaker');
    const byokBreaker = new CircuitBreaker(5, 60_000);
    const key = new ByokKeyError('tenant-a', 'openai', 'INVALID', 'rejected');
    const tagged = httpError(500);
    const { model } = fakeModel(async () => {
      throw tagged;
    });
    await withByokFailureHandling(model, { credential: credential(), fallback: null })
      .invoke('hi')
      .catch(() => undefined);
    for (let i = 0; i < 10; i++) {
      await byokBreaker.execute(() => Promise.reject(i % 2 ? key : tagged)).catch(() => undefined);
    }
    await expect(byokBreaker.execute(async () => 'still closed')).resolves.toBe('still closed');

    const platformBreaker = new CircuitBreaker(5, 60_000);
    for (let i = 0; i < 5; i++) {
      await platformBreaker.execute(() => Promise.reject(httpError(500))).catch(() => undefined);
    }
    await expect(platformBreaker.execute(async () => 'x')).rejects.toThrow(/OPEN/);
  });
});

describe('model cache eviction', () => {
  it('a full cache drops the oldest entries, never every tenant at once', () => {
    const build = vi.fn().mockImplementation(() => ({}) as never);
    for (let i = 0; i < 500; i++) {
      getCachedByokModel(credential({ tenantId: `tenant-${i}` }), 's', build);
    }
    expect(build).toHaveBeenCalledTimes(500);
    getCachedByokModel(credential({ tenantId: 'tenant-new' }), 's', build);
    // A recent tenant is still cached; the oldest one was evicted.
    getCachedByokModel(credential({ tenantId: 'tenant-499' }), 's', build);
    expect(build).toHaveBeenCalledTimes(501);
    getCachedByokModel(credential({ tenantId: 'tenant-0' }), 's', build);
    expect(build).toHaveBeenCalledTimes(502);
  });
});

describe('success reads the status now, not the one the model was built with', () => {
  it('a model built ACTIVE that was later marked RATE_LIMITED still heals the row on success', async () => {
    db.findFirst.mockResolvedValue(row());
    await resolveByokCredential('tenant-a');
    const { model } = fakeModel(async () => ({ content: 'ok' }));
    const wrapped = withByokFailureHandling(model, { credential: credential(), fallback: null });
    await markByokStatus(credential(), 'RATE_LIMITED');
    db.updateMany.mockClear();
    await wrapped.invoke('hi');
    expect(db.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'ACTIVE' });
  });

  it('a model built RATE_LIMITED whose key is ACTIVE again does not rewrite the row on every call', async () => {
    db.findFirst.mockResolvedValue(row({ status: 'ACTIVE' }));
    await resolveByokCredential('tenant-a');
    const { model } = fakeModel(async () => ({ content: 'ok' }));
    const wrapped = withByokFailureHandling(model, {
      credential: credential({ status: 'RATE_LIMITED' }),
      fallback: null,
    });
    await wrapped.invoke('hi');
    await wrapped.invoke('hi');
    await wrapped.invoke('hi');
    // Only the throttled lastUsedAt stamp, once: no status rewrite, no write per call.
    expect(db.updateMany).toHaveBeenCalledTimes(1);
    expect(db.updateMany.mock.calls[0][0].data.status).toBeUndefined();
  });
});

describe('a BYOK call is not the platform provider answer for the shared breaker', () => {
  async function openBreaker(threshold = 2) {
    const { CircuitBreaker } = await import('../../utils/circuit-breaker');
    const breaker = new CircuitBreaker(threshold, 60_000);
    for (let i = 0; i < threshold; i++) {
      await breaker.execute(() => Promise.reject(httpError(500))).catch(() => undefined);
    }
    await expect(breaker.execute(async () => 'x')).rejects.toThrow(/OPEN/);
    return breaker;
  }

  it('its success does not close a HALF_OPEN platform breaker; a platform success does', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const breaker = await openBreaker();
    vi.setSystemTime(Date.now() + 61_000);

    const own = fakeModel(async () => ({ content: 'own key answer' }));
    const wrapped = withByokFailureHandling(own.model, {
      credential: credential(),
      fallback: null,
    });
    await breaker.execute(() => wrapped.invoke('hi') as Promise<unknown>);
    // Entered HALF_OPEN for the probe, but the BYOK success did not close it.
    expect(breaker.getState().state).toBe('HALF_OPEN');

    await breaker.execute(async () => 'platform ok');
    expect(breaker.getState().state).toBe('CLOSED');
  });

  it('a routing error (rejected key, no fallback) thrown before any model call leaves a HALF_OPEN breaker as it was', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const breaker = await openBreaker();
    vi.setSystemTime(Date.now() + 61_000);
    const routingError = new ByokKeyError('tenant-a', 'openai', 'INVALID', 'rejected');
    await breaker.execute(() => Promise.reject(routingError)).catch(() => undefined);
    // Not counted as a platform failure, and the platform never answered: not CLOSED either.
    expect(breaker.getState()).toMatchObject({ state: 'HALF_OPEN', failureCount: 0 });
  });

  it('its failures are never counted, whatever the error', async () => {
    const { CircuitBreaker } = await import('../../utils/circuit-breaker');
    const breaker = new CircuitBreaker(2, 60_000);
    const own = fakeModel(async () => {
      throw httpError(500);
    });
    const wrapped = withByokFailureHandling(own.model, {
      credential: credential(),
      fallback: null,
    });
    for (let i = 0; i < 5; i++) {
      await breaker.execute(() => wrapped.invoke('hi') as Promise<unknown>).catch(() => undefined);
    }
    expect(breaker.getState().failureCount).toBe(0);
    await expect(breaker.execute(async () => 'still closed')).resolves.toBe('still closed');
  });

  it('when the key fails and the call falls back to the platform, the platform answer is counted', async () => {
    const { CircuitBreaker } = await import('../../utils/circuit-breaker');
    const breaker = new CircuitBreaker(2, 60_000);
    const own = fakeModel(async () => {
      throw httpError(429);
    });
    const failingPlatform = fakeModel(async () => {
      throw httpError(500);
    });
    const wrapped = withByokFailureHandling(own.model, {
      credential: credential({ allowFallback: true }),
      fallback: async () => failingPlatform.model,
    });
    for (let i = 0; i < 2; i++) {
      await breaker.execute(() => wrapped.invoke('hi') as Promise<unknown>).catch(() => undefined);
    }
    expect(breaker.getState().failureCount).toBe(2);
    expect(breaker.getState().state).toBe('OPEN');
    // ...and an OPEN platform breaker refuses the call before anything is sent to the platform.
    await expect(breaker.execute(() => wrapped.invoke('hi') as Promise<unknown>)).rejects.toThrow(
      /OPEN/
    );
    expect(failingPlatform.invoke).toHaveBeenCalledTimes(2);
  });

  it('a platform fallback that succeeds closes a HALF_OPEN breaker (it is the platform answering)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const breaker = await openBreaker();
    vi.setSystemTime(Date.now() + 61_000);
    const own = fakeModel(async () => {
      throw httpError(429);
    });
    const platform = fakeModel(async () => ({ content: 'platform answer' }));
    const wrapped = withByokFailureHandling(own.model, {
      credential: credential({ allowFallback: true }),
      fallback: async () => platform.model,
    });
    await breaker.execute(() => wrapped.invoke('hi') as Promise<unknown>);
    expect(breaker.getState().state).toBe('CLOSED');
  });
});

describe('403 is a bad key only when the provider says it is about the key', () => {
  it.each([
    ['Your API key does not have permission to use the specified resource', 'INVALID'],
    ['Project does not have access to model gpt-4o', 'INVALID'],
    ['Forbidden: access denied', 'INVALID'],
  ])('%s -> %s', (message, expected) => {
    expect(classifyByokFailure(httpError(403, message))).toBe(expected);
  });

  it.each([
    ['Your chosen model requires moderation and your input was flagged'],
    ['Country, region, or territory not supported'],
    ['something unrelated'],
  ])('%s is not a key failure', (message) => {
    expect(classifyByokFailure(httpError(403, message))).toBeNull();
  });
});

describe('an OPEN platform breaker does not refuse a tenant on its own key', () => {
  async function openBreaker() {
    const { CircuitBreaker } = await import('../../utils/circuit-breaker');
    const breaker = new CircuitBreaker(2, 60_000);
    for (let i = 0; i < 2; i++) {
      await breaker.execute(() => Promise.reject(httpError(500))).catch(() => undefined);
    }
    return breaker;
  }

  it('runs the own-key call; a tenant without a key (or with a rejected one) is still refused', async () => {
    const { tenantContextStore } = await import('../../tracing/tenant-context');
    const breaker = await openBreaker();
    db.findFirst.mockImplementation(async ({ where }: { where: { tenantId: string } }) => {
      if (where.tenantId === 'tenant-a') return row();
      if (where.tenantId === 'tenant-rejected') return row({ status: 'INVALID' });
      return null;
    });
    const own = fakeModel(async () => ({ content: 'own key answer' }));
    const wrapped = withByokFailureHandling(own.model, {
      credential: credential(),
      fallback: null,
    });

    await expect(
      tenantContextStore.run({ tenantId: 'tenant-a' }, () =>
        breaker.execute(() => wrapped.invoke('hi') as Promise<unknown>)
      )
    ).resolves.toEqual({ content: 'own key answer' });
    for (const tenantId of ['tenant-none', 'tenant-rejected']) {
      await expect(
        tenantContextStore.run({ tenantId }, () => breaker.execute(async () => 'x'))
      ).rejects.toThrow(/OPEN/);
    }
    // The own-key call neither counted nor closed anything.
    expect(breaker.getState().state).toBe('OPEN');
  });

  it('even a tenant that allowed fallback does not call the platform while the breaker is OPEN', async () => {
    const { tenantContextStore } = await import('../../tracing/tenant-context');
    const breaker = await openBreaker();
    db.findFirst.mockResolvedValue(row({ allowFallback: true }));
    const platform = fakeModel(async () => ({ content: 'platform answer' }));
    const own = fakeModel(async () => {
      throw httpError(429);
    });
    const wrapped = withByokFailureHandling(own.model, {
      credential: credential({ allowFallback: true }),
      fallback: async () => platform.model,
    });
    await expect(
      tenantContextStore.run({ tenantId: 'tenant-a' }, () =>
        breaker.execute(() => wrapped.invoke('hi') as Promise<unknown>)
      )
    ).rejects.toThrow(/OPEN/);
    expect(platform.invoke).not.toHaveBeenCalled();
    expect(breaker.getState().failureCount).toBe(2);
  });
});

describe('key identity: a replacement is not marked or healed by the old key', () => {
  it('a delayed failure of the old key marks nothing, even when both keys end the same', async () => {
    db.findFirst.mockResolvedValue(row({ apiKey: KEY_B, createdAt: new Date(REVISION_B) }));
    await resolveByokCredential('tenant-a');
    // The old key (revision A) fails after the replacement (revision B) was saved.
    await markByokStatus(credential({ revision: REVISION_A }), 'INVALID');
    expect((await resolveByokCredential('tenant-a'))?.status).toBe('ACTIVE');
    // The database write is keyed on the old revision, so it matches no row of the new key.
    expect(db.updateMany.mock.calls[0][0].where.createdAt).toEqual(new Date(REVISION_A));
  });

  it('a delayed success of the old key does not heal the replacement', async () => {
    db.findFirst.mockResolvedValue(
      row({ apiKey: KEY_B, createdAt: new Date(REVISION_B), status: 'RATE_LIMITED' })
    );
    await resolveByokCredential('tenant-a');
    const { model } = fakeModel(async () => ({ content: 'ok' }));
    const wrapped = withByokFailureHandling(model, {
      credential: credential({ revision: REVISION_A }),
      fallback: null,
    });
    await wrapped.invoke('hi');
    expect((await resolveByokCredential('tenant-a'))?.status).toBe('RATE_LIMITED');
  });
});

describe('status write throttle is per key', () => {
  it('an old key failure that matched no row does not suppress the replacement failure', async () => {
    db.updateMany.mockResolvedValueOnce({ count: 0 });
    await markByokStatus(credential({ revision: REVISION_A }), 'RATE_LIMITED');
    db.updateMany.mockResolvedValue({ count: 1 });
    await markByokStatus(credential({ revision: REVISION_B }), 'RATE_LIMITED');
    expect(db.updateMany).toHaveBeenCalledTimes(2);
    expect(db.updateMany.mock.calls[1][0].where.createdAt).toEqual(new Date(REVISION_B));
    // Same key, same status, inside a minute: throttled as before.
    await markByokStatus(credential({ revision: REVISION_B }), 'RATE_LIMITED');
    expect(db.updateMany).toHaveBeenCalledTimes(2);
  });
});
