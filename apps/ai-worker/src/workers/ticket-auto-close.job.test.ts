/**
 * Unit tests for TicketAutoCloseWorker.process().
 *
 * NP-007 regression: verifies that ticket.findMany is called ONCE regardless
 * of how many eligible tenant settings are returned.
 *
 * Pure logic tests — BullMQ not instantiated. Prisma + notification deps mocked.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Job } from 'bullmq';
import { TicketAutoCloseWorker, type AutoCloseDeps } from './ticket-auto-close.job';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<AutoCloseDeps> = {}): AutoCloseDeps {
  return {
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
  reporterId: string | null;
  reporterUserId: string | null;
  contactEmail: string | null;
  updatedAt: Date;
  lastActivityAt: Date | null;
};

type SettingRow = {
  tenantId: string;
  autoCloseIdleDays: number;
  autoCloseAppliesToWaitingCustomer: boolean;
  autoCloseAppliesToResolved: boolean;
  autoCloseNotifyCustomer: boolean;
};

function makePrisma(settings: SettingRow[], tickets: TicketRow[]) {
  const ticketFindMany = vi.fn().mockResolvedValue(tickets);
  // Return a count equal to how many ids were in the where clause.
  const ticketUpdateMany = vi
    .fn()
    .mockImplementation(async (args: { where?: { id?: { in?: string[] } } }) => ({
      count: args?.where?.id?.in?.length ?? 0,
    }));
  const settingsFindMany = vi.fn().mockResolvedValue(settings);
  return {
    prisma: {
      ticketAutomationSetting: { findMany: settingsFindMany },
      ticket: { findMany: ticketFindMany, updateMany: ticketUpdateMany },
    } as never,
    ticketFindMany,
    ticketUpdateMany,
    settingsFindMany,
  };
}

function makeJob(data: Record<string, unknown> = { sweepAll: true }) {
  return { id: '1', data } as unknown as Job;
}

const FIXED_NOW = new Date('2026-01-10T12:00:00.000Z');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TicketAutoCloseWorker.process — N+1 batching (NP-007)', () => {
  it('issues exactly ONE ticket.findMany when multiple tenants are eligible', async () => {
    const cutoff = new Date(FIXED_NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
    const idleDate = new Date(cutoff.getTime() - 60_000); // older than cutoff
    const tickets: TicketRow[] = [
      {
        id: 'tac-1',
        tenantId: 'ta',
        ticketNumber: 'TK-AC1',
        subject: 'Old waiting ticket',
        status: 'WAITING_ON_CUSTOMER',
        reporterId: 'user-ta-1',
        reporterUserId: null,
        contactEmail: null,
        updatedAt: idleDate,
        lastActivityAt: null,
      },
      {
        id: 'tac-2',
        tenantId: 'tb',
        ticketNumber: 'TK-AC2',
        subject: 'Resolved ticket',
        status: 'RESOLVED',
        reporterId: null,
        reporterUserId: 'user-tb-1',
        contactEmail: null,
        updatedAt: idleDate,
        lastActivityAt: null,
      },
    ];

    const settings: SettingRow[] = [
      {
        tenantId: 'ta',
        autoCloseIdleDays: 7,
        autoCloseAppliesToWaitingCustomer: true,
        autoCloseAppliesToResolved: false,
        autoCloseNotifyCustomer: false,
      },
      {
        tenantId: 'tb',
        autoCloseIdleDays: 7,
        autoCloseAppliesToWaitingCustomer: false,
        autoCloseAppliesToResolved: true,
        autoCloseNotifyCustomer: false,
      },
    ];

    const { prisma, ticketFindMany } = makePrisma(settings, tickets);
    const deps = makeDeps({ now: () => FIXED_NOW });
    const worker = new TicketAutoCloseWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    const result = await worker.process(makeJob());

    // NP-007 regression: exactly 1 ticket.findMany call regardless of tenant count.
    expect(ticketFindMany).toHaveBeenCalledTimes(1);

    // The single query must use tenantId: { in: [...] }.
    const queryArg = ticketFindMany.mock.calls[0][0] as {
      where: { tenantId: { in: string[] } };
    };
    expect(queryArg.where.tenantId).toHaveProperty('in');
    expect(queryArg.where.tenantId.in).toContain('ta');
    expect(queryArg.where.tenantId.in).toContain('tb');

    expect(result.tenantsScanned).toBe(2);
    expect(result.ticketsScanned).toBe(2);
    expect(result.ticketsClosed).toBe(2);
  });

  it('issues ONE ticket.findMany when there is a single eligible tenant', async () => {
    const cutoff = new Date(FIXED_NOW.getTime() - 5 * 24 * 60 * 60 * 1000);
    const idleDate = new Date(cutoff.getTime() - 1000);
    const tickets: TicketRow[] = [
      {
        id: 'tac-single',
        tenantId: 'ts',
        ticketNumber: 'TK-SNG',
        subject: 'Single tenant ticket',
        status: 'RESOLVED',
        reporterId: null,
        reporterUserId: null,
        contactEmail: null,
        updatedAt: idleDate,
        lastActivityAt: null,
      },
    ];
    const settings: SettingRow[] = [
      {
        tenantId: 'ts',
        autoCloseIdleDays: 5,
        autoCloseAppliesToWaitingCustomer: false,
        autoCloseAppliesToResolved: true,
        autoCloseNotifyCustomer: false,
      },
    ];
    const { prisma, ticketFindMany } = makePrisma(settings, tickets);
    const deps = makeDeps({ now: () => FIXED_NOW });
    const worker = new TicketAutoCloseWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    await worker.process(makeJob());

    expect(ticketFindMany).toHaveBeenCalledTimes(1);
  });

  it('skips ticket.findMany entirely when no tenant has eligible statuses', async () => {
    const settings: SettingRow[] = [
      {
        tenantId: 'tnone',
        autoCloseIdleDays: 7,
        autoCloseAppliesToWaitingCustomer: false, // neither flag on
        autoCloseAppliesToResolved: false,
        autoCloseNotifyCustomer: false,
      },
    ];
    const { prisma, ticketFindMany } = makePrisma(settings, []);
    const deps = makeDeps({ now: () => FIXED_NOW });
    const worker = new TicketAutoCloseWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    const result = await worker.process(makeJob());

    expect(ticketFindMany).not.toHaveBeenCalled();
    expect(result.ticketsClosed).toBe(0);
    expect(result.tenantsScanned).toBe(1);
  });

  it('filters tickets by per-tenant cutoff when different tenants have different idle days', async () => {
    // tenant-slow: 7 idle days. tenant-fast: 3 idle days.
    // earliestCutoff = now - 3 days (most permissive, comes from tenant-fast).
    // A ticket that is 4 days idle qualifies for tenant-slow but NOT tenant-fast
    // (since tenant-fast needs >=3 idle days and that ticket IS 4 days idle so actually qualifies for both).
    // Let's make a ticket that is EXACTLY 4 days old for tenant-slow (qualifies: 4>=7? NO).
    // Actually: idle for 4 days for tenant-slow (7-day threshold) => does NOT qualify.
    // But idle for 4 days for tenant-fast (3-day threshold) => DOES qualify.
    // The batch query uses earliestCutoff = now - 3 days.
    // Per-tenant in-memory filter applies the correct 7-day or 3-day cutoff.

    const fourDaysAgo = new Date(FIXED_NOW.getTime() - 4 * 24 * 60 * 60 * 1000);
    const tickets: TicketRow[] = [
      // tenant-slow ticket: 4 days idle -> below 7-day threshold, should NOT close
      {
        id: 'slow-ticket',
        tenantId: 'tenant-slow',
        ticketNumber: 'TK-SLOW',
        subject: 'Not old enough for slow tenant',
        status: 'RESOLVED',
        reporterId: null,
        reporterUserId: null,
        contactEmail: null,
        updatedAt: fourDaysAgo,
        lastActivityAt: null,
      },
      // tenant-fast ticket: 4 days idle -> above 3-day threshold, SHOULD close
      {
        id: 'fast-ticket',
        tenantId: 'tenant-fast',
        ticketNumber: 'TK-FAST',
        subject: 'Old enough for fast tenant',
        status: 'RESOLVED',
        reporterId: null,
        reporterUserId: null,
        contactEmail: null,
        updatedAt: fourDaysAgo,
        lastActivityAt: null,
      },
    ];

    const settings: SettingRow[] = [
      {
        tenantId: 'tenant-slow',
        autoCloseIdleDays: 7,
        autoCloseAppliesToWaitingCustomer: false,
        autoCloseAppliesToResolved: true,
        autoCloseNotifyCustomer: false,
      },
      {
        tenantId: 'tenant-fast',
        autoCloseIdleDays: 3,
        autoCloseAppliesToWaitingCustomer: false,
        autoCloseAppliesToResolved: true,
        autoCloseNotifyCustomer: false,
      },
    ];

    const { prisma, ticketFindMany, ticketUpdateMany } = makePrisma(settings, tickets);
    const deps = makeDeps({ now: () => FIXED_NOW });
    const worker = new TicketAutoCloseWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    const result = await worker.process(makeJob());

    // Still ONE batch query.
    expect(ticketFindMany).toHaveBeenCalledTimes(1);

    // Only 1 ticket should be closed (tenant-fast).
    expect(result.ticketsScanned).toBe(1);
    expect(result.ticketsClosed).toBe(1);

    // updateMany should be called with only the fast tenant's ticket.
    expect(ticketUpdateMany).toHaveBeenCalledTimes(1);
    const updateArg = ticketUpdateMany.mock.calls[0][0] as {
      where: { id: { in: string[] }; tenantId: string };
    };
    expect(updateArg.where.id.in).toContain('fast-ticket');
    expect(updateArg.where.id.in).not.toContain('slow-ticket');
    expect(updateArg.where.tenantId).toBe('tenant-fast');
  });

  it('sends auto-close notifications when autoCloseNotifyCustomer=true', async () => {
    const cutoff = new Date(FIXED_NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
    const idleDate = new Date(cutoff.getTime() - 1000);
    const tickets: TicketRow[] = [
      {
        id: 'notif-ticket',
        tenantId: 'tenant-notif',
        ticketNumber: 'TK-NOTIF',
        subject: 'Notify on close',
        status: 'RESOLVED',
        reporterId: null,
        reporterUserId: 'user-notif',
        contactEmail: null,
        updatedAt: idleDate,
        lastActivityAt: null,
      },
    ];
    const settings: SettingRow[] = [
      {
        tenantId: 'tenant-notif',
        autoCloseIdleDays: 7,
        autoCloseAppliesToWaitingCustomer: false,
        autoCloseAppliesToResolved: true,
        autoCloseNotifyCustomer: true,
      },
    ];
    const { prisma } = makePrisma(settings, tickets);
    const deps = makeDeps({ now: () => FIXED_NOW });
    const worker = new TicketAutoCloseWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    const result = await worker.process(makeJob());

    expect(result.notificationsWritten).toBe(1);
    expect(deps.createNotification).toHaveBeenCalledOnce();
    const call = (deps.createNotification as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      type: string;
      userId: string;
      entityId: string;
    };
    expect(call.type).toBe('ticket_auto_closed');
    expect(call.userId).toBe('user-notif');
    expect(call.entityId).toBe('notif-ticket');
  });

  it('does NOT close tickets in dry-run mode but still counts them', async () => {
    const cutoff = new Date(FIXED_NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
    const idleDate = new Date(cutoff.getTime() - 1000);
    const tickets: TicketRow[] = [
      {
        id: 'dry-1',
        tenantId: 'tenant-dry',
        ticketNumber: 'TK-DRY',
        subject: 'Dry run ticket',
        status: 'RESOLVED',
        reporterId: null,
        reporterUserId: null,
        contactEmail: null,
        updatedAt: idleDate,
        lastActivityAt: null,
      },
    ];
    const settings: SettingRow[] = [
      {
        tenantId: 'tenant-dry',
        autoCloseIdleDays: 7,
        autoCloseAppliesToWaitingCustomer: false,
        autoCloseAppliesToResolved: true,
        autoCloseNotifyCustomer: false,
      },
    ];
    const { prisma, ticketUpdateMany } = makePrisma(settings, tickets);
    const deps = makeDeps({ now: () => FIXED_NOW });
    const worker = new TicketAutoCloseWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    const result = await worker.process(makeJob({ sweepAll: true, dryRun: true }));

    expect(result.dryRun).toBe(true);
    expect(result.ticketsClosed).toBe(1); // counted but not actually closed
    expect(ticketUpdateMany).not.toHaveBeenCalled();
  });

  it('returns zero scanned/closed when no settings are found', async () => {
    const { prisma, ticketFindMany } = makePrisma([], []);
    const deps = makeDeps({ now: () => FIXED_NOW });
    const worker = new TicketAutoCloseWorker(prisma, { host: 'localhost', port: 6379 }, deps);

    const result = await worker.process(makeJob());

    expect(result.tenantsScanned).toBe(0);
    expect(result.ticketsClosed).toBe(0);
    expect(ticketFindMany).not.toHaveBeenCalled();
  });
});
