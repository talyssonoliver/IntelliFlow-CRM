/**
 * Property tests for Appointment aggregate and TimeSlot value object
 * (pure domain — no infrastructure).
 *
 * Property id: RACE-PURE-14
 * Object: Appointment domain aggregate — status state machine + TimeSlot overlap symmetry
 *
 * Properties verified:
 *  1.  TimeSlot.create accepts valid input (5 min..24h, start < end).
 *  2.  TimeSlot.create rejects: start >= end.
 *  3.  TimeSlot.create rejects: duration < 5 min.
 *  4.  TimeSlot.create rejects: duration > 24 h.
 *  5.  TimeSlot.overlaps is symmetric: a.overlaps(b) === b.overlaps(a).
 *  6.  TimeSlot.overlaps is reflexive: a.overlaps(a) === true.
 *  7.  Non-overlapping slots have non-negative gapMinutes.
 *  8.  Overlapping slots have gapMinutes === -1.
 *  9.  durationMinutes matches (endTime - startTime) / 60000 rounded.
 * 10.  withBuffer(0, 0) yields a slot with the same start/end as the original.
 * 11.  toValue/toJSON round-trip: ISO strings parse back to same epoch ms.
 * 12.  TimeSlot.createFromDuration: durationMinutes matches requested minutes.
 * 13.  isWithin self: a.isWithin(a) === true.
 * 14.  Appointment.create always starts in SCHEDULED status.
 * 15.  Appointment.create rejects past start times (before 5-min grace window).
 * 16.  confirm() on CANCELLED appointment always returns
 *      AppointmentAlreadyCancelledError.
 * 17.  confirm() on COMPLETED appointment always returns
 *      AppointmentAlreadyCompletedError.
 * 18.  confirm() on CONFIRMED appointment returns
 *      AppointmentInvalidStatusTransitionError (no re-confirm).
 * 19.  cancel() → cancel() always returns AppointmentAlreadyCancelledError.
 * 20.  complete() → complete() always returns AppointmentAlreadyCompletedError.
 * 21.  conflictsWith(self) always returns false.
 * 22.  conflictsWith is symmetric: a.conflictsWith(b) === b.conflictsWith(a).
 * 23.  effectiveTimeSlot always contains timeSlot (buffer widens, never shrinks).
 * 24.  Buffer.create rejects negative values.
 * 25.  Buffer.create rejects values > 240 min.
 * 26.  Buffer total: beforeMinutes + afterMinutes === totalMinutes.
 * 27.  cancel() is terminal: cancelled appointment rejects reschedule.
 * 28.  complete() is terminal: completed appointment rejects reschedule.
 * 29.  Cancelled/completed appointments do not conflict with any other appointment.
 *
 * @see docs/operations/property-testing/race-condition-findings.json RACE-PURE-14
 */

import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  Appointment,
  TimeSlot,
  Buffer,
  AppointmentId,
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  type AppointmentStatus,
  type AppointmentType,
} from '@intelliflow/domain';
import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_MS = Date.UTC(2026, 0, 1); // 2026-01-01 (future, avoids past-guard issues)
const MAX_MS = Date.UTC(2030, 0, 1);
const MIN_DURATION_MS = 5 * 60 * 1000; // 5 min
const MAX_DURATION_MS = 24 * 60 * 60 * 1000; // 24 h

// ---------------------------------------------------------------------------
// Inline bounded arbitraries
// ---------------------------------------------------------------------------

/** A future Date within the bounded window (all > now at generation time). */
const arbFutureInstant: fc.Arbitrary<Date> = fc
  .integer({ min: MIN_MS, max: MAX_MS - MAX_DURATION_MS })
  .map((ms) => new Date(ms));

/**
 * A valid TimeSlot: start in bounded future window, duration in [5 min, 24 h).
 * We keep max strictly below 24 h to avoid the boundary rejection.
 */
const arbValidTimeSlot: fc.Arbitrary<{ start: Date; end: Date }> = fc
  .tuple(
    fc.integer({ min: MIN_MS, max: MAX_MS - MAX_DURATION_MS }),
    fc.integer({ min: MIN_DURATION_MS, max: MAX_DURATION_MS - 1 })
  )
  .map(([startMs, durMs]) => ({
    start: new Date(startMs),
    end: new Date(startMs + durMs),
  }));

/** Two valid TimeSlots that are guaranteed to OVERLAP. */
const arbOverlappingPair: fc.Arbitrary<[{ start: Date; end: Date }, { start: Date; end: Date }]> =
  arbValidTimeSlot.chain((a) => {
    const span = a.end.getTime() - a.start.getTime();
    // b starts strictly inside a so they must overlap
    const maxOffset = Math.max(0, span - MIN_DURATION_MS - 1);
    if (maxOffset <= 0) {
      // degenerate — just use same slot
      return fc.constant([a, a] as [typeof a, typeof a]);
    }
    return fc
      .tuple(
        fc.integer({ min: 0, max: maxOffset }),
        fc.integer({ min: MIN_DURATION_MS, max: MAX_DURATION_MS - 1 })
      )
      .map(([offset, dur]) => {
        const startMs = a.start.getTime() + offset;
        return [a, { start: new Date(startMs), end: new Date(startMs + dur) }] as [
          typeof a,
          typeof a,
        ];
      });
  });

/** Two valid TimeSlots that are guaranteed to be DISJOINT (b starts after a ends). */
const arbDisjointPair: fc.Arbitrary<[{ start: Date; end: Date }, { start: Date; end: Date }]> =
  arbValidTimeSlot.chain((a) => {
    // CONSTRUCTIVE (no filter): `a.end` can sit at MAX_MS-1, leaving no room after it,
    // so a `.filter(bEnd <= MAX_MS)` would almost never satisfy and fast-check would
    // spin (the cause of the file-level hang). Build a guaranteed-valid disjoint b.
    const aEnd = a.end.getTime();
    const roomAfter = MAX_MS - aEnd;
    if (roomAfter >= 1 + MIN_DURATION_MS) {
      const maxGap = Math.min(60 * 60 * 1000, roomAfter - MIN_DURATION_MS);
      return fc
        .tuple(
          fc.integer({ min: 1, max: Math.max(1, maxGap) }),
          fc.integer({ min: MIN_DURATION_MS, max: MAX_DURATION_MS - 1 })
        )
        .map(([gap, dur]) => {
          const bStart = aEnd + gap;
          const safeDur = Math.min(dur, Math.max(MIN_DURATION_MS, MAX_MS - bStart));
          return [a, { start: new Date(bStart), end: new Date(bStart + safeDur) }] as [
            typeof a,
            typeof a,
          ];
        });
    }
    // No room after a — place b strictly BEFORE a (still disjoint).
    const roomBefore = a.start.getTime() - MIN_MS;
    if (roomBefore < 1 + MIN_DURATION_MS) {
      return fc.constant([a, a] as [typeof a, typeof a]); // degenerate (rare)
    }
    const maxDurBefore = Math.min(MAX_DURATION_MS - 1, roomBefore - 1);
    return fc.integer({ min: MIN_DURATION_MS, max: maxDurBefore }).map((dur) => {
      const bEnd = a.start.getTime() - 1;
      const bStart = bEnd - dur;
      return [a, { start: new Date(bStart), end: new Date(bEnd) }] as [typeof a, typeof a];
    });
  });

/** All appointment types. */
const arbAppointmentType: fc.Arbitrary<AppointmentType> = fc.constantFrom(...APPOINTMENT_TYPES);

/** A safe non-empty title (printable ASCII, bounded length). */
const arbTitle: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 60 })
  .filter((s) => s.trim().length > 0);

/** A UUID organizer id. */
const arbOrganizerId: fc.Arbitrary<string> = fc.uuid();

/** A UUID tenant id. */
const arbTenantId: fc.Arbitrary<string> = fc.uuid();

/** A valid buffer in [0..240] for both sides. */
const arbBufferMinutes: fc.Arbitrary<number> = fc.integer({ min: 0, max: 240 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a valid Appointment in SCHEDULED status using reconstitute() so we
 * bypass the past-time guard and keep tests deterministic.
 */
function makeScheduled(start: Date, end: Date, bufferBefore = 0, bufferAfter = 0): Appointment {
  const id = AppointmentId.generate();
  const tsResult = TimeSlot.create(start, end);
  if (tsResult.isFailure) throw new Error(`TimeSlot.create failed: ${tsResult.error.message}`);
  const buf = Buffer.reconstitute(bufferBefore, bufferAfter);
  return Appointment.reconstitute(id, {
    title: 'Test Appointment',
    timeSlot: tsResult.value,
    appointmentType: 'MEETING',
    status: 'SCHEDULED',
    buffer: buf,
    attendeeIds: [],
    linkedCaseIds: [],
    organizerId: 'org-1',
    tenantId: 'tenant-1',
    createdAt: new Date(start.getTime() - 60_000),
    updatedAt: new Date(start.getTime() - 60_000),
  });
}

// ---------------------------------------------------------------------------
// TimeSlot — creation validation (Properties 1-4)
// ---------------------------------------------------------------------------

describe('RACE-PURE-14: TimeSlot.create — valid input', () => {
  test.prop([arbValidTimeSlot], propertyParams())(
    'P01 accepts valid (start < end, 5min..24h)',
    ({ start, end }) => {
      const result = TimeSlot.create(start, end);
      expect(result.isSuccess).toBe(true);
    }
  );

  test.prop([fc.integer({ min: MIN_MS, max: MAX_MS }).map((ms) => new Date(ms))], propertyParams())(
    'P02 rejects when start === end',
    (t) => {
      const result = TimeSlot.create(t, t);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_TIME_SLOT');
    }
  );

  test.prop(
    [
      fc
        .integer({ min: MIN_MS, max: MAX_MS - 1 })
        .chain((startMs) =>
          fc
            .integer({ min: 1, max: MIN_DURATION_MS - 1 })
            .map((dur) => ({ start: new Date(startMs), end: new Date(startMs + dur) }))
        ),
    ],
    propertyParams()
  )('P03 rejects duration < 5 min', ({ start, end }) => {
    const result = TimeSlot.create(start, end);
    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe('INVALID_TIME_SLOT');
  });

  test.prop(
    [
      fc
        .integer({ min: MIN_MS, max: MAX_MS - MAX_DURATION_MS - 1 })
        .chain((startMs) =>
          fc
            .integer({ min: MAX_DURATION_MS + 1, max: MAX_DURATION_MS + 60 * 60 * 1000 })
            .map((dur) => ({ start: new Date(startMs), end: new Date(startMs + dur) }))
        ),
    ],
    propertyParams()
  )('P04 rejects duration > 24 h', ({ start, end }) => {
    const result = TimeSlot.create(start, end);
    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe('INVALID_TIME_SLOT');
  });
});

// ---------------------------------------------------------------------------
// TimeSlot — overlap symmetry (Properties 5-8)
// ---------------------------------------------------------------------------

describe('RACE-PURE-14: TimeSlot overlap symmetry', () => {
  test.prop([arbOverlappingPair], propertyParams())(
    'P05 overlaps is symmetric for overlapping pairs',
    ([a, b]) => {
      const slotA = TimeSlot.create(a.start, a.end).value;
      const slotB = TimeSlot.create(b.start, b.end).value;
      // Both may be valid; skip if either is invalid (boundary cases from chain)
      if (!slotA || !slotB) return;
      expect(slotA.overlaps(slotB)).toBe(slotB.overlaps(slotA));
    }
  );

  test.prop([arbValidTimeSlot], propertyParams())(
    'P06 overlaps is reflexive: a.overlaps(a) === true',
    ({ start, end }) => {
      const result = TimeSlot.create(start, end);
      if (result.isFailure) return;
      const slot = result.value;
      expect(slot.overlaps(slot)).toBe(true);
    }
  );

  test.prop([arbDisjointPair], propertyParams())(
    'P07 disjoint slots have non-negative gapMinutes',
    ([a, b]) => {
      const slotAResult = TimeSlot.create(a.start, a.end);
      const slotBResult = TimeSlot.create(b.start, b.end);
      if (slotAResult.isFailure || slotBResult.isFailure) return;
      const gap = slotAResult.value.gapMinutes(slotBResult.value);
      expect(gap).toBeGreaterThanOrEqual(0);
    }
  );

  test.prop([arbOverlappingPair], propertyParams())(
    'P08 overlapping slots return gapMinutes === -1',
    ([a, b]) => {
      const slotAResult = TimeSlot.create(a.start, a.end);
      const slotBResult = TimeSlot.create(b.start, b.end);
      if (slotAResult.isFailure || slotBResult.isFailure) return;
      if (!slotAResult.value.overlaps(slotBResult.value)) return; // skip non-overlapping edge
      expect(slotAResult.value.gapMinutes(slotBResult.value)).toBe(-1);
    }
  );
});

// ---------------------------------------------------------------------------
// TimeSlot — arithmetic (Properties 9-13)
// ---------------------------------------------------------------------------

describe('RACE-PURE-14: TimeSlot arithmetic and round-trip', () => {
  test.prop([arbValidTimeSlot], propertyParams())(
    'P09 durationMinutes matches Math.round((end - start) / 60000)',
    ({ start, end }) => {
      const result = TimeSlot.create(start, end);
      if (result.isFailure) return;
      const expected = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
      expect(result.value.durationMinutes).toBe(expected);
    }
  );

  test.prop([arbValidTimeSlot], propertyParams())(
    'P10 withBuffer(0, 0) produces slot equal to original start/end',
    ({ start, end }) => {
      const result = TimeSlot.create(start, end);
      if (result.isFailure) return;
      const slot = result.value;
      const buffered = slot.withBuffer(0, 0);
      if (buffered.isFailure) return;
      expect(buffered.value.startTime.getTime()).toBe(slot.startTime.getTime());
      expect(buffered.value.endTime.getTime()).toBe(slot.endTime.getTime());
    }
  );

  test.prop([arbValidTimeSlot], propertyParams())(
    'P11 toValue round-trip: ISO strings parse back to same epoch ms',
    ({ start, end }) => {
      const result = TimeSlot.create(start, end);
      if (result.isFailure) return;
      const slot = result.value;
      const v = slot.toValue();
      expect(new Date(v.startTime).getTime()).toBe(start.getTime());
      expect(new Date(v.endTime).getTime()).toBe(end.getTime());
    }
  );

  test.prop(
    [
      arbFutureInstant,
      fc.integer({ min: 5, max: 1439 }), // 5 min to 23 h 59 min
    ],
    propertyParams()
  )('P12 createFromDuration: durationMinutes matches requested minutes', (start, minutes) => {
    const result = TimeSlot.createFromDuration(start, minutes);
    if (result.isFailure) return;
    expect(result.value.durationMinutes).toBe(minutes);
  });

  test.prop([arbValidTimeSlot], propertyParams())(
    'P13 isWithin self: a.isWithin(a) === true',
    ({ start, end }) => {
      const result = TimeSlot.create(start, end);
      if (result.isFailure) return;
      expect(result.value.isWithin(result.value)).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// Appointment.create (Properties 14-15)
// ---------------------------------------------------------------------------

describe('RACE-PURE-14: Appointment.create invariants', () => {
  test.prop(
    [arbValidTimeSlot, arbAppointmentType, arbTitle, arbOrganizerId, arbTenantId],
    propertyParams()
  )(
    'P14 always starts in SCHEDULED status on success',
    ({ start, end }, aptType, title, organizerId, tenantId) => {
      const result = Appointment.create({
        title,
        startTime: start,
        endTime: end,
        appointmentType: aptType,
        organizerId,
        tenantId,
      });
      if (result.isSuccess) {
        expect(result.value.status).toBe('SCHEDULED');
      }
      // Either success (SCHEDULED) or failure (e.g. past-time guard) — both legal
    }
  );

  test.prop(
    [
      // start strictly before allowed window: more than 6 min in the past
      fc.integer({ min: 1, max: 60 * 24 * 365 }).map((minsAgo) => {
        const now = Date.now();
        const startMs = now - (minsAgo + 6) * 60 * 1000;
        const endMs = startMs + 60 * 60 * 1000;
        return { start: new Date(startMs), end: new Date(endMs) };
      }),
      arbAppointmentType,
      arbTitle,
    ],
    propertyParams()
  )('P15 rejects past start times outside 5-min grace window', ({ start, end }, aptType, title) => {
    const result = Appointment.create({
      title,
      startTime: start,
      endTime: end,
      appointmentType: aptType,
      organizerId: 'org-1',
      tenantId: 'tenant-1',
    });
    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe('APPOINTMENT_IN_PAST');
  });
});

// ---------------------------------------------------------------------------
// Status state machine — terminal-status guards (Properties 16-20)
// ---------------------------------------------------------------------------

describe('RACE-PURE-14: Appointment status state-machine guards', () => {
  test.prop([arbValidTimeSlot, arbTitle], propertyParams())(
    'P16 confirm() on CANCELLED always returns AppointmentAlreadyCancelledError',
    ({ start, end }, title) => {
      const apt = makeScheduled(start, end);
      apt.cancel('user-1');
      const result = apt.confirm('user-2');
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_ALREADY_CANCELLED');
    }
  );

  test.prop([arbValidTimeSlot, arbTitle], propertyParams())(
    'P17 confirm() on COMPLETED always returns AppointmentAlreadyCompletedError',
    ({ start, end }, _title) => {
      const apt = makeScheduled(start, end);
      apt.complete('user-1');
      const result = apt.confirm('user-2');
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_ALREADY_COMPLETED');
    }
  );

  test.prop([arbValidTimeSlot], propertyParams())(
    'P18 confirm() on CONFIRMED returns AppointmentInvalidStatusTransitionError',
    ({ start, end }) => {
      const apt = makeScheduled(start, end);
      apt.confirm('user-1'); // first confirm succeeds
      const result = apt.confirm('user-2'); // second confirm fails
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_INVALID_STATUS_TRANSITION');
    }
  );

  test.prop([arbValidTimeSlot], propertyParams())(
    'P19 cancel() → cancel() always returns AppointmentAlreadyCancelledError',
    ({ start, end }) => {
      const apt = makeScheduled(start, end);
      apt.cancel('user-1');
      const result = apt.cancel('user-2');
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_ALREADY_CANCELLED');
    }
  );

  test.prop([arbValidTimeSlot], propertyParams())(
    'P20 complete() → complete() always returns AppointmentAlreadyCompletedError',
    ({ start, end }) => {
      const apt = makeScheduled(start, end);
      apt.complete('user-1');
      const result = apt.complete('user-2');
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_ALREADY_COMPLETED');
    }
  );
});

// ---------------------------------------------------------------------------
// conflictsWith — symmetry (Properties 21-22)
// ---------------------------------------------------------------------------

describe('RACE-PURE-14: Appointment.conflictsWith symmetry', () => {
  test.prop([arbValidTimeSlot], propertyParams())(
    'P21 conflictsWith(self) always returns false',
    ({ start, end }) => {
      const apt = makeScheduled(start, end);
      expect(apt.conflictsWith(apt)).toBe(false);
    }
  );

  test.prop([arbOverlappingPair], propertyParams())(
    'P22 conflictsWith is symmetric: a.conflictsWith(b) === b.conflictsWith(a)',
    ([a, b]) => {
      // Validate both slots are usable
      const slotAResult = TimeSlot.create(a.start, a.end);
      const slotBResult = TimeSlot.create(b.start, b.end);
      if (slotAResult.isFailure || slotBResult.isFailure) return;

      const aptA = makeScheduled(a.start, a.end);
      const aptB = makeScheduled(b.start, b.end);
      expect(aptA.conflictsWith(aptB)).toBe(aptB.conflictsWith(aptA));
    }
  );
});

// ---------------------------------------------------------------------------
// effectiveTimeSlot invariant (Property 23)
// ---------------------------------------------------------------------------

describe('RACE-PURE-14: effectiveTimeSlot contains timeSlot', () => {
  test.prop(
    [
      arbValidTimeSlot,
      fc.integer({ min: 0, max: 60 }), // buffer before
      fc.integer({ min: 0, max: 60 }), // buffer after
    ],
    propertyParams()
  )(
    'P23 effectiveTimeSlot always widens timeSlot (effectiveStart <= start, effectiveEnd >= end)',
    ({ start, end }, before, after) => {
      const apt = makeScheduled(start, end, before, after);
      expect(apt.effectiveStartTime.getTime()).toBeLessThanOrEqual(apt.startTime.getTime());
      expect(apt.effectiveEndTime.getTime()).toBeGreaterThanOrEqual(apt.endTime.getTime());
    }
  );
});

// ---------------------------------------------------------------------------
// Buffer validation (Properties 24-26)
// ---------------------------------------------------------------------------

describe('RACE-PURE-14: Buffer validation', () => {
  test.prop([fc.integer({ min: 1, max: 10_000 })], propertyParams())(
    'P24 Buffer.create rejects negative before-minutes',
    (absVal) => {
      const result = Buffer.create(-absVal, 0);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_BUFFER');
    }
  );

  test.prop([fc.integer({ min: 241, max: 1440 })], propertyParams())(
    'P25 Buffer.create rejects before-minutes > 240',
    (minutes) => {
      const result = Buffer.create(minutes, 0);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_BUFFER');
    }
  );

  test.prop([arbBufferMinutes, arbBufferMinutes], propertyParams())(
    'P26 Buffer.totalMinutes === beforeMinutes + afterMinutes',
    (before, after) => {
      const result = Buffer.create(before, after);
      if (result.isFailure) return;
      expect(result.value.totalMinutes).toBe(before + after);
    }
  );
});

// ---------------------------------------------------------------------------
// Terminal status — reschedule blocked (Properties 27-28)
// ---------------------------------------------------------------------------

describe('RACE-PURE-14: Terminal status blocks reschedule', () => {
  test.prop([arbValidTimeSlot, arbValidTimeSlot], propertyParams())(
    'P27 cancel() is terminal: cancelled appointment rejects reschedule',
    (slot, newSlot) => {
      const slotBResult = TimeSlot.create(newSlot.start, newSlot.end);
      if (slotBResult.isFailure) return;
      const apt = makeScheduled(slot.start, slot.end);
      apt.cancel('user-1');
      const result = apt.reschedule(newSlot.start, newSlot.end, 'user-2');
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_ALREADY_CANCELLED');
    }
  );

  test.prop([arbValidTimeSlot, arbValidTimeSlot], propertyParams())(
    'P28 complete() is terminal: completed appointment rejects reschedule',
    (slot, newSlot) => {
      const slotBResult = TimeSlot.create(newSlot.start, newSlot.end);
      if (slotBResult.isFailure) return;
      const apt = makeScheduled(slot.start, slot.end);
      apt.complete('user-1');
      const result = apt.reschedule(newSlot.start, newSlot.end, 'user-2');
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_ALREADY_COMPLETED');
    }
  );
});

// ---------------------------------------------------------------------------
// Cancelled/completed appointments don't conflict (Property 29)
// ---------------------------------------------------------------------------

describe('RACE-PURE-14: Inactive appointments never conflict', () => {
  test.prop([arbOverlappingPair], propertyParams())(
    'P29 cancelled or completed appointments do not conflict with any other appointment',
    ([a, b]) => {
      const slotAResult = TimeSlot.create(a.start, a.end);
      const slotBResult = TimeSlot.create(b.start, b.end);
      if (slotAResult.isFailure || slotBResult.isFailure) return;

      // Test cancelled
      const aptACancelled = makeScheduled(a.start, a.end);
      const aptB = makeScheduled(b.start, b.end);
      aptACancelled.cancel('user-1');
      expect(aptACancelled.conflictsWith(aptB)).toBe(false);
      expect(aptB.conflictsWith(aptACancelled)).toBe(false);

      // Test completed
      const aptACompleted = makeScheduled(a.start, a.end);
      aptACompleted.complete('user-1');
      expect(aptACompleted.conflictsWith(aptB)).toBe(false);
      expect(aptB.conflictsWith(aptACompleted)).toBe(false);
    }
  );
});
