/**
 * PG-203 — listOpenSlots: the public booking slot lister (ADR-083).
 *
 * Pure: every case passes `now` and IANA zones explicitly; nothing reads the
 * wall clock or process.env.TZ (time-bomb lesson). Fixed dates are fine here
 * because the function under test never consults the real clock.
 */
import { describe, it, expect, vi } from 'vitest';
import * as policy from '../AvailabilityPolicy';
import { localToUtc, type AvailabilityRules, type WeeklyRange } from '../AvailabilityPolicy';
import { Appointment } from '../Appointment';
import { Buffer } from '../Buffer';
import { ConflictDetector } from '../ConflictDetector';
import { TimeSlot } from '../TimeSlot';
import { listOpenSlots, type BusyInterval } from '../listOpenSlots';

const LONDON = 'Europe/London';
const NEW_YORK = 'America/New_York';
const h = (hour: number, minute = 0) => hour * 60 + minute;

function ranges(start: number, end: number, days: number[] = [1, 2, 3, 4, 5]): WeeklyRange[] {
  return days.map((weekday) => ({
    weekday: weekday as WeeklyRange['weekday'],
    startMinute: start,
    endMinute: end,
  }));
}

function rules(overrides: Partial<AvailabilityRules> = {}): AvailabilityRules {
  return {
    timezone: LONDON,
    weeklyRanges: ranges(h(9), h(12)),
    closures: [],
    maxDailyBookings: null,
    ...overrides,
  };
}

// Monday 2026-11-02 (GMT, no DST in effect).
const MONDAY = '2026-11-02';
const NOW = new Date('2026-11-01T12:00:00Z'); // the Sunday before

function base(overrides: Partial<Parameters<typeof listOpenSlots>[0]> = {}) {
  return {
    rules: rules(),
    fromDate: MONDAY,
    days: 1,
    durationMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    busy: [] as BusyInterval[],
    bookedPerDay: {},
    now: NOW,
    ...overrides,
  };
}

const startsOf = (day: { slots: Array<{ start: Date }> }) =>
  day.slots.map((s) => s.start.toISOString());

describe('listOpenSlots — grid and ranges', () => {
  it('offers 15-minute starts that fit the range', () => {
    const [day] = listOpenSlots(base());
    expect(day.date).toBe(MONDAY);
    // 09:00 .. 11:30 inclusive for a 30-minute meeting in a 09:00-12:00 range.
    expect(day.slots).toHaveLength(11);
    expect(day.slots[0].start.toISOString()).toBe('2026-11-02T09:00:00.000Z');
    expect(day.slots[0].end.toISOString()).toBe('2026-11-02T09:30:00.000Z');
    expect(day.slots.at(-1)!.start.toISOString()).toBe('2026-11-02T11:30:00.000Z');
  });

  it('composes the PG-202 generateCandidates with a 15-minute step', () => {
    const spy = vi.spyOn(policy, 'generateCandidates');
    listOpenSlots(base());
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ stepMinutes: 15, durationMinutes: 30 })
    );
    spy.mockRestore();
  });

  it('returns one entry per requested day, empty when the firm is closed', () => {
    const result = listOpenSlots(
      base({
        days: 3,
        rules: rules({ closures: [{ startDate: '2026-11-03', endDate: '2026-11-03' }] }),
      })
    );
    expect(result.map((d) => d.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(result[1].slots).toEqual([]);
    expect(result[2].slots.length).toBeGreaterThan(0);
  });

  it('offers nothing on weekdays without hours', () => {
    const [saturday] = listOpenSlots(base({ fromDate: '2026-11-07' }));
    expect(saturday.slots).toEqual([]);
  });

  it('honours several ranges on one day', () => {
    const [day] = listOpenSlots(
      base({
        rules: rules({ weeklyRanges: [...ranges(h(9), h(10), [1]), ...ranges(h(14), h(15), [1])] }),
      })
    );
    expect(startsOf(day)).toEqual([
      '2026-11-02T09:00:00.000Z',
      '2026-11-02T09:15:00.000Z',
      '2026-11-02T09:30:00.000Z',
      '2026-11-02T14:00:00.000Z',
      '2026-11-02T14:15:00.000Z',
      '2026-11-02T14:30:00.000Z',
    ]);
  });

  it('caps the slots offered per day at 48', () => {
    const [day] = listOpenSlots(
      base({ durationMinutes: 15, rules: rules({ weeklyRanges: ranges(0, 1440, [1]) }) })
    );
    expect(day.slots).toHaveLength(48);
  });

  it('returns nothing for a non-positive duration', () => {
    const [day] = listOpenSlots(base({ durationMinutes: 0 }));
    expect(day.slots).toEqual([]);
  });
});

describe('listOpenSlots — notice and horizon', () => {
  it('allows a slot exactly 60 minutes ahead and drops one 59 minutes ahead', () => {
    const now = new Date('2026-11-02T09:00:00Z');
    const [day] = listOpenSlots(base({ now }));
    const starts = startsOf(day);
    expect(starts[0]).toBe('2026-11-02T10:00:00.000Z');
    expect(starts).not.toContain('2026-11-02T09:45:00.000Z');

    const almost = listOpenSlots(base({ now: new Date('2026-11-02T09:01:00Z') }))[0];
    expect(startsOf(almost)[0]).toBe('2026-11-02T10:15:00.000Z');
  });

  it('drops slots beyond the 60-day horizon', () => {
    const now = new Date('2026-11-02T08:00:00Z');
    const [inside] = listOpenSlots(base({ now, fromDate: '2026-12-31' })); // Thursday, day 59
    expect(inside.slots.length).toBeGreaterThan(0);
    const [beyond] = listOpenSlots(base({ now, fromDate: '2027-01-04' })); // Monday, day 63
    expect(beyond.slots).toEqual([]);
  });

  it('respects custom notice and horizon arguments', () => {
    const now = new Date('2026-11-02T08:00:00Z');
    const [day] = listOpenSlots(base({ now, noticeMinutes: 180 }));
    expect(startsOf(day)[0]).toBe('2026-11-02T11:00:00.000Z');
    const [none] = listOpenSlots(base({ now, horizonDays: 0 }));
    expect(none.slots).toEqual([]);
  });
});

describe('listOpenSlots — busy time and buffers (ConflictDetector parity)', () => {
  it('excludes slots that overlap a busy interval', () => {
    const busy: BusyInterval[] = [
      {
        start: new Date('2026-11-02T10:00:00Z'),
        end: new Date('2026-11-02T10:30:00Z'),
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
      },
    ];
    const starts = startsOf(listOpenSlots(base({ busy }))[0]);
    expect(starts).toContain('2026-11-02T09:30:00.000Z'); // ends exactly at 10:00 → touching is fine
    expect(starts).not.toContain('2026-11-02T09:45:00.000Z');
    expect(starts).not.toContain('2026-11-02T10:00:00.000Z');
    expect(starts).not.toContain('2026-11-02T10:15:00.000Z');
    expect(starts).toContain('2026-11-02T10:30:00.000Z');
  });

  it('applies the candidate buffers and the busy interval buffers', () => {
    const busy: BusyInterval[] = [
      {
        start: new Date('2026-11-02T10:00:00Z'),
        end: new Date('2026-11-02T10:30:00Z'),
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 15,
      },
    ];
    const starts = startsOf(listOpenSlots(base({ busy, bufferBeforeMinutes: 15 }))[0]);
    // Busy effective window 10:00-10:45; candidate effective window starts 15 min early.
    expect(starts).not.toContain('2026-11-02T10:45:00.000Z'); // effective 10:30 < 10:45
    expect(starts).toContain('2026-11-02T11:00:00.000Z'); // effective 10:45, touching
    expect(starts).toContain('2026-11-02T09:30:00.000Z'); // effective 09:15-10:00, touching
    expect(starts).not.toContain('2026-11-02T09:45:00.000Z'); // effective 09:30-10:15 overlaps
  });

  it('agrees with ConflictDetector.checkTimeSlotConflicts on every candidate', () => {
    // Far-future dates: Appointment.create rejects past starts against the real clock.
    const day = '2099-03-02'; // Monday
    const existing = Appointment.create({
      title: 'Existing',
      startTime: new Date(`${day}T10:05:00Z`),
      endTime: new Date(`${day}T10:40:00Z`),
      appointmentType: 'MEETING',
      organizerId: 'host-1',
      tenantId: 'tenant-1',
      buffer: Buffer.create(10, 5).value,
    }).value;
    const busy: BusyInterval[] = [
      {
        start: existing.startTime,
        end: existing.endTime,
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 5,
      },
    ];
    const buffer = Buffer.create(5, 10).value;
    const offered = new Set(
      startsOf(
        listOpenSlots(
          base({
            fromDate: day,
            now: new Date('2099-03-01T00:00:00Z'),
            busy,
            bufferBeforeMinutes: 5,
            bufferAfterMinutes: 10,
          })
        )[0]
      )
    );
    const all = listOpenSlots(
      base({
        fromDate: day,
        now: new Date('2099-03-01T00:00:00Z'),
        bufferBeforeMinutes: 5,
        bufferAfterMinutes: 10,
      })
    )[0];
    expect(all.slots.length).toBe(11);
    for (const slot of all.slots) {
      const conflict = ConflictDetector.checkTimeSlotConflicts(
        TimeSlot.create(slot.start, slot.end).value,
        buffer,
        [existing]
      ).hasConflicts;
      expect(offered.has(slot.start.toISOString())).toBe(!conflict);
    }
  });
});

describe('listOpenSlots — daily cap', () => {
  it('hides a day once its bookings reach the cap', () => {
    const result = listOpenSlots(
      base({
        days: 2,
        rules: rules({ maxDailyBookings: 2 }),
        bookedPerDay: { '2026-11-02': 2, '2026-11-03': 1 },
      })
    );
    expect(result[0].slots).toEqual([]);
    expect(result[1].slots.length).toBeGreaterThan(0);
  });

  it('ignores booked counts when there is no cap', () => {
    const [day] = listOpenSlots(base({ bookedPerDay: { [MONDAY]: 99 } }));
    expect(day.slots.length).toBe(11);
  });
});

describe('listOpenSlots — time zones and DST', () => {
  it('uses firm-local hours in New York (EST after the November change)', () => {
    const [day] = listOpenSlots(
      base({ rules: rules({ timezone: NEW_YORK }), now: new Date('2026-11-01T12:00:00Z') })
    );
    expect(day.slots[0].start.toISOString()).toBe(localToUtc(MONDAY, h(9), NEW_YORK).toISOString());
    expect(day.slots[0].start.toISOString()).toBe('2026-11-02T14:00:00.000Z');
  });

  it('keeps 09:00 local on the London fall-back day', () => {
    const sunday = '2026-10-25';
    const [day] = listOpenSlots(
      base({
        fromDate: sunday,
        now: new Date('2026-10-20T00:00:00Z'),
        rules: rules({ weeklyRanges: ranges(h(9), h(12), [0]) }),
      })
    );
    expect(day.slots[0].start.toISOString()).toBe('2026-10-25T09:00:00.000Z');
    expect(day.slots).toHaveLength(11);
  });

  it('keeps 09:00 local on the London spring-forward day', () => {
    const sunday = '2027-03-28';
    const [day] = listOpenSlots(
      base({
        fromDate: sunday,
        now: new Date('2027-03-20T00:00:00Z'),
        rules: rules({ weeklyRanges: ranges(h(9), h(12), [0]) }),
      })
    );
    expect(day.slots[0].start.toISOString()).toBe('2027-03-28T08:00:00.000Z');
    expect(day.slots).toHaveLength(11);
  });

  it('keeps 09:00 local on the New York spring-forward and fall-back days', () => {
    const spring = listOpenSlots(
      base({
        fromDate: '2027-03-14',
        now: new Date('2027-03-01T00:00:00Z'),
        rules: rules({ timezone: NEW_YORK, weeklyRanges: ranges(h(9), h(12), [0]) }),
      })
    )[0];
    expect(spring.slots[0].start.toISOString()).toBe('2027-03-14T13:00:00.000Z');
    const fall = listOpenSlots(
      base({
        fromDate: '2026-11-01',
        now: new Date('2026-10-20T00:00:00Z'),
        rules: rules({ timezone: NEW_YORK, weeklyRanges: ranges(h(9), h(12), [0]) }),
      })
    )[0];
    expect(fall.slots[0].start.toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });

  it('never offers a slot that runs past local midnight', () => {
    const [day] = listOpenSlots(
      base({ rules: rules({ weeklyRanges: ranges(h(23), 1440, [1]) }), durationMinutes: 45 })
    );
    expect(startsOf(day)).toEqual(['2026-11-02T23:00:00.000Z', '2026-11-02T23:15:00.000Z']);
  });
});
