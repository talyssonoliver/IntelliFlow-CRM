/**
 * Quota service stubs for router guard tests.
 *
 * Pass the stub via `createTestContext({ services: { ...mockServices, quota } })`
 * (or `ctx.services = { ...ctx.services, quota }`) so the shared mockServices stay untouched.
 */

import { expect, vi } from 'vitest';
import { QuotaExceededError, type QuotaKey } from '@intelliflow/domain';

/** A quota service that allows everything and records calls. */
export function underQuota() {
  return {
    assertWithinQuota: vi.fn().mockResolvedValue(undefined),
    increment: vi.fn().mockResolvedValue(undefined),
  };
}

/** A quota service that rejects `key` as exhausted (all other keys pass). */
export function overQuota(key: QuotaKey, used: number, limit: number) {
  return {
    assertWithinQuota: vi.fn(async (_tenantId: string, k: QuotaKey, increment = 1) => {
      if (k === key) throw new QuotaExceededError(k, used, limit, increment);
    }),
    increment: vi.fn().mockResolvedValue(undefined),
  };
}

/** The shape every guard rejection must have. */
export function quotaRejection(key: QuotaKey, used: number, limit: number) {
  return {
    code: 'PRECONDITION_FAILED',
    cause: expect.objectContaining({ code: 'QUOTA_EXCEEDED', key, used, limit }),
  };
}
