import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getActivityIcon,
  getActivityIconBg,
  formatRelativeTime,
  formatEstimatedValue,
  type ActivityType,
} from '../lead-format';

const ALL_TYPES: ActivityType[] = [
  'web_form',
  'score_update',
  'email',
  'call',
  'note',
  'meeting',
  'status_change',
  'qualification',
];

describe('lead-format · getActivityIcon', () => {
  it('maps every activity type to its material-symbol icon', () => {
    const expected: Record<ActivityType, string> = {
      web_form: 'web',
      score_update: 'psychology',
      email: 'mail',
      call: 'call',
      note: 'edit_note',
      meeting: 'event',
      status_change: 'person_add',
      qualification: 'verified',
    };
    for (const type of ALL_TYPES) {
      expect(getActivityIcon(type)).toBe(expected[type]);
    }
  });
});

describe('lead-format · getActivityIconBg', () => {
  it('returns background + text classes for every activity type', () => {
    for (const type of ALL_TYPES) {
      const cls = getActivityIconBg(type);
      expect(cls).toContain('bg-');
      expect(cls).toContain('text-');
      expect(cls).toContain('dark:');
    }
  });
});

describe('lead-format · formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders minutes for under an hour', () => {
    expect(formatRelativeTime('2026-06-13T11:30:00.000Z')).toBe('30m ago');
  });

  it('renders hours for under a day', () => {
    expect(formatRelativeTime('2026-06-13T08:00:00.000Z')).toBe('4h ago');
  });

  it('renders "Yesterday" at one day', () => {
    expect(formatRelativeTime('2026-06-12T10:00:00.000Z')).toBe('Yesterday');
  });

  it('renders "N days ago" within the week', () => {
    expect(formatRelativeTime('2026-06-10T12:00:00.000Z')).toBe('3 days ago');
  });

  it('renders a localised date for a week or older', () => {
    const out = formatRelativeTime('2026-05-01T12:00:00.000Z', 'Europe/London');
    expect(out).toContain('2026');
    expect(out).toContain('May');
  });
});

describe('lead-format · formatEstimatedValue', () => {
  it('formats values >= $1,000 as compact thousands (cents in)', () => {
    expect(formatEstimatedValue(5_000_000)).toBe('$50k');
    expect(formatEstimatedValue(100_000_000)).toBe('$1000k');
  });

  it('formats sub-$1,000 values as whole dollars (no 100x error)', () => {
    expect(formatEstimatedValue(50_000)).toBe('$500');
    expect(formatEstimatedValue(99_900)).toBe('$999');
  });

  it('formats zero', () => {
    expect(formatEstimatedValue(0)).toBe('$0');
  });
});
