/**
 * PG-190 — Unit tests for CaseDeadlineMonitorWorker.process().
 *
 * Pure logic tests — BullMQ not instantiated. Prisma + notification deps mocked.
 *
 * N+1 regression: case.findMany is called exactly ONCE per process() invocation
 * regardless of how many tenant settings are active (NP-010).
 * Per-case case.update is replaced by case.updateMany batched by new priority (NP-011).
 */

import { describe, it, expect, vi } from 'vitest';
import type { Job } from 'bullmq';
import { CaseDeadlineMonitorWorker, type CaseMonitorDeps } from '../case-deadline-monitor.job';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

function makeDeps() {
  const notifications: Array<{ type: string; entityId: string }> = [];
  const createNotification = vi.fn(
    async (params: Parameters<CaseMonitorDeps['createNotification']>[0]) => {
      notifications.push({ type: params.type, entityId: params.entityId });
    }
  );
  return { deps: { createNotification } as CaseMonitorDeps, notifications };
}

function makePrisma(rows: {
  settings?: Array<{
    tenantId: string;
    notifyOnDeadlineApproaching: boolean;
    autoEscalateOverdue: boolean;
  }>;
  cases?: Array<{
    id: string;
    tenantId: string;
    title: string;
    status: string;
    priority: Priority;
    deadline: Date | null;
    assignedTo: string;
  }>;
}) {
  const updateSpy = vi.fn();
  const updateManySpy = vi.fn().mockResolvedValue({ count: 0 });
  return {
    prisma: {
      caseAutomationSetting: {
        findMany: vi.fn().mockResolvedValue(rows.settings ?? []),
      },
      case: {
        findMany: vi.fn().mockResolvedValue(rows.cases ?? []),
        update: updateSpy,
        updateMany: updateManySpy,
      },
    } as never,
    updateSpy,
    updateManySpy,
  };
}

describe('CaseDeadlineMonitorWorker.process', () => {
  it('sweeps tenants with both toggles off and writes nothing', async () => {
    const { prisma } = makePrisma({
      settings: [
        { tenantId: 't1', notifyOnDeadlineApproaching: false, autoEscalateOverdue: false },
      ],
      cases: [],
    });
    const { deps, notifications } = makeDeps();
    const worker = new CaseDeadlineMonitorWorker(prisma, { host: 'localhost', port: 6379 }, deps);
    const result = await worker.process({
      id: '1',
      data: { sweepAll: true, approachingThresholdMs: 24 * 60 * 60 * 1000 },
    } as unknown as Job);
    expect(result.tenantsScanned).toBe(1);
    expect(result.casesScanned).toBe(0);
    expect(notifications).toHaveLength(0);
  });

  it('emits case_deadline_approaching for cases due within 24h when flag on', async () => {
    const approaching = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6h from now
    const { prisma } = makePrisma({
      settings: [{ tenantId: 't1', notifyOnDeadlineApproaching: true, autoEscalateOverdue: false }],
      cases: [
        {
          id: 'case-1',
          tenantId: 't1',
          title: 'Smith v. Jones',
          status: 'OPEN',
          priority: 'MEDIUM',
          deadline: approaching,
          assignedTo: 'user-1',
        },
      ],
    });
    const { deps, notifications } = makeDeps();
    const worker = new CaseDeadlineMonitorWorker(prisma, { host: 'localhost', port: 6379 }, deps);
    const result = await worker.process({
      id: '1',
      data: { sweepAll: true, approachingThresholdMs: 24 * 60 * 60 * 1000 },
    } as unknown as Job);
    expect(result.approachingNotificationsWritten).toBe(1);
    expect(notifications[0].type).toBe('case_deadline_approaching');
    expect(notifications[0].entityId).toBe('case-1');
  });

  it('bumps priority + emits case_escalated when overdue and autoEscalateOverdue on', async () => {
    const overdue = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    const { prisma, updateManySpy } = makePrisma({
      settings: [{ tenantId: 't1', notifyOnDeadlineApproaching: false, autoEscalateOverdue: true }],
      cases: [
        {
          id: 'case-2',
          tenantId: 't1',
          title: 'Overdue case',
          status: 'OPEN',
          priority: 'LOW',
          deadline: overdue,
          assignedTo: 'user-1',
        },
      ],
    });
    const { deps, notifications } = makeDeps();
    const worker = new CaseDeadlineMonitorWorker(prisma, { host: 'localhost', port: 6379 }, deps);
    const result = await worker.process({
      id: '1',
      data: { sweepAll: true, approachingThresholdMs: 24 * 60 * 60 * 1000 },
    } as unknown as Job);
    expect(result.escalationsApplied).toBe(1);
    expect(notifications[0].type).toBe('case_escalated');
    // NP-011: now uses updateMany instead of per-case update
    expect(updateManySpy).toHaveBeenCalledWith({
      where: { id: { in: ['case-2'] } },
      data: { priority: 'MEDIUM' }, // bumped LOW→MEDIUM
    });
  });

  it('does NOT bump priority past URGENT', async () => {
    const overdue = new Date(Date.now() - 60 * 60 * 1000);
    const { prisma, updateManySpy } = makePrisma({
      settings: [{ tenantId: 't1', notifyOnDeadlineApproaching: false, autoEscalateOverdue: true }],
      cases: [
        {
          id: 'case-3',
          tenantId: 't1',
          title: 'Already urgent',
          status: 'OPEN',
          priority: 'URGENT',
          deadline: overdue,
          assignedTo: 'user-1',
        },
      ],
    });
    const { deps } = makeDeps();
    const worker = new CaseDeadlineMonitorWorker(prisma, { host: 'localhost', port: 6379 }, deps);
    await worker.process({
      id: '1',
      data: { sweepAll: true, approachingThresholdMs: 24 * 60 * 60 * 1000 },
    } as unknown as Job);
    // URGENT is max — no update call, updateMany not called with any ids
    expect(updateManySpy).not.toHaveBeenCalled();
  });

  it('skips tenants where both toggles are off (short-circuit)', async () => {
    const { prisma } = makePrisma({
      settings: [
        { tenantId: 't-skip', notifyOnDeadlineApproaching: false, autoEscalateOverdue: false },
        { tenantId: 't-scan', notifyOnDeadlineApproaching: true, autoEscalateOverdue: false },
      ],
      cases: [],
    });
    const { deps } = makeDeps();
    const worker = new CaseDeadlineMonitorWorker(prisma, { host: 'localhost', port: 6379 }, deps);
    const result = await worker.process({
      id: '1',
      data: { sweepAll: true, approachingThresholdMs: 24 * 60 * 60 * 1000 },
    } as unknown as Job);
    // Both scanned, but only 't-scan' triggered findMany on case table
    expect(result.tenantsScanned).toBe(2);
    const findManyCalls = (
      prisma as unknown as {
        case: { findMany: { mock: { calls: unknown[] } } };
      }
    ).case.findMany.mock.calls.length;
    // NP-010: ONE batched findMany regardless of active tenant count
    expect(findManyCalls).toBe(1);
  });

  // ─── N+1 regression tests ─────────────────────────────────────────────────

  it('NP-010 regression: case.findMany is called exactly once for any number of active tenants', async () => {
    const now = Date.now();
    const approaching = new Date(now + 6 * 60 * 60 * 1000);

    // 5 active tenants each with one approaching case
    const settings = Array.from({ length: 5 }, (_, i) => ({
      tenantId: `tenant-${i}`,
      notifyOnDeadlineApproaching: true,
      autoEscalateOverdue: false,
    }));
    const cases = settings.map((s, i) => ({
      id: `case-${i}`,
      tenantId: s.tenantId,
      title: `Case ${i}`,
      status: 'OPEN',
      priority: 'LOW' as Priority,
      deadline: approaching,
      assignedTo: `user-${i}`,
    }));

    const { prisma } = makePrisma({ settings, cases });
    const { deps } = makeDeps();
    const worker = new CaseDeadlineMonitorWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    await worker.process({
      id: '1',
      data: { sweepAll: true, approachingThresholdMs: 24 * 60 * 60 * 1000 },
    } as unknown as Job);

    // CONSTANT: always 1 findMany call, never 5 (one per tenant)
    const caseModel = (prisma as unknown as { case: { findMany: ReturnType<typeof vi.fn> } }).case;
    expect(caseModel.findMany).toHaveBeenCalledTimes(1);
    // The single call must use tenantId: { in: [...] }
    const [callArgs] = caseModel.findMany.mock.calls;
    expect(callArgs[0].where.tenantId).toEqual({
      in: expect.arrayContaining(settings.map((s) => s.tenantId)),
    });
  });

  it('NP-011 regression: case.updateMany is called at most once per distinct new priority, not once per overdue case', async () => {
    const overdue = new Date(Date.now() - 60 * 60 * 1000);

    // 4 overdue cases all bumping LOW→MEDIUM
    const settings = [
      { tenantId: 't1', notifyOnDeadlineApproaching: false, autoEscalateOverdue: true },
    ];
    const cases = Array.from({ length: 4 }, (_, i) => ({
      id: `case-${i}`,
      tenantId: 't1',
      title: `Overdue ${i}`,
      status: 'OPEN',
      priority: 'LOW' as Priority,
      deadline: overdue,
      assignedTo: `user-${i}`,
    }));

    const { prisma, updateManySpy } = makePrisma({ settings, cases });
    const { deps } = makeDeps();
    const worker = new CaseDeadlineMonitorWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    await worker.process({
      id: '1',
      data: { sweepAll: true, approachingThresholdMs: 24 * 60 * 60 * 1000 },
    } as unknown as Job);

    // All 4 cases bump LOW→MEDIUM: should be 1 updateMany, NOT 4 updates
    expect(updateManySpy).toHaveBeenCalledTimes(1);
    expect(updateManySpy).toHaveBeenCalledWith({
      where: { id: { in: expect.arrayContaining(['case-0', 'case-1', 'case-2', 'case-3']) } },
      data: { priority: 'MEDIUM' },
    });
  });

  it('NP-011 regression: two priority groups produce two updateMany calls', async () => {
    const overdue = new Date(Date.now() - 60 * 60 * 1000);

    const settings = [
      { tenantId: 't1', notifyOnDeadlineApproaching: false, autoEscalateOverdue: true },
    ];
    const cases = [
      // LOW → MEDIUM group
      {
        id: 'c1',
        tenantId: 't1',
        title: 'Low 1',
        status: 'OPEN',
        priority: 'LOW' as Priority,
        deadline: overdue,
        assignedTo: 'u1',
      },
      {
        id: 'c2',
        tenantId: 't1',
        title: 'Low 2',
        status: 'OPEN',
        priority: 'LOW' as Priority,
        deadline: overdue,
        assignedTo: 'u2',
      },
      // MEDIUM → HIGH group
      {
        id: 'c3',
        tenantId: 't1',
        title: 'Med 1',
        status: 'OPEN',
        priority: 'MEDIUM' as Priority,
        deadline: overdue,
        assignedTo: 'u3',
      },
    ];

    const { prisma, updateManySpy } = makePrisma({ settings, cases });
    const { deps } = makeDeps();
    const worker = new CaseDeadlineMonitorWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    await worker.process({
      id: '1',
      data: { sweepAll: true, approachingThresholdMs: 24 * 60 * 60 * 1000 },
    } as unknown as Job);

    // 2 distinct new-priority groups → exactly 2 updateMany calls
    expect(updateManySpy).toHaveBeenCalledTimes(2);
    const calls = updateManySpy.mock.calls.map(
      (c: [{ where: { id: { in: string[] } }; data: { priority: Priority } }]) => c[0]
    );
    const mediumCall = calls.find((c) => c.data.priority === 'MEDIUM');
    const highCall = calls.find((c) => c.data.priority === 'HIGH');
    expect(mediumCall?.where.id.in).toEqual(expect.arrayContaining(['c1', 'c2']));
    expect(highCall?.where.id.in).toEqual(expect.arrayContaining(['c3']));
  });
});
