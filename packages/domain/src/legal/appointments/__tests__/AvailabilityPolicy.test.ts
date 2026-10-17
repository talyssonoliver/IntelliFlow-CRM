/**
 * PG-202 — AvailabilityPolicy (pure scheduling rules).
 *
 * Every case passes explicit instants and IANA zones; nothing reads the wall
 * clock or process.env.TZ (time-bomb lesson).
 */
import { describe, it, expect } from 'vitest';
import { APPOINTMENT_STATUSES } from '../AppointmentEvents';
import {
  AVAILABILITY_LIMITS,
  AVAILABILITY_VIOLATION_CODES,
  CAP_COUNTED_STATUSES,
  LEGACY_BOOKING_HOURS,
  MINUTES_PER_DAY,
  WEEKDAYS,
  InvalidTimezoneError,
  canonicalTimezone,
  capCountWindow,
  evaluateAvailability,
  generateCandidates,
  isValidTimezone,
  localDayBoundsUtc,
  localToUtc,
  mergeRanges,
  toZonedParts,
  type AvailabilityRules,
  type WeeklyRange,
} from '../AvailabilityPolicy';

const LONDON = 'Europe/London';
const NEW_YORK = 'America/New_York';
const AUCKLAND = 'Pacific/Auckland';
const KOLKATA = 'Asia/Kolkata';

const h = (hour: number, minute = 0) => hour * 60 + minute;

function weekdays(
  ranges: Array<[number, number]>,
  days: number[] = [1, 2, 3, 4, 5]
): WeeklyRange[] {
  return days.flatMap((weekday) =>
    ranges.map(([startMinute, endMinute]) => ({
      weekday: weekday as WeeklyRange['weekday'],
      startMinute,
      endMinute,
    }))
  );
}

function rules(overrides: Partial<AvailabilityRules> = {}): AvailabilityRules {
  return {
    timezone: LONDON,
    weeklyRanges: weekdays([[h(9), h(17)]]),
    closures: [],
    maxDailyBookings: null,
    ...overrides,
  };
}

function check(r: AvailabilityRules, start: string, end: string, sameDayCount?: number) {
  return evaluateAvailability({
    rules: r,
    start: new Date(start),
    end: new Date(end),
    sameDayCount,
  });
}

describe('constants', () => {
  it('exposes the weekday and limit constants', () => {
    expect(WEEKDAYS).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(MINUTES_PER_DAY).toBe(1440);
    expect(LEGACY_BOOKING_HOURS).toEqual({ startHour: 7, endHour: 19 });
    expect(AVAILABILITY_LIMITS).toMatchObject({
      maxRangesPerWeekday: 6,
      maxClosures: 200,
      maxClosureDays: 366,
      maxDailyBookings: 500,
      maxReasonLength: 200,
      minClosureDate: '2000-01-01',
      maxClosureDate: '2100-12-31',
      maxFindNextSlotCandidates: 2000,
    });
    expect(AVAILABILITY_VIOLATION_CODES).toEqual([
      'INVALID_INTERVAL',
      'INVALID_TIMEZONE',
      'SPANS_MIDNIGHT',
      'CLOSED_DATE',
      'OUTSIDE_HOURS',
      'DAILY_CAP_REACHED',
    ]);
  });

  it('cap-counted statuses plus CANCELLED and NO_SHOW are exactly the appointment statuses', () => {
    expect(CAP_COUNTED_STATUSES).toEqual(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED']);
    expect([...CAP_COUNTED_STATUSES, 'CANCELLED', 'NO_SHOW'].sort()).toEqual(
      [...APPOINTMENT_STATUSES].sort()
    );
  });
});

describe('timezone helpers', () => {
  it('validates IANA zones', () => {
    expect(isValidTimezone(LONDON)).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Not/AZone')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });

  it('canonicalises aliases idempotently', () => {
    const c = canonicalTimezone('Asia/Calcutta');
    expect(isValidTimezone(c)).toBe(true);
    expect(canonicalTimezone(c)).toBe(c);
    expect(() => canonicalTimezone('Not/AZone')).toThrow(InvalidTimezoneError);
  });

  it('toZonedParts reports local date, weekday and minute (midnight is 0, not 1440)', () => {
    const parts = toZonedParts(new Date('2026-04-13T23:00:00Z'), LONDON); // 00:00 BST on Tue 14th
    expect(parts).toMatchObject({
      date: '2026-04-14',
      weekday: 2,
      minuteOfDay: 0,
      second: 0,
      ms: 0,
    });
    const kolkata = toZonedParts(new Date('2026-04-13T04:00:00Z'), KOLKATA); // 09:30 IST
    expect(kolkata).toMatchObject({ date: '2026-04-13', weekday: 1, minuteOfDay: h(9, 30) });
    expect(() => toZonedParts(new Date('2026-04-13T04:00:00Z'), 'Not/AZone')).toThrow(
      InvalidTimezoneError
    );
  });

  it('maps weekdays from the local date (Sun 2026-04-12 … Sat 2026-04-18)', () => {
    const got = [12, 13, 14, 15, 16, 17, 18].map(
      (d) => toZonedParts(new Date(`2026-04-${d}T12:00:00Z`), LONDON).weekday
    );
    expect(got).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('localToUtc converts wall clock to an instant on ordinary days', () => {
    expect(localToUtc('2026-04-14', h(9), LONDON).toISOString()).toBe('2026-04-14T08:00:00.000Z');
    expect(localToUtc('2026-01-14', h(9), LONDON).toISOString()).toBe('2026-01-14T09:00:00.000Z');
    expect(localToUtc('2026-04-14', 1440, LONDON).toISOString()).toBe('2026-04-14T23:00:00.000Z');
  });

  it('localToUtc resolves a DST gap forward and an overlap to the earlier occurrence', () => {
    // London spring forward 2026-03-29: 01:00-02:00 local does not exist.
    expect(localToUtc('2026-03-29', h(1, 30), LONDON).toISOString()).toBe(
      '2026-03-29T01:00:00.000Z'
    );
    // London fall back 2026-10-25: 01:30 local happens at 00:30Z and 01:30Z.
    expect(localToUtc('2026-10-25', h(1, 30), LONDON).toISOString()).toBe(
      '2026-10-25T00:30:00.000Z'
    );
    // New York spring forward 2026-03-08: 02:30 local does not exist.
    expect(localToUtc('2026-03-08', h(2, 30), NEW_YORK).toISOString()).toBe(
      '2026-03-08T07:00:00.000Z'
    );
    // New York fall back 2026-11-01: 01:30 local at 05:30Z and 06:30Z.
    expect(localToUtc('2026-11-01', h(1, 30), NEW_YORK).toISOString()).toBe(
      '2026-11-01T05:30:00.000Z'
    );
  });

  it('localDayBoundsUtc is half-open and 23 h / 25 h on DST days', () => {
    const spring = localDayBoundsUtc('2026-03-29', LONDON);
    expect(spring.startUtc.toISOString()).toBe('2026-03-29T00:00:00.000Z');
    expect(spring.endUtc.toISOString()).toBe('2026-03-29T23:00:00.000Z');
    expect((spring.endUtc.getTime() - spring.startUtc.getTime()) / 3_600_000).toBe(23);
    const fall = localDayBoundsUtc('2026-10-25', LONDON);
    expect((fall.endUtc.getTime() - fall.startUtc.getTime()) / 3_600_000).toBe(25);
    const nyFall = localDayBoundsUtc('2026-11-01', NEW_YORK);
    expect(nyFall.startUtc.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(nyFall.endUtc.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(localDayBoundsUtc('2026-11-02', NEW_YORK).startUtc).toEqual(nyFall.endUtc);
  });

  it('capCountWindow is the firm-local day of the start', () => {
    const w = capCountWindow({ timezone: AUCKLAND }, new Date('2026-04-13T11:30:00Z')); // 23:30 NZST Mon 13th
    expect(w.startUtc.toISOString()).toBe('2026-04-12T12:00:00.000Z');
    expect(w.endUtc.toISOString()).toBe('2026-04-13T12:00:00.000Z');
  });
});

describe('mergeRanges', () => {
  it('merges touching and overlapping ranges per weekday, keeps gaps, sorts', () => {
    const input: WeeklyRange[] = [
      { weekday: 1, startMinute: h(12), endMinute: h(17) },
      { weekday: 1, startMinute: h(9), endMinute: h(12) },
      { weekday: 2, startMinute: h(13), endMinute: h(17) },
      { weekday: 2, startMinute: h(9), endMinute: h(12) },
      { weekday: 1, startMinute: h(16), endMinute: h(18) },
    ];
    expect(mergeRanges(input)).toEqual([
      { weekday: 1, startMinute: h(9), endMinute: h(18) },
      { weekday: 2, startMinute: h(9), endMinute: h(12) },
      { weekday: 2, startMinute: h(13), endMinute: h(17) },
    ]);
  });

  it('drops invalid ranges and leaves its input unchanged', () => {
    const input = Object.freeze([
      Object.freeze({ weekday: 3 as const, startMinute: h(10), endMinute: h(10) }),
      Object.freeze({ weekday: 3 as const, startMinute: h(11), endMinute: h(12) }),
    ]);
    const before = JSON.stringify(input);
    expect(mergeRanges(input)).toEqual([{ weekday: 3, startMinute: h(11), endMinute: h(12) }]);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('evaluateAvailability — hours', () => {
  it('accepts a booking inside the weekday range (Tue 10:00-11:00 BST)', () => {
    expect(check(rules(), '2026-04-14T09:00:00Z', '2026-04-14T10:00:00Z')).toEqual({ ok: true });
  });

  it('accepts start at opening and end at closing; rejects one minute outside', () => {
    expect(check(rules(), '2026-04-14T08:00:00Z', '2026-04-14T09:00:00Z').ok).toBe(true);
    expect(check(rules(), '2026-04-14T15:00:00Z', '2026-04-14T16:00:00Z').ok).toBe(true);
    expect(check(rules(), '2026-04-14T07:59:00Z', '2026-04-14T09:00:00Z')).toMatchObject({
      ok: false,
      code: 'OUTSIDE_HOURS',
    });
    expect(check(rules(), '2026-04-14T15:01:00Z', '2026-04-14T16:01:00Z')).toMatchObject({
      code: 'OUTSIDE_HOURS',
    });
  });

  it('rejects a booking that starts exactly at closing time', () => {
    expect(check(rules(), '2026-04-14T16:00:00Z', '2026-04-14T16:30:00Z')).toMatchObject({
      code: 'OUTSIDE_HOURS',
    });
  });

  it('names the weekday, the open ranges and the zone in the message', () => {
    const r = rules({
      weeklyRanges: weekdays([
        [h(9), h(12)],
        [h(13), h(17)],
      ]),
    });
    expect(check(r, '2026-04-13T11:30:00Z', '2026-04-13T12:30:00Z')).toEqual({
      ok: false,
      code: 'OUTSIDE_HOURS',
      message:
        'Appointments on Monday must fall within 09:00-12:00 or 13:00-17:00 (Europe/London).',
    });
  });

  it('treats a weekday with no ranges as closed', () => {
    expect(check(rules(), '2026-04-18T09:00:00Z', '2026-04-18T10:00:00Z')).toEqual({
      ok: false,
      code: 'OUTSIDE_HOURS',
      message: 'The firm is closed on Saturdays (Europe/London).',
    });
  });

  it('applies different hours per weekday', () => {
    const r = rules({
      weeklyRanges: [
        { weekday: 1, startMinute: h(9), endMinute: h(12) },
        { weekday: 3, startMinute: h(13), endMinute: h(18) },
      ],
    });
    expect(check(r, '2026-04-15T09:00:00Z', '2026-04-15T10:00:00Z')).toMatchObject({
      code: 'OUTSIDE_HOURS',
    });
    expect(check(r, '2026-04-15T12:00:00Z', '2026-04-15T13:00:00Z')).toEqual({ ok: true });
  });

  it('allows a booking across touching ranges but not across a gap', () => {
    const touching = rules({
      weeklyRanges: weekdays([
        [h(9), h(12)],
        [h(12), h(17)],
      ]),
    });
    expect(check(touching, '2026-04-14T10:00:00Z', '2026-04-14T12:00:00Z')).toEqual({ ok: true });
    const gap = rules({
      weeklyRanges: weekdays([
        [h(9), h(12)],
        [h(14), h(17)],
      ]),
    });
    expect(check(gap, '2026-04-14T10:00:00Z', '2026-04-14T14:00:00Z')).toMatchObject({
      code: 'OUTSIDE_HOURS',
    });
  });

  it('rounds a seconds-past end up (17:00:30 does not fit a 17:00 close)', () => {
    expect(check(rules(), '2026-04-14T15:00:00Z', '2026-04-14T16:00:30Z')).toMatchObject({
      code: 'OUTSIDE_HOURS',
    });
  });
});

describe('evaluateAvailability — midnight', () => {
  const allDay = rules({ weeklyRanges: weekdays([[h(0), 1440]], [0, 1, 2, 3, 4, 5, 6]) });

  it('accepts 23:00-24:00 when the range ends at 1440', () => {
    expect(check(allDay, '2026-04-14T22:00:00Z', '2026-04-14T23:00:00Z')).toEqual({ ok: true });
  });

  it('rejects a booking running past local midnight with the multi-day message', () => {
    expect(check(allDay, '2026-04-14T22:30:00Z', '2026-04-14T23:30:00Z')).toEqual({
      ok: false,
      code: 'SPANS_MIDNIGHT',
      message:
        'Appointments cannot run past midnight. Book multi-day events as one appointment per day.',
    });
  });

  it('rejects the legacy cross-midnight shape (18:00 -> 08:00 next day)', () => {
    expect(check(rules(), '2026-04-14T17:00:00Z', '2026-04-15T07:00:00Z')).toMatchObject({
      code: 'SPANS_MIDNIGHT',
    });
  });

  it('rejects an end at next-day 00:00 when the last range closes earlier', () => {
    const r = rules({ weeklyRanges: weekdays([[h(9), h(17)]]) });
    expect(check(r, '2026-04-14T22:00:00Z', '2026-04-14T23:00:00Z')).toMatchObject({
      code: 'OUTSIDE_HOURS',
    });
  });
});

describe('evaluateAvailability — closures', () => {
  const closures = [{ startDate: '2026-12-24', endDate: '2026-12-26' }];
  const open = rules({ weeklyRanges: weekdays([[h(0), 1440]], [0, 1, 2, 3, 4, 5, 6]), closures });

  it('rejects the first, middle and last day of an inclusive closure', () => {
    for (const d of ['2026-12-24', '2026-12-25', '2026-12-26']) {
      expect(check(open, `${d}T10:00:00Z`, `${d}T11:00:00Z`)).toEqual({
        ok: false,
        code: 'CLOSED_DATE',
        message: `The firm is closed on ${d}.`,
      });
    }
  });

  it('accepts the day before and the day after', () => {
    expect(check(open, '2026-12-23T10:00:00Z', '2026-12-23T11:00:00Z').ok).toBe(true);
    expect(check(open, '2026-12-27T10:00:00Z', '2026-12-27T11:00:00Z').ok).toBe(true);
  });

  it('does not treat a 24:00 end as touching the next (closed) day', () => {
    expect(check(open, '2026-12-23T23:00:00Z', '2026-12-24T00:00:00Z')).toEqual({ ok: true });
  });

  it('checks the closure before the hours (closure message wins)', () => {
    const r = rules({ closures: [{ startDate: '2026-12-26', endDate: '2026-12-26' }] }); // Saturday
    expect(check(r, '2026-12-26T10:00:00Z', '2026-12-26T11:00:00Z')).toMatchObject({
      code: 'CLOSED_DATE',
    });
  });

  it('compares closure dates in the firm zone, not UTC', () => {
    const nz = rules({
      timezone: AUCKLAND,
      weeklyRanges: weekdays([[h(0), 1440]], [0, 1, 2, 3, 4, 5, 6]),
      closures: [{ startDate: '2026-04-14', endDate: '2026-04-14' }],
    });
    // 2026-04-13T22:00Z is 10:00 on Tue 14 April in Auckland.
    expect(check(nz, '2026-04-13T22:00:00Z', '2026-04-13T23:00:00Z')).toMatchObject({
      code: 'CLOSED_DATE',
    });
  });

  it('never puts a closure reason or an id in the message', () => {
    const r = check(open, '2026-12-25T10:00:00Z', '2026-12-25T11:00:00Z');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).not.toMatch(/reason|christmas|id/i);
    }
  });
});

describe('evaluateAvailability — daily cap', () => {
  const capped = rules({ maxDailyBookings: 3 });

  it('allows count = cap - 1 and rejects count = cap', () => {
    expect(check(capped, '2026-04-14T09:00:00Z', '2026-04-14T10:00:00Z', 2)).toEqual({ ok: true });
    expect(check(capped, '2026-04-14T09:00:00Z', '2026-04-14T10:00:00Z', 3)).toEqual({
      ok: false,
      code: 'DAILY_CAP_REACHED',
      message: 'The daily booking limit for 2026-04-14 has been reached.',
    });
  });

  it('treats a null cap as unlimited', () => {
    expect(check(rules(), '2026-04-14T09:00:00Z', '2026-04-14T10:00:00Z', 1000)).toEqual({
      ok: true,
    });
  });

  it('throws when a cap is set but no count is supplied', () => {
    expect(() => check(capped, '2026-04-14T09:00:00Z', '2026-04-14T10:00:00Z')).toThrow(
      /sameDayCount/
    );
  });

  it('checks hours before the cap', () => {
    expect(check(capped, '2026-04-18T09:00:00Z', '2026-04-18T10:00:00Z', 99)).toMatchObject({
      code: 'OUTSIDE_HOURS',
    });
  });
});

describe('evaluateAvailability — interval and timezone guards', () => {
  it('rejects end <= start', () => {
    expect(check(rules(), '2026-04-14T10:00:00Z', '2026-04-14T10:00:00Z')).toEqual({
      ok: false,
      code: 'INVALID_INTERVAL',
      message: 'Appointment end time must be after its start time.',
    });
  });

  it('returns INVALID_TIMEZONE instead of throwing for a bad firm zone', () => {
    expect(
      check(rules({ timezone: 'Not/AZone' }), '2026-04-14T09:00:00Z', '2026-04-14T10:00:00Z')
    ).toEqual({
      ok: false,
      code: 'INVALID_TIMEZONE',
      message:
        'The firm timezone is invalid. An administrator must fix it in Calendar > Availability.',
    });
  });
});

describe('evaluateAvailability — week boundary and DST', () => {
  it('uses the firm-local weekday, not the UTC weekday (Auckland 23:30)', () => {
    const r = rules({ timezone: AUCKLAND, weeklyRanges: weekdays([[h(23), 1440]], [1]) });
    // 2026-04-13T11:30Z is Mon 23:30 in Auckland (UTC date is still Monday 13th, 11:30).
    expect(check(r, '2026-04-13T11:30:00Z', '2026-04-13T12:00:00Z')).toEqual({ ok: true });
    // 2026-04-12T11:30Z is Sun 23:30 in Auckland: no Sunday range.
    expect(check(r, '2026-04-12T11:30:00Z', '2026-04-12T12:00:00Z')).toMatchObject({
      code: 'OUTSIDE_HOURS',
    });
  });

  it('uses the firm-local weekday in New York at 23:30', () => {
    const r = rules({ timezone: NEW_YORK, weeklyRanges: weekdays([[h(23), 1440]], [2]) });
    // 2026-04-15T03:30Z is Tue 23:30 EDT (UTC weekday is Wednesday).
    expect(check(r, '2026-04-15T03:30:00Z', '2026-04-15T04:00:00Z')).toEqual({ ok: true });
  });

  it('keeps 09:00-17:00 local on both sides of the London changes', () => {
    const r = rules({ weeklyRanges: weekdays([[h(9), h(17)]], [0]) });
    expect(check(r, '2026-03-22T09:00:00Z', '2026-03-22T10:00:00Z').ok).toBe(true); // GMT
    expect(check(r, '2026-03-29T08:00:00Z', '2026-03-29T09:00:00Z').ok).toBe(true); // BST day of change
    expect(check(r, '2026-03-29T09:00:00Z', '2026-03-29T16:01:00Z')).toMatchObject({
      code: 'OUTSIDE_HOURS',
    });
    expect(check(r, '2026-10-25T09:00:00Z', '2026-10-25T17:00:00Z').ok).toBe(true); // GMT again
    expect(check(r, '2026-10-25T09:00:00Z', '2026-10-25T17:01:00Z')).toMatchObject({
      code: 'OUTSIDE_HOURS',
    });
  });

  it('keeps 09:00-17:00 local on both sides of the New York changes', () => {
    const r = rules({ timezone: NEW_YORK, weeklyRanges: weekdays([[h(9), h(17)]], [0]) });
    expect(check(r, '2026-03-08T13:00:00Z', '2026-03-08T21:00:00Z').ok).toBe(true); // EDT 09-17
    expect(check(r, '2026-03-01T14:00:00Z', '2026-03-01T22:00:00Z').ok).toBe(true); // EST 09-17
    expect(check(r, '2026-11-01T14:00:00Z', '2026-11-01T22:00:00Z').ok).toBe(true); // EST again
    expect(check(r, '2026-11-01T13:00:00Z', '2026-11-01T14:00:00Z')).toMatchObject({
      code: 'OUTSIDE_HOURS',
    });
  });

  it('judges both occurrences of an ambiguous local time the same way', () => {
    const r = rules({ weeklyRanges: weekdays([[h(1), h(2)]], [0]) });
    expect(check(r, '2026-10-25T00:30:00Z', '2026-10-25T00:45:00Z').ok).toBe(true); // 01:30 BST
    expect(check(r, '2026-10-25T01:30:00Z', '2026-10-25T01:45:00Z').ok).toBe(true); // 01:30 GMT
  });

  it('handles a half-hour offset zone (Asia/Kolkata)', () => {
    const r = rules({ timezone: KOLKATA, weeklyRanges: weekdays([[h(9, 30), h(17, 30)]]) });
    expect(check(r, '2026-04-13T04:00:00Z', '2026-04-13T05:00:00Z').ok).toBe(true); // 09:30-10:30 IST
    expect(check(r, '2026-04-13T03:59:00Z', '2026-04-13T05:00:00Z')).toMatchObject({
      code: 'OUTSIDE_HOURS',
    });
  });
});

describe('generateCandidates', () => {
  const base = rules({ weeklyRanges: weekdays([[h(9, 30), h(12, 30)]]) });

  it('anchors candidates at each range start (09:30 range yields 09:30, 10:30, 11:30)', () => {
    const got = generateCandidates({
      rules: base,
      from: new Date('2026-04-14T00:00:00Z'),
      durationMinutes: 60,
      maxDaysAhead: 1,
      limit: 10,
    });
    expect(got.map((c) => c.start.toISOString())).toEqual([
      '2026-04-14T08:30:00.000Z',
      '2026-04-14T09:30:00.000Z',
      '2026-04-14T10:30:00.000Z',
    ]);
    expect(got[0].end.toISOString()).toBe('2026-04-14T09:30:00.000Z');
  });

  it('rounds a mid-range `from` up to the next grid point', () => {
    const got = generateCandidates({
      rules: base,
      from: new Date('2026-04-14T08:45:00Z'), // 09:45 BST
      durationMinutes: 60,
      maxDaysAhead: 1,
      limit: 10,
    });
    // Horizon is 24 h from `from`, so the next morning's first slot (09:30 BST) is still inside it.
    expect(got.map((c) => c.start.toISOString())).toEqual([
      '2026-04-14T09:30:00.000Z',
      '2026-04-14T10:30:00.000Z',
      '2026-04-15T08:30:00.000Z',
    ]);
  });

  it('skips closed weekdays and closure dates and stops at the horizon', () => {
    const r = rules({
      weeklyRanges: weekdays([[h(9), h(10)]]),
      closures: [{ startDate: '2026-04-20', endDate: '2026-04-20' }], // Monday
    });
    const got = generateCandidates({
      rules: r,
      from: new Date('2026-04-17T12:00:00Z'), // Fri after hours
      durationMinutes: 60,
      maxDaysAhead: 5,
      limit: 10,
    });
    expect(got.map((c) => c.start.toISOString())).toEqual([
      '2026-04-21T08:00:00.000Z',
      '2026-04-22T08:00:00.000Z',
    ]);
  });

  it('skips ranges too short for the duration', () => {
    const got = generateCandidates({
      rules: rules({ weeklyRanges: weekdays([[h(9), h(9, 30)]]) }),
      from: new Date('2026-04-14T00:00:00Z'),
      durationMinutes: 60,
      maxDaysAhead: 2,
      limit: 10,
    });
    expect(got).toEqual([]);
  });

  it('respects the limit', () => {
    const got = generateCandidates({
      rules: rules({ weeklyRanges: weekdays([[0, 1440]], [0, 1, 2, 3, 4, 5, 6]) }),
      from: new Date('2026-04-14T00:00:00Z'),
      durationMinutes: 15,
      stepMinutes: 15,
      maxDaysAhead: 365,
      limit: AVAILABILITY_LIMITS.maxFindNextSlotCandidates,
    });
    expect(got).toHaveLength(2000);
  });

  it('returns nothing when no weekday is open', () => {
    expect(
      generateCandidates({
        rules: rules({ weeklyRanges: [] }),
        from: new Date('2026-04-14T00:00:00Z'),
        durationMinutes: 30,
        maxDaysAhead: 30,
        limit: 10,
      })
    ).toEqual([]);
  });
});
