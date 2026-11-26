import { beforeEach, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { complianceRouter } from '../compliance.router';
import { createAdminContext, createTestContext, prismaMock, TEST_UUIDS } from '../../../test/setup';
import type { BaseContext } from '../../../context';

function managerContext(): BaseContext {
  return createTestContext({
    user: {
      userId: TEST_UUIDS.user1,
      email: 'manager@example.com',
      role: 'MANAGER',
      tenantId: TEST_UUIDS.tenant,
      emailVerified: true,
    },
  });
}

function zeroCounts() {
  prismaMock.user.count.mockResolvedValue(0);
  prismaMock.auditLogEntry.count.mockResolvedValue(0);
  prismaMock.lead.count.mockResolvedValue(0);
  prismaMock.aPIKey.count.mockResolvedValue(0);
  prismaMock.dsarRequest.count.mockResolvedValue(0);
  prismaMock.processingRestriction.count.mockResolvedValue(0);
  prismaMock.appointment.count.mockResolvedValue(0);
  prismaMock.termsAcceptance.count.mockResolvedValue(0);
  prismaMock.documentRetentionPolicy.count.mockResolvedValue(0);
  prismaMock.tenantMemoryPolicy.findUnique.mockResolvedValue(null);
  prismaMock.aIMonitoringEvent.count.mockResolvedValue(0);
  prismaMock.complianceSnapshot.findMany.mockResolvedValue([]);
}

describe('compliance router', () => {
  beforeEach(() => {
    zeroCounts();
  });

  it('is closed to everyone but administrators and managers', async () => {
    await expect(
      complianceRouter.createCaller(createTestContext()).overview()
    ).rejects.toBeInstanceOf(TRPCError);
    await expect(
      complianceRouter.createCaller(createTestContext()).overview()
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('gives a manager every framework, with trend pending until history exists', async () => {
    const result = await complianceRouter.createCaller(managerContext()).overview();
    expect(result.frameworks.map((f) => f.id)).toEqual([
      'iso-27001',
      'iso-42001',
      'iso-14001',
      'gdpr',
      'adr-registry',
    ]);
    for (const f of result.frameworks) {
      expect(f.trend).toEqual({ state: 'pending', reason: 'Trend starts tomorrow' });
    }
    expect(result.frameworks.find((f) => f.id === 'iso-14001')?.score).toBeNull();
  });

  it('computes a trend from stored snapshots only', async () => {
    prismaMock.complianceSnapshot.findMany.mockResolvedValue([
      {
        frameworkId: 'gdpr',
        day: new Date('2026-11-20'),
        score: 50,
        passing: 1,
        attention: 1,
        notMeasured: 0,
      },
      {
        frameworkId: 'gdpr',
        day: new Date('2026-11-22'),
        score: 80,
        passing: 4,
        attention: 1,
        notMeasured: 0,
      },
    ] as never);
    const result = await complianceRouter.createCaller(createAdminContext()).overview();
    expect(result.frameworks.find((f) => f.id === 'gdpr')?.trend).toEqual({
      state: 'available',
      delta: 30,
      since: '2026-11-20',
    });
  });

  it('asks for snapshot history of the context tenant only', async () => {
    await complianceRouter.createCaller(managerContext()).history({ frameworkId: 'gdpr' });
    const where = prismaMock.complianceSnapshot.findMany.mock.calls.at(-1)![0]!.where as Record<
      string,
      unknown
    >;
    expect(where.tenantId).toBe(TEST_UUIDS.tenant);
  });

  it('refresh stores one snapshot row per framework for the context tenant', async () => {
    prismaMock.complianceSnapshot.upsert.mockResolvedValue({} as never);
    const result = await complianceRouter.createCaller(managerContext()).refresh();
    expect(result.stored).toBe(5);
    expect(prismaMock.complianceSnapshot.upsert).toHaveBeenCalledTimes(5);
    const first = prismaMock.complianceSnapshot.upsert.mock.calls[0]![0]!;
    expect(first.create.tenantId).toBe(TEST_UUIDS.tenant);
  });

  it('refresh stores nothing when some evidence could not be read', async () => {
    prismaMock.dsarRequest.count.mockRejectedValue(new Error('read failed'));
    prismaMock.complianceSnapshot.upsert.mockClear();
    const result = await complianceRouter.createCaller(managerContext()).refresh();
    expect(result.stored).toBe(0);
    expect(prismaMock.complianceSnapshot.upsert).not.toHaveBeenCalled();
  });

  it('rejects history for a framework that does not exist', async () => {
    await expect(
      complianceRouter.createCaller(managerContext()).history({ frameworkId: 'sox' as never })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
