/**
 * Prisma implementation of QuotaRepositoryPort.
 *
 * Overrides and counters live in tenant_quota_overrides / tenant_usage_counters;
 * contacts, seats and active workflows are counted live from their own tables.
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@intelliflow/db';
import { isQuotaKey, type QuotaKey } from '@intelliflow/domain';
import type { QuotaRepositoryPort, TenantQuotaOverrideRecord } from '@intelliflow/application';

export class PrismaQuotaRepository implements QuotaRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async getOverrides(tenantId: string): Promise<TenantQuotaOverrideRecord[]> {
    const rows = await this.prisma.tenantQuotaOverride.findMany({ where: { tenantId } });
    const overrides: TenantQuotaOverrideRecord[] = [];
    for (const row of rows) {
      if (isQuotaKey(row.key)) {
        overrides.push({ key: row.key, limit: row.limit });
      }
    }
    return overrides;
  }

  countContacts(tenantId: string): Promise<number> {
    return this.prisma.contact.count({ where: { tenantId } });
  }

  countUsers(tenantId: string): Promise<number> {
    return this.prisma.user.count({ where: { tenantId } });
  }

  countActiveWorkflows(tenantId: string): Promise<number> {
    return this.prisma.workflowDefinition.count({
      where: { tenantId, isActive: true, deletedAt: null },
    });
  }

  async getCounter(tenantId: string, key: QuotaKey, period: string): Promise<number> {
    const row = await this.prisma.tenantUsageCounter.findUnique({
      where: { tenantId_key_period: { tenantId, key, period } },
    });
    return row?.value ?? 0;
  }

  /**
   * Single-statement upsert: `ON CONFLICT DO UPDATE` is atomic under concurrent
   * callers, unlike Prisma's `upsert` whose create branch can race.
   */
  async incrementCounter(
    tenantId: string,
    key: QuotaKey,
    period: string,
    by: number
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ value: number }>>`
      INSERT INTO tenant_usage_counters ("id", "tenantId", "key", "period", "value", "updatedAt")
      VALUES (${randomUUID()}, ${tenantId}, ${key}, ${period}, ${by}, NOW())
      ON CONFLICT ("tenantId", "key", "period")
      DO UPDATE SET "value" = tenant_usage_counters."value" + ${by}, "updatedAt" = NOW()
      RETURNING "value"
    `;
    return Number(rows[0]?.value ?? 0);
  }

  /**
   * Conditional single-statement upsert. The SELECT ... WHERE guards the insert branch
   * (a fresh row must fit too) and the DO UPDATE ... WHERE guards the existing-row branch;
   * no row is returned when either guard fails, which is how "over the limit" is reported.
   */
  async reserveCounter(
    tenantId: string,
    key: QuotaKey,
    period: string,
    by: number,
    limit: number
  ): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<Array<{ value: number }>>`
      INSERT INTO tenant_usage_counters ("id", "tenantId", "key", "period", "value", "updatedAt")
      SELECT ${randomUUID()}::text, ${tenantId}::text, ${key}::text, ${period}::text, ${by}::int, NOW()
      WHERE ${by}::int <= ${limit}::int
      ON CONFLICT ("tenantId", "key", "period")
      DO UPDATE SET "value" = tenant_usage_counters."value" + ${by}::int, "updatedAt" = NOW()
      WHERE tenant_usage_counters."value" + ${by}::int <= ${limit}::int
      RETURNING "value"
    `;
    return rows.length === 0 ? null : Number(rows[0]!.value);
  }

  async decrementCounter(
    tenantId: string,
    key: QuotaKey,
    period: string,
    by: number
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE tenant_usage_counters
      SET "value" = GREATEST("value" - ${by}::int, 0), "updatedAt" = NOW()
      WHERE "tenantId" = ${tenantId} AND "key" = ${key} AND "period" = ${period}
    `;
  }

  /**
   * Transaction-scoped advisory lock keyed on (tenant, key). `fn` runs on its own pooled
   * connection and must commit before it resolves; the lock only orders the critical sections.
   * The API pool must therefore have spare connections (a locker holds one while waiting for
   * a second); the timeouts below turn pool starvation into an error instead of a hang.
   */
  runExclusive<T>(tenantId: string, key: QuotaKey, fn: () => Promise<T>): Promise<T> {
    const lockKey = `quota:${tenantId}:${key}`;
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
        return fn();
      },
      { maxWait: 10_000, timeout: 30_000 }
    );
  }
}
