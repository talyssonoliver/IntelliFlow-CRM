/**
 * Prisma implementation of PurposeSpendPort (PG-199, ADR-082).
 *
 * Per-purpose monthly AI spend lives in tenant_usage_counters beside the tenant-wide
 * `aiSpendCentsPerMonth` counter, keyed by the domain's `purposeSpendKey`.
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@intelliflow/db';
import { purposeSpendKey, type LLMPurpose } from '@intelliflow/domain';
import type { PurposeSpendPort } from '@intelliflow/application';

/** tenant_usage_counters."value" is a Postgres INTEGER. */
const INT_MAX = 2147483647;

export class PrismaPurposeSpendRepository implements PurposeSpendPort {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Single-statement upsert (atomic under concurrent workers, as PrismaQuotaRepository).
   * LEAST keeps the counter inside INTEGER range instead of failing the AI call's listener.
   */
  async addSpend(
    tenantId: string,
    purpose: LLMPurpose,
    period: string,
    centiCents: number
  ): Promise<number> {
    if (!(centiCents > 0)) return 0;
    const by = Math.min(Math.ceil(centiCents), INT_MAX);
    const rows = await this.prisma.$queryRaw<Array<{ value: number }>>`
      INSERT INTO tenant_usage_counters ("id", "tenantId", "key", "period", "value", "updatedAt")
      VALUES (${randomUUID()}, ${tenantId}, ${purposeSpendKey(purpose)}, ${period}, ${by}, NOW())
      ON CONFLICT ("tenantId", "key", "period")
      DO UPDATE SET "value" = LEAST(tenant_usage_counters."value"::bigint + ${by}, ${INT_MAX})::int,
                    "updatedAt" = NOW()
      RETURNING "value"
    `;
    return Number(rows[0]?.value ?? 0);
  }

  async getSpend(
    tenantId: string,
    period: string,
    purposes: readonly LLMPurpose[]
  ): Promise<Partial<Record<LLMPurpose, number>>> {
    if (purposes.length === 0) return {};
    const keys = purposes.map(purposeSpendKey);
    const rows = await this.prisma.tenantUsageCounter.findMany({
      where: { tenantId, period, key: { in: keys } },
      select: { key: true, value: true },
    });
    const spend: Partial<Record<LLMPurpose, number>> = {};
    for (const purpose of purposes) {
      const key = purposeSpendKey(purpose);
      spend[purpose] = rows.find((row) => row.key === key)?.value ?? 0;
    }
    return spend;
  }
}
