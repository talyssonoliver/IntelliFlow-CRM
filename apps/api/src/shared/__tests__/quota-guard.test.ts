import { describe, it, expect, vi, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { QuotaExceededError } from '@intelliflow/domain';
import {
  assertQuota,
  isQuotaExceeded,
  recordUsage,
  reserveQuota,
  withQuotaLock,
} from '../quota-guard';
import { createTRPCRouter } from '../../trpc';

const TENANT = 'tenant-1';

describe('quota-guard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('isQuotaExceeded', () => {
    it('recognises the domain error and rejects other values', () => {
      expect(isQuotaExceeded(new QuotaExceededError('contacts', 1, 1))).toBe(true);
      expect(isQuotaExceeded(new Error('boom'))).toBe(false);
      expect(isQuotaExceeded({ code: 'QUOTA_EXCEEDED' })).toBe(false);
      expect(isQuotaExceeded(undefined)).toBe(false);
    });
  });

  describe('assertQuota', () => {
    it('skips a missing service only in a test process that opted in explicitly', async () => {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('QUOTA_GUARD_ALLOW_MISSING_SERVICE', '1');
      await expect(assertQuota({}, TENANT, 'contacts')).resolves.toBeUndefined();
      await expect(assertQuota({ services: {} }, TENANT, 'contacts')).resolves.toBeUndefined();
    });

    it.each([
      ['production, flag set', 'production', '1'],
      ['production, no flag', 'production', ''],
      ['test, no flag', 'test', ''],
      ['development, flag set', 'development', '1'],
    ])('fails closed when the quota service is missing (%s)', async (_n, nodeEnv, flag) => {
      vi.stubEnv('NODE_ENV', nodeEnv);
      vi.stubEnv('QUOTA_GUARD_ALLOW_MISSING_SERVICE', flag);
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const err = await assertQuota({}, TENANT, 'contacts').catch((e) => e);
      expect(err).toBeInstanceOf(TRPCError);
      expect(err.code).toBe('INTERNAL_SERVER_ERROR');
      expect(err.message).toContain('Quota enforcement is unavailable');
      expect(spy).toHaveBeenCalled();
      // The same policy covers the atomic and locking entry points.
      await expect(reserveQuota({}, TENANT, 'emailsPerMonth')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
      const create = vi.fn();
      await expect(withQuotaLock({}, TENANT, 'contacts', 1, create)).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('passes the tenant, key and increment to the service', async () => {
      const quota = { assertWithinQuota: vi.fn().mockResolvedValue(undefined), increment: vi.fn() };
      await assertQuota({ services: { quota } }, TENANT, 'emailsPerMonth', 4);
      expect(quota.assertWithinQuota).toHaveBeenCalledWith(TENANT, 'emailsPerMonth', 4);
    });

    it('maps QuotaExceededError to PRECONDITION_FAILED carrying the error as cause', async () => {
      const exceeded = new QuotaExceededError('seats', 2, 2);
      const quota = { assertWithinQuota: vi.fn().mockRejectedValue(exceeded), increment: vi.fn() };
      const err = await assertQuota({ services: { quota } }, TENANT, 'seats').catch((e) => e);
      expect(err).toBeInstanceOf(TRPCError);
      expect(err.code).toBe('PRECONDITION_FAILED');
      expect(err.cause).toBe(exceeded);
      expect(err.message).toContain('seats');
    });

    it('fails closed when the quota lookup itself fails', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const quota = {
        assertWithinQuota: vi.fn().mockRejectedValue(new Error('db down')),
        increment: vi.fn(),
      };
      await expect(assertQuota({ services: { quota } }, TENANT, 'contacts')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('recordUsage', () => {
    it('warns (never silent) when the quota service is not wired outside tests', async () => {
      vi.stubEnv('QUOTA_GUARD_ALLOW_MISSING_SERVICE', '');
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await expect(recordUsage({}, TENANT, 'emailsPerMonth', 2)).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('USAGE_NOT_RECORDED'),
        expect.objectContaining({ tenantId: TENANT, key: 'emailsPerMonth', by: 2 })
      );
    });

    it('increments through the service', async () => {
      const quota = { assertWithinQuota: vi.fn(), increment: vi.fn().mockResolvedValue(undefined) };
      await recordUsage({ services: { quota } }, TENANT, 'emailsPerMonth', 3);
      expect(quota.increment).toHaveBeenCalledWith(TENANT, 'emailsPerMonth', 3);
    });

    it('retries once, then warns with tenant and key but never throws', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const quota = {
        assertWithinQuota: vi.fn(),
        increment: vi.fn().mockRejectedValue(new Error('x')),
      };
      await expect(
        recordUsage({ services: { quota } }, TENANT, 'emailsPerMonth')
      ).resolves.toBeUndefined();
      expect(quota.increment).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('USAGE_NOT_RECORDED'),
        expect.objectContaining({ tenantId: TENANT, key: 'emailsPerMonth' })
      );
    });

    it('succeeds on the retry without warning', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const quota = {
        increment: vi.fn().mockRejectedValueOnce(new Error('blip')).mockResolvedValue(undefined),
      };
      await recordUsage({ services: { quota } }, TENANT, 'emailsPerMonth');
      expect(quota.increment).toHaveBeenCalledTimes(2);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('reserveQuota', () => {
    it('reserves atomically and returns an idempotent release', async () => {
      const quota = { reserve: vi.fn().mockResolvedValue(undefined), release: vi.fn() };
      const release = await reserveQuota({ services: { quota } }, TENANT, 'emailsPerMonth', 3);
      expect(quota.reserve).toHaveBeenCalledWith(TENANT, 'emailsPerMonth', 3);
      await release();
      await release();
      expect(quota.release).toHaveBeenCalledTimes(1);
      expect(quota.release).toHaveBeenCalledWith(TENANT, 'emailsPerMonth', 3);
    });

    it('maps an exhausted quota to PRECONDITION_FAILED and keeps nothing reserved', async () => {
      const exceeded = new QuotaExceededError('emailsPerMonth', 499, 500, 2);
      const quota = { reserve: vi.fn().mockRejectedValue(exceeded), release: vi.fn() };
      const err = await reserveQuota({ services: { quota } }, TENANT, 'emailsPerMonth', 2).catch(
        (e) => e
      );
      expect(err.code).toBe('PRECONDITION_FAILED');
      expect(err.cause).toBe(exceeded);
      expect(quota.release).not.toHaveBeenCalled();
    });

    it('warns but does not throw when the release fails', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const quota = {
        reserve: vi.fn().mockResolvedValue(undefined),
        release: vi.fn().mockRejectedValue(new Error('db')),
      };
      const release = await reserveQuota({ services: { quota } }, TENANT, 'emailsPerMonth');
      await expect(release()).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('withQuotaLock', () => {
    const lockingQuota = (assertThrows?: Error) => {
      const withinQuota = vi.fn(
        async (_t: string, _k: string, _n: number, create: () => Promise<unknown>) => {
          if (assertThrows) throw assertThrows;
          return create();
        }
      );
      return { withinQuota: withinQuota as never } as { withinQuota: never } & {
        withinQuota: typeof withinQuota;
      };
    };

    it('runs create under the lock and returns its value', async () => {
      const quota = lockingQuota();
      const out = await withQuotaLock(
        { services: { quota } },
        TENANT,
        'contacts',
        2,
        async () => 'ok'
      );
      expect(out).toBe('ok');
      expect(quota.withinQuota).toHaveBeenCalledWith(TENANT, 'contacts', 2, expect.any(Function));
    });

    it('maps a quota rejection from the locked assertion and never runs create', async () => {
      const create = vi.fn();
      const quota = lockingQuota(new QuotaExceededError('contacts', 500, 500));
      await expect(
        withQuotaLock({ services: { quota } }, TENANT, 'contacts', 1, create)
      ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
      expect(create).not.toHaveBeenCalled();
    });

    it('fails closed when the lock itself cannot be taken', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const quota = lockingQuota(new Error('pool exhausted'));
      await expect(
        withQuotaLock({ services: { quota } }, TENANT, 'contacts', 1, async () => 1)
      ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    });

    it('rethrows create failures unchanged, not as a quota error', async () => {
      const boom = new TRPCError({ code: 'BAD_REQUEST', message: 'bad input' });
      const quota = lockingQuota();
      await expect(
        withQuotaLock({ services: { quota } }, TENANT, 'contacts', 1, async () => {
          throw boom;
        })
      ).rejects.toBe(boom);
      const plain = new Error('db down');
      await expect(
        withQuotaLock({ services: { quota } }, TENANT, 'contacts', 1, async () => {
          throw plain;
        })
      ).rejects.toBe(plain);
    });
  });

  describe('error formatter', () => {
    const format = (cause?: unknown) => {
      const config = (createTRPCRouter({}) as any)._def._config;
      const error = new TRPCError({ code: 'PRECONDITION_FAILED', message: 'x', cause });
      return config.errorFormatter({ shape: { data: { code: 'PRECONDITION_FAILED' } }, error });
    };

    it('exposes the quota payload to clients', () => {
      const shape = format(new QuotaExceededError('contacts', 500, 500));
      expect(shape.data.quota).toEqual({
        code: 'QUOTA_EXCEEDED',
        key: 'contacts',
        used: 500,
        limit: 500,
      });
    });

    it('leaves quota null for other errors', () => {
      expect(format(new Error('other')).data.quota).toBeNull();
      expect(format().data.quota).toBeNull();
    });
  });
});
