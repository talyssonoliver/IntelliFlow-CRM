/**
 * PG-203 owner ruling Q24 — abuse limits in PrismaDsarRepository (unit tests, mocked Prisma).
 *
 * The real-database behaviour of the same rules is proven in tests/integration/dsar-abuse.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@intelliflow/db';
import { PrismaDsarRepository } from '../PrismaDsarRepository';

const CAPS = {
  perTenantEmailPerDay: 3,
  perIpPerHour: 10,
  globalEmailPerDay: 3,
  perTenantPerDay: 50,
  resendCooldownMinutes: 60,
};
const NOW = new Date('2026-10-22T12:00:00.000Z');
const DAY_MS = 86_400_000;

/** A client whose interactive $transaction runs the callback against itself. */
function mockPrisma(models: Record<string, Record<string, unknown>> = {}): Record<string, any> {
  const client: Record<string, any> = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
    ...models,
  };
  client.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client));
  return client;
}

const asClient = (p: Record<string, any>) => p as unknown as PrismaClient;

function submission() {
  return {
    tenantId: 't1',
    type: 'ACCESS' as const,
    subjectEmail: 'ada@example.invalid',
    capEmailHash: 'c'.repeat(64),
    details: null,
    objectionScope: null,
    ipHash: 'd'.repeat(64),
    verificationTokenHash: 'e'.repeat(64),
    verificationExpiresAt: NOW,
  };
}

describe('PrismaDsarRepository.reserveSubmission: per-firm daily cap (Q24)', () => {
  function setup(counts: number[]) {
    const count = vi.fn();
    for (const n of counts) count.mockResolvedValueOnce(n);
    const prisma = mockPrisma({
      dsarRequest: {
        findFirst: vi.fn().mockResolvedValue(null),
        count,
        create: vi.fn().mockResolvedValue({ id: 'r1' }),
      },
    });
    return { prisma, repo: new PrismaDsarRepository(asClient(prisma)) };
  }

  it('counts the firm public-form rows of the last 24 h', async () => {
    const { prisma, repo } = setup([0, 0, 0, 0]);
    await repo.reserveSubmission(submission(), CAPS, NOW);
    const wheres = prisma.dsarRequest.count.mock.calls.map((c: any[]) => c[0].where);
    expect(wheres).toContainEqual({
      tenantId: 't1',
      source: 'PUBLIC_FORM',
      createdAt: { gt: new Date(NOW.getTime() - DAY_MS) },
    });
  });

  it('answers CAPPED at the cap and creates nothing', async () => {
    // email, ip and global are under their caps; the firm total is exactly the cap.
    const { prisma, repo } = setup([0, 0, 0, 50]);
    await expect(repo.reserveSubmission(submission(), CAPS, NOW)).resolves.toEqual({
      outcome: 'CAPPED',
    });
    expect(prisma.dsarRequest.create).not.toHaveBeenCalled();
  });

  it('creates the request one below the cap', async () => {
    const { repo } = setup([0, 0, 0, 49]);
    await expect(repo.reserveSubmission(submission(), CAPS, NOW)).resolves.toMatchObject({
      outcome: 'CREATED',
    });
  });
});

describe('PrismaDsarRepository.list: expired unverified requests (Q24)', () => {
  it('leaves out PENDING_VERIFICATION rows whose link has expired, keeping every other status', async () => {
    vi.useFakeTimers({ now: NOW });
    try {
      const prisma = mockPrisma({ dsarRequest: { findMany: vi.fn().mockResolvedValue([]) } });
      await new PrismaDsarRepository(asClient(prisma)).list('t1');
      const calls = prisma.dsarRequest.findMany.mock.calls.map((c: any[]) => c[0]);
      expect(calls[0].where).toEqual({
        tenantId: 't1',
        status: { in: ['PENDING_VERIFICATION', 'VERIFIED'] },
        OR: [
          { status: { not: 'PENDING_VERIFICATION' } },
          { verificationExpiresAt: null },
          { verificationExpiresAt: { gt: NOW } },
        ],
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('PrismaDsarRepository.purgeExpiredUnverified (Q24)', () => {
  it('deletes only PENDING_VERIFICATION rows expired over 7 days ago, in batches, returning the count', async () => {
    const prisma = mockPrisma();
    prisma.$executeRaw.mockResolvedValueOnce(2).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    const repo = new PrismaDsarRepository(asClient(prisma));
    await expect(repo.purgeExpiredUnverified(NOW, 2)).resolves.toBe(5);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(3); // a short batch (1 < 2) ends the loop
    const [strings, ...values] = prisma.$executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = strings.join('?');
    expect(sql).toContain('DELETE FROM dsar_requests');
    expect(sql).toContain("status = 'PENDING_VERIFICATION'");
    expect(sql).toContain('"verificationExpiresAt" <');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(values).toEqual([new Date(NOW.getTime() - 7 * DAY_MS), 2]);
  });

  it('stops after a bounded number of batches even when the table keeps filling', async () => {
    const prisma = mockPrisma();
    prisma.$executeRaw.mockResolvedValue(10);
    const repo = new PrismaDsarRepository(asClient(prisma));
    const purged = await repo.purgeExpiredUnverified(NOW, 10);
    expect(prisma.$executeRaw.mock.calls.length).toBeLessThanOrEqual(50);
    expect(purged).toBe(prisma.$executeRaw.mock.calls.length * 10);
  });
});
