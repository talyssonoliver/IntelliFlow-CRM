/**
 * Prisma implementation of TenantUsagePort (ADR-070)
 *
 * contacts / seats / emails are measured from the tenant's own rows. AI spend is
 * not metered yet and is reported as `measured: false`. Limits are null until a
 * quota service enforces them.
 */

import type { PrismaClient } from '@intelliflow/db';
import type { ModuleAccessPort, TenantUsage, TenantUsagePort } from '@intelliflow/application';

export class PrismaTenantUsageAdapter implements TenantUsagePort {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly moduleAccess: ModuleAccessPort,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getUsage(tenantId: string): Promise<TenantUsage> {
    const asOf = this.now();
    const monthStart = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));

    const [plan, modules, contacts, seats, emails] = await Promise.all([
      this.moduleAccess.getTenantPlan(tenantId),
      this.moduleAccess.getEnabledModules(tenantId),
      this.prisma.contact.count({ where: { tenantId } }),
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.emailRecord.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
    ]);

    return {
      tenantId,
      plan,
      modules: [...modules],
      quotas: {
        contacts: { used: contacts, limit: null },
        seats: { used: seats, limit: null },
        emailsPerMonth: { used: emails, limit: null, measured: true },
        aiSpendCentsPerMonth: { used: 0, limit: null, measured: false },
      },
      asOf: asOf.toISOString(),
    };
  }
}
