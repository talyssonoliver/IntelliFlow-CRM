/**
 * Retention Purge Service — Fix #16
 *
 * Purges expired audit log records from the database to enforce
 * the data retention policy set via `retentionExpiresAt`.
 *
 * Purge runs in batches to avoid long-running transactions.
 */

import type { PrismaClient } from '@intelliflow/db';

/**
 * Minimal logger interface — compatible with pino, console, and test stubs.
 */
export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export interface PurgeResult {
  auditLogEntriesPurged: number;
  securityEventsPurged: number;
  totalPurged: number;
}

/**
 * Delete `AuditLogEntry` records whose `retentionExpiresAt` is in the past.
 * Runs in batches of `batchSize` to avoid long transactions.
 */
async function purgeAuditLogEntries(
  prisma: PrismaClient,
  logger: Logger,
  batchSize: number
): Promise<number> {
  const now = new Date();
  let totalDeleted = 0;

  for (;;) {
    // Find a batch of expired IDs first (avoids holding locks for the full scan)
    const expiredIds = await (prisma as any).auditLogEntry.findMany({
      where: {
        retentionExpiresAt: {
          lt: now,
          not: null,
        },
      },
      select: { id: true },
      take: batchSize,
    });

    if (expiredIds.length === 0) break;

    const ids = expiredIds.map((r: { id: string }) => r.id);

    const { count } = await (prisma as any).auditLogEntry.deleteMany({
      where: { id: { in: ids } },
    });

    totalDeleted += count;

    logger.info('[RetentionPurge] Deleted AuditLogEntry batch', {
      batchDeleted: count,
      runningTotal: totalDeleted,
    });

    // If we got fewer than batchSize there are no more records
    if (expiredIds.length < batchSize) break;
  }

  return totalDeleted;
}

/**
 * Purge expired audit log and security event records.
 *
 * @param prisma  — Prisma client instance
 * @param logger  — Logger (compatible with pino / console)
 * @param options — Optional overrides (batchSize defaults to 100)
 */
export async function purgeExpiredRecords(
  prisma: PrismaClient,
  logger: Logger,
  options: { batchSize?: number } = {}
): Promise<PurgeResult> {
  const batchSize = options.batchSize ?? 100;

  logger.info('[RetentionPurge] Starting expired record purge', {
    batchSize,
    asOf: new Date().toISOString(),
  });

  // Purge AuditLogEntry records
  const auditLogEntriesPurged = await purgeAuditLogEntries(prisma, logger, batchSize);

  // SecurityEvent model does not have a retentionExpiresAt field in the schema,
  // so we skip it here and log a warning to make the gap visible.
  logger.warn(
    '[RetentionPurge] SecurityEvent model has no retentionExpiresAt field — skipping. ' +
      'Add the field and a migration if retention enforcement is needed.'
  );
  const securityEventsPurged = 0;

  const totalPurged = auditLogEntriesPurged + securityEventsPurged;

  logger.info('[RetentionPurge] Purge complete', {
    auditLogEntriesPurged,
    securityEventsPurged,
    totalPurged,
  });

  return {
    auditLogEntriesPurged,
    securityEventsPurged,
    totalPurged,
  };
}
