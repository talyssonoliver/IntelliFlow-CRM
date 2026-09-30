/**
 * PrismaTenantUsageAdapter Tests (ADR-070)
 */

import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@intelliflow/db';
import type { ModuleAccessPort } from '@intelliflow/application';
import { PrismaTenantUsageAdapter } from '../PrismaTenantUsageAdapter';

function setup() {
  const prisma: Record<string, any> = {
    contact: { count: vi.fn().mockResolvedValue(12) },
    user: { count: vi.fn().mockResolvedValue(3) },
    emailRecord: { count: vi.fn().mockResolvedValue(40) },
  };
  const moduleAccess = {
    getTenantPlan: vi.fn().mockResolvedValue('STARTER'),
    getEnabledModules: vi.fn().mockResolvedValue(['CORE_CRM', 'SUPPORT']),
  } as unknown as ModuleAccessPort;
  const adapter = new PrismaTenantUsageAdapter(
    prisma as unknown as PrismaClient,
    moduleAccess,
    () => new Date('2026-09-30T13:45:00Z')
  );
  return { prisma, moduleAccess, adapter };
}

describe('PrismaTenantUsageAdapter.getUsage', () => {
  it('reports measured counters, plan and modules for the tenant', async () => {
    const { adapter } = setup();

    const usage = await adapter.getUsage('t-1');

    expect(usage).toEqual({
      tenantId: 't-1',
      plan: 'STARTER',
      modules: ['CORE_CRM', 'SUPPORT'],
      quotas: {
        contacts: { used: 12, limit: null },
        seats: { used: 3, limit: null },
        emailsPerMonth: { used: 40, limit: null, measured: true },
        aiSpendCentsPerMonth: { used: 0, limit: null, measured: false },
      },
      asOf: '2026-09-30T13:45:00.000Z',
    });
  });

  it('scopes every count to the tenant and counts emails from the UTC month start', async () => {
    const { adapter, prisma } = setup();

    await adapter.getUsage('t-1');

    expect(prisma.contact.count).toHaveBeenCalledWith({ where: { tenantId: 't-1' } });
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { tenantId: 't-1' } });
    expect(prisma.emailRecord.count).toHaveBeenCalledWith({
      where: { tenantId: 't-1', createdAt: { gte: new Date('2026-09-01T00:00:00Z') } },
    });
  });

  it('defaults the clock to now', async () => {
    const { prisma, moduleAccess } = setup();
    const adapter = new PrismaTenantUsageAdapter(prisma as unknown as PrismaClient, moduleAccess);

    const usage = await adapter.getUsage('t-1');

    expect(Math.abs(Date.now() - Date.parse(usage.asOf))).toBeLessThan(5_000);
  });
});
