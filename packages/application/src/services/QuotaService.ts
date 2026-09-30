/**
 * Quota Service — per-tenant cost control
 *
 * Resolves a tenant's limits (plan defaults merged with overrides), reports
 * usage, and enforces quotas before cost-bearing operations.
 *
 * Usage sources:
 * - contacts, seats, workflowsActive: live counts (always exact).
 * - emailsPerMonth, aiSpendCentsPerMonth: TenantUsageCounter rows for the current UTC month.
 *   The counters only move when a caller invokes `increment`, so a key is only as accurate
 *   as its recording call sites.
 */

import {
  QUOTA_KEYS,
  QuotaExceededError,
  getQuotaLimitsForPlan,
  getQuotaPeriod,
  isMonthlyQuotaKey,
  isWithinQuota,
  type QuotaKey,
  type QuotaLimits,
} from '@intelliflow/domain';
import type { ModuleAccessPort } from '../ports/repositories/ModuleAccessPort';
import type { QuotaRepositoryPort } from '../ports/repositories/QuotaRepositoryPort';

export type QuotaUsage = Record<QuotaKey, number>;

export class QuotaService {
  constructor(
    private readonly repository: QuotaRepositoryPort,
    private readonly moduleAccess: Pick<ModuleAccessPort, 'getTenantPlan'>,
    private readonly now: () => Date = () => new Date()
  ) {}

  /** Plan defaults with per-tenant overrides applied. */
  async getLimits(tenantId: string): Promise<QuotaLimits> {
    const [plan, overrides] = await Promise.all([
      this.moduleAccess.getTenantPlan(tenantId),
      this.repository.getOverrides(tenantId),
    ]);
    const limits = getQuotaLimitsForPlan(plan);
    for (const override of overrides) {
      limits[override.key] = override.limit;
    }
    return limits;
  }

  /** Current usage for every quota key. */
  async getUsage(tenantId: string): Promise<QuotaUsage> {
    const entries = await Promise.all(
      QUOTA_KEYS.map(async (key) => [key, await this.getUsed(tenantId, key)] as const)
    );
    return Object.fromEntries(entries) as QuotaUsage;
  }

  /**
   * Throw `QuotaExceededError` when `used + increment` would pass the tenant's limit.
   * A limit of 0 therefore blocks the capability outright, whatever the increment (>= 1).
   */
  async assertWithinQuota(tenantId: string, key: QuotaKey, increment = 1): Promise<void> {
    const limits = await this.getLimits(tenantId);
    const limit = limits[key];
    if (limit === null) return;

    const used = await this.getUsed(tenantId, key);
    if (!isWithinQuota(used, increment, limit)) {
      throw new QuotaExceededError(key, used, limit, increment);
    }
  }

  /**
   * Record consumption for a metered key. Live-count keys (contacts, seats,
   * workflowsActive) derive from real rows, so recording them is a no-op.
   */
  async increment(tenantId: string, key: QuotaKey, by = 1): Promise<void> {
    if (!isMonthlyQuotaKey(key) || by === 0) return;
    await this.repository.incrementCounter(tenantId, key, getQuotaPeriod(key, this.now()), by);
  }

  private async getUsed(tenantId: string, key: QuotaKey): Promise<number> {
    switch (key) {
      case 'contacts':
        return this.repository.countContacts(tenantId);
      case 'seats':
        return this.repository.countUsers(tenantId);
      case 'workflowsActive':
        return this.repository.countActiveWorkflows(tenantId);
      case 'emailsPerMonth':
      case 'aiSpendCentsPerMonth':
        return this.repository.getCounter(tenantId, key, getQuotaPeriod(key, this.now()));
    }
  }
}
