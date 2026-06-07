/**
 * Inbound Router — logCallBooking tests.
 *
 * Covers:
 *  - 401 when bearer missing or wrong
 *  - 500 when PORTAL_INTERNAL_SECRET / LEANGENCY_TENANT_ID / LEANGENCY_SYSTEM_USER_ID unset
 *  - New email → creates lead + appointment + task + activity (leadCreated: true)
 *  - Known email → dedupes lead (leadCreated: false) but still creates appointment/task/activity
 *  - Idempotent retry — same submissionId returns existing ids (leadCreated: false)
 *  - Best-effort: appointment create failure does not throw; returns appointmentId: null
 *  - Invalid callDate/callTime → 400 BAD_REQUEST
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { inboundRouter } from '../inbound.router';
import { createTestContext, prismaMock, mockServices } from '../../../test/setup';

const TENANT_ID = '00000000-0000-4000-8000-000000000900';
const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000901';
// Test-only constant — clearly labelled so the repo-policy pre-commit
// hook does not flag it as a real key. Length must be >= 16 to satisfy
// the inbound router's PORTAL_INTERNAL_SECRET min-length check.
const SECRET = 'test-bearer-do-not-use-in-production';

function headersWith(value: string | undefined): Headers {
  const h = new Headers();
  if (value !== undefined) h.set('Authorization', value);
  return h;
}

function buildCtx(authHeader: string | undefined) {
  return createTestContext({
    req: { headers: headersWith(authHeader) } as unknown as Request,
  });
}

const BASE_BOOKING_INPUT = {
  submissionId: 'booking_xyz_001',
  email: 'jane@acme.example',
  firstName: 'Jane',
  lastName: 'Doe',
  company: 'Acme Studios',
  phone: '+44 20 7946 0000',
  website: 'https://acme.example',
  location: 'London, UK',
  callDate: '2026-07-15',
  callTime: '10:00',
  durationMinutes: 30,
  notes: 'Looking forward to the call.',
};

const LEAD_ID = 'lead_booking_test_1';
const APPOINTMENT_ID = 'appt_booking_test_1';
const TASK_ID = 'task_booking_test_1';

describe('inboundRouter — logCallBooking', () => {
  beforeEach(() => {
    vi.stubEnv('PORTAL_INTERNAL_SECRET', SECRET);
    vi.stubEnv('LEANGENCY_TENANT_ID', TENANT_ID);
    vi.stubEnv('LEANGENCY_SYSTEM_USER_ID', SYSTEM_USER_ID);
  });

  // ── auth / env guards ──────────────────────────────────────────────────────

  it('returns 401 when Authorization header is missing', async () => {
    const caller = inboundRouter.createCaller(buildCtx(undefined) as never);
    await expect(caller.logCallBooking(BASE_BOOKING_INPUT)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('returns 401 when bearer token does not match', async () => {
    const caller = inboundRouter.createCaller(buildCtx('Bearer wrong-token') as never);
    await expect(caller.logCallBooking(BASE_BOOKING_INPUT)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('returns 500 when PORTAL_INTERNAL_SECRET is unset', async () => {
    vi.stubEnv('PORTAL_INTERNAL_SECRET', '');
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await expect(caller.logCallBooking(BASE_BOOKING_INPUT)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  it('returns 500 when LEANGENCY_TENANT_ID is unset', async () => {
    vi.stubEnv('LEANGENCY_TENANT_ID', '');
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await expect(caller.logCallBooking(BASE_BOOKING_INPUT)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  it('returns 500 when LEANGENCY_SYSTEM_USER_ID is unset', async () => {
    vi.stubEnv('LEANGENCY_SYSTEM_USER_ID', '');
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await expect(caller.logCallBooking(BASE_BOOKING_INPUT)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  // ── new email — creates lead + artifacts ──────────────────────────────────

  it('creates lead + appointment + task + activity for a new email', async () => {
    // Lead dedup: not found by email
    prismaMock.lead.findFirst.mockResolvedValueOnce(null);
    // Lead create succeeds
    (mockServices.lead.createLead as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      isFailure: false,
      value: { id: { value: LEAD_ID } },
    });
    // Idempotency check: no existing appointment
    prismaMock.appointment.findFirst.mockResolvedValueOnce(null);
    // Appointment create
    prismaMock.appointment.create.mockResolvedValueOnce({ id: APPOINTMENT_ID } as never);
    // Task create
    prismaMock.task.create.mockResolvedValueOnce({ id: TASK_ID } as never);
    // LeadActivity create
    prismaMock.leadActivity.create.mockResolvedValueOnce({} as never);

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.logCallBooking(BASE_BOOKING_INPUT);

    expect(result).toEqual({
      leadId: LEAD_ID,
      tenantId: TENANT_ID,
      submissionId: BASE_BOOKING_INPUT.submissionId,
      leadCreated: true,
      appointmentId: APPOINTMENT_ID,
      taskId: TASK_ID,
    });

    // Verify lead was created with correct tags
    const createLeadCall = (mockServices.lead.createLead as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(createLeadCall).toMatchObject({
      email: BASE_BOOKING_INPUT.email,
      firstName: 'Jane',
      lastName: 'Doe',
      company: 'Acme Studios',
      source: 'WEBSITE',
      ownerId: SYSTEM_USER_ID,
      tenantId: TENANT_ID,
    });
    expect(createLeadCall.tags).toEqual(
      expect.arrayContaining([
        'portal-discover',
        'portal-call-booking',
        `booking:${BASE_BOOKING_INPUT.submissionId}`,
      ])
    );

    // Verify appointment was created with idempotency key
    expect(prismaMock.appointment.create).toHaveBeenCalledOnce();
    const apptData = prismaMock.appointment.create.mock.calls[0][0].data;
    expect(apptData.externalCalendarId).toBe(`booking:${BASE_BOOKING_INPUT.submissionId}`);
    expect(apptData.tenantId).toBe(TENANT_ID);
    expect(apptData.organizerId).toBe(SYSTEM_USER_ID);
    expect(apptData.appointmentType).toBe('CALL');

    // Verify task was created linked to the lead
    expect(prismaMock.task.create).toHaveBeenCalledOnce();
    const taskData = prismaMock.task.create.mock.calls[0][0].data;
    expect(taskData.leadId).toBe(LEAD_ID);
    expect(taskData.tenantId).toBe(TENANT_ID);
    expect(taskData.ownerId).toBe(SYSTEM_USER_ID);
    expect(taskData.priority).toBe('HIGH');
    expect(taskData.status).toBe('PENDING');

    // Verify LeadActivity was created
    expect(prismaMock.leadActivity.create).toHaveBeenCalledOnce();
    const actData = prismaMock.leadActivity.create.mock.calls[0][0].data;
    expect(actData.leadId).toBe(LEAD_ID);
    expect(actData.tenantId).toBe(TENANT_ID);
    expect(actData.type).toBe('MEETING');
    expect(actData.metadata).toMatchObject({
      source: 'discovery-call-booking',
      submissionId: BASE_BOOKING_INPUT.submissionId,
    });
  });

  // ── known email — dedupes lead, still attaches artifacts ──────────────────

  it('dedupes lead (leadCreated: false) but still creates appointment/task for known email', async () => {
    // Lead found by email
    prismaMock.lead.findFirst.mockResolvedValueOnce({ id: LEAD_ID } as never);
    // Idempotency check: no existing appointment
    prismaMock.appointment.findFirst.mockResolvedValueOnce(null);
    // Appointment create
    prismaMock.appointment.create.mockResolvedValueOnce({ id: APPOINTMENT_ID } as never);
    // Task create
    prismaMock.task.create.mockResolvedValueOnce({ id: TASK_ID } as never);
    // LeadActivity create
    prismaMock.leadActivity.create.mockResolvedValueOnce({} as never);

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.logCallBooking(BASE_BOOKING_INPUT);

    expect(result).toMatchObject({
      leadId: LEAD_ID,
      leadCreated: false,
      appointmentId: APPOINTMENT_ID,
      taskId: TASK_ID,
    });

    // Lead service must NOT have been called (we found the lead directly)
    expect(mockServices.lead.createLead).not.toHaveBeenCalled();
    expect(prismaMock.appointment.create).toHaveBeenCalledOnce();
    expect(prismaMock.task.create).toHaveBeenCalledOnce();
    expect(prismaMock.leadActivity.create).toHaveBeenCalledOnce();
  });

  // ── idempotent retry ───────────────────────────────────────────────────────

  it('is idempotent — second call with same submissionId returns existing appointment', async () => {
    // Lead found by email
    prismaMock.lead.findFirst.mockResolvedValueOnce({ id: LEAD_ID } as never);
    // Idempotency: appointment already exists
    prismaMock.appointment.findFirst.mockResolvedValueOnce({ id: APPOINTMENT_ID } as never);
    // Task lookup for companion task
    prismaMock.task.findFirst.mockResolvedValueOnce({ id: TASK_ID } as never);

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.logCallBooking(BASE_BOOKING_INPUT);

    expect(result).toEqual({
      leadId: LEAD_ID,
      tenantId: TENANT_ID,
      submissionId: BASE_BOOKING_INPUT.submissionId,
      leadCreated: false,
      appointmentId: APPOINTMENT_ID,
      taskId: TASK_ID,
    });

    // Must NOT create anything on retry
    expect(mockServices.lead.createLead).not.toHaveBeenCalled();
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
    expect(prismaMock.task.create).not.toHaveBeenCalled();
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
  });

  // ── best-effort: appointment create failure ────────────────────────────────

  it('returns appointmentId: null when appointment create fails (best-effort)', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce({ id: LEAD_ID } as never);
    prismaMock.appointment.findFirst.mockResolvedValueOnce(null);
    prismaMock.appointment.create.mockRejectedValueOnce(new Error('DB error'));
    prismaMock.task.create.mockResolvedValueOnce({ id: TASK_ID } as never);
    prismaMock.leadActivity.create.mockResolvedValueOnce({} as never);

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.logCallBooking(BASE_BOOKING_INPUT);

    expect(result).toMatchObject({
      leadId: LEAD_ID,
      leadCreated: false,
      appointmentId: null,
      taskId: TASK_ID,
    });
  });

  // ── invalid callDate/callTime ──────────────────────────────────────────────

  it('returns 400 for an invalid callDate/callTime', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce({ id: LEAD_ID } as never);

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await expect(
      caller.logCallBooking({ ...BASE_BOOKING_INPUT, callDate: 'not-a-date', callTime: 'xx:yy' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  // ── extraTags are attached to the lead ────────────────────────────────────

  it('passes extraTags through to the lead tags', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce(null);
    (mockServices.lead.createLead as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      isFailure: false,
      value: { id: { value: LEAD_ID } },
    });
    prismaMock.appointment.findFirst.mockResolvedValueOnce(null);
    prismaMock.appointment.create.mockResolvedValueOnce({ id: APPOINTMENT_ID } as never);
    prismaMock.task.create.mockResolvedValueOnce({ id: TASK_ID } as never);
    prismaMock.leadActivity.create.mockResolvedValueOnce({} as never);

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await caller.logCallBooking({
      ...BASE_BOOKING_INPUT,
      extraTags: ['campaign:summer-2026', 'vip'],
    });

    const call = (mockServices.lead.createLead as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.tags).toEqual(
      expect.arrayContaining(['campaign:summer-2026', 'vip', 'portal-call-booking'])
    );
  });
});
