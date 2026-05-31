/**
 * Property tests for ScheduleAppointmentUseCase — conflict gate invariants
 * and pure-domain value-object laws (Buffer, TimeSlot, Appointment status machine).
 *
 * Property ids sourced from:
 *   docs/operations/property-testing/race-condition-findings.json
 *   propertyCandidates → "ScheduleAppointmentUseCase — conflict gate"
 *
 * Properties covered:
 *
 *  Buffer value-object
 *  B-1. create accepts any before/after in [0, 240] — both must succeed.
 *  B-2. create rejects negative before-minutes.
 *  B-3. create rejects negative after-minutes.
 *  B-4. create rejects before-minutes > 240.
 *  B-5. create rejects after-minutes > 240.
 *  B-6. none() produces 0/0 and hasValue() is false.
 *  B-7. adjustStartTime subtracts beforeMinutes * 60 * 1000 ms.
 *  B-8. adjustEndTime adds afterMinutes * 60 * 1000 ms.
 *  B-9. totalMinutes = beforeMinutes + afterMinutes.
 *  B-10. toValue round-trip preserves both fields.
 *
 *  TimeSlot value-object
 *  T-1. create accepts any start < end with 5 min ≤ duration ≤ 24 h.
 *  T-2. create rejects start >= end.
 *  T-3. create rejects duration < 5 minutes.
 *  T-4. create rejects duration > 24 hours.
 *  T-5. overlaps is symmetric: A.overlaps(B) === B.overlaps(A).
 *  T-6. non-adjacent disjoint slots do not overlap.
 *  T-7. durationMinutes is Math.round((end - start) / 60000).
 *  T-8. toValue round-trip preserves start, end, and durationMinutes.
 *
 *  ScheduleAppointmentUseCase — conflict gate (RACE-PURE property candidates)
 *  U-1. With forceOverrideConflicts=false and non-empty conflicts, save is NEVER called.
 *  U-2. With forceOverrideConflicts=true, save IS called regardless of conflicts.
 *  U-3. A slot with no existing appointments is always saved (no false-positive rejection).
 *  U-4. Invalid buffer minutes produce a Result.fail before reaching the repo.
 *  U-5. Weekly recurrence without daysOfWeek produces Result.fail.
 *  U-6. Monthly recurrence without dayOfMonth produces Result.fail.
 *  U-7. Yearly recurrence without dayOfMonth or monthOfYear produces Result.fail.
 *  U-8. forceOverrideConflicts=false, zero conflicts — save IS called.
 *
 *  Appointment status machine
 *  A-1. Fresh appointment is always SCHEDULED.
 *  A-2. confirm() only succeeds from SCHEDULED; second confirm fails.
 *  A-3. cancel() succeeds on any active appointment; second cancel fails.
 *  A-4. complete() succeeds from SCHEDULED, CONFIRMED, or IN_PROGRESS.
 *  A-5. complete() on a cancelled appointment fails.
 *  A-6. reschedule() on a cancelled appointment fails.
 *  A-7. markNoShow() only from SCHEDULED or CONFIRMED.
 *  A-8. start() only from SCHEDULED or CONFIRMED.
 *  A-9. Appointment.create rejects startTime in the past (> 5 min grace).
 *
 * @see packages/application/src/usecases/scheduling/ScheduleAppointment.ts
 */

import { describe, expect, vi, afterEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  Buffer,
  TimeSlot,
  Appointment,
  APPOINTMENT_TYPES,
  type AppointmentType,
  ConflictDetector,
} from '@intelliflow/domain';
import {
  ScheduleAppointmentUseCase,
  type ScheduleAppointmentInput,
} from '../../../../packages/application/src/usecases/scheduling/ScheduleAppointment';
import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a Date that is `offsetMs` milliseconds from an anchor (default: now).
 */
function offsetDate(offsetMs: number, anchor?: Date): Date {
  const base = anchor ?? new Date();
  return new Date(base.getTime() + offsetMs);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Future date, always at least 10 minutes from now. */
function futureDate(extraMs = 0): Date {
  return offsetDate(10 * MINUTE + extraMs);
}

// ---------------------------------------------------------------------------
// Inline bounded arbitraries
// ---------------------------------------------------------------------------

/** Valid buffer minutes: integer in [0, 240]. */
const arbValidBuf: fc.Arbitrary<number> = fc.integer({ min: 0, max: 240 });

/** Invalid buffer minutes: negative integers. */
const arbNegBuf: fc.Arbitrary<number> = fc.integer({ min: -10_000, max: -1 });

/** Buffer minutes exceeding maximum: integers in (240, 10_000]. */
const arbOverMaxBuf: fc.Arbitrary<number> = fc.integer({ min: 241, max: 10_000 });

/** A valid appointment type. */
const arbAppointmentType: fc.Arbitrary<AppointmentType> = fc.constantFrom(...APPOINTMENT_TYPES);

/** Positive duration in minutes [5, 1440]. */
const arbDurationMinutes: fc.Arbitrary<number> = fc.integer({ min: 5, max: 1440 });

/** A non-empty user-id string. */
const arbUserId: fc.Arbitrary<string> = fc.uuid();

/** A non-empty tenant-id string. */
const arbTenantId: fc.Arbitrary<string> = fc.uuid();

/** A non-empty title. */
const arbTitle: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 60 })
  .filter((s) => s.trim().length > 0);

/**
 * Builds a valid pair of [startTime, endTime] where:
 *   - startTime >= now + 10 min (clear of the 5 min grace period)
 *   - endTime   = startTime + durationMinutes (5..1440 min)
 */
const arbFutureTimeRange: fc.Arbitrary<{ startTime: Date; endTime: Date }> = arbDurationMinutes.map(
  (dur) => {
    const start = futureDate(0);
    const end = new Date(start.getTime() + dur * MINUTE);
    return { startTime: start, endTime: end };
  }
);

/**
 * Minimal valid ScheduleAppointmentInput (no conflicts, no buffer, no recurrence).
 */
const arbValidInput: fc.Arbitrary<ScheduleAppointmentInput> = fc
  .tuple(arbTitle, arbFutureTimeRange, arbAppointmentType, arbUserId, arbTenantId)
  .map(([title, { startTime, endTime }, appointmentType, organizerId, tenantId]) => ({
    title,
    startTime,
    endTime,
    appointmentType,
    organizerId,
    tenantId,
  }));

// ---------------------------------------------------------------------------
// Mock repository factory
// ---------------------------------------------------------------------------

interface MockRepoOptions {
  /** Existing appointments returned by findForConflictCheck. */
  existing?: Appointment[];
  /** Whether save() should throw (simulates a persistence error). */
  saveShouldThrow?: boolean;
}

function makeMockRepo(opts: MockRepoOptions = {}) {
  const saveCallCount = { n: 0 };
  const repo = {
    forTenant: (_: string) => ({
      findForConflictCheck: async () => opts.existing ?? [],
    }),
    save: vi.fn(async () => {
      saveCallCount.n++;
      if (opts.saveShouldThrow) throw new Error('simulated persistence failure');
    }),
    saveAll: vi.fn(async () => {}),
    batchUpdateStatus: vi.fn(async () => {}),
  };
  return { repo, saveCallCount };
}

/**
 * Create a conflicting Appointment fixture that overlaps with [startTime, endTime].
 * We pin a fixed past-safe reference so vi.useFakeTimers doesn't affect the helper.
 */
function makeConflictingAppointment(baseStart: Date, baseEnd: Date): Appointment {
  // The appointment creation rejects past dates with a 5 min grace.  Since we
  // always start from futureDate() + some offset, the conflicting fixture is fine.
  const result = Appointment.create({
    title: 'Existing appointment',
    startTime: baseStart,
    endTime: baseEnd,
    appointmentType: 'MEETING',
    organizerId: 'existing-organizer',
    tenantId: 'tenant-x',
  });
  if (result.isFailure) {
    throw new Error(
      `makeConflictingAppointment failed: ${result.error.message} (start=${baseStart.toISOString()}, end=${baseEnd.toISOString()})`
    );
  }
  return result.value;
}

// ---------------------------------------------------------------------------
// B. Buffer value-object properties
// ---------------------------------------------------------------------------

describe('Buffer — value-object invariants', () => {
  test.prop([arbValidBuf, arbValidBuf], propertyParams())(
    'B-1. create accepts any before/after in [0, 240]',
    (before, after) => {
      const result = Buffer.create(before, after);
      expect(result.isSuccess).toBe(true);
      expect(result.value.beforeMinutes).toBe(before);
      expect(result.value.afterMinutes).toBe(after);
    }
  );

  test.prop([arbNegBuf, arbValidBuf], propertyParams())(
    'B-2. create rejects negative before-minutes',
    (before, after) => {
      const result = Buffer.create(before, after);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_BUFFER');
    }
  );

  test.prop([arbValidBuf, arbNegBuf], propertyParams())(
    'B-3. create rejects negative after-minutes',
    (before, after) => {
      const result = Buffer.create(before, after);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_BUFFER');
    }
  );

  test.prop([arbOverMaxBuf, arbValidBuf], propertyParams())(
    'B-4. create rejects before-minutes > 240',
    (before, after) => {
      const result = Buffer.create(before, after);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_BUFFER');
    }
  );

  test.prop([arbValidBuf, arbOverMaxBuf], propertyParams())(
    'B-5. create rejects after-minutes > 240',
    (before, after) => {
      const result = Buffer.create(before, after);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_BUFFER');
    }
  );

  test.prop([fc.constant(null)], propertyParams())(
    'B-6. none() produces 0/0 and hasValue() is false',
    (_) => {
      const buf = Buffer.none();
      expect(buf.beforeMinutes).toBe(0);
      expect(buf.afterMinutes).toBe(0);
      expect(buf.hasValue()).toBe(false);
    }
  );

  test.prop([arbValidBuf, arbValidBuf], propertyParams())(
    'B-7. adjustStartTime subtracts beforeMinutes * 60000 ms',
    (before, after) => {
      const result = Buffer.create(before, after);
      fc.pre(result.isSuccess);
      const buf = result.value;
      const anchor = new Date(Date.now() + HOUR);
      const adjusted = buf.adjustStartTime(anchor);
      expect(adjusted.getTime()).toBe(anchor.getTime() - before * MINUTE);
    }
  );

  test.prop([arbValidBuf, arbValidBuf], propertyParams())(
    'B-8. adjustEndTime adds afterMinutes * 60000 ms',
    (before, after) => {
      const result = Buffer.create(before, after);
      fc.pre(result.isSuccess);
      const buf = result.value;
      const anchor = new Date(Date.now() + HOUR);
      const adjusted = buf.adjustEndTime(anchor);
      expect(adjusted.getTime()).toBe(anchor.getTime() + after * MINUTE);
    }
  );

  test.prop([arbValidBuf, arbValidBuf], propertyParams())(
    'B-9. totalMinutes = beforeMinutes + afterMinutes',
    (before, after) => {
      const result = Buffer.create(before, after);
      fc.pre(result.isSuccess);
      expect(result.value.totalMinutes).toBe(before + after);
    }
  );

  test.prop([arbValidBuf, arbValidBuf], propertyParams())(
    'B-10. toValue round-trip preserves both fields',
    (before, after) => {
      const result = Buffer.create(before, after);
      fc.pre(result.isSuccess);
      const snapshot = result.value.toValue();
      expect(snapshot.beforeMinutes).toBe(before);
      expect(snapshot.afterMinutes).toBe(after);
    }
  );
});

// ---------------------------------------------------------------------------
// T. TimeSlot value-object properties
// ---------------------------------------------------------------------------

describe('TimeSlot — value-object invariants', () => {
  /**
   * Build a valid pair (start, end) using a future anchor so Appointment.create
   * won't be blocked (not required here, but keeps helpers consistent).
   */
  const arbValidPair: fc.Arbitrary<{ start: Date; end: Date }> = arbDurationMinutes.map((dur) => {
    const start = futureDate(0);
    const end = new Date(start.getTime() + dur * MINUTE);
    return { start, end };
  });

  test.prop([arbValidPair], propertyParams())(
    'T-1. create accepts any start < end with 5 min <= duration <= 24 h',
    ({ start, end }) => {
      const result = TimeSlot.create(start, end);
      expect(result.isSuccess).toBe(true);
    }
  );

  test.prop([arbDurationMinutes], propertyParams())(
    'T-2. create rejects start >= end (start === end)',
    (offsetMs) => {
      const t = new Date(Date.now() + offsetMs * MINUTE);
      const result = TimeSlot.create(t, t);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_TIME_SLOT');
    }
  );

  test.prop([fc.integer({ min: 1, max: 4 })], propertyParams())(
    'T-3. create rejects duration < 5 minutes',
    (shortMinutes) => {
      const start = futureDate(0);
      const end = new Date(start.getTime() + shortMinutes * MINUTE);
      const result = TimeSlot.create(start, end);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_TIME_SLOT');
    }
  );

  test.prop([fc.integer({ min: 1441, max: 2880 })], propertyParams())(
    'T-4. create rejects duration > 24 hours',
    (longMinutes) => {
      const start = futureDate(0);
      const end = new Date(start.getTime() + longMinutes * MINUTE);
      const result = TimeSlot.create(start, end);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_TIME_SLOT');
    }
  );

  test.prop([arbDurationMinutes, arbDurationMinutes], propertyParams())(
    'T-5. overlaps is symmetric: A.overlaps(B) === B.overlaps(A)',
    (dur1, dur2) => {
      const base = futureDate(0);
      const s1 = base;
      const e1 = new Date(s1.getTime() + dur1 * MINUTE);
      const s2 = new Date(base.getTime() + Math.floor(dur1 / 2) * MINUTE);
      const e2 = new Date(s2.getTime() + dur2 * MINUTE);
      const r1 = TimeSlot.create(s1, e1);
      const r2 = TimeSlot.create(s2, e2);
      fc.pre(r1.isSuccess && r2.isSuccess);
      expect(r1.value.overlaps(r2.value)).toBe(r2.value.overlaps(r1.value));
    }
  );

  test.prop([arbDurationMinutes, arbDurationMinutes], propertyParams())(
    'T-6. disjoint non-adjacent slots do not overlap',
    (dur1, dur2) => {
      const base = futureDate(0);
      const s1 = base;
      const e1 = new Date(s1.getTime() + dur1 * MINUTE);
      // gap of 30 min between the two slots
      const s2 = new Date(e1.getTime() + 30 * MINUTE);
      const e2 = new Date(s2.getTime() + dur2 * MINUTE);
      const r1 = TimeSlot.create(s1, e1);
      const r2 = TimeSlot.create(s2, e2);
      fc.pre(r1.isSuccess && r2.isSuccess);
      expect(r1.value.overlaps(r2.value)).toBe(false);
    }
  );

  test.prop([arbDurationMinutes], propertyParams())(
    'T-7. durationMinutes matches Math.round((end - start) / 60000)',
    (dur) => {
      const start = futureDate(0);
      const end = new Date(start.getTime() + dur * MINUTE);
      const result = TimeSlot.create(start, end);
      fc.pre(result.isSuccess);
      expect(result.value.durationMinutes).toBe(
        Math.round((end.getTime() - start.getTime()) / MINUTE)
      );
    }
  );

  test.prop([arbDurationMinutes], propertyParams())(
    'T-8. toValue round-trip preserves start, end, and durationMinutes',
    (dur) => {
      const start = futureDate(0);
      const end = new Date(start.getTime() + dur * MINUTE);
      const result = TimeSlot.create(start, end);
      fc.pre(result.isSuccess);
      const snapshot = result.value.toValue();
      expect(new Date(snapshot.startTime).getTime()).toBe(start.getTime());
      expect(new Date(snapshot.endTime).getTime()).toBe(end.getTime());
      expect(snapshot.durationMinutes).toBe(result.value.durationMinutes);
    }
  );
});

// ---------------------------------------------------------------------------
// U. ScheduleAppointmentUseCase — conflict gate properties
// ---------------------------------------------------------------------------

describe('ScheduleAppointmentUseCase — conflict gate (RACE-PURE)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // U-1
  test.prop([arbValidInput], propertyParams())(
    'U-1. forceOverrideConflicts=false + non-empty conflicts → save is NEVER called',
    async (input) => {
      // Build a conflicting existing appointment that overlaps input's time range.
      const conflicting = makeConflictingAppointment(input.startTime, input.endTime);
      const { repo } = makeMockRepo({ existing: [conflicting] });
      const useCase = new ScheduleAppointmentUseCase(repo as any);

      const result = await useCase.execute({ ...input, forceOverrideConflicts: false });

      // Result must succeed (conflict is not a failure — it returns ok with warnings)
      expect(result.isSuccess).toBe(true);
      // save must NOT have been called
      expect(repo.save).not.toHaveBeenCalled();
      // And conflictWarnings must list at least one item
      expect(result.value.conflictWarnings?.length).toBeGreaterThan(0);
    }
  );

  // U-2
  test.prop([arbValidInput], propertyParams())(
    'U-2. forceOverrideConflicts=true → save IS called regardless of conflicts',
    async (input) => {
      const conflicting = makeConflictingAppointment(input.startTime, input.endTime);
      const { repo } = makeMockRepo({ existing: [conflicting] });
      const useCase = new ScheduleAppointmentUseCase(repo as any);

      const result = await useCase.execute({ ...input, forceOverrideConflicts: true });

      expect(result.isSuccess).toBe(true);
      expect(repo.save).toHaveBeenCalledOnce();
    }
  );

  // U-3
  test.prop([arbValidInput], propertyParams())(
    'U-3. No existing appointments → slot is always saved (no false-positive conflict rejection)',
    async (input) => {
      const { repo } = makeMockRepo({ existing: [] });
      const useCase = new ScheduleAppointmentUseCase(repo as any);

      const result = await useCase.execute({ ...input, forceOverrideConflicts: false });

      expect(result.isSuccess).toBe(true);
      expect(repo.save).toHaveBeenCalledOnce();
      // No conflict warnings when there are no existing appointments
      expect(result.value.conflictWarnings).toBeUndefined();
    }
  );

  // U-4
  test.prop([arbNegBuf, arbValidBuf, arbValidInput], propertyParams())(
    'U-4. Negative bufferMinutesBefore produces Result.fail before repo is touched',
    async (negBuf, validAfter, input) => {
      const { repo } = makeMockRepo();
      const useCase = new ScheduleAppointmentUseCase(repo as any);

      const result = await useCase.execute({
        ...input,
        bufferMinutesBefore: negBuf,
        bufferMinutesAfter: validAfter,
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_BUFFER');
      expect(repo.save).not.toHaveBeenCalled();
    }
  );

  // U-5
  test.prop([arbValidInput], propertyParams())(
    'U-5. WEEKLY recurrence without daysOfWeek produces Result.fail',
    async (input) => {
      const { repo } = makeMockRepo();
      const useCase = new ScheduleAppointmentUseCase(repo as any);

      const result = await useCase.execute({
        ...input,
        recurrence: { frequency: 'WEEKLY' /* daysOfWeek omitted */ },
      });

      expect(result.isFailure).toBe(true);
      expect(repo.save).not.toHaveBeenCalled();
    }
  );

  // U-6
  test.prop([arbValidInput], propertyParams())(
    'U-6. MONTHLY recurrence without dayOfMonth produces Result.fail',
    async (input) => {
      const { repo } = makeMockRepo();
      const useCase = new ScheduleAppointmentUseCase(repo as any);

      const result = await useCase.execute({
        ...input,
        recurrence: { frequency: 'MONTHLY' /* dayOfMonth omitted */ },
      });

      expect(result.isFailure).toBe(true);
      expect(repo.save).not.toHaveBeenCalled();
    }
  );

  // U-7
  test.prop([arbValidInput], propertyParams())(
    'U-7. YEARLY recurrence without monthOfYear + dayOfMonth produces Result.fail',
    async (input) => {
      const { repo } = makeMockRepo();
      const useCase = new ScheduleAppointmentUseCase(repo as any);

      const result = await useCase.execute({
        ...input,
        recurrence: { frequency: 'YEARLY' /* monthOfYear + dayOfMonth omitted */ },
      });

      expect(result.isFailure).toBe(true);
      expect(repo.save).not.toHaveBeenCalled();
    }
  );

  // U-8
  test.prop([arbValidInput], propertyParams())(
    'U-8. forceOverrideConflicts=false, zero conflicts → save IS called',
    async (input) => {
      const { repo } = makeMockRepo({ existing: [] });
      const useCase = new ScheduleAppointmentUseCase(repo as any);

      const result = await useCase.execute({ ...input, forceOverrideConflicts: false });

      expect(result.isSuccess).toBe(true);
      expect(repo.save).toHaveBeenCalledOnce();
    }
  );
});

// ---------------------------------------------------------------------------
// A. Appointment aggregate — status machine
// ---------------------------------------------------------------------------

describe('Appointment aggregate — status machine (pure domain)', () => {
  /** Always future so Appointment.create won't fail the in-past guard. */
  const arbFuturePair: fc.Arbitrary<{ startTime: Date; endTime: Date }> = arbDurationMinutes.map(
    (dur) => {
      const start = futureDate(0);
      const end = new Date(start.getTime() + dur * MINUTE);
      return { startTime: start, endTime: end };
    }
  );

  function makeAppointment(
    startTime: Date,
    endTime: Date,
    type: AppointmentType = 'MEETING'
  ): Appointment {
    const r = Appointment.create({
      title: 'Test appointment',
      startTime,
      endTime,
      appointmentType: type,
      organizerId: 'organizer-1',
      tenantId: 'tenant-1',
    });
    if (r.isFailure) throw new Error(`makeAppointment: ${r.error.message}`);
    return r.value;
  }

  test.prop([arbFuturePair, arbAppointmentType], propertyParams())(
    'A-1. Fresh appointment is always SCHEDULED',
    ({ startTime, endTime }, type) => {
      const appt = makeAppointment(startTime, endTime, type);
      expect(appt.status).toBe('SCHEDULED');
      expect(appt.isActive).toBe(true);
    }
  );

  test.prop([arbFuturePair], propertyParams())(
    'A-2. confirm() succeeds from SCHEDULED; second confirm fails with APPOINTMENT_INVALID_STATUS_TRANSITION',
    ({ startTime, endTime }) => {
      const appt = makeAppointment(startTime, endTime);
      const first = appt.confirm('user-1');
      expect(first.isSuccess).toBe(true);
      expect(appt.status).toBe('CONFIRMED');

      const second = appt.confirm('user-1');
      expect(second.isFailure).toBe(true);
      expect(second.error.code).toBe('APPOINTMENT_INVALID_STATUS_TRANSITION');
    }
  );

  test.prop([arbFuturePair], propertyParams())(
    'A-3. cancel() succeeds on a SCHEDULED appointment; second cancel fails with APPOINTMENT_ALREADY_CANCELLED',
    ({ startTime, endTime }) => {
      const appt = makeAppointment(startTime, endTime);
      const first = appt.cancel('user-1');
      expect(first.isSuccess).toBe(true);
      expect(appt.isCancelled).toBe(true);

      const second = appt.cancel('user-1');
      expect(second.isFailure).toBe(true);
      expect(second.error.code).toBe('APPOINTMENT_ALREADY_CANCELLED');
    }
  );

  test.prop([arbFuturePair], propertyParams())(
    'A-4. complete() succeeds from SCHEDULED (no IN_PROGRESS requirement)',
    ({ startTime, endTime }) => {
      const appt = makeAppointment(startTime, endTime);
      const result = appt.complete('user-1');
      expect(result.isSuccess).toBe(true);
      expect(appt.isCompleted).toBe(true);
    }
  );

  test.prop([arbFuturePair], propertyParams())(
    'A-4b. complete() succeeds from CONFIRMED',
    ({ startTime, endTime }) => {
      const appt = makeAppointment(startTime, endTime);
      appt.confirm('user-1');
      const result = appt.complete('user-1');
      expect(result.isSuccess).toBe(true);
      expect(appt.isCompleted).toBe(true);
    }
  );

  test.prop([arbFuturePair], propertyParams())(
    'A-4c. complete() succeeds from IN_PROGRESS',
    ({ startTime, endTime }) => {
      const appt = makeAppointment(startTime, endTime);
      appt.start('user-1');
      const result = appt.complete('user-1');
      expect(result.isSuccess).toBe(true);
      expect(appt.isCompleted).toBe(true);
    }
  );

  test.prop([arbFuturePair], propertyParams())(
    'A-5. complete() on a cancelled appointment fails with APPOINTMENT_ALREADY_CANCELLED',
    ({ startTime, endTime }) => {
      const appt = makeAppointment(startTime, endTime);
      appt.cancel('user-1');
      const result = appt.complete('user-1');
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_ALREADY_CANCELLED');
    }
  );

  test.prop([arbFuturePair], propertyParams())(
    'A-6. reschedule() on a cancelled appointment fails with APPOINTMENT_ALREADY_CANCELLED',
    ({ startTime, endTime }) => {
      const appt = makeAppointment(startTime, endTime);
      appt.cancel('user-1');
      const newStart = futureDate(2 * HOUR);
      const newEnd = new Date(newStart.getTime() + 30 * MINUTE);
      const result = appt.reschedule(newStart, newEnd, 'user-1');
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_ALREADY_CANCELLED');
    }
  );

  test.prop([arbFuturePair], propertyParams())(
    'A-7. markNoShow() only from SCHEDULED or CONFIRMED — fails from IN_PROGRESS',
    ({ startTime, endTime }) => {
      const appt = makeAppointment(startTime, endTime);
      appt.start('user-1'); // => IN_PROGRESS
      const result = appt.markNoShow('user-1');
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_INVALID_STATUS_TRANSITION');
    }
  );

  test.prop([arbFuturePair], propertyParams())(
    'A-7b. markNoShow() succeeds from SCHEDULED',
    ({ startTime, endTime }) => {
      const appt = makeAppointment(startTime, endTime);
      const result = appt.markNoShow('user-1');
      expect(result.isSuccess).toBe(true);
      expect(appt.status).toBe('NO_SHOW');
    }
  );

  test.prop([arbFuturePair], propertyParams())(
    'A-8. start() only from SCHEDULED or CONFIRMED — fails from NO_SHOW',
    ({ startTime, endTime }) => {
      const appt = makeAppointment(startTime, endTime);
      appt.markNoShow('user-1'); // => NO_SHOW
      const result = appt.start('user-1');
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_INVALID_STATUS_TRANSITION');
    }
  );

  test.prop([fc.integer({ min: 6, max: 300 })], propertyParams())(
    'A-9. Appointment.create rejects startTime more than 5 minutes in the past',
    (minutesAgo) => {
      const start = new Date(Date.now() - minutesAgo * MINUTE);
      const end = new Date(start.getTime() + 30 * MINUTE);
      const result = Appointment.create({
        title: 'Past appointment',
        startTime: start,
        endTime: end,
        appointmentType: 'MEETING',
        organizerId: 'user-1',
        tenantId: 'tenant-1',
      });
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_IN_PAST');
    }
  );
});
