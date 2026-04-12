/**
 * Tests for RetentionPurgeService (Fix #16)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { purgeExpiredRecords } from '../retention-purge.service';
import type { Logger } from '../retention-purge.service';

// ------------------------------------------------
// Helpers
// ------------------------------------------------

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/**
 * Build a minimal mock PrismaClient focused on AuditLogEntry operations.
 */
function makePrismaMock(expiredRows: { id: string }[]) {
  let remainingRows = [...expiredRows];

  const findMany = vi.fn(({ take }: { take: number }) => {
    const batch = remainingRows.slice(0, take);
    return Promise.resolve(batch);
  });

  const deleteMany = vi.fn(({ where }: { where: { id: { in: string[] } } }) => {
    const ids = new Set(where.id.in);
    const count = remainingRows.filter((r) => ids.has(r.id)).length;
    remainingRows = remainingRows.filter((r) => !ids.has(r.id));
    return Promise.resolve({ count });
  });

  const prisma = {
    auditLogEntry: { findMany, deleteMany },
  } as unknown as import('@intelliflow/db').PrismaClient;

  return { prisma, findMany, deleteMany };
}

// ------------------------------------------------
// Tests
// ------------------------------------------------

describe('purgeExpiredRecords', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = makeLogger();
  });

  it('returns zeros when no expired records exist', async () => {
    const { prisma } = makePrismaMock([]);

    const result = await purgeExpiredRecords(prisma, logger);

    expect(result.auditLogEntriesPurged).toBe(0);
    expect(result.securityEventsPurged).toBe(0);
    expect(result.totalPurged).toBe(0);
  });

  it('purges all expired AuditLogEntry records in a single batch', async () => {
    const rows = [{ id: 'id-1' }, { id: 'id-2' }, { id: 'id-3' }];
    const { prisma, deleteMany } = makePrismaMock(rows);

    const result = await purgeExpiredRecords(prisma, logger, { batchSize: 100 });

    expect(result.auditLogEntriesPurged).toBe(3);
    expect(result.totalPurged).toBe(3);
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });

  it('purges records in multiple batches when count exceeds batchSize', async () => {
    // 5 records, batch size 2 → 3 rounds (2 + 2 + 1)
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `id-${i}` }));
    const { prisma, deleteMany } = makePrismaMock(rows);

    const result = await purgeExpiredRecords(prisma, logger, { batchSize: 2 });

    expect(result.auditLogEntriesPurged).toBe(5);
    expect(deleteMany).toHaveBeenCalledTimes(3);
  });

  it('always sets securityEventsPurged to 0 (no retention field on model)', async () => {
    const { prisma } = makePrismaMock([{ id: 'id-1' }]);

    const result = await purgeExpiredRecords(prisma, logger);

    expect(result.securityEventsPurged).toBe(0);
  });

  it('logs a warning about SecurityEvent missing retentionExpiresAt', async () => {
    const { prisma } = makePrismaMock([]);

    await purgeExpiredRecords(prisma, logger);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('SecurityEvent'));
  });

  it('logs info at start and end of purge', async () => {
    const { prisma } = makePrismaMock([]);

    await purgeExpiredRecords(prisma, logger);

    // Called at least twice: start + complete
    expect((logger.info as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    const allMessages = (logger.info as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0]
    );
    expect(allMessages.some((m: unknown) => typeof m === 'string' && m.includes('Starting'))).toBe(
      true
    );
    expect(allMessages.some((m: unknown) => typeof m === 'string' && m.includes('complete'))).toBe(
      true
    );
  });

  it('uses default batchSize of 100 when not specified', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ id: `id-${i}` }));
    const { prisma, findMany } = makePrismaMock(rows);

    await purgeExpiredRecords(prisma, logger);

    // First call should use take: 100
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });
});
