/**
 * PG-202 — availability validators (AC-002, AC-003, AC-005, AC-011).
 */
import { describe, it, expect } from 'vitest';
import {
  updateAvailabilitySchema,
  availabilityClosureInputSchema,
  type UpdateAvailabilityInput,
} from '../availability';

const h = (hour: number, minute = 0) => hour * 60 + minute;

function days(overrides: Partial<Record<number, Array<[number, number]>>> = {}) {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    ranges: (overrides[weekday] ?? (weekday >= 1 && weekday <= 5 ? [[h(9), h(17)]] : [])).map(
      ([startMinute, endMinute]) => ({ startMinute, endMinute })
    ),
  }));
}

function valid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    timezone: 'Europe/London',
    days: days(),
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 15,
    maxDailyBookings: null,
    closures: [],
    ...overrides,
  };
}

function issues(input: unknown) {
  const r = updateAvailabilitySchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => ({ path: i.path, message: i.message }));
}

describe('updateAvailabilitySchema — shape', () => {
  it('accepts a full configuration', () => {
    const r = updateAvailabilitySchema.safeParse(valid());
    expect(r.success).toBe(true);
  });

  it('accepts a configured week with every day closed', () => {
    expect(issues(valid({ days: days({ 1: [], 2: [], 3: [], 4: [], 5: [] }) }))).toEqual([]);
  });

  it('requires exactly seven unique weekdays', () => {
    expect(issues(valid({ days: days().slice(0, 6) })).length).toBeGreaterThan(0);
    expect(issues(valid({ days: [...days(), { weekday: 1, ranges: [] }] })).length).toBeGreaterThan(
      0
    );
    const dup = days();
    dup[0] = { weekday: 1, ranges: [] };
    expect(issues(valid({ days: dup })).length).toBeGreaterThan(0);
  });

  it.each([
    ['weekday -1', { weekday: -1, ranges: [] }],
    ['weekday 7', { weekday: 7, ranges: [] }],
    ['weekday 1.5', { weekday: 1.5, ranges: [] }],
  ])('rejects %s', (_label, day) => {
    const d = days();
    d[6] = day as never;
    expect(issues(valid({ days: d })).length).toBeGreaterThan(0);
  });

  it.each([
    ['start -1', [-1, h(10)]],
    ['end 1441', [h(9), 1441]],
    ['start == end', [h(9), h(9)]],
    ['start > end', [h(10), h(9)]],
    ['fractional minute', [h(9) + 0.5, h(10)]],
  ])('rejects a range with %s', (_label, range) => {
    expect(
      issues(valid({ days: days({ 1: [range as [number, number]] }) })).length
    ).toBeGreaterThan(0);
  });

  it('accepts the 0..1440 boundaries', () => {
    expect(issues(valid({ days: days({ 1: [[0, 1440]] }) }))).toEqual([]);
  });

  it('allows 6 ranges per weekday and rejects 7', () => {
    const six: Array<[number, number]> = [0, 1, 2, 3, 4, 5].map((i) => [h(8 + i), h(8 + i, 30)]);
    expect(issues(valid({ days: days({ 1: six }) }))).toEqual([]);
    const seven = [...six, [h(15), h(16)] as [number, number]];
    expect(issues(valid({ days: days({ 1: seven }) })).length).toBeGreaterThan(0);
  });
});

describe('updateAvailabilitySchema — overlap superRefine', () => {
  it('rejects overlapping ranges on the same weekday at the later range', () => {
    expect(
      issues(
        valid({
          days: days({
            1: [
              [h(9), h(12)],
              [h(11, 40), h(15)],
            ],
          }),
        })
      )
    ).toEqual([
      { path: ['days', 1, 'ranges', 1, 'startMinute'], message: 'Monday range 2 overlaps range 1' },
    ]);
  });

  it('detects overlap in unsorted input', () => {
    const got = issues(
      valid({
        days: days({
          3: [
            [h(14), h(16)],
            [h(9), h(15)],
          ],
        }),
      })
    );
    expect(got).toEqual([
      {
        path: ['days', 3, 'ranges', 0, 'startMinute'],
        message: 'Wednesday range 1 overlaps range 2',
      },
    ]);
  });

  it('rejects a duplicate range', () => {
    expect(
      issues(
        valid({
          days: days({
            2: [
              [h(9), h(10)],
              [h(9), h(10)],
            ],
          }),
        })
      ).length
    ).toBe(1);
  });

  it('allows touching ranges', () => {
    expect(
      issues(
        valid({
          days: days({
            1: [
              [h(9), h(12)],
              [h(12), h(17)],
            ],
          }),
        })
      )
    ).toEqual([]);
  });

  it('allows the same ranges on different weekdays', () => {
    expect(issues(valid({ days: days({ 1: [[h(9), h(12)]], 2: [[h(9), h(12)]] }) }))).toEqual([]);
  });
});

describe('updateAvailabilitySchema — closures', () => {
  const closure = (startDate: string, endDate: string, reason?: string | null) => ({
    startDate,
    endDate,
    ...(reason === undefined ? {} : { reason }),
  });

  it('accepts a closure with and without a reason', () => {
    expect(issues(valid({ closures: [closure('2026-12-24', '2026-12-26', 'Christmas')] }))).toEqual(
      []
    );
    expect(issues(valid({ closures: [closure('2026-12-31', '2026-12-31')] }))).toEqual([]);
  });

  it.each([
    ['impossible date', '2026-02-30', '2026-02-30'],
    ['month 13', '2026-13-01', '2026-13-01'],
    ['datetime string', '2026-12-24T00:00:00Z', '2026-12-24'],
    ['short year', '26-12-24', '26-12-24'],
    ['before 2000', '1999-12-31', '1999-12-31'],
    ['after 2100', '2101-01-01', '2101-01-01'],
  ])('rejects %s', (_label, startDate, endDate) => {
    expect(issues(valid({ closures: [closure(startDate, endDate)] })).length).toBeGreaterThan(0);
  });

  it('rejects an end date before the start date at endDate', () => {
    const got = issues(valid({ closures: [closure('2026-12-26', '2026-12-24')] }));
    expect(got.map((i) => i.path)).toContainEqual(['closures', 0, 'endDate']);
  });

  it('allows 366 days and rejects 367 (leap year aware)', () => {
    expect(issues(valid({ closures: [closure('2028-01-01', '2028-12-31')] }))).toEqual([]); // 366 days incl. Feb 29
    expect(
      issues(valid({ closures: [closure('2028-01-01', '2029-01-01')] })).length
    ).toBeGreaterThan(0);
    expect(issues(valid({ closures: [closure('2028-02-29', '2028-02-29')] }))).toEqual([]);
  });

  it('trims the reason, maps blank to null and limits it to 200 characters', () => {
    const parsed = availabilityClosureInputSchema.parse(
      closure('2026-12-24', '2026-12-24', '  Office move  ')
    );
    expect(parsed.reason).toBe('Office move');
    expect(
      availabilityClosureInputSchema.parse(closure('2026-12-24', '2026-12-24', '   ')).reason
    ).toBeNull();
    expect(
      availabilityClosureInputSchema.parse(closure('2026-12-24', '2026-12-24', null)).reason
    ).toBeNull();
    expect(
      availabilityClosureInputSchema.parse(closure('2026-12-24', '2026-12-24')).reason
    ).toBeNull();
    expect(
      availabilityClosureInputSchema.safeParse(closure('2026-12-24', '2026-12-24', 'x'.repeat(200)))
        .success
    ).toBe(true);
    expect(
      availabilityClosureInputSchema.safeParse(closure('2026-12-24', '2026-12-24', 'x'.repeat(201)))
        .success
    ).toBe(false);
  });

  it('rejects overlapping and duplicate closures at the later one', () => {
    expect(
      issues(
        valid({
          closures: [closure('2026-12-24', '2026-12-26'), closure('2026-12-26', '2026-12-28')],
        })
      )
    ).toEqual([{ path: ['closures', 1, 'startDate'], message: 'Closure 2 overlaps closure 1' }]);
    expect(
      issues(
        valid({
          closures: [closure('2026-08-01', '2026-08-01'), closure('2026-08-01', '2026-08-01')],
        })
      )
    ).toHaveLength(1);
  });

  it('allows 200 closures and rejects 201', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => {
        const d = new Date(Date.UTC(2030, 0, 1 + i)).toISOString().slice(0, 10);
        return closure(d, d);
      });
    expect(issues(valid({ closures: many(200) }))).toEqual([]);
    expect(issues(valid({ closures: many(201) })).length).toBeGreaterThan(0);
  });
});

describe('updateAvailabilitySchema — buffers, cap, timezone', () => {
  it.each([
    ['bufferBeforeMinutes', 0, true],
    ['bufferBeforeMinutes', 240, true],
    ['bufferBeforeMinutes', -1, false],
    ['bufferAfterMinutes', 241, false],
    ['maxDailyBookings', null, true],
    ['maxDailyBookings', 1, true],
    ['maxDailyBookings', 500, true],
    ['maxDailyBookings', 0, false],
    ['maxDailyBookings', 501, false],
    ['maxDailyBookings', 1.5, false],
  ])('%s = %s → valid %s', (field, value, ok) => {
    expect(updateAvailabilitySchema.safeParse(valid({ [field]: value })).success).toBe(ok);
  });

  it('validates and canonicalises the timezone', () => {
    const r = updateAvailabilitySchema.parse(
      valid({ timezone: 'Asia/Calcutta' })
    ) as UpdateAvailabilityInput;
    expect(updateAvailabilitySchema.safeParse(valid({ timezone: r.timezone })).success).toBe(true);
    expect(updateAvailabilitySchema.safeParse(valid({ timezone: 'Not/AZone' })).success).toBe(
      false
    );
    expect(updateAvailabilitySchema.safeParse(valid({ timezone: '' })).success).toBe(false);
  });

  it('strips unknown keys such as a smuggled tenantId', () => {
    const r = updateAvailabilitySchema.parse(valid({ tenantId: 'smuggled' }));
    expect(r).not.toHaveProperty('tenantId');
  });
});
