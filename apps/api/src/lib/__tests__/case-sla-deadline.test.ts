/**
 * computeSlaDeadline — PG-204 (spec D7): 23:59:59.999 local on calendar day today+N.
 */
import { describe, it, expect } from 'vitest';
import { computeSlaDeadline } from '../case-sla-deadline';

/** Local wall-clock of a UTC instant in a zone, as `YYYY-MM-DD HH:mm:ss.SSS`. */
function local(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}.${get('fractionalSecond')}`;
}

describe('computeSlaDeadline', () => {
  it('UTC (no timezone): end of day N days ahead', () => {
    const now = new Date('2026-10-13T09:30:00Z');
    expect(computeSlaDeadline(now, 14, null).toISOString()).toBe('2026-10-27T23:59:59.999Z');
  });

  it('falls back to UTC for an invalid timezone', () => {
    const now = new Date('2026-10-13T09:30:00Z');
    expect(computeSlaDeadline(now, 1, 'Not/AZone').toISOString()).toBe('2026-10-14T23:59:59.999Z');
  });

  it('Europe/London across the BST→GMT change', () => {
    // 2026-10-20 10:00 BST; +14 days lands on 2026-11-03 (GMT).
    const deadline = computeSlaDeadline(new Date('2026-10-20T09:00:00Z'), 14, 'Europe/London');
    expect(local(deadline, 'Europe/London')).toBe('2026-11-03 23:59:59.999');
    expect(deadline.toISOString()).toBe('2026-11-03T23:59:59.999Z');
  });

  it('America/New_York: target day is the spring-forward day', () => {
    const deadline = computeSlaDeadline(new Date('2026-03-01T15:00:00Z'), 7, 'America/New_York');
    expect(local(deadline, 'America/New_York')).toBe('2026-03-08 23:59:59.999');
  });

  it('America/New_York: target day is the fall-back day', () => {
    const deadline = computeSlaDeadline(new Date('2026-10-25T15:00:00Z'), 7, 'America/New_York');
    expect(local(deadline, 'America/New_York')).toBe('2026-11-01 23:59:59.999');
  });

  it('Australia/Sydney (ahead of UTC, southern DST)', () => {
    // 2026-10-13 08:00 AEDT is 2026-10-12 21:00Z — the local date is already the 13th.
    const deadline = computeSlaDeadline(new Date('2026-10-12T21:00:00Z'), 3, 'Australia/Sydney');
    expect(local(deadline, 'Australia/Sydney')).toBe('2026-10-16 23:59:59.999');
  });

  it('Pacific/Kiritimati (UTC+14)', () => {
    const deadline = computeSlaDeadline(new Date('2026-10-13T12:00:00Z'), 2, 'Pacific/Kiritimati');
    // 12:00Z is 02:00 on the 14th locally.
    expect(local(deadline, 'Pacific/Kiritimati')).toBe('2026-10-16 23:59:59.999');
  });

  it('America/Santiago: a day whose last hour repeats ends at the later instant', () => {
    // Clocks go back from 24:00 to 23:00 at the end of 2026-04-04, so 23:59:59.999 happens twice.
    const deadline = computeSlaDeadline(new Date('2026-04-03T15:00:00Z'), 1, 'America/Santiago');
    expect(deadline.toISOString()).toBe('2026-04-05T03:59:59.999Z');
    expect(local(deadline, 'America/Santiago')).toBe('2026-04-04 23:59:59.999');
  });

  it('Asia/Beirut: the day before a midnight spring-forward ends right before the jump', () => {
    // Lebanon skips 00:00-01:00 on 2026-03-29, so 2026-03-28 ends at 21:59:59.999Z (+02:00).
    const deadline = computeSlaDeadline(new Date('2026-03-27T10:00:00Z'), 1, 'Asia/Beirut');
    expect(deadline.toISOString()).toBe('2026-03-28T21:59:59.999Z');
    expect(local(deadline, 'Asia/Beirut')).toBe('2026-03-28 23:59:59.999');
  });

  it('Asia/Amman: the day before a repeated midnight ends at its first midnight', () => {
    // 2021-10-29 01:00 went back to 00:00, so that day starts at the first 00:00 (21:00Z, +03:00).
    const deadline = computeSlaDeadline(new Date('2021-10-27T12:00:00Z'), 1, 'Asia/Amman');
    expect(deadline.toISOString()).toBe('2021-10-28T20:59:59.999Z');
    expect(local(deadline, 'Asia/Amman')).toBe('2021-10-28 23:59:59.999');
  });

  it('late evening stays on the local date', () => {
    // 23:30 in New York on 2026-10-13 is 03:30Z on the 14th.
    const deadline = computeSlaDeadline(new Date('2026-10-14T03:30:00Z'), 1, 'America/New_York');
    expect(local(deadline, 'America/New_York')).toBe('2026-10-14 23:59:59.999');
  });

  it('every day of 2021 and 2026 ends exactly at the last local instant, in DST-unusual zones', () => {
    const zones = [
      'UTC',
      'Europe/London',
      'America/New_York',
      'America/Santiago',
      'America/Havana',
      'Asia/Amman',
      'Asia/Beirut',
      'Australia/Lord_Howe',
      'Pacific/Chatham',
      'Pacific/Kiritimati',
      'America/St_Johns',
    ];
    const dateOf = (instant: Date, zone: string) => local(instant, zone).slice(0, 10);
    for (const zone of zones) {
      for (const year of [2021, 2026]) {
        for (let day = 0; day < 365; day++) {
          const now = new Date(Date.UTC(year, 0, 1 + day, 12));
          const deadline = computeSlaDeadline(now, 1, zone);
          const today = dateOf(now, zone);
          const expected = dateOf(
            new Date(Date.parse(`${today}T12:00:00Z`) + 24 * 3600 * 1000),
            'UTC'
          );
          // Last instant of local day D+1: it reads 23:59:59.999 on that day and 1 ms later is the next day.
          expect(local(deadline, zone), `${zone} ${today}`).toBe(`${expected} 23:59:59.999`);
          expect(dateOf(new Date(deadline.getTime() + 1), zone), `${zone} ${today}`).not.toBe(
            expected
          );
        }
      }
    }
  });
});
