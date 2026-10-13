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
    expect(calls.cases.create).toHaveBeenCalledWith({
      title: 'T',
      priority: 'HIGH',
      clientId: 'client-1',
    });
    expect(calls.ctxSeen).toEqual([approver]);
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

  it('update_case with only a status skips the field update', async () => {
    await executeApprovedAction('update_case', { id: 'case-1', status: 'ON_HOLD' }, ctx());
    expect(calls.cases.update).not.toHaveBeenCalled();
    expect(calls.cases.changeStatus).toHaveBeenCalled();
  });

  it('create_appointment runs appointments.create', async () => {
    calls.appointments.create.mockResolvedValue({ id: 'appt-1' });
    const start = new Date('2026-10-14T10:00:00Z');
    const end = new Date('2026-10-14T11:00:00Z');
    const outcome = await executeApprovedAction(
      'create_appointment',
      { title: 'Call', startTime: start, endTime: end, appointmentType: 'CALL', attendeeIds: [] },
      ctx()
    );
    expect(calls.appointments.create).toHaveBeenCalledWith({
      title: 'Call',
      startTime: start,
      endTime: end,
      appointmentType: 'CALL',
      attendeeIds: [],
    });
    expect(outcome.result).toEqual({ entityType: 'APPOINTMENT', entityId: 'appt-1' });
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

  it('falls back to a generic message when the schema reports no error', () => {
    const silent = { safeParse: () => ({ success: false }) };
    expect(() => prepareExecutionInput('create_case', silent, {})).toThrow(/invalid input/);
  });
});
