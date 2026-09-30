import { describe, it, expect, vi, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { QuotaExceededError } from '@intelliflow/domain';
import { assertQuota, isQuotaExceeded, recordUsage } from '../quota-guard';
import { createTRPCRouter } from '../../trpc';

const TENANT = 'tenant-1';

describe('quota-guard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
    it('skips the guard when the quota service is not wired', async () => {
      await expect(assertQuota({}, TENANT, 'contacts')).resolves.toBeUndefined();
      await expect(assertQuota({ services: {} }, TENANT, 'contacts')).resolves.toBeUndefined();
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
    it('is a no-op when the quota service is not wired', async () => {
      await expect(recordUsage({}, TENANT, 'emailsPerMonth')).resolves.toBeUndefined();
    });

    it('increments through the service', async () => {
      const quota = { assertWithinQuota: vi.fn(), increment: vi.fn().mockResolvedValue(undefined) };
      await recordUsage({ services: { quota } }, TENANT, 'emailsPerMonth', 3);
      expect(quota.increment).toHaveBeenCalledWith(TENANT, 'emailsPerMonth', 3);
    });

    it('logs but never throws when recording fails', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const quota = {
        assertWithinQuota: vi.fn(),
        increment: vi.fn().mockRejectedValue(new Error('x')),
      };
      await expect(
        recordUsage({ services: { quota } }, TENANT, 'emailsPerMonth')
      ).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalled();
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
