/**
 * AI Provider Key Router Tests - PG-199 BYOK.
 *
 * Admin-only, tenant-scoped, rate-limited; the key is checked with the provider before it is
 * stored, stored only through the encrypting client when encryption is configured, and is
 * never returned, selected for a DTO, logged or audited. The fake key is built at runtime.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

const FAKE_KEY = 'm'.repeat(20) + 'n'.repeat(10) + 'wxyz';

const logAction = vi.hoisted(() => vi.fn());
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction }),
}));

const checkProviderKey = vi.hoisted(() => vi.fn());
vi.mock('../ai-provider-key-check', () => ({ checkProviderKey }));

// The key limiter is replaced by a controllable gate; every other tier is real.
const keyGate = vi.hoisted(() => vi.fn());
vi.mock('../../../middleware/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../middleware/rate-limit')>();
  return {
    ...actual,
    createDistributedRateLimitMiddleware: (tier: { name: string }, options?: unknown) =>
      tier.name === 'ai-provider-key-write'
        ? (opts: { next: () => Promise<unknown> }) => keyGate(opts)
        : actual.createDistributedRateLimitMiddleware(tier as never, options as never),
  };
});

import { aiProviderKeyRouter } from '../ai-provider-key.router';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  createManagerContext,
  createPublicContext,
  TEST_UUIDS,
} from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;
const NOW = new Date('2026-11-23T12:00:00.000Z');
const SAVED = new Date('2026-11-22T09:00:00.000Z');

function keyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'key-1',
    provider: 'openai',
    last4: 'wxyz',
    status: 'ACTIVE',
    statusDetail: null,
    allowFallback: false,
    createdAt: NOW,
    lastUsedAt: null,
    ...overrides,
  };
}

const delegate = () => prismaMock.tenantAIProviderKey as any;

async function expectCode(promise: Promise<unknown>, code: TRPCError['code']) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('aiProviderKeyRouter (PG-199 BYOK)', () => {
  let admin: ReturnType<typeof aiProviderKeyRouter.createCaller>;
  let user: ReturnType<typeof aiProviderKeyRouter.createCaller>;
  const savedKey = process.env['PRISMA_FIELD_ENCRYPTION_KEY'];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    logAction.mockReset().mockResolvedValue('audit-1');
    checkProviderKey.mockReset().mockResolvedValue({ ok: true });
    keyGate.mockReset().mockImplementation(({ next }: { next: () => Promise<unknown> }) => next());
    process.env['PRISMA_FIELD_ENCRYPTION_KEY'] = 'configured';
    admin = aiProviderKeyRouter.createCaller(createAdminContext());
    user = aiProviderKeyRouter.createCaller(createTestContext());
    delegate().findFirst.mockResolvedValue(null);
    delegate().upsert.mockImplementation(async ({ create }: any) =>
      keyRow({ ...create, apiKey: undefined })
    );
    delegate().update.mockResolvedValue(keyRow());
    delegate().updateMany.mockResolvedValue({ count: 1 });
    delegate().deleteMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (savedKey === undefined) delete process.env['PRISMA_FIELD_ENCRYPTION_KEY'];
    else process.env['PRISMA_FIELD_ENCRYPTION_KEY'] = savedKey;
  });

  describe('access', () => {
    it('rejects an unauthenticated caller', async () => {
      const anon = aiProviderKeyRouter.createCaller(createPublicContext());
      await expectCode(anon.get(), 'UNAUTHORIZED');
    });

    it('a non-admin gets no key from get and cannot set, test, change or remove', async () => {
      const result = await user.get();
      expect(result).toEqual({ canManage: false, key: null });
      expect(delegate().findFirst).not.toHaveBeenCalled();
      await expectCode(
        user.set({ provider: 'openai', apiKey: FAKE_KEY, allowFallback: false }),
        'FORBIDDEN'
      );
      await expectCode(user.test(null), 'FORBIDDEN');
      await expectCode(user.setOptions({ allowFallback: true }), 'FORBIDDEN');
      await expectCode(user.remove(), 'FORBIDDEN');
      expect(checkProviderKey).not.toHaveBeenCalled();
      expect(delegate().upsert).not.toHaveBeenCalled();
    });

    it('a manager is not a key admin: the key decides where every prompt goes and who pays', async () => {
      const manager = aiProviderKeyRouter.createCaller(createManagerContext());
      await expect(manager.get()).resolves.toEqual({ canManage: false, key: null });
      await expectCode(
        manager.set({ provider: 'openai', apiKey: FAKE_KEY, allowFallback: false }),
        'FORBIDDEN'
      );
      await expectCode(manager.remove(), 'FORBIDDEN');
      expect(delegate().upsert).not.toHaveBeenCalled();
    });
  });

  describe('get (masking)', () => {
    it('returns null when no key is stored', async () => {
      await expect(admin.get()).resolves.toEqual({ canManage: true, key: null });
    });

    it('returns provider, last 4, status, dates - and never selects or returns the key', async () => {
      delegate().findFirst.mockResolvedValue(keyRow({ lastUsedAt: NOW, apiKey: FAKE_KEY }));
      const result = await admin.get();
      expect(result.key).toEqual({
        provider: 'openai',
        last4: 'wxyz',
        status: 'ACTIVE',
        statusDetail: null,
        allowFallback: false,
        createdAt: NOW.toISOString(),
        lastUsedAt: NOW.toISOString(),
      });
      expect(JSON.stringify(result)).not.toContain(FAKE_KEY);
      const select = delegate().findFirst.mock.calls[0][0].select;
      expect(select.apiKey).toBeUndefined();
    });

    it('reads only the caller tenant', async () => {
      await admin.get();
      expect(delegate().findFirst.mock.calls[0][0].where).toEqual({ tenantId });
    });
  });

  describe('set', () => {
    const input = { provider: 'anthropic' as const, apiKey: FAKE_KEY, allowFallback: false };

    it('checks the key with the provider, then stores it for this tenant with its last 4', async () => {
      const result = await admin.set(input);
      expect(checkProviderKey).toHaveBeenCalledWith('anthropic', FAKE_KEY);
      const args = delegate().upsert.mock.calls[0][0];
      expect(args.where).toEqual({ tenantId });
      expect(args.create).toMatchObject({
        tenantId,
        provider: 'anthropic',
        apiKey: FAKE_KEY,
        last4: 'wxyz',
        status: 'ACTIVE',
        allowFallback: false,
      });
      expect(args.update.apiKey).toBe(FAKE_KEY);
      expect(args.update.lastUsedAt).toBeNull();
      expect(JSON.stringify(result)).not.toContain(FAKE_KEY);
    });

    it('stores the fallback choice; a first key defaults to false and a replacement keeps the stored choice', async () => {
      await admin.set({ provider: 'openai', apiKey: FAKE_KEY, allowFallback: true });
      expect(delegate().upsert.mock.calls[0][0].create.allowFallback).toBe(true);
      await admin.set({ provider: 'openai', apiKey: FAKE_KEY });
      expect(delegate().upsert.mock.calls[1][0].create.allowFallback).toBe(false);
      delegate().findFirst.mockResolvedValue(keyRow({ allowFallback: true }));
      await admin.set({ provider: 'openai', apiKey: FAKE_KEY });
      expect(delegate().upsert.mock.calls[2][0].update.allowFallback).toBe(true);
    });

    it('refuses a key the provider rejects and writes nothing', async () => {
      checkProviderKey.mockResolvedValue({
        ok: false,
        reason: 'invalid',
        message: 'The provider did not accept this key.',
      });
      await expectCode(admin.set(input), 'BAD_REQUEST');
      expect(delegate().upsert).not.toHaveBeenCalled();
      expect(logAction).not.toHaveBeenCalled();
    });

    it('says the provider is unavailable when it cannot check, and writes nothing', async () => {
      checkProviderKey.mockResolvedValue({
        ok: false,
        reason: 'unavailable',
        message: 'try later',
      });
      await expectCode(admin.set(input), 'SERVICE_UNAVAILABLE');
      expect(delegate().upsert).not.toHaveBeenCalled();
    });

    it('writes nothing when field encryption is not configured, and names AI provider keys', async () => {
      delete process.env['PRISMA_FIELD_ENCRYPTION_KEY'];
      await expect(admin.set(input)).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: expect.stringContaining('AI provider keys'),
      });
      expect(checkProviderKey).not.toHaveBeenCalled();
      expect(delegate().upsert).not.toHaveBeenCalled();
    });

    it('validates the provider and the key shape', async () => {
      await expectCode(
        admin.set({ provider: 'nope' as any, apiKey: FAKE_KEY, allowFallback: false }),
        'BAD_REQUEST'
      );
      await expectCode(
        admin.set({ provider: 'openai', apiKey: 'short', allowFallback: false }),
        'BAD_REQUEST'
      );
      await expectCode(
        admin.set({
          provider: 'openai',
          apiKey: 'has space in it ' + FAKE_KEY,
          allowFallback: false,
        }),
        'BAD_REQUEST'
      );
      expect(checkProviderKey).not.toHaveBeenCalled();
    });

    it('is rate limited', async () => {
      keyGate.mockRejectedValueOnce(new TRPCError({ code: 'TOO_MANY_REQUESTS' }));
      await expectCode(admin.set(input), 'TOO_MANY_REQUESTS');
      expect(checkProviderKey).not.toHaveBeenCalled();
    });

    it('audits a first set as CREATE and a replacement as UPDATE - provider and last 4 only', async () => {
      await admin.set(input);
      expect(logAction).toHaveBeenCalledTimes(1);
      expect(logAction.mock.calls[0].slice(0, 4)).toEqual([
        'CREATE',
        'model_config',
        'key-1',
        tenantId,
      ]);
      expect(logAction.mock.calls[0][4]).toMatchObject({
        eventType: 'AIProviderKeySet',
        actorId: TEST_UUIDS.admin1,
      });

      delegate().findFirst.mockResolvedValue(keyRow({ provider: 'openai', last4: 'oldk' }));
      await admin.set(input);
      expect(logAction.mock.calls[1][0]).toBe('UPDATE');
      expect(logAction.mock.calls[1][4]).toMatchObject({
        eventType: 'AIProviderKeyReplaced',
        beforeState: { provider: 'openai', last4: 'oldk' },
      });
      for (const call of logAction.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(FAKE_KEY);
      }
    });

    it('a failing audit write never fails the save', async () => {
      logAction.mockRejectedValue(new Error('audit down'));
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await expect(admin.set(input)).resolves.toBeTruthy();
      await Promise.resolve();
      spy.mockRestore();
    });
  });

  describe('test', () => {
    it('checks a typed key without storing it', async () => {
      const result = await admin.test({ provider: 'google', apiKey: FAKE_KEY });
      expect(checkProviderKey).toHaveBeenCalledWith('google', FAKE_KEY);
      expect(result).toMatchObject({ ok: true, key: null });
      expect(delegate().updateMany).not.toHaveBeenCalled();
      expect(delegate().upsert).not.toHaveBeenCalled();
    });

    const STORED_ROW = { id: 'key-1', updatedAt: SAVED, provider: 'openai', apiKey: FAKE_KEY };

    it('re-checks the stored key and marks it ACTIVE when the provider accepts it', async () => {
      delegate().findFirst.mockResolvedValue({ ...STORED_ROW, ...keyRow() });
      const result = await admin.test(null);
      expect(checkProviderKey).toHaveBeenCalledWith('openai', FAKE_KEY);
      // Only the row that was checked: its id and the updatedAt it had when it was read.
      expect(delegate().updateMany.mock.calls[0][0]).toMatchObject({
        where: { tenantId, id: 'key-1', updatedAt: SAVED },
        data: { status: 'ACTIVE', statusDetail: null },
      });
      expect(result.ok).toBe(true);
      expect(JSON.stringify(result)).not.toContain(FAKE_KEY);
    });

    it('marks the stored key INVALID when the provider rejects it', async () => {
      delegate().findFirst.mockResolvedValue({ ...STORED_ROW, ...keyRow() });
      checkProviderKey.mockResolvedValue({
        ok: false,
        reason: 'invalid',
        message: 'The provider did not accept this key.',
      });
      const result = await admin.test(null);
      expect(result.ok).toBe(false);
      expect(delegate().updateMany.mock.calls[0][0].data.status).toBe('INVALID');
    });

    it('a key saved or removed while the provider was being asked takes no result and throws nothing', async () => {
      delegate().findFirst.mockResolvedValue({ ...STORED_ROW, ...keyRow() });
      delegate().updateMany.mockResolvedValue({ count: 0 });
      checkProviderKey.mockResolvedValue({
        ok: false,
        reason: 'invalid',
        message: 'The provider did not accept this key.',
      });
      const result = await admin.test(null);
      expect(result).toMatchObject({ ok: false, key: null });
      expect(result.message).toMatch(/changed while it was being checked/);
      expect(delegate().update).not.toHaveBeenCalled();
    });

    it('leaves the status alone when the provider cannot be reached', async () => {
      delegate().findFirst.mockResolvedValue({ ...STORED_ROW, ...keyRow() });
      checkProviderKey.mockResolvedValue({
        ok: false,
        reason: 'unavailable',
        message: 'try later',
      });
      const result = await admin.test(null);
      expect(result).toMatchObject({ ok: false, key: null });
      expect(delegate().updateMany).not.toHaveBeenCalled();
    });

    it('re-checking the stored key needs field encryption: nothing is read, sent or overwritten without it', async () => {
      delete process.env['PRISMA_FIELD_ENCRYPTION_KEY'];
      await expectCode(admin.test(null), 'PRECONDITION_FAILED');
      expect(delegate().findFirst).not.toHaveBeenCalled();
      expect(checkProviderKey).not.toHaveBeenCalled();
      expect(delegate().updateMany).not.toHaveBeenCalled();
    });

    it('is NOT_FOUND when there is no stored key to test', async () => {
      await expectCode(admin.test(null), 'NOT_FOUND');
    });

    it('is rate limited', async () => {
      keyGate.mockRejectedValueOnce(new TRPCError({ code: 'TOO_MANY_REQUESTS' }));
      await expectCode(admin.test({ provider: 'openai', apiKey: FAKE_KEY }), 'TOO_MANY_REQUESTS');
    });
  });

  describe('setOptions', () => {
    it('changes the fallback switch for this tenant and audits it', async () => {
      delegate()
        .findFirst.mockResolvedValueOnce(keyRow())
        .mockResolvedValueOnce(keyRow({ allowFallback: true }));
      const result = await admin.setOptions({ allowFallback: true });
      expect(delegate().updateMany.mock.calls[0][0]).toMatchObject({
        where: { tenantId, id: 'key-1' },
        data: { allowFallback: true },
      });
      expect(result.key.allowFallback).toBe(true);
      expect(logAction.mock.calls[0][4]).toMatchObject({
        eventType: 'AIProviderKeyOptionsChanged',
      });
    });

    it('is NOT_FOUND without a stored key, and when the key is removed meanwhile (no 500)', async () => {
      await expectCode(admin.setOptions({ allowFallback: true }), 'NOT_FOUND');
      delegate().findFirst.mockResolvedValue(keyRow());
      delegate().updateMany.mockResolvedValue({ count: 0 });
      await expectCode(admin.setOptions({ allowFallback: true }), 'NOT_FOUND');
    });
  });

  describe('remove', () => {
    it('deletes only this tenant key and audits the removal', async () => {
      delegate().findFirst.mockResolvedValue(keyRow());
      await expect(admin.remove()).resolves.toEqual({ removed: true });
      expect(delegate().deleteMany).toHaveBeenCalledWith({ where: { tenantId } });
      expect(logAction.mock.calls[0].slice(0, 4)).toEqual([
        'DELETE',
        'model_config',
        'key-1',
        tenantId,
      ]);
      expect(logAction.mock.calls[0][4]).toMatchObject({ eventType: 'AIProviderKeyRemoved' });
    });

    it('does nothing and audits nothing when there is no key', async () => {
      await expect(admin.remove()).resolves.toEqual({ removed: false });
      expect(delegate().deleteMany).not.toHaveBeenCalled();
      expect(logAction).not.toHaveBeenCalled();
    });
  });
});
