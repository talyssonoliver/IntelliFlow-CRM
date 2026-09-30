/**
 * email.getStorageUsage reads the plan from Tenant.plan (ADR-070), not from the
 * deprecated Workspace membership that nothing populates.
 */
import { describe, it, expect } from 'vitest';
import { createTestContext, prismaMock } from '../../../test/setup';
import { inboundEmailRouter } from '../inbound.router';

const GB = 1024 * 1024 * 1024;

function arrange(plan: string | null) {
  prismaMock.$queryRaw.mockResolvedValue([{ total: 10 }] as never);
  prismaMock.emailAttachment.aggregate.mockResolvedValue({ _sum: { fileSize: 5 } } as never);
  prismaMock.tenant.findUnique.mockResolvedValue(plan ? ({ plan } as never) : null);
  return (inboundEmailRouter as any).createCaller(createTestContext());
}

describe('email.getStorageUsage plan resolution', () => {
  it.each([
    ['STARTER', 5 * GB],
    ['PROFESSIONAL', 25 * GB],
    ['ENTERPRISE', 100 * GB],
  ])('uses the %s limit from Tenant.plan', async (plan, limit) => {
    const caller = arrange(plan);

    const out = await caller.getStorageUsage();

    expect(out).toEqual({ usedBytes: 15, limitBytes: limit, planTier: plan });
    expect(prismaMock.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: expect.any(String) },
      select: { plan: true },
    });
  });

  it('falls back to the STARTER limit for a plan without a storage tier and for a missing tenant', async () => {
    const partner = await arrange('PARTNER_FREE').getStorageUsage();
    expect(partner.planTier).toBe('PARTNER_FREE');
    expect(partner.limitBytes).toBe(5 * GB);

    const missing = await arrange(null).getStorageUsage();
    expect(missing).toMatchObject({ planTier: 'STARTER', limitBytes: 5 * GB });
  });
});
