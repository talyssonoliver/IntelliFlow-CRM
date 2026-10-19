/**
 * Approved-action compensator (PG-198 RF-4, #856): rolling back an approved agent
 * action undoes it for real through the target module's own tRPC procedures on the
 * requester's ctx — and only for the actions that have a safe compensation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  cases: { changeStatus: vi.fn() },
  appointments: { cancel: vi.fn() },
  ctxSeen: [] as unknown[],
}));

function routerMock(name: 'cases' | 'appointments', exportName: string) {
  return {
    [exportName]: {
      createCaller: (ctx: unknown) => {
        calls.ctxSeen.push(ctx);
        return calls[name];
      },
    },
  };
}

vi.mock('../../modules/legal/cases.router', () => routerMock('cases', 'casesRouter'));
vi.mock('../../modules/legal/appointments.router', () =>
  routerMock('appointments', 'appointmentsRouter')
);

import { canCompensate, compensateApprovedAction } from '../approved-action-compensator';

const TENANT = 'tenant-1';

interface TargetState {
  caseStatus?: string | null;
  appointmentStatus?: string | null;
  draft?: Record<string, unknown> | null;
}

/** Requester ctx whose reads return the target's state: null means not in the tenant. */
function ctx(state: TargetState = {}) {
  const row = (value: unknown, wrap: (v: any) => unknown) =>
    vi.fn().mockResolvedValue(value === null ? null : wrap(value));
  return {
    user: { userId: 'requester-1', tenantId: TENANT, role: 'MANAGER' },
    prisma: {
      case: {
        findFirst: row(state.caseStatus === undefined ? 'OPEN' : state.caseStatus, (status) => ({
          status,
        })),
      },
      appointment: {
        findFirst: row(
          state.appointmentStatus === undefined ? 'SCHEDULED' : state.appointmentStatus,
          (status) => ({ status })
        ),
      },
      emailRecord: {
        findFirst: row(state.draft === undefined ? { isDraft: true } : state.draft, (metadata) => ({
          metadata,
        })),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    },
  } as any;
}

beforeEach(() => {
  calls.ctxSeen.length = 0;
  for (const group of [calls.cases, calls.appointments]) {
    for (const fn of Object.values(group)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
});

describe('canCompensate', () => {
  it.each([
    ['create_case', { entityType: 'CASE', entityId: 'case-1' }],
    ['create_appointment', { entityType: 'APPOINTMENT', entityId: 'appt-1' }],
    ['draft_message', { entityType: 'MESSAGE', entityId: 'email-1' }],
  ])('%s with a recorded entity can be undone', (tool, result) => {
    expect(canCompensate(tool, result)).toBe(true);
  });

  it.each([
    ['update_case', { entityType: 'CASE', entityId: 'case-1' }],
    ['update_appointment', { entityType: 'APPOINTMENT', entityId: 'appt-1' }],
    // A note records the lead/contact it was added to: there is no note to remove.
    ['draft_message', { entityType: 'LEAD', entityId: 'lead-1' }],
    ['draft_message', { entityType: 'CONTACT', entityId: 'contact-1' }],
    ['search_leads', { entityType: 'LEAD', entityId: 'lead-1' }],
    ['create_case', undefined],
    ['create_case', { entityType: 'CASE' }],
    ['create_case', 'case-1'],
  ])('%s with %j cannot be undone', (tool, result) => {
    expect(canCompensate(tool, result)).toBe(false);
  });
});

describe('compensateApprovedAction', () => {
  it('create_case moves the created case to CANCELLED on the requester ctx', async () => {
    calls.cases.changeStatus.mockResolvedValue({ id: 'case-1', status: 'CANCELLED' });
    const requester = ctx();

    const outcome = await compensateApprovedAction(
      'create_case',
      { entityType: 'CASE', entityId: 'case-1' },
      requester
    );

    expect(outcome).toEqual({ success: true, restoredState: { cancelledCaseId: 'case-1' } });
    expect(calls.cases.changeStatus).toHaveBeenCalledWith({
      caseId: 'case-1',
      status: 'CANCELLED',
    });
    expect(calls.ctxSeen).toEqual([requester]);
  });

  it('create_case reports a refused transition and claims nothing was undone', async () => {
    calls.cases.changeStatus.mockRejectedValue(
      new Error('Cannot transition from CLOSED to CANCELLED')
    );

    const outcome = await compensateApprovedAction(
      'create_case',
      { entityType: 'CASE', entityId: 'case-1' },
      ctx()
    );

    expect(outcome).toEqual({
      success: false,
      error: 'Cannot transition from CLOSED to CANCELLED',
    });
  });

  it('create_appointment cancels the created appointment with a reason', async () => {
    calls.appointments.cancel.mockResolvedValue({ id: 'appt-1' });

    const outcome = await compensateApprovedAction(
      'create_appointment',
      { entityType: 'APPOINTMENT', entityId: 'appt-1' },
      ctx()
    );

    expect(outcome).toEqual({
      success: true,
      restoredState: { cancelledAppointmentId: 'appt-1' },
    });
    expect(calls.appointments.cancel).toHaveBeenCalledWith({
      id: 'appt-1',
      reason: 'Agent action rolled back',
    });
  });

  it('draft_message moves a still-unsent email draft to the trash, in the tenant', async () => {
    const requester = ctx({ draft: { isDraft: true, textBody: 'Hi' } });

    const outcome = await compensateApprovedAction(
      'draft_message',
      { entityType: 'MESSAGE', entityId: 'email-1' },
      requester
    );

    expect(outcome).toEqual({ success: true, restoredState: { trashedDraftId: 'email-1' } });
    expect(requester.prisma.emailRecord.findFirst).toHaveBeenCalledWith({
      where: { id: 'email-1', tenantId: TENANT },
      select: { metadata: true },
    });
    // One compare-and-set on the metadata just read, with processEmail('delete')'s flags.
    expect(requester.prisma.emailRecord.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'email-1',
        tenantId: TENANT,
        metadata: { equals: { isDraft: true, textBody: 'Hi' } },
      },
      data: {
        metadata: {
          isDraft: false,
          textBody: 'Hi',
          isTrashed: true,
          isArchived: false,
          isSpam: false,
        },
      },
    });
  });

  it('draft_message trashes nothing when the email changes during the rollback', async () => {
    const requester = ctx({ draft: { isDraft: true } });
    // Archived between the read and the update: the compare-and-set matches no row.
    requester.prisma.emailRecord.updateMany.mockResolvedValue({ count: 0 });

    const outcome = await compensateApprovedAction(
      'draft_message',
      { entityType: 'MESSAGE', entityId: 'email-1' },
      requester
    );

    expect(outcome).toEqual({
      success: false,
      error: 'The email changed while rolling back; nothing was trashed.',
    });
  });

  it('draft_message leaves an email that is no longer a draft alone', async () => {
    const archived = ctx({ draft: { isDraft: false, isArchived: true } });
    const outcome = await compensateApprovedAction(
      'draft_message',
      { entityType: 'MESSAGE', entityId: 'email-1' },
      archived
    );

    expect(outcome).toEqual({ success: false, error: 'The email is no longer a draft.' });
    expect(archived.prisma.emailRecord.updateMany).not.toHaveBeenCalled();
  });

  it('draft_message fails when the draft is not in the tenant', async () => {
    const missing = ctx({ draft: null });
    const outcome = await compensateApprovedAction(
      'draft_message',
      { entityType: 'MESSAGE', entityId: 'email-1' },
      missing
    );

    expect(outcome).toEqual({ success: false, error: 'The email draft was not found.' });
    expect(missing.prisma.emailRecord.updateMany).not.toHaveBeenCalled();
  });

  it('create_case reads the case in the requester tenant', async () => {
    calls.cases.changeStatus.mockResolvedValue({});
    const requester = ctx();

    await compensateApprovedAction(
      'create_case',
      { entityType: 'CASE', entityId: 'case-1' },
      requester
    );

    expect(requester.prisma.case.findFirst).toHaveBeenCalledWith({
      where: { id: 'case-1', tenantId: TENANT },
      select: { status: true },
    });
  });

  it('create_case fails, touching nothing, when the case is not in the tenant', async () => {
    const outcome = await compensateApprovedAction(
      'create_case',
      { entityType: 'CASE', entityId: 'case-1' },
      ctx({ caseStatus: null })
    );

    expect(outcome).toEqual({ success: false, error: 'The case was not found.' });
    expect(calls.cases.changeStatus).not.toHaveBeenCalled();
  });

  it.each([
    ['create_case', 'CASE', { caseStatus: 'CANCELLED' }, { cancelledCaseId: 'x-1' }],
    [
      'create_appointment',
      'APPOINTMENT',
      { appointmentStatus: 'CANCELLED' },
      { cancelledAppointmentId: 'x-1' },
    ],
    ['draft_message', 'MESSAGE', { draft: { isTrashed: true } }, { trashedDraftId: 'x-1' }],
  ])(
    '%s already undone (a retry after an interrupted rollback) succeeds without a second call',
    async (tool, entityType, state, restoredState) => {
      const requester = ctx(state as TargetState);
      const outcome = await compensateApprovedAction(
        tool,
        { entityType, entityId: 'x-1' },
        requester
      );

      expect(outcome).toEqual({ success: true, restoredState });
      expect(calls.cases.changeStatus).not.toHaveBeenCalled();
      expect(calls.appointments.cancel).not.toHaveBeenCalled();
      expect(requester.prisma.emailRecord.updateMany).not.toHaveBeenCalled();
    }
  );

  it('records the undo when the procedure committed and then failed', async () => {
    // appointments.cancel persists the cancellation, then a follow-up read throws.
    const requester = ctx();
    requester.prisma.appointment.findFirst
      .mockResolvedValueOnce({ status: 'SCHEDULED' })
      .mockResolvedValueOnce({ status: 'CANCELLED' });
    calls.appointments.cancel.mockRejectedValue(new Error('Appointment disappeared after cancel'));

    const outcome = await compensateApprovedAction(
      'create_appointment',
      { entityType: 'APPOINTMENT', entityId: 'appt-1' },
      requester
    );

    expect(outcome).toEqual({
      success: true,
      restoredState: { cancelledAppointmentId: 'appt-1' },
    });
  });

  it('reports the failure when the procedure failed and the reconciling read fails too', async () => {
    const requester = ctx();
    requester.prisma.case.findFirst
      .mockResolvedValueOnce({ status: 'OPEN' })
      .mockRejectedValueOnce(new Error('db down'));
    calls.cases.changeStatus.mockRejectedValue(new Error('Cannot transition'));

    const outcome = await compensateApprovedAction(
      'create_case',
      { entityType: 'CASE', entityId: 'case-1' },
      requester
    );

    expect(outcome).toEqual({ success: false, error: 'Cannot transition' });
  });

  it('refuses an action with no compensation, touching nothing', async () => {
    const outcome = await compensateApprovedAction(
      'update_case',
      { entityType: 'CASE', entityId: 'case-1' },
      ctx()
    );

    expect(outcome).toEqual({
      success: false,
      error: '"update_case" actions cannot be rolled back.',
    });
    expect(calls.ctxSeen).toEqual([]);
  });

  it('refuses to run outside a signed-in request', async () => {
    const outcome = await compensateApprovedAction(
      'create_case',
      { entityType: 'CASE', entityId: 'case-1' },
      undefined
    );

    expect(outcome.success).toBe(false);
    expect(calls.cases.changeStatus).not.toHaveBeenCalled();
  });
});
