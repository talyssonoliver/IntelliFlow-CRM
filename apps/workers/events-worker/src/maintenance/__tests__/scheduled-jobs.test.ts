/**
 * MaintenanceScheduler — N+1 regression tests
 *
 * Each "reminder loop" job must issue exactly ONE `notification.findMany`
 * (dedup check) and ONE `notification.createMany` (insert) regardless of how
 * many rows are returned — never a per-row findFirst / create.
 *
 * SLA breach/warning jobs must issue exactly ONE `ticket.updateMany` and ONE
 * `notification.createMany` regardless of collection size.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pino from 'pino';
import { MaintenanceScheduler } from '../scheduled-jobs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const silentLogger = pino({ level: 'silent' });

/** Build a minimal Prisma mock — only the methods exercised by the scheduler */
function makePrisma() {
  return {
    ticket: {
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      // old per-row method — must NOT be called after the fix
      update: vi.fn(),
    },
    notification: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      // old per-row methods — must NOT be called after the fix
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    lead: { findMany: vi.fn() },
    task: { findMany: vi.fn() },
    opportunity: { findMany: vi.fn() },
    appointment: { findMany: vi.fn() },
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
}

type MockPrisma = ReturnType<typeof makePrisma>;

function makeScheduler(prisma: MockPrisma) {
  return new MaintenanceScheduler(
    prisma as unknown as Parameters<typeof MaintenanceScheduler.prototype.constructor>[0],
    silentLogger,
    {
      slaCheckIntervalMs: 999_999,
      followUpCheckIntervalMs: 999_999,
      staleDealCheckIntervalMs: 999_999,
      sessionCleanupIntervalMs: 999_999,
      appointmentReminderIntervalMs: 999_999,
      staleLeadDays: 7,
      staleDealDays: 14,
    }
  );
}

// ---------------------------------------------------------------------------
// Job 1: SLA Breaches (NP-008 / NP-009)
// ---------------------------------------------------------------------------

describe('checkSLABreaches', () => {
  let prisma: MockPrisma;
  let scheduler: MaintenanceScheduler;

  const now = new Date('2025-06-01T12:00:00Z');

  const makeBreachedTicket = (id: string) => ({
    id,
    subject: `Ticket ${id}`,
    assigneeId: `user-${id}`,
    tenantId: 'tenant-1',
    slaResolutionDue: new Date(now.getTime() - 60_000),
    priority: 'HIGH',
  });

  const makeWarningTicket = (id: string) => ({
    id,
    subject: `Warning Ticket ${id}`,
    assigneeId: `user-${id}`,
    tenantId: 'tenant-1',
    slaResolutionDue: new Date(now.getTime() + 15 * 60_000),
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    prisma = makePrisma();
    scheduler = makeScheduler(prisma);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues ONE ticket.updateMany for multiple breached tickets (NP-008)', async () => {
    const tickets = ['t1', 't2', 't3'].map(makeBreachedTicket);
    prisma.ticket.findMany
      .mockResolvedValueOnce(tickets) // breached query
      .mockResolvedValueOnce([]); // warning query

    scheduler.start();
    // Manually invoke the private method via runSafe equivalent
    await (scheduler as unknown as { checkSLABreaches(): Promise<void> }).checkSLABreaches();

    expect(prisma.ticket.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['t1', 't2', 't3'] } },
      data: { slaStatus: 'BREACHED', slaBreachedAt: now },
    });
    // old per-row method must never fire
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it('issues ONE notification.createMany for all assigned breached tickets (NP-008)', async () => {
    const tickets = ['t1', 't2', 't3'].map(makeBreachedTicket);
    prisma.ticket.findMany.mockResolvedValueOnce(tickets).mockResolvedValueOnce([]);

    await (scheduler as unknown as { checkSLABreaches(): Promise<void> }).checkSLABreaches();

    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    const call = prisma.notification.createMany.mock.calls[0][0] as { data: unknown[] };
    expect(call.data).toHaveLength(3);
    // old per-row method must never fire
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('skips notification.createMany when no tickets have assignees', async () => {
    const unassigned = ['t1', 't2'].map((id) => ({ ...makeBreachedTicket(id), assigneeId: null }));
    prisma.ticket.findMany.mockResolvedValueOnce(unassigned).mockResolvedValueOnce([]);

    await (scheduler as unknown as { checkSLABreaches(): Promise<void> }).checkSLABreaches();

    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('issues ONE ticket.updateMany for warning tickets (NP-009)', async () => {
    // The breach block early-returns when breachedTickets.length === 0,
    // so to exercise the warning path we must pass at least one breached
    // ticket AND warning tickets, then check that updateMany is called
    // for both groups (2 calls total) or we can pass breached tickets to
    // satisfy the early-return guard and warning tickets for the second
    // findMany.
    //
    // Simpler: provide 1 breached ticket (no assignee so no notification)
    // + 2 warning tickets. We then assert updateMany was called twice and
    // that the second call used AT_RISK.
    const oneBreached = [{ ...makeBreachedTicket('b0'), assigneeId: null }];
    const warningTickets = ['w1', 'w2'].map(makeWarningTicket);

    prisma.ticket.findMany
      .mockResolvedValueOnce(oneBreached) // breach findMany
      .mockResolvedValueOnce(warningTickets); // warning findMany

    await (scheduler as unknown as { checkSLABreaches(): Promise<void> }).checkSLABreaches();

    // Two updateMany calls: one for breach, one for warnings
    expect(prisma.ticket.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['w1', 'w2'] } },
      data: { slaStatus: 'AT_RISK' },
    });
  });

  it('N+1 regression: call counts are CONSTANT regardless of collection size', async () => {
    // 10 tickets — still exactly 1 updateMany + 1 createMany
    const bigSet = Array.from({ length: 10 }, (_, i) => makeBreachedTicket(`t${i}`));
    prisma.ticket.findMany.mockResolvedValueOnce(bigSet).mockResolvedValueOnce([]);

    await (scheduler as unknown as { checkSLABreaches(): Promise<void> }).checkSLABreaches();

    expect(prisma.ticket.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Job 2a: Stale Leads (NP-029)
// ---------------------------------------------------------------------------

describe('checkFollowUpReminders — stale leads (NP-029)', () => {
  let prisma: MockPrisma;
  let scheduler: MaintenanceScheduler;
  const now = new Date('2025-06-01T12:00:00Z');

  const makeLead = (id: string) => ({
    id,
    firstName: 'Alice',
    lastName: id,
    email: `alice-${id}@example.com`,
    ownerId: `owner-${id}`,
    tenantId: 'tenant-1',
    updatedAt: new Date(now.getTime() - 8 * 24 * 60 * 60_000), // 8 days ago
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    prisma = makePrisma();
    scheduler = makeScheduler(prisma);
    // No overdue tasks
    prisma.task.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues ONE notification.findMany dedup check for all leads (NP-029)', async () => {
    const leads = ['l1', 'l2', 'l3'].map(makeLead);
    prisma.lead.findMany.mockResolvedValue(leads);
    prisma.notification.findMany.mockResolvedValue([]); // none already reminded

    await (
      scheduler as unknown as { checkFollowUpReminders(): Promise<void> }
    ).checkFollowUpReminders();

    // Only 1 findMany call for lead dedup (task list is empty so no task findMany)
    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceId: { in: ['l1', 'l2', 'l3'] },
          sourceType: 'stale_lead_reminder',
        }),
      })
    );
    // old per-row method must never fire
    expect(prisma.notification.findFirst).not.toHaveBeenCalled();
  });

  it('issues ONE notification.createMany for all non-deduped leads (NP-029)', async () => {
    const leads = ['l1', 'l2', 'l3'].map(makeLead);
    prisma.lead.findMany.mockResolvedValue(leads);
    // l2 already has a reminder
    prisma.notification.findMany.mockResolvedValue([{ sourceId: 'l2' }]);

    await (
      scheduler as unknown as { checkFollowUpReminders(): Promise<void> }
    ).checkFollowUpReminders();

    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    const call = prisma.notification.createMany.mock.calls[0][0] as {
      data: { sourceId: string }[];
    };
    expect(call.data).toHaveLength(2);
    expect(call.data.map((n) => n.sourceId)).not.toContain('l2');
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('skips createMany when all leads already reminded', async () => {
    const leads = ['l1', 'l2'].map(makeLead);
    prisma.lead.findMany.mockResolvedValue(leads);
    prisma.notification.findMany.mockResolvedValue([{ sourceId: 'l1' }, { sourceId: 'l2' }]);

    await (
      scheduler as unknown as { checkFollowUpReminders(): Promise<void> }
    ).checkFollowUpReminders();

    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('N+1 regression: 10 leads → exactly 1 findMany + 1 createMany', async () => {
    const leads = Array.from({ length: 10 }, (_, i) => makeLead(`l${i}`));
    prisma.lead.findMany.mockResolvedValue(leads);
    prisma.notification.findMany.mockResolvedValue([]);

    await (
      scheduler as unknown as { checkFollowUpReminders(): Promise<void> }
    ).checkFollowUpReminders();

    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Job 2b: Overdue Tasks (NP-030)
// ---------------------------------------------------------------------------

describe('checkFollowUpReminders — overdue tasks (NP-030)', () => {
  let prisma: MockPrisma;
  let scheduler: MaintenanceScheduler;
  const now = new Date('2025-06-01T12:00:00Z');

  const makeTask = (id: string, daysOverdue = 1) => ({
    id,
    title: `Task ${id}`,
    ownerId: `owner-${id}`,
    assigneeId: null as string | null,
    tenantId: 'tenant-1',
    dueDate: new Date(now.getTime() - daysOverdue * 24 * 60 * 60_000),
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    prisma = makePrisma();
    scheduler = makeScheduler(prisma);
    // No stale leads
    prisma.lead.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues ONE notification.findMany dedup check for all tasks (NP-030)', async () => {
    const tasks = ['tk1', 'tk2', 'tk3'].map((id) => makeTask(id));
    prisma.task.findMany.mockResolvedValue(tasks);
    prisma.notification.findMany.mockResolvedValue([]);

    await (
      scheduler as unknown as { checkFollowUpReminders(): Promise<void> }
    ).checkFollowUpReminders();

    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceId: { in: ['tk1', 'tk2', 'tk3'] },
          sourceType: 'overdue_task_reminder',
        }),
      })
    );
    expect(prisma.notification.findFirst).not.toHaveBeenCalled();
  });

  it('issues ONE notification.createMany for all non-deduped tasks (NP-030)', async () => {
    const tasks = ['tk1', 'tk2', 'tk3'].map((id) => makeTask(id));
    prisma.task.findMany.mockResolvedValue(tasks);
    // tk1 already reminded
    prisma.notification.findMany.mockResolvedValue([{ sourceId: 'tk1' }]);

    await (
      scheduler as unknown as { checkFollowUpReminders(): Promise<void> }
    ).checkFollowUpReminders();

    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    const call = prisma.notification.createMany.mock.calls[0][0] as {
      data: { sourceId: string }[];
    };
    expect(call.data).toHaveLength(2);
    expect(call.data.map((n) => n.sourceId)).not.toContain('tk1');
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('sets HIGH priority for tasks overdue >= 3 days', async () => {
    const tasks = [makeTask('tk1', 3), makeTask('tk2', 1)];
    prisma.task.findMany.mockResolvedValue(tasks);
    prisma.notification.findMany.mockResolvedValue([]);

    await (
      scheduler as unknown as { checkFollowUpReminders(): Promise<void> }
    ).checkFollowUpReminders();

    const call = prisma.notification.createMany.mock.calls[0][0] as {
      data: { sourceId: string; priority: string }[];
    };
    const tk1 = call.data.find((n) => n.sourceId === 'tk1');
    const tk2 = call.data.find((n) => n.sourceId === 'tk2');
    expect(tk1?.priority).toBe('HIGH');
    expect(tk2?.priority).toBe('NORMAL');
  });

  it('N+1 regression: 10 tasks → exactly 1 findMany + 1 createMany', async () => {
    const tasks = Array.from({ length: 10 }, (_, i) => makeTask(`tk${i}`));
    prisma.task.findMany.mockResolvedValue(tasks);
    prisma.notification.findMany.mockResolvedValue([]);

    await (
      scheduler as unknown as { checkFollowUpReminders(): Promise<void> }
    ).checkFollowUpReminders();

    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Job 3: Stale Deals (NP-031)
// ---------------------------------------------------------------------------

describe('checkStaleDeal (NP-031)', () => {
  let prisma: MockPrisma;
  let scheduler: MaintenanceScheduler;
  const now = new Date('2025-06-01T12:00:00Z');

  const makeDeal = (id: string) => ({
    id,
    name: `Deal ${id}`,
    ownerId: `owner-${id}`,
    tenantId: 'tenant-1',
    updatedAt: new Date(now.getTime() - 15 * 24 * 60 * 60_000), // 15 days ago
    value: 50000,
    stage: 'PROPOSAL',
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    prisma = makePrisma();
    scheduler = makeScheduler(prisma);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues ONE notification.findMany dedup check for all deals (NP-031)', async () => {
    const deals = ['d1', 'd2', 'd3'].map(makeDeal);
    prisma.opportunity.findMany.mockResolvedValue(deals);
    prisma.notification.findMany.mockResolvedValue([]);

    await (scheduler as unknown as { checkStaleDeal(): Promise<void> }).checkStaleDeal();

    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceId: { in: ['d1', 'd2', 'd3'] },
          sourceType: 'stale_deal_alert',
        }),
      })
    );
    expect(prisma.notification.findFirst).not.toHaveBeenCalled();
  });

  it('issues ONE notification.createMany for non-deduped deals (NP-031)', async () => {
    const deals = ['d1', 'd2', 'd3'].map(makeDeal);
    prisma.opportunity.findMany.mockResolvedValue(deals);
    // d3 already alerted
    prisma.notification.findMany.mockResolvedValue([{ sourceId: 'd3' }]);

    await (scheduler as unknown as { checkStaleDeal(): Promise<void> }).checkStaleDeal();

    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    const call = prisma.notification.createMany.mock.calls[0][0] as {
      data: { sourceId: string }[];
    };
    expect(call.data).toHaveLength(2);
    expect(call.data.map((n) => n.sourceId)).not.toContain('d3');
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('N+1 regression: 10 deals → exactly 1 findMany + 1 createMany', async () => {
    const deals = Array.from({ length: 10 }, (_, i) => makeDeal(`d${i}`));
    prisma.opportunity.findMany.mockResolvedValue(deals);
    prisma.notification.findMany.mockResolvedValue([]);

    await (scheduler as unknown as { checkStaleDeal(): Promise<void> }).checkStaleDeal();

    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
  });

  it('skips all when no deals have owners', async () => {
    const deals = ['d1', 'd2'].map((id) => ({ ...makeDeal(id), ownerId: null }));
    prisma.opportunity.findMany.mockResolvedValue(deals);

    await (scheduler as unknown as { checkStaleDeal(): Promise<void> }).checkStaleDeal();

    expect(prisma.notification.findMany).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Job 5: Appointment Reminders (NP-032)
// ---------------------------------------------------------------------------

describe('checkAppointmentReminders (NP-032)', () => {
  let prisma: MockPrisma;
  let scheduler: MaintenanceScheduler;
  const now = new Date('2025-06-01T12:00:00Z');

  const makeAppt = (id: string) => ({
    id,
    title: `Appointment ${id}`,
    startTime: new Date(now.getTime() + 10 * 60_000), // 10 min from now
    location: null as string | null,
    organizerId: `org-${id}`,
    tenantId: 'tenant-1',
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    prisma = makePrisma();
    scheduler = makeScheduler(prisma);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues ONE notification.findMany dedup check for all appointments (NP-032)', async () => {
    const appts = ['a1', 'a2', 'a3'].map(makeAppt);
    prisma.appointment.findMany.mockResolvedValue(appts);
    prisma.notification.findMany.mockResolvedValue([]);

    await (
      scheduler as unknown as { checkAppointmentReminders(): Promise<void> }
    ).checkAppointmentReminders();

    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceId: { in: ['a1', 'a2', 'a3'] },
          sourceType: 'appointment_reminder',
        }),
      })
    );
    expect(prisma.notification.findFirst).not.toHaveBeenCalled();
  });

  it('issues ONE notification.createMany for non-deduped appointments (NP-032)', async () => {
    const appts = ['a1', 'a2', 'a3'].map(makeAppt);
    prisma.appointment.findMany.mockResolvedValue(appts);
    // a2 already sent
    prisma.notification.findMany.mockResolvedValue([{ sourceId: 'a2' }]);

    await (
      scheduler as unknown as { checkAppointmentReminders(): Promise<void> }
    ).checkAppointmentReminders();

    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    const call = prisma.notification.createMany.mock.calls[0][0] as {
      data: { sourceId: string }[];
    };
    expect(call.data).toHaveLength(2);
    expect(call.data.map((n) => n.sourceId)).not.toContain('a2');
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('includes location in body when present', async () => {
    const appt = { ...makeAppt('a1'), location: 'Conference Room B' };
    prisma.appointment.findMany.mockResolvedValue([appt]);
    prisma.notification.findMany.mockResolvedValue([]);

    await (
      scheduler as unknown as { checkAppointmentReminders(): Promise<void> }
    ).checkAppointmentReminders();

    const call = prisma.notification.createMany.mock.calls[0][0] as { data: { body: string }[] };
    expect(call.data[0].body).toContain('Location: Conference Room B');
  });

  it('skips all when no appointments have organizers', async () => {
    const appts = ['a1', 'a2'].map((id) => ({ ...makeAppt(id), organizerId: null }));
    prisma.appointment.findMany.mockResolvedValue(appts);

    await (
      scheduler as unknown as { checkAppointmentReminders(): Promise<void> }
    ).checkAppointmentReminders();

    expect(prisma.notification.findMany).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('N+1 regression: 10 appointments → exactly 1 findMany + 1 createMany', async () => {
    const appts = Array.from({ length: 10 }, (_, i) => makeAppt(`a${i}`));
    prisma.appointment.findMany.mockResolvedValue(appts);
    prisma.notification.findMany.mockResolvedValue([]);

    await (
      scheduler as unknown as { checkAppointmentReminders(): Promise<void> }
    ).checkAppointmentReminders();

    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
  });
});
