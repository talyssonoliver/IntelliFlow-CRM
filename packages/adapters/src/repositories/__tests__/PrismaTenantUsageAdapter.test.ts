/**
 * PrismaTenantUsageAdapter Tests (ADR-070)
 *
 * The adapter must report exactly what QuotaService enforces: same limits (plan defaults plus
 * overrides) and same usage numbers.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ModuleAccessPort, QuotaService } from '@intelliflow/application';
import { QuotaService as RealQuotaService } from '@intelliflow/application';
import { PrismaTenantUsageAdapter } from '../PrismaTenantUsageAdapter';

function setup() {
  const moduleAccess = {
    getTenantPlan: vi.fn().mockResolvedValue('STARTER'),
    getEnabledModules: vi.fn().mockResolvedValue(['CORE_CRM', 'SUPPORT']),
  } as unknown as ModuleAccessPort;
  const quota = {
    getLimits: vi.fn().mockResolvedValue({
      contacts: 2000,
      seats: 3,
      emailsPerMonth: 500,
      aiSpendCentsPerMonth: 2000,
      workflowsActive: 3,
    }),
    getUsage: vi.fn().mockResolvedValue({
      contacts: 12,
      seats: 3,
      emailsPerMonth: 40,
      aiSpendCentsPerMonth: 150,
      workflowsActive: 1,
    }),
  } satisfies Pick<QuotaService, 'getLimits' | 'getUsage'>;
  const adapter = new PrismaTenantUsageAdapter(
    moduleAccess,
    quota,
    () => new Date('2026-09-30T13:45:00Z')
  );
  return { moduleAccess, quota, adapter };
}

describe('PrismaTenantUsageAdapter.getUsage', () => {
  it('reports the quota service limits and usage with the plan and modules', async () => {
    const { adapter, quota } = setup();

    const usage = await adapter.getUsage('t-1');

    expect(usage).toEqual({
      tenantId: 't-1',
      plan: 'STARTER',
      modules: ['CORE_CRM', 'SUPPORT'],
      quotas: {
        contacts: { used: 12, limit: 2000 },
        seats: { used: 3, limit: 3 },
        emailsPerMonth: { used: 40, limit: 500, measured: true },
        aiSpendCentsPerMonth: { used: 150, limit: 2000, measured: true },
      },
      asOf: '2026-09-30T13:45:00.000Z',
    });
    expect(quota.getLimits).toHaveBeenCalledWith('t-1');
    expect(quota.getUsage).toHaveBeenCalledWith('t-1');
  });

  it('passes through unlimited (null) limits', async () => {
    const { adapter, quota } = setup();
    quota.getLimits.mockResolvedValue({
      contacts: null,
      seats: null,
      emailsPerMonth: null,
      aiSpendCentsPerMonth: null,
      workflowsActive: null,
    });

    const usage = await adapter.getUsage('t-1');

    expect(usage.quotas.contacts.limit).toBeNull();
    expect(usage.quotas.emailsPerMonth.limit).toBeNull();
  });

  it('matches enforcement: per-tenant overrides and recipient counting show up in the report', async () => {
    // A real QuotaService over a stub repository: one override, emails counted per recipient.
    const repository = {
      getOverrides: vi.fn().mockResolvedValue([{ key: 'seats', limit: 10 }]),
      countContacts: vi.fn().mockResolvedValue(5),
      countUsers: vi.fn().mockResolvedValue(4),
      countActiveWorkflows: vi.fn().mockResolvedValue(0),
      getCounter: vi.fn(
        async (_t: string, key: string) =>
          ({ emailsPerMonth: 7, aiSpendCentsPerMonth: 33 })[key as string] ?? 0
      ),
    };
    const moduleAccess = {
      getTenantPlan: vi.fn().mockResolvedValue('STARTER'),
      getEnabledModules: vi.fn().mockResolvedValue(['CORE_CRM']),
    } as unknown as ModuleAccessPort;
    const service = new RealQuotaService(repository as never, moduleAccess);
    const adapter = new PrismaTenantUsageAdapter(moduleAccess, service);

    const usage = await adapter.getUsage('t-1');

    expect(usage.quotas.seats).toEqual({ used: 4, limit: 10 });
    expect(usage.quotas.emailsPerMonth).toEqual({ used: 7, limit: 500, measured: true });
    expect(usage.quotas.aiSpendCentsPerMonth).toEqual({ used: 33, limit: 2000, measured: true });
  });

  it('defaults the clock to now', async () => {
    const { moduleAccess, quota } = setup();
    const adapter = new PrismaTenantUsageAdapter(moduleAccess, quota);

    const usage = await adapter.getUsage('t-1');

    expect(Math.abs(Date.now() - Date.parse(usage.asOf))).toBeLessThan(5_000);
  });
});
