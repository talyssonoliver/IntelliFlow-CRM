/**
 * contact-date-format tests (IFC-256)
 *
 * Shared Contact 360 date formatters, extracted from the route page so the
 * logic stays unit-tested and counted by coverage.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { formatContactDate, formatContactRelativeTime } from '../contact-date-format';

describe('formatContactDate', () => {
  it('formats an ISO date as a short en-GB date', () => {
    expect(formatContactDate('2025-01-09T09:00:00.000Z', 'UTC')).toBe('9 Jan 2025');
  });
});

describe('formatContactRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-20T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Today" for the same day', () => {
    expect(formatContactRelativeTime('2025-01-20T08:00:00.000Z', 'UTC')).toBe('Today');
  });

  it('returns "Yesterday" for one day ago', () => {
    expect(formatContactRelativeTime('2025-01-19T08:00:00.000Z', 'UTC')).toBe('Yesterday');
  });

  it('returns "N days ago" within a week', () => {
    expect(formatContactRelativeTime('2025-01-17T08:00:00.000Z', 'UTC')).toBe('3 days ago');
  });

  it('returns "N weeks ago" within a month', () => {
    expect(formatContactRelativeTime('2025-01-05T08:00:00.000Z', 'UTC')).toBe('2 weeks ago');
  });

  it('falls back to a formatted date beyond a month', () => {
    expect(formatContactRelativeTime('2024-11-01T08:00:00.000Z', 'UTC')).toBe('1 Nov 2024');
  });

  it('uses calendar days in the supplied timezone for the boundary (not elapsed time)', () => {
    // "now" is just after midnight UTC; the date is late the previous UTC day.
    vi.setSystemTime(new Date('2025-01-20T00:30:00.000Z'));
    // Elapsed time is only 1h, but it is the previous calendar day → "Yesterday"
    // (the old elapsed-ms logic would have returned "Today").
    expect(formatContactRelativeTime('2025-01-19T23:30:00.000Z', 'UTC')).toBe('Yesterday');
  });
});
