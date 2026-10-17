import { describe, it, expect } from 'vitest';
import {
  DISPLAY_ORDER,
  WEEKDAY_NAMES,
  minutesToTime,
  timeToMinutes,
  prefillLegacyDays,
  toDraft,
  toUpdateInput,
  normalize,
  validateDraft,
  issuePathToFieldId,
  rangeFieldId,
  closureFieldId,
  formatDaySummary,
  formatClosureDate,
  type AvailabilityDraft,
} from '../availability-draft';

const h = (hour: number, minute = 0) => hour * 60 + minute;

function dto(overrides: Record<string, unknown> = {}) {
  return {
    isConfigured: true,
    timezone: 'Europe/London',
    days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      ranges:
        weekday === 1
          ? [
              { startMinute: h(9), endMinute: h(12) },
              { startMinute: h(13), endMinute: 1440 },
            ]
          : [],
    })),
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 0,
    maxDailyBookings: null,
    closures: [{ id: 'c1', startDate: '2026-12-24', endDate: '2026-12-26', reason: 'Christmas' }],
    canEdit: true,
    ...overrides,
  } as const;
}

function draft(overrides: Partial<AvailabilityDraft> = {}): AvailabilityDraft {
  return { ...toDraft(dto() as never), ...overrides };
}

describe('time conversion', () => {
  it('formats minutes as HH:MM and 1440 as 00:00', () => {
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(h(9, 5))).toBe('09:05');
    expect(minutesToTime(h(23, 59))).toBe('23:59');
    expect(minutesToTime(1440)).toBe('00:00');
  });

  it('parses times, treating an end of 00:00 as midnight (1440)', () => {
    expect(timeToMinutes('09:30', 'start')).toBe(h(9, 30));
    expect(timeToMinutes('00:00', 'start')).toBe(0);
    expect(timeToMinutes('00:00', 'end')).toBe(1440);
    expect(timeToMinutes('7:00', 'start')).toBe(h(7));
    expect(timeToMinutes('', 'start')).toBeNull();
    expect(timeToMinutes('25:00', 'end')).toBeNull();
    expect(timeToMinutes('nope', 'end')).toBeNull();
  });
});

describe('weekday helpers', () => {
  it('displays Monday first while storing 0 = Sunday', () => {
    expect(DISPLAY_ORDER).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(WEEKDAY_NAMES[0]).toBe('Sunday');
    expect(WEEKDAY_NAMES[1]).toBe('Monday');
  });

  it('summarises a day as text', () => {
    const d = draft();
    expect(formatDaySummary(d.days[1])).toBe('09:00 to 12:00 and 13:00 to midnight (end of day)');
    expect(formatDaySummary(d.days[2])).toBe('Closed');
  });
});

describe('toDraft', () => {
  it('maps a configured DTO, keeping a 1440 end as 00:00', () => {
    const d = toDraft(dto() as never);
    expect(d.timezone).toBe('Europe/London');
    expect(d.days).toHaveLength(7);
    expect(d.days[1].open).toBe(true);
    expect(d.days[1].ranges.map((r) => [r.start, r.end])).toEqual([
      ['09:00', '12:00'],
      ['13:00', '00:00'],
    ]);
    expect(d.days[0].open).toBe(false);
    expect(d.bufferBefore).toBe('10');
    expect(d.capEnabled).toBe(false);
    expect(d.closures).toEqual([
      expect.objectContaining({
        startDate: '2026-12-24',
        endDate: '2026-12-26',
        reason: 'Christmas',
      }),
    ]);
  });

  it('prefills the legacy 07:00-19:00 rule on every day when unconfigured', () => {
    const d = toDraft(
      dto({
        isConfigured: false,
        days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, ranges: [] })),
      }) as never
    );
    expect(d.days.every((day) => day.open && day.ranges.length === 1)).toBe(true);
    expect(d.days[3].ranges[0]).toMatchObject({ start: '07:00', end: '19:00' });
    expect(prefillLegacyDays()).toHaveLength(7);
  });

  it('maps a cap into the switch + number', () => {
    const d = toDraft(dto({ maxDailyBookings: 6 }) as never);
    expect(d.capEnabled).toBe(true);
    expect(d.cap).toBe('6');
  });
});

describe('toUpdateInput', () => {
  it('sends open days only and strips client keys', () => {
    const d = draft();
    d.days[3] = { ...d.days[3], open: false, ranges: [{ key: 'k', start: '09:00', end: '10:00' }] };
    const input = toUpdateInput(d);
    expect(input.days).toHaveLength(7);
    expect(input.days[1].ranges).toEqual([
      { startMinute: h(9), endMinute: h(12) },
      { startMinute: h(13), endMinute: 1440 },
    ]);
    expect(input.days[3].ranges).toEqual([]);
    expect(input.closures).toEqual([
      { startDate: '2026-12-24', endDate: '2026-12-26', reason: 'Christmas' },
    ]);
    expect(input).toMatchObject({
      timezone: 'Europe/London',
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 0,
      maxDailyBookings: null,
    });
  });

  it('sends a blank reason as null and the cap only when enabled', () => {
    const d = draft({ capEnabled: true, cap: '4' });
    d.closures = [{ ...d.closures[0], reason: '   ' }];
    const input = toUpdateInput(d);
    expect(input.closures[0].reason).toBeNull();
    expect(input.maxDailyBookings).toBe(4);
    expect(toUpdateInput({ ...d, capEnabled: false }).maxDailyBookings).toBeNull();
  });
});

describe('normalize', () => {
  it('is stable across key changes and ignores hidden ranges of closed days', () => {
    const a = draft();
    const b = draft();
    b.closures = b.closures.map((c) => ({ ...c, key: 'other-key' }));
    expect(normalize(a)).toBe(normalize(b));
    const c = draft();
    c.days[2] = { ...c.days[2], open: false, ranges: [{ key: 'x', start: '09:00', end: '10:00' }] };
    expect(normalize(c)).toBe(normalize(a));
  });

  it('changes when a value changes', () => {
    expect(normalize(draft({ bufferBefore: '20' }))).not.toBe(normalize(draft()));
  });
});

describe('validateDraft', () => {
  it('accepts the mapped DTO', () => {
    expect(validateDraft(draft())).toEqual([]);
  });

  it('reports range problems on the open day, with positional messages', () => {
    const d = draft();
    d.days[1] = {
      ...d.days[1],
      ranges: [
        { key: 'a', start: '09:00', end: '12:00' },
        { key: 'b', start: '11:00', end: '14:00' },
        { key: 'c', start: '', end: '15:00' },
        { key: 'd', start: '16:00', end: '15:00' },
      ],
    };
    expect(validateDraft(d)).toEqual([
      { fieldId: rangeFieldId(1, 1, 'start'), message: 'Monday range 2 overlaps range 1' },
      { fieldId: rangeFieldId(1, 2, 'start'), message: 'Enter a start time for Monday range 3' },
      { fieldId: rangeFieldId(1, 3, 'end'), message: 'Monday range 4 must end after it starts' },
    ]);
  });

  it('rejects a 00:00-00:00 range', () => {
    const d = draft();
    d.days[2] = { ...d.days[2], open: true, ranges: [{ key: 'z', start: '00:00', end: '00:00' }] };
    expect(validateDraft(d)).toEqual([
      { fieldId: rangeFieldId(2, 0, 'end'), message: 'Tuesday range 1 must end after it starts' },
    ]);
  });

  it('does not validate the hidden ranges of a closed day', () => {
    const d = draft();
    d.days[4] = { ...d.days[4], open: false, ranges: [{ key: 'q', start: '10:00', end: '09:00' }] };
    expect(validateDraft(d)).toEqual([]);
  });

  it('checks the timezone, buffers and cap', () => {
    expect(validateDraft(draft({ timezone: '' }))).toEqual([
      { fieldId: 'availability-timezone', message: 'Choose a valid timezone' },
    ]);
    expect(validateDraft(draft({ bufferBefore: '', bufferAfter: '241' }))).toEqual([
      { fieldId: 'buffer-before', message: 'Enter 0 to 240 minutes' },
      { fieldId: 'buffer-after', message: 'Enter 0 to 240 minutes' },
    ]);
    expect(validateDraft(draft({ capEnabled: true, cap: '' }))).toEqual([
      { fieldId: 'cap-max', message: 'Enter a number from 1 to 500' },
    ]);
    expect(validateDraft(draft({ capEnabled: true, cap: '501' }))).toHaveLength(1);
    expect(validateDraft(draft({ capEnabled: false, cap: '' }))).toEqual([]);
  });

  it('checks closures in order', () => {
    const d = draft({
      closures: [
        { key: 'a', startDate: '', endDate: '2026-01-01', reason: '' },
        { key: 'b', startDate: '2026-05-02', endDate: '2026-05-01', reason: '' },
        { key: 'c', startDate: '2026-01-01', endDate: '2027-01-03', reason: '' },
        { key: 'd', startDate: '1999-12-31', endDate: '1999-12-31', reason: '' },
        { key: 'e', startDate: '2026-08-01', endDate: '2026-08-03', reason: 'x'.repeat(201) },
        { key: 'f', startDate: '2026-08-03', endDate: '2026-08-04', reason: '' },
      ],
    });
    expect(validateDraft(d)).toEqual([
      { fieldId: closureFieldId('a', 'start'), message: 'Enter a start date for closure 1' },
      {
        fieldId: closureFieldId('b', 'end'),
        message: 'Closure 2 must end on or after its start date',
      },
      { fieldId: closureFieldId('c', 'end'), message: 'Closure 3 can span at most 366 days' },
      {
        fieldId: closureFieldId('d', 'start'),
        message: 'Closure 4 dates must be between 2000-01-01 and 2100-12-31',
      },
      {
        fieldId: closureFieldId('e', 'reason'),
        message: 'Closure 5 reason can be at most 200 characters',
      },
      { fieldId: closureFieldId('f', 'start'), message: 'Closure 6 overlaps closure 5' },
    ]);
  });

  it('returns errors in DOM order: hours, timezone, closures, buffers', () => {
    const d = draft({ timezone: '', bufferBefore: '' });
    d.days[1] = { ...d.days[1], ranges: [{ key: 'a', start: '', end: '10:00' }] };
    d.closures = [{ key: 'x', startDate: '', endDate: '', reason: '' }];
    expect(validateDraft(d).map((e) => e.fieldId)).toEqual([
      rangeFieldId(1, 0, 'start'),
      'availability-timezone',
      closureFieldId('x', 'start'),
      closureFieldId('x', 'end'),
      'buffer-before',
    ]);
  });
});

describe('issuePathToFieldId (server Zod issues)', () => {
  it('maps a Sunday range issue (days index 0) to the Sunday field', () => {
    const d = draft();
    d.days[0] = { ...d.days[0], open: true, ranges: [{ key: 's', start: '09:00', end: '10:00' }] };
    expect(issuePathToFieldId(['days', 0, 'ranges', 0, 'startMinute'], d)).toBe(
      rangeFieldId(0, 0, 'start')
    );
    expect(issuePathToFieldId(['days', 1, 'ranges', 1, 'endMinute'], d)).toBe(
      rangeFieldId(1, 1, 'end')
    );
  });

  it('maps closure, buffer, cap and timezone paths', () => {
    const d = draft();
    expect(issuePathToFieldId(['closures', 0, 'endDate'], d)).toBe(
      closureFieldId(d.closures[0].key, 'end')
    );
    expect(issuePathToFieldId(['closures', 0, 'reason'], d)).toBe(
      closureFieldId(d.closures[0].key, 'reason')
    );
    expect(issuePathToFieldId(['bufferBeforeMinutes'], d)).toBe('buffer-before');
    expect(issuePathToFieldId(['bufferAfterMinutes'], d)).toBe('buffer-after');
    expect(issuePathToFieldId(['maxDailyBookings'], d)).toBe('cap-max');
    expect(issuePathToFieldId(['timezone'], d)).toBe('availability-timezone');
    expect(issuePathToFieldId(['unknown'], d)).toBeNull();
    expect(issuePathToFieldId(['closures', 9, 'startDate'], d)).toBeNull();
  });
});

describe('formatClosureDate', () => {
  it('formats a calendar date without shifting it by the viewer zone', () => {
    expect(formatClosureDate('2026-12-24')).toBe('24 Dec 2026');
    expect(formatClosureDate('2026-01-01')).toBe('1 Jan 2026');
  });
});
