/**
 * PG-203 — publicBooking router: the first unauthenticated write (ADR-083).
 *
 * Covers AC-011..AC-020 and the runner's R1-R7 at unit level. `$transaction`
 * runs its callback against prismaMock, so calls inside the booking transaction
 * are recorded on the same delegates. The clock is pinned (Date only), and the
 * detached post-commit work is awaited with vi.waitFor.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { publicBookingRouter } from '../public-booking.router';
import { bookingSlotsLimiter } from '../booking-abuse';
import { prismaMock, createPublicContext } from '../../../test/setup';
import { h, prismaError, weekdayRanges, dateOnly } from './availability.test-utils';

vi.mock('../../legal/appointment-side-effects', () => ({
  onAppointmentCreated: vi.fn(async () => undefined),
}));
vi.mock('../../lead/lead-scoring-enqueue', () => ({
  enqueueLeadScoring: vi.fn(async () => undefined),
}));
import { onAppointmentCreated } from '../../legal/appointment-side-effects';
import { enqueueLeadScoring } from '../../lead/lead-scoring-enqueue';

const NOW = new Date('2026-11-01T12:00:00Z'); // Sunday; Monday 2 Nov is bookable
const TENANT = 'clhtenant0000000000';
const EVENT_TYPE_ID = 'clhevent00000000000';
const HOST = 'clhhost000000000000';
const SLOT = '2026-11-02T10:00:00.000Z';

function eventTypeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_TYPE_ID,
    tenantId: TENANT,
    name: 'Initial consultation',
    description: 'A first call.',
    durationMinutes: 30,
    colorToken: 'blue',
    locationType: 'VIDEO',
    locationDetails: 'https://meet.example.invalid/x',
    appointmentType: 'CONSULTATION',
    hostUserId: HOST,
    requiredFields: ['phone'],
    leadSource: 'BOOKING',
    ...overrides,
  };
}

function tenantRow(overrides: Record<string, unknown> = {}) {
  return { id: TENANT, name: 'Smith Law', bookingPrivacyUrl: null, ...overrides };
}

function settingsRow(overrides: Record<string, unknown> = {}) {
  return {
    availabilityConfiguredAt: new Date('2026-04-01T00:00:00Z'),
    defaultTimezone: 'Europe/London',
    maxDailyBookings: null,
    defaultBufferBeforeMinutes: 0,
    defaultBufferAfterMinutes: 0,
    defaultReminderMinutes: 15,
    ...overrides,
  };
}

const lookup = { handle: 'smith-law', slug: 'initial-consultation' };
const bookInput = {
  ...lookup,
  start: SLOT,
  name: 'Ada Lovelace',
  email: 'ada@example.invalid',
  answers: { phone: '+44 20 7946 0000' },
  consent: true as const,
};

let ctx: ReturnType<typeof createPublicContext>;
let leadService: { createLeadInTransaction: ReturnType<typeof vi.fn> };
let sendEmail: ReturnType<typeof vi.fn>;
const caller = () => publicBookingRouter.createCaller(ctx);

function stubBookable(
  overrides: { tenant?: unknown; eventType?: unknown; settings?: unknown; hostCount?: number } = {}
) {
  prismaMock.tenant.findUnique.mockResolvedValue(
    ('tenant' in overrides ? overrides.tenant : tenantRow()) as never
  );
  prismaMock.eventType.findFirst.mockResolvedValue(
    ('eventType' in overrides ? overrides.eventType : eventTypeRow()) as never
  );
  prismaMock.appointmentSettings.findUnique.mockResolvedValue(
    ('settings' in overrides ? overrides.settings : settingsRow()) as never
  );
  prismaMock.user.count.mockResolvedValue((overrides.hostCount ?? 1) as never);
  prismaMock.availabilityHour.findMany.mockResolvedValue(weekdayRanges([[h(9), h(12)]]) as never);
  prismaMock.availabilityClosure.findMany.mockResolvedValue([] as never);
  prismaMock.appointment.findMany.mockResolvedValue([] as never);
}

function stubBookingWrites() {
  prismaMock.bookingAttempt.count.mockResolvedValue(0 as never);
  prismaMock.bookingAttempt.create.mockResolvedValue({} as never);
  prismaMock.bookingAttempt.deleteMany.mockResolvedValue({ count: 0 } as never);
  prismaMock.$transaction.mockImplementation((fn: any) => fn(prismaMock));
  prismaMock.$executeRaw.mockResolvedValue(1 as never);
  prismaMock.lead.findFirst.mockResolvedValue(null as never);
  prismaMock.contact.findFirst.mockResolvedValue(null as never);
  prismaMock.appointment.count.mockResolvedValue(0 as never);
  prismaMock.appointment.create.mockImplementation(((args: any) =>
    Promise.resolve({
      id: 'clhappt000000000000',
      attendees: [],
      linkedCases: [],
      ...args.data,
    })) as never);
  prismaMock.user.findUnique.mockResolvedValue({ email: 'host@firm.example.invalid' } as never);
  prismaMock.leadActivity.create.mockResolvedValue({} as never);
  leadService.createLeadInTransaction.mockResolvedValue({
    isSuccess: true,
    isFailure: false,
    value: {
      id: { value: 'clhlead000000000000' },
      email: { value: 'ada@example.invalid' },
      firstName: 'Ada',
      lastName: 'Lovelace',
      company: undefined,
      title: undefined,
      phone: { value: '+442079460000' },
      source: 'BOOKING',
    },
  });
}

/** Every Prisma call that carries a where/data with tenantId targets the resolved tenant. */
function expectTenantScoped(model: string, method: string) {
  const fn = (prismaMock as any)[model][method] as ReturnType<typeof vi.fn>;
  expect(fn.mock.calls.length, `${model}.${method} called`).toBeGreaterThan(0);
  for (const [args] of fn.mock.calls as Array<[any]>) {
    const scope = method === 'create' ? args.data : args.where;
    expect(scope.tenantId, `${model}.${method}`).toBe(TENANT);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  bookingSlotsLimiter.reset();
  leadService = { createLeadInTransaction: vi.fn() };
  sendEmail = vi.fn().mockResolvedValue({ isSuccess: true, isFailure: false });
  ctx = createPublicContext({
    services: { lead: leadService } as never,
    adapters: { notificationService: { sendEmail } } as never,
    req: new Request('https://api.example.invalid/trpc', {
      headers: { 'x-forwarded-for': '198.51.100.7' },
    }) as never,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('lookup and enumeration (AC-013, AC-014, R2, R3)', () => {
  const cases: Array<[string, Parameters<typeof stubBookable>[0]]> = [
    ['unknown handle', { tenant: null, eventType: null }],
    ['unknown slug for a known handle', { eventType: null }],
    ['inactive event type (filtered by the query)', { eventType: null }],
    [
      'firm without saved availability',
      { settings: settingsRow({ availabilityConfiguredAt: null }) },
    ],
    ['firm without a settings row', { settings: null }],
    ['host no longer in the firm', { hostCount: 0 }],
  ];

  it.each(cases)(
    '%s → the identical NOT_FOUND through the same four reads',
    async (_label, stub) => {
      stubBookable(stub);
      const error = await caller()
        .getEventType(lookup)
        .catch((e: unknown) => e);
      expect(error).toMatchObject({
        code: 'NOT_FOUND',
        message: 'This booking page is not available.',
      });
      expect(prismaMock.tenant.findUnique).toHaveBeenCalledTimes(1);
      expect(prismaMock.eventType.findFirst).toHaveBeenCalledTimes(1);
      expect(prismaMock.appointmentSettings.findUnique).toHaveBeenCalledTimes(1);
      expect(prismaMock.user.count).toHaveBeenCalledTimes(1);
    }
  );

  it('resolves the tenant only from the handle and filters active types', async () => {
    stubBookable();
    await caller().getEventType(lookup);
    expect(prismaMock.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookingHandle: 'smith-law' } })
    );
    expect(prismaMock.eventType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, slug: 'initial-consultation', isActive: true },
      })
    );
    expect(JSON.stringify(prismaMock.user.count.mock.calls[0][0])).toContain(TENANT);
  });

  it('rejects tenantId / hostUserId / leadId in any body before any read', async () => {
    stubBookable();
    await expect(
      caller().getEventType({ ...lookup, tenantId: TENANT } as never)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller().listSlots({ ...lookup, fromDate: '2026-11-02', days: 7, hostUserId: HOST } as never)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller().book({ ...bookInput, leadId: 'x' } as never)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(prismaMock.eventType.findFirst).not.toHaveBeenCalled();
  });
});

describe('getEventType (AC-020 allowlist)', () => {
  it('returns only the public DTO', async () => {
    stubBookable({ tenant: tenantRow({ bookingPrivacyUrl: 'https://firm.example.invalid/p' }) });
    const dto = await caller().getEventType(lookup);
    expect(dto).toEqual({
      firmName: 'Smith Law',
      eventName: 'Initial consultation',
      durationMinutes: 30,
      description: 'A first call.',
      locationType: 'VIDEO',
      requiredFields: ['phone'],
      timezone: 'Europe/London',
      colorToken: 'blue',
      privacyUrl: 'https://firm.example.invalid/p',
    });
    const serialised = JSON.stringify(dto);
    for (const leak of [
      'hostUserId',
      HOST,
      TENANT,
      EVENT_TYPE_ID,
      'tenantId',
      'meet.example.invalid',
      'organizerId',
    ]) {
      expect(serialised).not.toContain(leak);
    }
  });
});

describe('listSlots (AC-011)', () => {
  it('returns open slots in UTC for the firm timezone, minus the host busy time', async () => {
    stubBookable();
    prismaMock.appointment.findMany.mockResolvedValue([
      {
        startTime: new Date('2026-11-02T10:00:00Z'),
        endTime: new Date('2026-11-02T10:30:00Z'),
        bufferMinutesBefore: 0,
        bufferMinutesAfter: 0,
      },
    ] as never);
    const result = await caller().listSlots({ ...lookup, fromDate: '2026-11-02', days: 1 });
    expect(result.timezone).toBe('Europe/London');
    expect(result.days).toHaveLength(1);
    const starts = result.days[0].slots.map((s) => s.start);
    expect(starts[0]).toBe('2026-11-02T09:00:00.000Z');
    expect(starts).not.toContain('2026-11-02T10:00:00.000Z');
    expect(starts).toContain('2026-11-02T10:30:00.000Z');
    expect(JSON.stringify(result)).not.toMatch(/organizer|title|attendee/i);
  });

  it("queries the host's appointments as organiser or attendee, in this tenant, cap-counted statuses only", async () => {
    stubBookable();
    await caller().listSlots({ ...lookup, fromDate: '2026-11-02', days: 1 });
    const where = (prismaMock.appointment.findMany.mock.calls[0][0] as any).where;
    expect(where.tenantId).toBe(TENANT);
    expect(where.OR).toEqual([{ organizerId: HOST }, { attendees: { some: { userId: HOST } } }]);
    expect(where.status).toEqual({ in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] });
  });

  it('counts tenant-wide bookings per day only when a daily cap is set', async () => {
    stubBookable({ settings: settingsRow({ maxDailyBookings: 1 }) });
    prismaMock.appointment.findMany
      .mockResolvedValueOnce([] as never) // host busy time
      .mockResolvedValueOnce([{ startTime: new Date('2026-11-02T15:00:00Z') }] as never); // cap count
    const result = await caller().listSlots({ ...lookup, fromDate: '2026-11-02', days: 2 });
    expect(result.days[0].slots).toEqual([]);
    expect(result.days[1].slots.length).toBeGreaterThan(0);
    const capWhere = (prismaMock.appointment.findMany.mock.calls[1][0] as any).where;
    expect(capWhere.tenantId).toBe(TENANT);
    expect(capWhere.OR).toBeUndefined();
  });

  it('rejects a start date in the past or beyond the 60-day horizon', async () => {
    stubBookable();
    await expect(
      caller().listSlots({ ...lookup, fromDate: '2026-10-31', days: 1 })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    bookingSlotsLimiter.reset(); // the clock is frozen, so the per-IP window has not passed
    await expect(
      caller().listSlots({ ...lookup, fromDate: '2027-01-01', days: 1 })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throttles a burst from one client IP', async () => {
    stubBookable();
    await caller().listSlots({ ...lookup, fromDate: '2026-11-02', days: 1 });
    await expect(
      caller().listSlots({ ...lookup, fromDate: '2026-11-02', days: 1 })
    ).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
  });
});

describe('book — gates before the transaction (AC-015, AC-017)', () => {
  beforeEach(() => {
    stubBookable();
    stubBookingWrites();
  });

  it('a filled honeypot gets a fake success with zero database calls', async () => {
    const result = await caller().book({ ...bookInput, __honeypot: 'i-am-a-bot' });
    expect(result).toMatchObject({ startsAt: SLOT });
    for (const fn of [
      prismaMock.eventType.findFirst,
      prismaMock.bookingAttempt.create,
      prismaMock.$transaction,
    ]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('a missing required answer is BAD_REQUEST and nothing is written', async () => {
    await expect(caller().book({ ...bookInput, answers: {} })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Please complete all required fields.',
    });
    expect(prismaMock.bookingAttempt.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('records a hashed attempt, prunes after the lookup and stops at a cap', async () => {
    prismaMock.bookingAttempt.count.mockResolvedValueOnce(3 as never);
    await expect(caller().book(bookInput)).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(prismaMock.bookingAttempt.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1); // the attempts transaction only
    expect(prismaMock.bookingAttempt.create).not.toHaveBeenCalled();
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
    const counted = JSON.stringify(prismaMock.bookingAttempt.count.mock.calls);
    expect(counted).not.toContain('ada@example.invalid');
    expect(counted).not.toContain('198.51.100.7');
  });

  it('refuses to book in production without BOOKING_IP_SALT', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BOOKING_IP_SALT', '');
    await expect(caller().book(bookInput)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Online booking is temporarily unavailable.',
    });
    vi.unstubAllEnvs();
    expect(prismaMock.eventType.findFirst).not.toHaveBeenCalled();
  });
});

describe('book — the transaction (AC-012, AC-016, AC-018, AC-019, R5, R7)', () => {
  beforeEach(() => {
    stubBookable();
    stubBookingWrites();
  });

  it('counts and records the attempt under its own per-tenant lock, then locks the booking before reading the slot', async () => {
    await caller().book(bookInput);
    const raw = prismaMock.$executeRaw.mock.calls.map(([strings, ...values]) => [
      (strings as unknown as string[]).join('?'),
      values,
    ]);
    // Attempts transaction: tenant config, bounded wait, attempts lock.
    expect(raw[0][0]).toContain("set_config('app.current_tenant_id'");
    expect(raw[0][1]).toEqual([TENANT]);
    expect(raw[1][0]).toContain("set_config('lock_timeout'");
    expect(raw[2][0]).toContain('pg_advisory_xact_lock(hashtextextended(');
    expect(raw[2][1]).toEqual([`booking-attempts:${TENANT}`]);
    const attemptsLock = prismaMock.$executeRaw.mock.invocationCallOrder[2];
    expect(attemptsLock).toBeLessThan(prismaMock.bookingAttempt.count.mock.invocationCallOrder[0]);
    expect(prismaMock.bookingAttempt.create.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.$executeRaw.mock.invocationCallOrder[3]
    );
    // Booking transaction: the same three, with the booking lock.
    expect(raw[3][0]).toContain("set_config('app.current_tenant_id'");
    expect(raw[5][1]).toEqual([`booking:${TENANT}`]);
    const bookingLock = prismaMock.$executeRaw.mock.invocationCallOrder[5];
    const busyOrder = prismaMock.appointment.findMany.mock.invocationCallOrder.at(-1)!;
    expect(bookingLock).toBeLessThan(busyOrder);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
  });

  it('re-resolves the event type under the lock: a type disabled mid-booking is not booked', async () => {
    prismaMock.eventType.findFirst
      .mockResolvedValueOnce(eventTypeRow() as never) // before the lock
      .mockResolvedValueOnce(null as never); // after the lock: disabled meanwhile
    await expect(caller().book(bookInput)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'This booking page is not available.',
    });
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it('a duration changed mid-booking is a CONFLICT, never a booking of the old length', async () => {
    prismaMock.eventType.findFirst
      .mockResolvedValueOnce(eventTypeRow() as never)
      .mockResolvedValueOnce(eventTypeRow({ durationMinutes: 60 }) as never);
    await expect(caller().book(bookInput)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it('re-checks required answers against the configuration read under the lock', async () => {
    prismaMock.eventType.findFirst
      .mockResolvedValueOnce(eventTypeRow() as never)
      .mockResolvedValueOnce(eventTypeRow({ requiredFields: ['phone', 'company'] }) as never);
    await expect(caller().book(bookInput)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Please complete all required fields.',
    });
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it('uses the configuration read under the lock (host changed mid-booking)', async () => {
    prismaMock.eventType.findFirst
      .mockResolvedValueOnce(eventTypeRow() as never)
      .mockResolvedValueOnce(eventTypeRow({ hostUserId: 'clhnewhost000000000' }) as never);
    await caller().book(bookInput);
    expect((prismaMock.appointment.create.mock.calls[0][0] as any).data.organizerId).toBe(
      'clhnewhost000000000'
    );
  });

  it('creates one SCHEDULED appointment for the host with every booking field', async () => {
    const result = await caller().book({ ...bookInput, name: 'Ada Lovelace' });
    expect(result).toEqual({
      startsAt: SLOT,
      endsAt: '2026-11-02T10:30:00.000Z',
      timezone: 'Europe/London',
    });
    const data = (prismaMock.appointment.create.mock.calls[0][0] as any).data;
    expect(data).toEqual({
      tenantId: TENANT,
      title: 'Initial consultation with Ada Lovelace',
      description: 'A first call.',
      startTime: new Date(SLOT),
      endTime: new Date('2026-11-02T10:30:00.000Z'),
      timezone: 'Europe/London',
      appointmentType: 'CONSULTATION',
      status: 'SCHEDULED',
      location: 'https://meet.example.invalid/x',
      organizerId: HOST,
      bufferMinutesBefore: 0,
      bufferMinutesAfter: 0,
      reminderMinutes: 15,
      eventTypeId: EVENT_TYPE_ID,
      leadId: 'clhlead000000000000',
      bookerName: 'Ada Lovelace',
      bookerEmail: 'ada@example.invalid',
      bookingAnswers: { phone: '+44 20 7946 0000' },
      bookedVia: 'PUBLIC_LINK',
      bookingConsentAt: NOW,
      bookingConsentVersion: '2026-10-20',
    });
    expectTenantScoped('appointment', 'create');
    expectTenantScoped('lead', 'findFirst');
    expectTenantScoped('contact', 'findFirst');
    expectTenantScoped('appointment', 'count');
  });

  it('caps the title at 200 characters', async () => {
    await caller().book({ ...bookInput, name: 'N'.repeat(200) });
    const data = (prismaMock.appointment.create.mock.calls[0][0] as any).data;
    expect(data.title).toHaveLength(200);
    expect(data.bookerName).toHaveLength(200);
  });

  it('rejects a start that is not in the regenerated slot set', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([
      {
        startTime: new Date(SLOT),
        endTime: new Date('2026-11-02T10:30:00Z'),
        bufferMinutesBefore: 0,
        bufferMinutesAfter: 0,
      },
    ] as never);
    await expect(caller().book(bookInput)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'That time is no longer available. Please pick another.',
    });
    await expect(
      caller().book({ ...bookInput, start: '2026-11-02T10:07:00.000Z' })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it('creates a new lead with the event type source and the host as owner, through the outbox path', async () => {
    await caller().book(bookInput);
    expect(leadService.createLeadInTransaction).toHaveBeenCalledWith(
      {
        email: 'ada@example.invalid',
        firstName: 'Ada',
        lastName: 'Lovelace',
        company: undefined,
        phone: '+44 20 7946 0000',
        source: 'BOOKING',
        ownerId: HOST,
        tenantId: TENANT,
      },
      prismaMock
    );
  });

  it('drops an invalid phone from the lead but keeps it in the booking answers', async () => {
    await caller().book({ ...bookInput, answers: { phone: 'call me maybe' } });
    expect(leadService.createLeadInTransaction.mock.calls[0][0].phone).toBeUndefined();
    expect((prismaMock.appointment.create.mock.calls[0][0] as any).data.bookingAnswers).toEqual({
      phone: 'call me maybe',
    });
  });

  it('links an earlier booking-created lead without modifying it', async () => {
    prismaMock.lead.findFirst.mockResolvedValue({ id: 'clhprior00000000000' } as never);
    prismaMock.appointment.count.mockResolvedValue(1 as never);
    await caller().book(bookInput);
    expect(leadService.createLeadInTransaction).not.toHaveBeenCalled();
    expect(prismaMock.lead.update).not.toHaveBeenCalled();
    expect((prismaMock.appointment.create.mock.calls[0][0] as any).data.leadId).toBe(
      'clhprior00000000000'
    );
    expect(prismaMock.appointment.count).toHaveBeenCalledWith({
      where: { tenantId: TENANT, leadId: 'clhprior00000000000', bookedVia: 'PUBLIC_LINK' },
    });
  });

  it.each([
    [
      'a staff-created lead',
      () => prismaMock.lead.findFirst.mockResolvedValue({ id: 'clhstaff00000000000' } as never),
    ],
    [
      'a contact',
      () => prismaMock.contact.findFirst.mockResolvedValue({ id: 'clhcontact000000000' } as never),
    ],
  ])(
    'does not link or modify %s with the same email, and flags it to the host only',
    async (_label, arrange) => {
      arrange();
      const result = await caller().book(bookInput);
      expect(leadService.createLeadInTransaction).not.toHaveBeenCalled();
      expect((prismaMock.appointment.create.mock.calls[0][0] as any).data.leadId).toBeNull();
      expect(result).toEqual({
        startsAt: SLOT,
        endsAt: '2026-11-02T10:30:00.000Z',
        timezone: 'Europe/London',
      });
      await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(2));
      const host = sendEmail.mock.calls.find(([m]) => m.to[0] === 'host@firm.example.invalid')![0];
      const booker = sendEmail.mock.calls.find(([m]) => m.to[0] === 'ada@example.invalid')![0];
      expect(host.textBody).toMatch(/matches an existing record/i);
      expect(booker.textBody).not.toMatch(/existing record/i);
    }
  );

  it('looks up leads and contacts case-insensitively and runs the same reads in every branch', async () => {
    await caller().book(bookInput);
    for (const fn of [prismaMock.lead.findFirst, prismaMock.contact.findFirst]) {
      expect((fn.mock.calls[0][0] as any).where).toEqual({
        tenantId: TENANT,
        email: { equals: 'ada@example.invalid', mode: 'insensitive' },
      });
    }
    expect(prismaMock.appointment.count).toHaveBeenCalledTimes(1);
  });

  it('maps a lead unique race or a lock timeout to CONFLICT "Please try again."', async () => {
    leadService.createLeadInTransaction.mockRejectedValueOnce(prismaError('P2002'));
    await expect(caller().book(bookInput)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Please try again.',
    });
    prismaMock.$executeRaw
      .mockReset()
      .mockResolvedValueOnce(1 as never)
      .mockResolvedValueOnce(1 as never)
      .mockRejectedValueOnce(
        Object.assign(new Error('canceling statement due to lock timeout'), {
          code: 'P2010',
          meta: { code: '55P03' },
        })
      );
    await expect(caller().book(bookInput)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Please try again.',
    });
  });

  it('fails a booking whose lead the domain rejects, without leaking the reason', async () => {
    leadService.createLeadInTransaction.mockResolvedValueOnce({
      isSuccess: false,
      isFailure: true,
      error: new Error('Invalid email format'),
    });
    await expect(caller().book(bookInput)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Please check your details and try again.',
    });
  });

  it('never returns a database error message', async () => {
    prismaMock.appointment.create.mockRejectedValueOnce(
      new Error('relation "appointments" secret detail')
    );
    const error = (await caller()
      .book(bookInput)
      .catch((e: unknown) => e)) as { code: string; message: string };
    expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(error.message).not.toContain('secret detail');
  });
});

describe('book — after commit (AC-016, AC-019)', () => {
  beforeEach(() => {
    stubBookable();
    stubBookingWrites();
  });

  it('queues AI scoring for a new lead, writes its activity, runs side effects without ICS and sends two emails', async () => {
    await caller().book(bookInput);
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(2));
    expect(enqueueLeadScoring).toHaveBeenCalledWith({
      leadId: 'clhlead000000000000',
      tenantId: TENANT,
      lead: {
        email: 'ada@example.invalid',
        source: 'BOOKING',
        firstName: 'Ada',
        lastName: 'Lovelace',
        company: undefined,
        title: undefined,
        phone: '+442079460000',
      },
      correlationId: 'lead-create-clhlead000000000000',
    });
    expect(prismaMock.leadActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'clhlead000000000000',
        tenantId: TENANT,
        userName: 'Public booking',
      }),
    });
    expect(onAppointmentCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'clhappt000000000000' }),
      HOST,
      {
        sendIcs: false,
      }
    );
    expect(sendEmail.mock.calls.map(([m]) => m.to[0])).toEqual([
      'ada@example.invalid',
      'host@firm.example.invalid',
    ]);
  });

  it('a scoring call that never settles (Redis down) does not hold up the emails', async () => {
    vi.mocked(enqueueLeadScoring).mockImplementationOnce(() => new Promise<void>(() => {}));
    await caller().book(bookInput);
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(2));
    expect(onAppointmentCreated).toHaveBeenCalledTimes(1);
  });

  it('does not queue scoring when an existing booking lead was linked', async () => {
    prismaMock.lead.findFirst.mockResolvedValue({ id: 'clhprior00000000000' } as never);
    prismaMock.appointment.count.mockResolvedValue(1 as never);
    await caller().book(bookInput);
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(2));
    expect(enqueueLeadScoring).not.toHaveBeenCalled();
  });

  it('a failing email or side effect never fails the booking', async () => {
    sendEmail.mockRejectedValue(new Error('resend down'));
    vi.mocked(onAppointmentCreated).mockRejectedValueOnce(new Error('reminders down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(caller().book(bookInput)).resolves.toMatchObject({ startsAt: SLOT });
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(2));
    const logged = JSON.stringify([...warn.mock.calls, ...err.mock.calls]);
    expect(logged).not.toContain('ada@example.invalid');
    expect(logged).not.toContain('198.51.100.7');
    warn.mockRestore();
    err.mockRestore();
  });
});

describe('closures in the slot set', () => {
  it('a closed day offers no slots and cannot be booked', async () => {
    stubBookable();
    stubBookingWrites();
    prismaMock.availabilityClosure.findMany.mockResolvedValue([
      { startDate: dateOnly('2026-11-02'), endDate: dateOnly('2026-11-02') },
    ] as never);
    const result = await caller().listSlots({ ...lookup, fromDate: '2026-11-02', days: 1 });
    expect(result.days[0].slots).toEqual([]);
    bookingSlotsLimiter.reset();
    await expect(caller().book(bookInput)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
