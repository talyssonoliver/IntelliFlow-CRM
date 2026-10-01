/**
 * moduleAccess.getUsage — plan, limits and usage for the caller's tenant,
 * and PARTNER_FREE staying off the purchasable plan listing.
 */

import { describe, it, expect, vi } from 'vitest';
import { moduleAccessRouter } from '../subscription.router';
import { createTestContext, mockServices, TEST_UUIDS } from '../../../test/setup';

const limits = {
  contacts: 500,
  seats: 2,
  emailsPerMonth: 0,
  aiSpendCentsPerMonth: 0,
  workflowsActive: 0,
};
const usage = {
  contacts: 12,
  seats: 1,
  emailsPerMonth: 0,
  aiSpendCentsPerMonth: 0,
  workflowsActive: 0,
};

function containerWithPlan(plan: string) {
  return {
    get: (name: string) =>
      name === 'moduleAccess' ? { getTenantPlan: async () => plan } : undefined,
  };
}

describe('moduleAccess.getUsage', () => {
  it('returns the plan with the tenant limits and usage', async () => {
    const quota = {
      getLimits: vi.fn().mockResolvedValue(limits),
      getUsage: vi.fn().mockResolvedValue(usage),
    };
    const ctx = createTestContext({
      container: containerWithPlan('PARTNER_FREE') as never,
      services: { ...mockServices, quota: quota as never },
    });

    const result = await moduleAccessRouter.createCaller(ctx).getUsage();

    expect(result).toEqual({ plan: 'PARTNER_FREE', limits, usage });
    expect(quota.getLimits).toHaveBeenCalledWith(TEST_UUIDS.tenant);
    expect(quota.getUsage).toHaveBeenCalledWith(TEST_UUIDS.tenant);
  });

  it('fails loudly when the quota service is not wired', async () => {
    const ctx = createTestContext({
      container: containerWithPlan('STARTER') as never,
      services: { ...mockServices, quota: undefined as never },
    });

    await expect(moduleAccessRouter.createCaller(ctx).getUsage()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });
});

describe('moduleAccess.getPlans', () => {
  it('lists purchasable plans only, never PARTNER_FREE', async () => {
    const ctx = createTestContext();
    const plans = await moduleAccessRouter.createCaller(ctx).getPlans();

    const tiers = plans.map((p) => p.tier);
    expect(tiers).not.toContain('PARTNER_FREE');
    expect(tiers).toEqual(['STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM']);
  });
});
