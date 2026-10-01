/**
 * Prisma implementation of TenantUsagePort (ADR-070)
 *
 * The partner `getUsage` read-model is built from the same QuotaService that enforces the
 * limits, so what a partner sees (used, limit, overrides, plan defaults) is exactly what the
 * API enforces. Nothing is counted separately here.
 *
 * - contacts / seats: live counts.
 * - emailsPerMonth: the monthly counter, which counts recipients, as enforcement does.
 * - aiSpendCentsPerMonth: the monthly counter fed by the ai-worker from its per-call cost
 *   estimate (token counts x model pricing), so it is an estimate rather than an invoice.
 */

import type {
  ModuleAccessPort,
  QuotaService,
  TenantUsage,
  TenantUsagePort,
} from '@intelliflow/application';

export class PrismaTenantUsageAdapter implements TenantUsagePort {
  constructor(
    private readonly moduleAccess: ModuleAccessPort,
    private readonly quota: Pick<QuotaService, 'getLimits' | 'getUsage'>,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getUsage(tenantId: string): Promise<TenantUsage> {
    const asOf = this.now();

    const [plan, modules, limits, used] = await Promise.all([
      this.moduleAccess.getTenantPlan(tenantId),
      this.moduleAccess.getEnabledModules(tenantId),
      this.quota.getLimits(tenantId),
      this.quota.getUsage(tenantId),
    ]);

    return {
      tenantId,
      plan,
      modules: [...modules],
      quotas: {
        contacts: { used: used.contacts, limit: limits.contacts },
        seats: { used: used.seats, limit: limits.seats },
        emailsPerMonth: { used: used.emailsPerMonth, limit: limits.emailsPerMonth, measured: true },
        aiSpendCentsPerMonth: {
          used: used.aiSpendCentsPerMonth,
          limit: limits.aiSpendCentsPerMonth,
          measured: true,
        },
      },
      asOf: asOf.toISOString(),
    };
  }
}
