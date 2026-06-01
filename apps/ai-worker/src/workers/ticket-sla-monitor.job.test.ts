/**
 * Unit tests for TicketSlaMonitorWorker.process().
 *
 * NP-007 regression: verifies that ticket.findMany is called ONCE regardless
 * of how many tenant settings are returned.
 *
 * Pure logic tests — BullMQ not instantiated. Prisma + notification deps mocked.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Job } from 'bullmq';
import {
  TicketSlaMonitorWorker,
  type SlaMonitorDeps,
  type SlaAutomationFlagsShape,
} from './ticket-sla-monitor.job';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<SlaMonitorDeps> = {}): SlaMonitorDeps {
  return {
    shouldWriteBreach: (flags: SlaAutomationFlagsShape) => flags.notifyOnSlaBreach,
    shouldWriteWarning: (flags: SlaAutomationFlagsShape) => flags.notifyOnSlaWarning,
    createNotification: vi.fn(async () => {}),
    ...overrides,
  };
}

type TicketRow = {
  id: string;
  tenantId: string;
  ticketNumber: string;
  subject: string;
  status: string;
  slaDeadline: Date | null;
  slaBreachedAt: Date | null;
  assigneeId: string | null;
  createdAt: Date;
};

function makePrisma(
  settings: Array<{ tenantId: string; notifyOnSlaBreach: boolean; notifyOnSlaWarning: boolean }>,
  tickets: TicketRow[]
) {
  const ticketFindMany = vi.fn().mockResolvedValue(tickets);
  const settingsFindMany = vi.fn().mockResolvedValue(settings);
  return {
    prisma: {
      ticketAutomationSetting: { findMany: settingsFindMany },
      ticket: { findMany: ticketFindMany },
    } as never,
    ticketFindMany,
    settingsFindMany,
  };
}

function makeJob(data: Record<string, unknown> = { sweepAll: true }) {
  return { id: '1', data } as unknown as Job;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TicketSlaMonitorWorker.process — N+1 batching (NP-007)', () => {
  it('issues exactly ONE ticket.findMany when sweeping multiple tenants', async () => {
    const now = Date.now();
    const breach = new Date(now - 60_000); // 1 min ago => breached
    const tickets: TicketRow[] = [
      {
        id: 't1',
        tenantId: 'tenant-a',
        ticketNumber: 'TK-001',
        subject: 'Broken login',
        status: 'OPEN',
        slaDeadline: breach,
        slaBreachedAt: null,
        assigneeId: 'user-1',
        createdAt: new Date(now - 10 * 60 * 60 * 1000),
      },
      {
        id: 't2',
        tenantId: 'tenant-b',
        ticketNumber: 'TK-002',
        subject: 'API timeout',
        status: 'IN_PROGRESS',
        slaDeadline: breach,
        slaBreachedAt: null,
        assigneeId: 'user-2',
        createdAt: new Date(now - 10 * 60 * 60 * 1000),
      },
    ];

    const { prisma, ticketFindMany } = makePrisma(
      [
        { tenantId: 'tenant-a', notifyOnSlaBreach: true, notifyOnSlaWarning: false },
        { tenantId: 'tenant-b', notifyOnSlaBreach: true, notifyOnSlaWarning: false },
      ],
      tickets
    );
    const deps = makeDeps();
    const worker = new TicketSlaMonitorWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    const result = await worker.process(makeJob());

    // NP-007 regression: exactly 1 ticket.findMany call regardless of tenant count.
    expect(ticketFindMany).toHaveBeenCalledTimes(1);

    // The single query must use tenantId: { in: [...] }.
    const queryArg = ticketFindMany.mock.calls[0][0] as {
      where: { tenantId: { in: string[] } };
    };
    expect(queryArg.where.tenantId).toHaveProperty('in');
    expect(queryArg.where.tenantId.in).toContain('tenant-a');
    expect(queryArg.where.tenantId.in).toContain('tenant-b');

    expect(result.tenantsScanned).toBe(2);
    expect(result.ticketsScanned).toBe(2);
    expect(result.breachNotificationsWritten).toBe(2);
    expect(result.warningNotificationsWritten).toBe(0);
  });

  it('issues ONE ticket.findMany even when there is a single tenant', async () => {
    const { prisma, ticketFindMany } = makePrisma(
      [{ tenantId: 'tenant-x', notifyOnSlaBreach: false, notifyOnSlaWarning: false }],
      []
    );
    const deps = makeDeps();
    const worker = new TicketSlaMonitorWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    await worker.process(makeJob());

    expect(ticketFindMany).toHaveBeenCalledTimes(1);
  });

  it('writes zero notifications when both flags are off', async () => {
    const now = Date.now();
    const breach = new Date(now - 60_000);
    const tickets: TicketRow[] = [
      {
        id: 't3',
        tenantId: 'tenant-c',
        ticketNumber: 'TK-003',
        subject: 'Ignored',
        status: 'OPEN',
        slaDeadline: breach,
        slaBreachedAt: null,
        assigneeId: 'user-3',
        createdAt: new Date(now - 10 * 60 * 60 * 1000),
      },
    ];
    const { prisma } = makePrisma(
      [{ tenantId: 'tenant-c', notifyOnSlaBreach: false, notifyOnSlaWarning: false }],
      tickets
    );
    const deps = makeDeps();
    const worker = new TicketSlaMonitorWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    const result = await worker.process(makeJob());

    expect(result.breachNotificationsWritten).toBe(0);
    expect(result.warningNotificationsWritten).toBe(0);
    expect(deps.createNotification).not.toHaveBeenCalled();
  });

  it('emits SLA warning notification when ticket is at 85% elapsed and warning flag is on', async () => {
    const now = Date.now();
    const createdAt = new Date(now - 85 * 60 * 1000); // 85 min ago
    const deadline = new Date(now + 15 * 60 * 1000); // 15 min from now (85% elapsed)
    const tickets: TicketRow[] = [
      {
        id: 'tw1',
        tenantId: 'tenant-w',
        ticketNumber: 'TK-W01',
        subject: 'Warning ticket',
        status: 'OPEN',
        slaDeadline: deadline,
        slaBreachedAt: null,
        assigneeId: 'user-w',
        createdAt,
      },
    ];
    const { prisma } = makePrisma(
      [{ tenantId: 'tenant-w', notifyOnSlaBreach: false, notifyOnSlaWarning: true }],
      tickets
    );
    const deps = makeDeps();
    const worker = new TicketSlaMonitorWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    const result = await worker.process(makeJob());

    expect(result.warningNotificationsWritten).toBe(1);
    expect(result.breachNotificationsWritten).toBe(0);
    expect(deps.createNotification).toHaveBeenCalledOnce();
    const call = (deps.createNotification as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      priority: string;
      metadata: { reason: string };
    };
    expect(call.priority).toBe('normal');
    expect(call.metadata.reason).toBe('sla_warning');
  });

  it('emits SLA breach notification with high priority', async () => {
    const now = Date.now();
    const breach = new Date(now - 5_000);
    const tickets: TicketRow[] = [
      {
        id: 'tb1',
        tenantId: 'tenant-breach',
        ticketNumber: 'TK-B01',
        subject: 'Breached ticket',
        status: 'OPEN',
        slaDeadline: breach,
        slaBreachedAt: null,
        assigneeId: 'user-b',
        createdAt: new Date(now - 60 * 60 * 1000),
      },
    ];
    const { prisma } = makePrisma(
      [{ tenantId: 'tenant-breach', notifyOnSlaBreach: true, notifyOnSlaWarning: false }],
      tickets
    );
    const deps = makeDeps();
    const worker = new TicketSlaMonitorWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    const result = await worker.process(makeJob());

    expect(result.breachNotificationsWritten).toBe(1);
    const call = (deps.createNotification as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      priority: string;
      type: string;
      metadata: { reason: string };
    };
    expect(call.priority).toBe('high');
    expect(call.type).toBe('ticket_escalated');
    expect(call.metadata.reason).toBe('sla_breach');
  });

  it('skips breach notification for tickets already recorded as breached (slaBreachedAt set)', async () => {
    const now = Date.now();
    const breach = new Date(now - 5_000);
    const tickets: TicketRow[] = [
      {
        id: 'tb2',
        tenantId: 'tenant-already',
        ticketNumber: 'TK-AB2',
        subject: 'Already breached',
        status: 'OPEN',
        slaDeadline: breach,
        slaBreachedAt: new Date(now - 60_000), // already recorded
        assigneeId: 'user-b',
        createdAt: new Date(now - 60 * 60 * 1000),
      },
    ];
    const { prisma } = makePrisma(
      [{ tenantId: 'tenant-already', notifyOnSlaBreach: true, notifyOnSlaWarning: false }],
      tickets
    );
    const deps = makeDeps();
    const worker = new TicketSlaMonitorWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    const result = await worker.process(makeJob());

    expect(result.breachNotificationsWritten).toBe(0);
  });

  it('returns zero counts when no settings are found', async () => {
    const { prisma, ticketFindMany } = makePrisma([], []);
    const deps = makeDeps();
    const worker = new TicketSlaMonitorWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    const result = await worker.process(makeJob());

    expect(result.tenantsScanned).toBe(0);
    expect(result.ticketsScanned).toBe(0);
    // Short-circuit: no ticket query when no settings.
    expect(ticketFindMany).not.toHaveBeenCalled();
  });

  it('caps each tenant group to 500 and does not mix tickets across tenants', async () => {
    const now = Date.now();
    const createdAt = new Date(now - 10 * 60 * 60 * 1000);
    // Create 10 tickets: 5 for tenant-x, 5 for tenant-y
    const tickets: TicketRow[] = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`,
      tenantId: i < 5 ? 'tenant-x' : 'tenant-y',
      ticketNumber: `TK-${i}`,
      subject: `Ticket ${i}`,
      status: 'OPEN',
      slaDeadline: new Date(now - 1_000),
      slaBreachedAt: null,
      assigneeId: `user-${i}`,
      createdAt,
    }));

    const { prisma, ticketFindMany } = makePrisma(
      [
        { tenantId: 'tenant-x', notifyOnSlaBreach: true, notifyOnSlaWarning: false },
        { tenantId: 'tenant-y', notifyOnSlaBreach: true, notifyOnSlaWarning: false },
      ],
      tickets
    );
    const deps = makeDeps();
    const worker = new TicketSlaMonitorWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    const result = await worker.process(makeJob());

    // Still only ONE DB call.
    expect(ticketFindMany).toHaveBeenCalledTimes(1);
    // 5 + 5 = 10 tickets across both tenants.
    expect(result.ticketsScanned).toBe(10);
    expect(result.breachNotificationsWritten).toBe(10);
  });
});
