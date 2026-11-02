/**
 * PG-203 — later occurrences of a recurring appointment are busy time (codex HIGH).
 */
import { describe, it, expect } from 'vitest';
import { toZonedParts } from '@intelliflow/domain';
import { recurringBusyIntervals } from '../recurring-busy';

const toLocal = (d: Date) => toZonedParts(d, 'Pacific/Auckland').date;

const row = (recurrence: unknown) => ({
  startTime: new Date('2026-10-26T10:00:00Z'), // a Monday
  endTime: new Date('2026-10-26T11:00:00Z'),
  bufferMinutesBefore: 5,
  bufferMinutesAfter: 10,
  recurrence,
  timezone: null as string | null,
});

const windowStart = new Date('2026-11-01T00:00:00Z');
const windowEnd = new Date('2026-11-15T00:00:00Z');

describe('recurringBusyIntervals', () => {
  it('expands a weekly series into the window, with its length and buffers', () => {
    const busy = recurringBusyIntervals(
      [row({ frequency: 'WEEKLY', interval: 1, daysOfWeek: ['MONDAY'] })],
      windowStart,
      windowEnd
    );
    expect(busy.map((b) => b.start.toISOString())).toEqual([
      '2026-11-02T10:00:00.000Z',
      '2026-11-09T10:00:00.000Z',
    ]);
    expect(busy[0]).toMatchObject({
      end: new Date('2026-11-02T11:00:00Z'),
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 10,
    });
  });

  it('respects the end date and skipped dates of the series', () => {
    expect(
      recurringBusyIntervals(
        [
          row({
            frequency: 'WEEKLY',
            daysOfWeek: ['MONDAY'],
            exceptionDates: ['2026-11-02T10:00:00.000Z'],
          }),
        ],
        windowStart,
        windowEnd
      ).map((b) => b.start.toISOString())
    ).toEqual(['2026-11-09T10:00:00.000Z']);
    expect(
      recurringBusyIntervals(
        [row({ frequency: 'WEEKLY', daysOfWeek: ['MONDAY'], endDate: '2026-10-31T00:00:00Z' })],
        windowStart,
        windowEnd
      )
    ).toEqual([]);
  });

  it('anchors a fortnightly series to its first week and counts only real occurrences (codex)', () => {
    const starts = recurringBusyIntervals(
      [row({ frequency: 'WEEKLY', interval: 2, daysOfWeek: ['MONDAY'], occurrenceCount: 2 })],
      windowStart,
      windowEnd
    ).map((b) => b.start.toISOString());
    // 26 Oct is the first, 9 Nov the second; 2 Nov is a free week.
    expect(starts).toEqual(['2026-11-09T10:00:00.000Z']);
  });

  it('keeps the 31st in long months and skips months without it (codex)', () => {
    const monthly = {
      startTime: new Date('2026-01-31T09:00:00Z'),
      endTime: new Date('2026-01-31T09:30:00Z'),
      bufferMinutesBefore: 0,
      bufferMinutesAfter: 0,
      recurrence: { frequency: 'MONTHLY', interval: 1, dayOfMonth: 31 },
      timezone: 'UTC',
    };
    const starts = recurringBusyIntervals(
      [monthly],
      new Date('2026-02-01T00:00:00Z'),
      new Date('2026-06-01T00:00:00Z')
    ).map((b) => b.start.toISOString());
    expect(starts).toEqual(['2026-03-31T09:00:00.000Z', '2026-05-31T09:00:00.000Z']);
  });

  it('expands daily and yearly series too', () => {
    const daily = recurringBusyIntervals(
      [row({ frequency: 'DAILY', interval: 3, endDate: '2026-11-07T00:00:00Z' })],
      windowStart,
      windowEnd
    ).map((b) => b.start.toISOString().slice(0, 10));
    expect(daily).toEqual(['2026-11-01', '2026-11-04', '2026-11-07']); // the end day is inclusive
    const yearly = recurringBusyIntervals(
      [row({ frequency: 'YEARLY', monthOfYear: 11, dayOfMonth: 3 })],
      windowStart,
      windowEnd
    ).map((b) => b.start.toISOString());
    expect(yearly).toEqual(['2026-11-03T10:00:00.000Z']);
  });

  it("reads weekdays and wall-clock time in the appointment's own zone (codex)", () => {
    // Monday 08:30 in Tokyo is Sunday 23:30 UTC.
    const tokyo = {
      startTime: new Date('2026-10-18T23:30:00Z'),
      endTime: new Date('2026-10-19T00:30:00Z'),
      bufferMinutesBefore: 0,
      bufferMinutesAfter: 0,
      recurrence: { frequency: 'WEEKLY', interval: 1, daysOfWeek: ['MONDAY'] },
      timezone: 'Asia/Tokyo',
    };
    expect(
      recurringBusyIntervals(
        [tokyo],
        new Date('2026-10-20T00:00:00Z'),
        new Date('2026-10-27T12:00:00Z')
      ).map((b) => b.start.toISOString())
    ).toEqual(['2026-10-25T23:30:00.000Z']);
    // London 09:00 stays at 09:00 local across the October DST change.
    const london = {
      startTime: new Date('2026-10-19T08:00:00Z'), // 09:00 BST
      endTime: new Date('2026-10-19T09:00:00Z'),
      bufferMinutesBefore: 0,
      bufferMinutesAfter: 0,
      recurrence: { frequency: 'WEEKLY', interval: 1, daysOfWeek: ['MONDAY'] },
      timezone: 'Europe/London',
    };
    expect(
      recurringBusyIntervals(
        [london],
        new Date('2026-10-26T00:00:00Z'),
        new Date('2026-10-27T00:00:00Z')
      ).map((b) => b.start.toISOString())
    ).toEqual(['2026-10-26T09:00:00.000Z']); // 09:00 GMT
  });

  it('reads a skipped date in the series zone, not in UTC (codex)', () => {
    const auckland = {
      startTime: new Date('2026-10-31T20:00:00Z'), // Sunday 1 Nov, 09:00 NZDT
      endTime: new Date('2026-10-31T21:00:00Z'),
      bufferMinutesBefore: 0,
      bufferMinutesAfter: 0,
      // 2 November 09:00 NZDT is stored as the UTC instant on 1 November.
      recurrence: {
        frequency: 'DAILY',
        exceptionDates: ['2026-11-01T20:00:00.000Z', '2026-11-04'],
      },
      timezone: 'Pacific/Auckland',
    };
    expect(
      recurringBusyIntervals(
        [auckland],
        new Date('2026-10-31T00:00:00Z'),
        new Date('2026-11-04T12:00:00Z')
      ).map((b) => toLocal(b.start))
    ).toEqual(['2026-11-01', '2026-11-03']);
  });

  it('falls back to the stored occurrence alone for an unreadable rule', () => {
    expect(
      recurringBusyIntervals(
        [row(null), row('weekly'), row({ frequency: 'HOURLY' })],
        windowStart,
        windowEnd
      )
    ).toEqual([]); // the stored 26 Oct occurrence is outside the window
    const inside = { ...row('weekly'), startTime: new Date('2026-11-03T10:00:00Z') };
    inside.endTime = new Date('2026-11-03T11:00:00Z');
    expect(recurringBusyIntervals([inside], windowStart, windowEnd)).toEqual([
      {
        start: inside.startTime,
        end: inside.endTime,
        bufferBeforeMinutes: 5,
        bufferAfterMinutes: 10,
      },
    ]);
  });

  it('keeps the stored first occurrence busy even when skipped: the DB still reserves it', () => {
    const series = {
      ...row({ frequency: 'DAILY', exceptionDates: ['2026-11-02T10:00:00.000Z'] }),
      startTime: new Date('2026-11-02T10:00:00Z'),
      endTime: new Date('2026-11-02T11:00:00Z'),
    };
    expect(
      recurringBusyIntervals([series], windowStart, new Date('2026-11-04T00:00:00Z')).map((b) =>
        b.start.toISOString()
      )
    ).toEqual(['2026-11-02T10:00:00.000Z', '2026-11-03T10:00:00.000Z']);
  });

  it('keeps a stored start whose weekday the rule does not repeat on (codex)', () => {
    const series = {
      ...row({ frequency: 'WEEKLY', daysOfWeek: ['TUESDAY'] }),
      startTime: new Date('2026-11-02T10:00:00Z'), // a Monday
      endTime: new Date('2026-11-02T11:00:00Z'),
    };
    expect(
      recurringBusyIntervals([series], windowStart, windowEnd).map((b) => b.start.toISOString())
    ).toEqual(['2026-11-02T10:00:00.000Z', '2026-11-03T10:00:00.000Z', '2026-11-10T10:00:00.000Z']);
  });

  it('treats the end date as an inclusive day on the series calendar (codex)', () => {
    const series = (timezone: string, startTime: string, endTime: string, endDate: string) => ({
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      bufferMinutesBefore: 0,
      bufferMinutesAfter: 0,
      recurrence: { frequency: 'WEEKLY', daysOfWeek: ['MONDAY'], endDate },
      timezone,
    });
    // 09:00 London on the last day (stored as midnight UTC) still happens.
    const london = series(
      'Europe/London',
      '2026-11-02T09:00:00Z',
      '2026-11-02T10:00:00Z',
      '2026-11-09T00:00:00.000Z'
    );
    expect(
      recurringBusyIntervals([london], windowStart, windowEnd).map((b) => b.start.toISOString())
    ).toEqual(['2026-11-02T09:00:00.000Z', '2026-11-09T09:00:00.000Z']);
    // 20:00 New York on the last day is 01:00 UTC the next day: still inside the series.
    const newYork = series(
      'America/New_York',
      '2026-11-03T01:00:00Z',
      '2026-11-03T02:00:00Z',
      '2026-11-09T00:00:00.000Z'
    );
    expect(
      recurringBusyIntervals([newYork], windowStart, windowEnd).map((b) => b.start.toISOString())
    ).toEqual(['2026-11-03T01:00:00.000Z', '2026-11-10T01:00:00.000Z']);
  });

  it('keeps the exact first instant in a repeated DST hour (codex)', () => {
    const series = {
      ...row({ frequency: 'DAILY', occurrenceCount: 1 }),
      startTime: new Date('2026-11-01T06:30:00Z'), // the second 01:30 in New York
      endTime: new Date('2026-11-01T07:00:00Z'),
      timezone: 'America/New_York',
    };
    expect(
      recurringBusyIntervals([series], windowStart, windowEnd).map((b) => b.start.toISOString())
    ).toEqual(['2026-11-01T06:30:00.000Z']);
  });
});
