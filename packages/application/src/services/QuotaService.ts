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

  /**
   * Atomically reserve `by` units of a monthly key before performing the action
   * (check and increment are one statement, so concurrent callers cannot both take the
   * last unit). Throws `QuotaExceededError` when it does not fit. Pair with `release` when
   * the action then fails.
   */
  async reserve(tenantId: string, key: QuotaKey, by = 1): Promise<void> {
    if (!isMonthlyQuotaKey(key)) {
      throw new Error(`reserve() only supports monthly quota keys, got "${key}"`);
    }
    if (by <= 0) return;

    const limits = await this.getLimits(tenantId);
    const limit = limits[key];
    const period = getQuotaPeriod(key, this.now());

    if (limit === null) {
      await this.repository.incrementCounter(tenantId, key, period, by);
      return;
    }

    const reserved = await this.repository.reserveCounter(tenantId, key, period, by, limit);
    if (reserved === null) {
      const used = await this.repository.getCounter(tenantId, key, period);
      throw new QuotaExceededError(key, used, limit, by);
    }
  }

  /** Give back units taken by `reserve` (the action failed). Floors at 0. */
  async release(tenantId: string, key: QuotaKey, by = 1): Promise<void> {
    if (!isMonthlyQuotaKey(key) || by <= 0) return;
    await this.repository.decrementCounter(tenantId, key, getQuotaPeriod(key, this.now()), by);
  }

  /**
   * Live-count keys (contacts, seats, workflowsActive): assert the quota and run `create`
   * under a per-(tenant, key) lock so two requests cannot both pass the count at `limit - 1`.
   * `create` must have committed its row by the time it resolves. An `increment` of 0 takes the
   * lock without asserting, for callers that only learn the real count inside `create` (they
   * then call `assertWithinQuota` themselves).
   */
  async withinQuota<T>(
    tenantId: string,
    key: QuotaKey,
    increment: number,
    create: () => Promise<T>
  ): Promise<T> {
    return this.repository.runExclusive(tenantId, key, async () => {
      if (increment > 0) await this.assertWithinQuota(tenantId, key, increment);
      return create();
    });
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
