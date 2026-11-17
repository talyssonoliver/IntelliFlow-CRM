import { describe, it, expect } from 'vitest';
import { FOLLOW_UP_AFTER_DAYS, followUpCutoff, followUpStatus } from '../follow-ups-due';

const DAY = 86_400_000;
// 17 Nov 2026, 10:00 UTC
const NOW = new Date('2026-11-17T10:00:00.000Z');
const daysAgo = (n: number, hour = 10) =>
  new Date(Date.UTC(2026, 10, 17 - n, hour, 0, 0)).toISOString();

describe('followUpCutoff', () => {
  it('is the last instant of the day 7 days ago, so a lead contacted 7 days ago is due', () => {
    expect(followUpCutoff(NOW).toISOString()).toBe('2026-11-10T23:59:59.999Z');
  });

  it('is the same all day and moves at UTC midnight (safe in a query key)', () => {
    expect(followUpCutoff(new Date('2026-11-17T00:00:00.000Z')).getTime()).toBe(
      followUpCutoff(new Date('2026-11-17T23:59:59.999Z')).getTime()
    );
    expect(
      followUpCutoff(new Date('2026-11-18T00:00:00.000Z')).getTime() -
        followUpCutoff(new Date('2026-11-17T00:00:00.000Z')).getTime()
    ).toBe(DAY);
  });

  it('agrees with followUpStatus: a lead contacted at the cutoff is exactly due today', () => {
    expect(followUpStatus(followUpCutoff(NOW), NOW)).toEqual({ label: 'Due today', tone: 'today' });
  });

  it('is the end of the UTC day 7 days back, across a month boundary', () => {
    expect(followUpCutoff(new Date('2026-12-03T05:00:00.000Z')).toISOString()).toBe(
      '2026-11-26T23:59:59.999Z'
    );
  });

  it('uses the 7 day rule of the Needs Follow-up lead view', () => {
    expect(FOLLOW_UP_AFTER_DAYS).toBe(7);
  });
});

describe('followUpStatus', () => {
  it('is due today when the last contact was 7 days ago', () => {
    expect(followUpStatus(daysAgo(7), NOW)).toEqual({ label: 'Due today', tone: 'today' });
  });

  it('counts overdue days after that', () => {
    expect(followUpStatus(daysAgo(8), NOW)).toEqual({ label: 'Overdue by 1 day', tone: 'overdue' });
    expect(followUpStatus(daysAgo(17), NOW)).toEqual({
      label: 'Overdue by 10 days',
      tone: 'overdue',
    });
  });

  it('works on UTC days, not hours: late evening 7 days ago is still due today', () => {
    expect(followUpStatus(daysAgo(7, 23), NOW).label).toBe('Due today');
  });

  it('says never contacted for a lead with no last contact', () => {
    expect(followUpStatus(null, NOW)).toEqual({ label: 'Never contacted', tone: 'overdue' });
    expect(followUpStatus(undefined, NOW).label).toBe('Never contacted');
    expect(followUpStatus('not a date', NOW).label).toBe('Never contacted');
  });

  it('never reports a lead that is not yet due as overdue', () => {
    expect(followUpStatus(daysAgo(3), NOW)).toEqual({ label: 'Due today', tone: 'today' });
  });

  it('accepts a Date as well as a string', () => {
    expect(followUpStatus(new Date(daysAgo(9)), NOW).label).toBe('Overdue by 2 days');
  });
});
