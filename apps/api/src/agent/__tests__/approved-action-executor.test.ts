/**
 * Approved-action executor (PG-198 RF-1, #853): approved agent actions run for
 * real through the target module's own tRPC procedures on the approver's ctx.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

const calls = vi.hoisted(() => ({
  cases: { create: vi.fn(), update: vi.fn(), changeStatus: vi.fn() },
  appointments: { create: vi.fn(), update: vi.fn(), reschedule: vi.fn() },
  email: { saveDraft: vi.fn() },
  lead: { addNote: vi.fn() },
  contact: { addNote: vi.fn() },
  ctxSeen: [] as unknown[],
}));

function routerMock(name: keyof typeof calls, exportName: string) {
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
vi.mock('../../modules/lead/lead.router', () => routerMock('lead', 'leadRouter'));
vi.mock('../../modules/contact/contact.router', () => routerMock('contact', 'contactRouter'));

import {
  executeApprovedAction,
  prepareExecutionInput,
  ApprovalInputError,
  IMMUTABLE_INPUT_FIELDS,
} from '../approved-action-executor';

const TENANT = 'tenant-1';

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    user: { userId: 'approver-1', tenantId: TENANT, role: 'MANAGER', email: 'm@example.invalid' },
    prisma: {
      lead: { findFirst: vi.fn().mockResolvedValue({ email: 'lead@example.invalid' }) },
      contact: { findFirst: vi.fn().mockResolvedValue({ email: 'contact@example.invalid' }) },
      // Default: every proposed user / case is in the tenant (count echoes the ids asked for).
      user: { count: vi.fn(async (args: any) => args.where.id.in.length) },
      case: { count: vi.fn(async (args: any) => args.where.id.in.length) },
      appointment: { findFirst: vi.fn().mockResolvedValue({ id: 'appt-1' }) },
    },
    ...overrides,
  } as any;
}

beforeEach(() => {
  calls.ctxSeen.length = 0;
  for (const group of [calls.cases, calls.appointments, calls.email, calls.lead, calls.contact]) {
    for (const fn of Object.values(group)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
});

describe('executeApprovedAction', () => {
  it('create_case runs cases.create on the approver ctx and returns the new id', async () => {
    calls.cases.create.mockResolvedValue({ id: 'case-9' });
    const approver = ctx();
    const outcome = await executeApprovedAction(
      'create_case',
      { title: 'T', priority: 'HIGH', clientId: 'client-1', ignored: 'x' },
      approver
    );
    expect(outcome).toEqual({
      status: 'SUCCEEDED',
      result: { entityType: 'CASE', entityId: 'case-9' },
    });
    // No assignee proposed and no requester known: the approver is assigned.
    expect(calls.cases.create).toHaveBeenCalledWith({
      title: 'T',
      priority: 'HIGH',
      clientId: 'client-1',
      assignedTo: 'approver-1',
    });
    expect(calls.ctxSeen).toEqual([approver]);
  });

  it('create_case defaults the assignee to the requester, as the preview showed it', async () => {
    calls.cases.create.mockResolvedValue({ id: 'case-11' });
    await executeApprovedAction('create_case', { title: 'T', clientId: 'client-1' }, ctx(), {
      requesterId: 'requester-3',
    });
    expect(calls.cases.create).toHaveBeenCalledWith(
      expect.objectContaining({ assignedTo: 'requester-3' })
    );
  });

  it('create_case keeps the proposed assignee', async () => {
    calls.cases.create.mockResolvedValue({ id: 'case-10' });
    await executeApprovedAction(
      'create_case',
      { title: 'T', clientId: 'client-1', assignedTo: 'rep-7' },
      ctx()
    );
    expect(calls.cases.create).toHaveBeenCalledWith(
      expect.objectContaining({ assignedTo: 'rep-7' })
    );
  });

  it('update_case updates fields and changes status separately', async () => {
    const outcome = await executeApprovedAction(
      'update_case',
      { id: 'case-1', title: 'New', status: 'CLOSED' },
      ctx()
    );
    expect(calls.cases.update).toHaveBeenCalledWith({ id: 'case-1', title: 'New' });
    expect(calls.cases.changeStatus).toHaveBeenCalledWith({ caseId: 'case-1', status: 'CLOSED' });
    expect(outcome.result).toEqual({ entityType: 'CASE', entityId: 'case-1' });
  });

  it('update_case changes status before fields, so a refused transition writes nothing', async () => {
    calls.cases.changeStatus.mockRejectedValue(new Error('Cannot transition from CLOSED to OPEN'));
    const outcome = await executeApprovedAction(
      'update_case',
      { id: 'case-1', title: 'New', status: 'OPEN' },
      ctx()
    );
    expect(outcome).toEqual({ status: 'FAILED', error: 'Cannot transition from CLOSED to OPEN' });
    expect(calls.cases.update).not.toHaveBeenCalled();
  });

  it('update_case reports exactly what applied when the field update fails afterwards', async () => {
    calls.cases.update.mockRejectedValue(new Error('Case not found'));
    const outcome = await executeApprovedAction(
      'update_case',
      { id: 'case-1', title: 'New', status: 'CLOSED' },
      ctx()
    );
    expect(outcome.error).toBe(
      'Status changed to CLOSED, but the other changes were not applied: Case not found'
    );
  });

  it('update_case with only fields surfaces a field-update error unchanged', async () => {
    calls.cases.update.mockRejectedValue(new Error('Case not found'));
    const outcome = await executeApprovedAction('update_case', { id: 'case-1', title: 'N' }, ctx());
    expect(outcome.error).toBe('Case not found');
  });

  it('update_appointment reschedules first, so a conflict writes nothing', async () => {
    calls.appointments.reschedule.mockRejectedValue(new Error('Scheduling conflict'));
    const start = new Date('2026-10-15T10:00:00Z');
    const outcome = await executeApprovedAction(
      'update_appointment',
      { id: 'appt-1', title: 'T', startTime: start, endTime: start },
      ctx()
    );
    expect(outcome.error).toBe('Scheduling conflict');
    expect(calls.appointments.update).not.toHaveBeenCalled();
  });

  it('create_appointment surfaces a firm-availability rejection as a failed execution (PG-202)', async () => {
    const { TRPCError } = await import('@trpc/server');
    calls.appointments.create.mockRejectedValue(
      new TRPCError({ code: 'BAD_REQUEST', message: 'The firm is closed on 2026-12-24.' })
    );
    const start = new Date('2026-12-24T10:00:00Z');
    const outcome = await executeApprovedAction(
      'create_appointment',
      {
        title: 'T',
        startTime: start,
        endTime: new Date('2026-12-24T11:00:00Z'),
        appointmentType: 'MEETING',
      },
      ctx()
    );
    expect(outcome.error).toBe('The firm is closed on 2026-12-24.');
  });

  it('update_appointment surfaces a firm-availability rejection on reschedule (PG-202)', async () => {
    const { TRPCError } = await import('@trpc/server');
    calls.appointments.reschedule.mockRejectedValue(
      new TRPCError({
        code: 'BAD_REQUEST',
        message: 'The daily booking limit for 2026-10-15 has been reached.',
      })
    );
    const start = new Date('2026-10-15T10:00:00Z');
    const outcome = await executeApprovedAction(
      'update_appointment',
      { id: 'appt-1', startTime: start, endTime: new Date('2026-10-15T11:00:00Z') },
      ctx()
    );
    expect(outcome.error).toBe('The daily booking limit for 2026-10-15 has been reached.');
    expect(calls.appointments.update).not.toHaveBeenCalled();
  });

  it('update_appointment reports a partial write honestly', async () => {
    calls.appointments.update.mockRejectedValue('nope');
    const start = new Date('2026-10-15T10:00:00Z');
    const outcome = await executeApprovedAction(
      'update_appointment',
      { id: 'appt-1', title: 'T', startTime: start, endTime: start },
      ctx()
    );
    expect(outcome.error).toBe(
      'Rescheduled, but the other changes were not applied: unknown error'
    );
  });

  it.each([
    ['update_case', { id: 'case-1' }],
    ['update_appointment', { id: 'appt-1' }],
  ])('%s with nothing to change fails instead of reporting success', async (tool, input) => {
    const outcome = await executeApprovedAction(tool, input, ctx());
    expect(outcome).toEqual({
      status: 'FAILED',
      error: 'The approved update has no changes to apply.',
    });
    expect(calls.cases.update).not.toHaveBeenCalled();
    expect(calls.appointments.update).not.toHaveBeenCalled();
  });

  it('update_case with only a status skips the field update', async () => {
    await executeApprovedAction('update_case', { id: 'case-1', status: 'ON_HOLD' }, ctx());
    expect(calls.cases.update).not.toHaveBeenCalled();
    expect(calls.cases.changeStatus).toHaveBeenCalled();
  });

  it('create_appointment runs appointments.create with the requester kept as an attendee', async () => {
    calls.appointments.create.mockResolvedValue({ id: 'appt-1' });
    const start = new Date('2026-10-14T10:00:00Z');
    const end = new Date('2026-10-14T11:00:00Z');
    const outcome = await executeApprovedAction(
      'create_appointment',
      {
        title: 'Call',
        startTime: start,
        endTime: end,
        appointmentType: 'CALL',
        attendeeIds: ['u-2'],
      },
      ctx(),
      { requesterId: 'requester-1' }
    );
    expect(calls.appointments.create).toHaveBeenCalledWith({
      title: 'Call',
      startTime: start,
      endTime: end,
      appointmentType: 'CALL',
      attendeeIds: ['requester-1', 'u-2'],
    });
    expect(outcome.result).toEqual({ entityType: 'APPOINTMENT', entityId: 'appt-1' });
  });

  it('create_appointment does not duplicate the requester or invent attendees', async () => {
    calls.appointments.create.mockResolvedValue({ id: 'appt-2' });
    await executeApprovedAction(
      'create_appointment',
      { title: 'A', attendeeIds: ['requester-1'] },
      ctx(),
      { requesterId: 'requester-1' }
    );
    expect(calls.appointments.create.mock.calls[0]![0].attendeeIds).toEqual(['requester-1']);
    await executeApprovedAction('create_appointment', { title: 'B' }, ctx());
    expect(calls.appointments.create.mock.calls[1]![0].attendeeIds).toEqual([]);
  });

  it('update_appointment updates fields and reschedules when both times change', async () => {
    const start = new Date('2026-10-15T10:00:00Z');
    const end = new Date('2026-10-15T11:00:00Z');
    await executeApprovedAction(
      'update_appointment',
      { id: 'appt-1', notes: 'n', startTime: start, endTime: end },
      ctx()
    );
    expect(calls.appointments.update).toHaveBeenCalledWith({ id: 'appt-1', notes: 'n' });
    expect(calls.appointments.reschedule).toHaveBeenCalledWith({
      id: 'appt-1',
      newStartTime: start,
      newEndTime: end,
    });
  });

  it('update_appointment with only the times reschedules without a field update', async () => {
    const start = new Date('2026-10-15T10:00:00Z');
    await executeApprovedAction(
      'update_appointment',
      { id: 'appt-1', startTime: start, endTime: start },
      ctx()
    );
    expect(calls.appointments.update).not.toHaveBeenCalled();
    expect(calls.appointments.reschedule).toHaveBeenCalled();
  });

  it('update_appointment with only one of the times fails without writing', async () => {
    const outcome = await executeApprovedAction(
      'update_appointment',
      { id: 'appt-1', startTime: new Date() },
      ctx()
    );
    expect(outcome).toEqual({
      status: 'FAILED',
      error: 'Rescheduling needs both a start and an end time.',
    });
    expect(calls.appointments.update).not.toHaveBeenCalled();
  });

  it('draft_message EMAIL to a lead saves a draft (never sends), escaping the body', async () => {
    calls.email.saveDraft.mockResolvedValue({ id: 'draft-1', status: 'DRAFT' });
    const approver = ctx();
    const outcome = await executeApprovedAction(
      'draft_message',
      {
        type: 'EMAIL',
        recipientType: 'LEAD',
        recipientId: 'lead-1',
        subject: 'Hi',
        body: 'a<b>\nc&d',
      },
      approver
    );
    expect(approver.prisma.lead.findFirst).toHaveBeenCalledWith({
      where: { id: 'lead-1', tenantId: TENANT },
      select: { email: true },
    });
    expect(calls.email.saveDraft).toHaveBeenCalledWith({
      to: ['lead@example.invalid'],
      subject: 'Hi',
      textBody: 'a<b>\nc&d',
      htmlBody: 'a&lt;b&gt;<br>c&amp;d',
    });
    expect(outcome.result).toMatchObject({ entityType: 'MESSAGE', entityId: 'draft-1' });
    expect(outcome.result?.detail).toMatch(/not sent/);
  });

  it('draft_message EMAIL to a contact looks up the contact email in the tenant', async () => {
    calls.email.saveDraft.mockResolvedValue({ id: 'draft-2', status: 'DRAFT' });
    const approver = ctx();
    await executeApprovedAction(
      'draft_message',
      { type: 'EMAIL', recipientType: 'CONTACT', recipientId: 'c-1', body: 'x' },
      approver
    );
    expect(approver.prisma.contact.findFirst).toHaveBeenCalledWith({
      where: { id: 'c-1', tenantId: TENANT },
      select: { email: true },
    });
  });

  it.each([
    [
      'an account recipient',
      { type: 'EMAIL', recipientType: 'ACCOUNT', recipientId: 'a-1', body: 'x' },
      /Accounts have no email/,
    ],
    [
      'an SMS',
      { type: 'SMS', recipientType: 'LEAD', recipientId: 'l-1', body: 'x' },
      /No SMS channel/,
    ],
    [
      'a note on an account',
      { type: 'NOTE', recipientType: 'ACCOUNT', recipientId: 'a-1', body: 'x' },
      /leads and contacts only/,
    ],
  ])('draft_message fails explicitly for %s', async (_label, input, error) => {
    const outcome = await executeApprovedAction('draft_message', input, ctx());
    expect(outcome.status).toBe('FAILED');
    expect(outcome.error).toMatch(error);
    expect(calls.email.saveDraft).not.toHaveBeenCalled();
  });

  it('draft_message EMAIL fails when the recipient has no email (or is in another tenant)', async () => {
    const approver = ctx();
    approver.prisma.lead.findFirst.mockResolvedValue(null);
    const outcome = await executeApprovedAction(
      'draft_message',
      { type: 'EMAIL', recipientType: 'LEAD', recipientId: 'foreign', body: 'x' },
      approver
    );
    expect(outcome).toEqual({ status: 'FAILED', error: 'The lead has no email address.' });
  });

  it('draft_message EMAIL fails when the session has no tenant', async () => {
    const approver = ctx({ user: { userId: 'u', role: 'ADMIN' } });
    const outcome = await executeApprovedAction(
      'draft_message',
      { type: 'EMAIL', recipientType: 'LEAD', recipientId: 'l', body: 'x' },
      approver
    );
    expect(outcome.error).toBe('No tenant on the approving session.');
  });

  it('draft_message NOTE scheduled for later fails instead of being written now', async () => {
    const outcome = await executeApprovedAction(
      'draft_message',
      {
        type: 'NOTE',
        recipientType: 'LEAD',
        recipientId: 'l-1',
        body: 'later',
        scheduledFor: new Date(Date.now() + 3_600_000),
      },
      ctx()
    );
    expect(outcome).toEqual({
      status: 'FAILED',
      error: 'Scheduled notes are not supported; nothing was written.',
    });
    expect(calls.lead.addNote).not.toHaveBeenCalled();
  });

  it('draft_message NOTE with a past scheduledFor is written', async () => {
    await executeApprovedAction(
      'draft_message',
      {
        type: 'NOTE',
        recipientType: 'LEAD',
        recipientId: 'l-1',
        body: 'now',
        scheduledFor: new Date(0),
      },
      ctx()
    );
    expect(calls.lead.addNote).toHaveBeenCalled();
  });

  it('draft_message NOTE refuses a recipient outside the approving tenant', async () => {
    const approver = ctx();
    approver.prisma.contact.findFirst.mockResolvedValue(null);
    const outcome = await executeApprovedAction(
      'draft_message',
      { type: 'NOTE', recipientType: 'CONTACT', recipientId: 'foreign', body: 'x' },
      approver
    );
    expect(outcome).toEqual({ status: 'FAILED', error: 'The contact was not found.' });
    expect(approver.prisma.contact.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', tenantId: TENANT },
      select: { id: true },
    });
    expect(calls.contact.addNote).not.toHaveBeenCalled();
  });

  it('draft_message NOTE needs a tenant on the approving session', async () => {
    const outcome = await executeApprovedAction(
      'draft_message',
      { type: 'NOTE', recipientType: 'LEAD', recipientId: 'l', body: 'x' },
      ctx({ user: { userId: 'u', role: 'ADMIN' } })
    );
    expect(outcome.error).toBe('No tenant on the approving session.');
  });

  it('draft_message NOTE adds a note to a lead or a contact', async () => {
    await executeApprovedAction(
      'draft_message',
      { type: 'NOTE', recipientType: 'LEAD', recipientId: 'l-1', body: 'hello' },
      ctx()
    );
    expect(calls.lead.addNote).toHaveBeenCalledWith({ leadId: 'l-1', content: 'hello' });
    const outcome = await executeApprovedAction(
      'draft_message',
      { type: 'NOTE', recipientType: 'CONTACT', recipientId: 'c-1', body: 'hi' },
      ctx()
    );
    expect(calls.contact.addNote).toHaveBeenCalledWith({ contactId: 'c-1', content: 'hi' });
    expect(outcome.result).toEqual({
      entityType: 'CONTACT',
      entityId: 'c-1',
      detail: 'Note added.',
    });
  });

  it('a procedure error (e.g. FORBIDDEN for the approver) is FAILED with that message', async () => {
    calls.cases.create.mockRejectedValue(new Error('You do not have access to the Legal module'));
    const outcome = await executeApprovedAction(
      'create_case',
      { title: 'T', clientId: 'c' },
      ctx()
    );
    expect(outcome).toEqual({
      status: 'FAILED',
      error: 'You do not have access to the Legal module',
    });
  });

  it('a non-Error rejection still reports a failure', async () => {
    calls.cases.create.mockRejectedValue('boom');
    const outcome = await executeApprovedAction(
      'create_case',
      { title: 'T', clientId: 'c' },
      ctx()
    );
    expect(outcome).toEqual({ status: 'FAILED', error: 'Execution failed' });
  });

  it('never executes without a signed-in request context', async () => {
    const outcome = await executeApprovedAction('create_case', { title: 'T' }, undefined);
    expect(outcome.status).toBe('FAILED');
    expect(outcome.error).toMatch(/signed-in request/);
    expect(calls.cases.create).not.toHaveBeenCalled();
    const noUser = await executeApprovedAction('create_case', { title: 'T' }, {
      user: null,
    } as any);
    expect(noUser.status).toBe('FAILED');
  });

  it('refuses a tool without an executor', async () => {
    const outcome = await executeApprovedAction('search_leads', {}, ctx());
    expect(outcome).toEqual({ status: 'FAILED', error: 'No executor exists for "search_leads".' });
  });
});

describe('agent-proposed ids must belong to the approving tenant (#880, #890)', () => {
  it('update_case refuses an assignee outside the workspace, writing nothing', async () => {
    const approver = ctx();
    approver.prisma.user.count.mockResolvedValue(0);
    const outcome = await executeApprovedAction(
      'update_case',
      { id: 'case-1', assignedTo: 'foreign-user', status: 'CLOSED' },
      approver
    );
    expect(outcome).toMatchObject({
      status: 'FAILED',
      error: 'The assignee must be users of this workspace.',
    });
    expect(approver.prisma.user.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: { in: ['foreign-user'] } }),
    });
    expect(calls.cases.changeStatus).not.toHaveBeenCalled();
    expect(calls.cases.update).not.toHaveBeenCalled();
  });

  it('create_appointment refuses a foreign attendee or linked case before creating', async () => {
    const foreignUser = ctx();
    foreignUser.prisma.user.count.mockResolvedValue(1); // requester found, u-2 not
    const a = await executeApprovedAction(
      'create_appointment',
      { title: 'Call', attendeeIds: ['u-2'] },
      foreignUser,
      { requesterId: 'requester-1' }
    );
    expect(a).toMatchObject({
      status: 'FAILED',
      error: 'The attendees must be users of this workspace.',
    });

    const foreignCase = ctx();
    foreignCase.prisma.case.count.mockResolvedValue(0);
    const b = await executeApprovedAction(
      'create_appointment',
      { title: 'Call', linkedCaseIds: ['case-x', 7] },
      foreignCase
    );
    expect(b).toMatchObject({ status: 'FAILED', error: 'A linked case was not found.' });
    expect(foreignCase.prisma.case.count).toHaveBeenCalledWith({
      where: { id: { in: ['case-x'] }, tenantId: TENANT },
    });
    expect(calls.appointments.create).not.toHaveBeenCalled();
  });

  it('update_appointment refuses an appointment of another tenant, writing nothing', async () => {
    const approver = ctx();
    approver.prisma.appointment.findFirst.mockResolvedValue(null);
    const outcome = await executeApprovedAction(
      'update_appointment',
      { id: 'appt-foreign', title: 'Renamed' },
      approver
    );
    expect(outcome).toMatchObject({ status: 'FAILED', error: 'The appointment was not found.' });
    expect(approver.prisma.appointment.findFirst).toHaveBeenCalledWith({
      where: { id: 'appt-foreign', tenantId: TENANT },
      select: { id: true },
    });
    expect(calls.appointments.update).not.toHaveBeenCalled();
    expect(calls.appointments.reschedule).not.toHaveBeenCalled();
  });

  it('the checks need a tenant on the approving session', async () => {
    const outcome = await executeApprovedAction(
      'update_appointment',
      { id: 'appt-1', title: 'x' },
      ctx({ user: { userId: 'approver-1', role: 'MANAGER', email: 'm@example.invalid' } })
    );
    expect(outcome).toMatchObject({
      status: 'FAILED',
      error: 'No tenant on the approving session.',
    });
  });
});

describe('prepareExecutionInput', () => {
  const schema = z.object({ id: z.string(), title: z.string().min(1).optional() });

  it('returns the original input re-validated when nothing was modified', () => {
    expect(prepareExecutionInput('update_case', schema, { id: 'c1', title: 'A' })).toEqual({
      id: 'c1',
      title: 'A',
    });
  });

  it('merges the approver modifications over the original', () => {
    expect(
      prepareExecutionInput('update_case', schema, { id: 'c1', title: 'A' }, { title: 'B' })
    ).toEqual({ id: 'c1', title: 'B' });
  });

  it('allows an immutable field when it is unchanged', () => {
    expect(
      prepareExecutionInput('update_case', schema, { id: 'c1' }, { id: 'c1', title: 'B' })
    ).toEqual({ id: 'c1', title: 'B' });
  });

  it('rejects a change to an immutable field', () => {
    expect(() =>
      prepareExecutionInput('update_case', schema, { id: 'c1' }, { id: 'other' })
    ).toThrow(ApprovalInputError);
    expect(IMMUTABLE_INPUT_FIELDS.draft_message).toEqual(['recipientType', 'recipientId']);
  });

  it('rejects input the tool schema does not accept', () => {
    expect(() => prepareExecutionInput('update_case', schema, { id: 'c1' }, { title: '' })).toThrow(
      /not valid for update_case/
    );
  });

  it('tools without immutable fields accept any valid modification', () => {
    const s = z.object({ title: z.string() });
    expect(prepareExecutionInput('create_appointment', s, { title: 'a' }, { title: 'b' })).toEqual({
      title: 'b',
    });
  });

  it('refuses a note longer than the note procedures accept (before any claim)', () => {
    const passthrough = { safeParse: (v: unknown) => ({ success: true, data: v }) };
    const note = { type: 'NOTE', recipientType: 'LEAD', recipientId: 'l', body: 'x'.repeat(5001) };
    expect(() => prepareExecutionInput('draft_message', passthrough, note)).toThrow(
      'A note can be at most 5000 characters.'
    );
    expect(
      prepareExecutionInput('draft_message', passthrough, { ...note, body: 'x'.repeat(5000) })
    ).toMatchObject({ type: 'NOTE' });
    expect(
      prepareExecutionInput('draft_message', passthrough, { ...note, type: 'EMAIL' })
    ).toMatchObject({ type: 'EMAIL' });
  });

  it('falls back to a generic message when the schema reports no error', () => {
    const silent = { safeParse: () => ({ success: false }) };
    expect(() => prepareExecutionInput('create_case', silent, {})).toThrow(/invalid input/);
  });
});
