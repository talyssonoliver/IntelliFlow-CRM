/**
 * Approved-action compensator (PG-198 RF-4, #856): rolling back an approved agent
 * action undoes it for real through the target module's own tRPC procedures on the
 * requester's ctx — and only for the actions that have a safe compensation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  cases: { changeStatus: vi.fn() },
  appointments: { cancel: vi.fn() },
  email: { processEmail: vi.fn() },
  ctxSeen: [] as unknown[],
}));

function routerMock(name: 'cases' | 'appointments' | 'email', exportName: string) {
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
vi.mock('../../modules/email/inbound.router', () => routerMock('email', 'inboundEmailRouter'));

import { canCompensate, compensateApprovedAction } from '../approved-action-compensator';

const TENANT = 'tenant-1';

function ctx(draftMetadata: Record<string, unknown> | null = { isDraft: true }) {
  return {
    user: { userId: 'requester-1', tenantId: TENANT, role: 'MANAGER' },
    prisma: {
      emailRecord: {
        findFirst: vi
          .fn()
          .mockResolvedValue(draftMetadata === null ? null : { metadata: draftMetadata }),
      },
    },
  } as any;
}

beforeEach(() => {
  calls.ctxSeen.length = 0;
  for (const group of [calls.cases, calls.appointments, calls.email]) {
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
    calls.email.processEmail.mockResolvedValue({ success: true });
    const requester = ctx({ isDraft: true });

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
    expect(calls.email.processEmail).toHaveBeenCalledWith({
      emailId: 'email-1',
      action: 'delete',
    });
  });

  it('draft_message leaves an email that is no longer a draft alone', async () => {
    const outcome = await compensateApprovedAction(
      'draft_message',
      { entityType: 'MESSAGE', entityId: 'email-1' },
      ctx({ isDraft: false, isTrashed: true })
    );

    expect(outcome).toEqual({ success: false, error: 'The email is no longer a draft.' });
    expect(calls.email.processEmail).not.toHaveBeenCalled();
  });

  it('draft_message fails when the draft is not in the tenant', async () => {
    const outcome = await compensateApprovedAction(
      'draft_message',
      { entityType: 'MESSAGE', entityId: 'email-1' },
      ctx(null)
    );

    expect(outcome).toEqual({ success: false, error: 'The email draft was not found.' });
    expect(calls.email.processEmail).not.toHaveBeenCalled();
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
