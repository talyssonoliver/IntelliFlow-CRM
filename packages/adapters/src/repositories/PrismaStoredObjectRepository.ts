/**
 * Prisma implementation of StoredObjectOutboxPort (IFC-316): the queue of an erased person's
 * stored files in `dsar_stored_objects`. Every query carries the tenant and the request.
 */
import type { PrismaClient } from '@intelliflow/db';
import { STORED_OBJECT_CHECKLIST_KEYS, type StoredObjectSource } from '@intelliflow/domain';
import type {
  PendingStoredObject,
  StoredObjectOutboxPort,
  StoredObjectSettlement,
} from '@intelliflow/application';

export class PrismaStoredObjectRepository implements StoredObjectOutboxPort {
  constructor(private readonly prisma: PrismaClient) {}

  async pending(
    tenantId: string,
    requestId: string,
    limit: number
  ): Promise<PendingStoredObject[]> {
    const rows = await this.prisma.dsarStoredObject.findMany({
      where: { tenantId, requestId, state: 'PENDING' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true, source: true, bucket: true, locator: true, attempts: true },
    });
    return rows.flatMap((r) =>
      r.bucket && r.locator
        ? [
            {
              id: r.id,
              source: r.source as StoredObjectSource,
              bucket: r.bucket,
              path: r.locator,
              attempts: r.attempts,
            },
          ]
        : []
    );
  }

  async settle(
    tenantId: string,
    requestId: string,
    results: StoredObjectSettlement[],
    now: Date
  ): Promise<void> {
    const where = (ids: string[]) => ({ tenantId, requestId, state: 'PENDING', id: { in: ids } });
    const deleted = results.filter((r) => r.deleted).map((r) => r.id);
    const failuresByCode = new Map<string, string[]>();
    for (const r of results) {
      if (r.deleted) continue;
      const code = (r.error ?? 'UNKNOWN').slice(0, 40);
      failuresByCode.set(code, [...(failuresByCode.get(code) ?? []), r.id]);
    }
    await this.prisma.$transaction(async (tx) => {
      if (deleted.length > 0) {
        // Done: the locator is cleared, nothing about the file is kept.
        await tx.dsarStoredObject.updateMany({
          where: where(deleted),
          data: { state: 'DELETED', locator: null, settledAt: now, lastError: null },
        });
      }
      for (const [code, ids] of failuresByCode) {
        await tx.dsarStoredObject.updateMany({
          where: where(ids),
          data: { attempts: { increment: 1 }, lastError: code },
        });
      }
    });
  }

  async leftFor(tenantId: string, requestIds: string[]): Promise<Record<string, number>> {
    if (requestIds.length === 0) return {};
    const groups = await this.prisma.dsarStoredObject.groupBy({
      by: ['requestId'],
      where: { tenantId, requestId: { in: requestIds }, state: { in: ['PENDING', 'MANUAL'] } },
      _count: { _all: true },
    });
    return Object.fromEntries(groups.map((g) => [g.requestId, g._count._all]));
  }

  async remaining(tenantId: string, requestId: string): Promise<Record<string, number>> {
    const groups = await this.prisma.dsarStoredObject.groupBy({
      by: ['source'],
      where: { tenantId, requestId, state: { in: ['PENDING', 'MANUAL'] } },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const g of groups) {
      const key = STORED_OBJECT_CHECKLIST_KEYS[g.source as StoredObjectSource];
      if (key) counts[key] = g._count._all;
    }
    return counts;
  }
}
