/**
 * PG-190 — Unit tests for CaseDeadlineMonitorWorker.process().
 *
 * Pure logic tests — BullMQ not instantiated. Prisma + notification deps mocked.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Job } from 'bullmq';
import { CaseDeadlineMonitorWorker, type CaseMonitorDeps } from '../case-deadline-monitor.job';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

function makeDeps() {
  const notifications: Array<{ type: string; entityId: string }> = [];
  const createNotification = vi.fn(async (params: Parameters<CaseMonitorDeps['createNotification']>[0]) => {
    notifications.push({ type: params.type, entityId: params.entityId });
  });
  return { deps: { createNotification } as CaseMonitorDeps, notifications };
}

function makePrisma(rows: {
  settings?: Array<{ tenantId: string; notifyOnDeadlineApproaching: boolean; autoEscalateOverdue: boolean }>;
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
  return {
    prisma: {
      caseAutomationSetting: {
        findMany: vi.fn().mockResolvedValue(rows.settings ?? []),
      },
      case: {
        findMany: vi.fn().mockResolvedValue(rows.cases ?? []),
        update: updateSpy,
      },
    } as never,
    updateSpy,
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
    const worker = new CaseDeadlineMonitorWorker(
      prisma,
      { host: 'localhost', port: 6379 },
      deps,
    );
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
      settings: [
        { tenantId: 't1', notifyOnDeadlineApproaching: true, autoEscalateOverdue: false },
      ],
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
    const worker = new CaseDeadlineMonitorWorker(
      prisma,
      { host: 'localhost', port: 6379 },
      deps,
    );
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
    const { prisma, updateSpy } = makePrisma({
      settings: [
        { tenantId: 't1', notifyOnDeadlineApproaching: false, autoEscalateOverdue: true },
      ],
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
    const worker = new CaseDeadlineMonitorWorker(
      prisma,
      { host: 'localhost', port: 6379 },
      deps,
    );
    const result = await worker.process({
      id: '1',
      data: { sweepAll: true, approachingThresholdMs: 24 * 60 * 60 * 1000 },
    } as unknown as Job);
    expect(result.escalationsApplied).toBe(1);
    expect(notifications[0].type).toBe('case_escalated');
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'case-2' },
      data: { priority: 'MEDIUM' }, // bumped LOW→MEDIUM
    });
  });

  it('does NOT bump priority past URGENT', async () => {
    const overdue = new Date(Date.now() - 60 * 60 * 1000);
    const { prisma, updateSpy } = makePrisma({
      settings: [
        { tenantId: 't1', notifyOnDeadlineApproaching: false, autoEscalateOverdue: true },
      ],
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
    const worker = new CaseDeadlineMonitorWorker(
      prisma,
      { host: 'localhost', port: 6379 },
      deps,
    );
    await worker.process({
      id: '1',
      data: { sweepAll: true, approachingThresholdMs: 24 * 60 * 60 * 1000 },
    } as unknown as Job);
    // URGENT is max — no update call
    expect(updateSpy).not.toHaveBeenCalled();
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
    const worker = new CaseDeadlineMonitorWorker(
      prisma,
      { host: 'localhost', port: 6379 },
      deps,
    );
    const result = await worker.process({
      id: '1',
      data: { sweepAll: true, approachingThresholdMs: 24 * 60 * 60 * 1000 },
    } as unknown as Job);
    // Both scanned, but only 't-scan' triggered findMany on case table
    expect(result.tenantsScanned).toBe(2);
    const findManyCalls = (prisma as unknown as {
      case: { findMany: { mock: { calls: unknown[] } } };
    }).case.findMany.mock.calls.length;
    expect(findManyCalls).toBe(1);
  });
});
