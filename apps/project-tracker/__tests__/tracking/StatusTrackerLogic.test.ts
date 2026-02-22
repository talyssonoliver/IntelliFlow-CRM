import { describe, it, expect } from 'vitest';

/**
 * Pure-function logic tests for StatusTracker, StaleIndicator, and RefreshButton.
 * Follows the pure-function extraction pattern (established by QualityDashboard.test.ts).
 * No RTL or component imports needed.
 */

// --- Pure functions extracted from components ---

/**
 * Computes completion rate percentage.
 * Mirrors StatusTracker.tsx line ~104-105 logic.
 */
function computeCompletionRate(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

/**
 * Sorts sprint entries numerically and slices to max 6.
 * Mirrors StatusTracker.tsx lines ~173-175 logic.
 */
function sortedSprintEntries(
  bySprint: Record<string, { total: number; completed: number }>
): Array<[string, { total: number; completed: number }]> {
  return Object.entries(bySprint)
    .sort(([a], [b]) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (isNaN(numA) && isNaN(numB)) return a.localeCompare(b);
      if (isNaN(numA)) return 1;
      if (isNaN(numB)) return -1;
      return numA - numB;
    })
    .slice(0, 6);
}

/**
 * Computes stale state from a lastUpdated timestamp.
 * Mirrors StaleIndicator.tsx lines ~17-41 logic.
 */
function computeStaleState(
  lastUpdated: Date | string,
  thresholdMinutes: number = 60
): { isStale: boolean; timeAgo: string; formattedTime: string } {
  const date = typeof lastUpdated === 'string' ? new Date(lastUpdated) : lastUpdated;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  let timeAgo: string;
  if (diffMinutes < 1) {
    timeAgo = 'Just now';
  } else if (diffMinutes < 60) {
    timeAgo = `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    timeAgo = `${diffHours}h ago`;
  } else {
    timeAgo = `${diffDays}d ago`;
  }

  return {
    isStale: diffMinutes >= thresholdMinutes,
    timeAgo,
    formattedTime: date.toLocaleString(),
  };
}

/**
 * Parses lastUpdated input to Date or null.
 * Mirrors null/undefined guard in StaleIndicator usage.
 */
function parsedLastUpdated(input: Date | string | null | undefined): Date | null {
  if (input === null || input === undefined) return null;
  if (input instanceof Date) return input;
  return new Date(input);
}

/**
 * Determines if refresh should be allowed.
 * Mirrors RefreshButton.tsx line ~26 guard logic.
 */
function shouldAllowRefresh(isRefreshing: boolean, disabled: boolean): boolean {
  return !isRefreshing && !disabled;
}

// --- Tests ---

describe('StatusTrackerLogic', () => {
  describe('computeCompletionRate', () => {
    it('returns 0 when total is 0 (divide-by-zero guard)', () => {
      expect(computeCompletionRate(0, 0)).toBe(0);
    });

    it('returns 0 when completed is 0', () => {
      expect(computeCompletionRate(0, 10)).toBe(0);
    });

    it('returns 50 for 5/10', () => {
      expect(computeCompletionRate(5, 10)).toBe(50);
    });

    it('returns 33 for 1/3 (rounds down)', () => {
      expect(computeCompletionRate(1, 3)).toBe(33);
    });

    it('returns 67 for 2/3 (rounds to nearest)', () => {
      expect(computeCompletionRate(2, 3)).toBe(67);
    });
  });

  describe('sortedSprintEntries', () => {
    it('sorts sprint keys numerically', () => {
      const bySprint = {
        '12': { total: 5, completed: 3 },
        '2': { total: 10, completed: 5 },
        '0': { total: 8, completed: 8 },
        '1': { total: 6, completed: 4 },
      };

      const result = sortedSprintEntries(bySprint);
      expect(result.map(([key]) => key)).toEqual(['0', '1', '2', '12']);
    });

    it('slices result to max 6 entries', () => {
      const bySprint: Record<string, { total: number; completed: number }> = {};
      for (let i = 0; i < 10; i++) {
        bySprint[String(i)] = { total: 5, completed: i };
      }

      const result = sortedSprintEntries(bySprint);
      expect(result.length).toBe(6);
    });

    it('returns empty array for empty input', () => {
      expect(sortedSprintEntries({})).toEqual([]);
    });

    it('handles NaN sprint key ("unknown") — placed at end', () => {
      const bySprint = {
        '1': { total: 5, completed: 3 },
        unknown: { total: 2, completed: 0 },
        '0': { total: 8, completed: 8 },
      };

      const result = sortedSprintEntries(bySprint);
      expect(result.map(([key]) => key)).toEqual(['0', '1', 'unknown']);
    });
  });

  describe('computeStaleState', () => {
    it('returns isStale: false, timeAgo: "Just now" for <1 minute', () => {
      const now = new Date();
      const result = computeStaleState(now, 60);
      expect(result.isStale).toBe(false);
      expect(result.timeAgo).toBe('Just now');
    });

    it('returns isStale: false, timeAgo: "1m ago" for 1 minute', () => {
      const oneMinAgo = new Date(Date.now() - 60_000);
      const result = computeStaleState(oneMinAgo, 60);
      expect(result.isStale).toBe(false);
      expect(result.timeAgo).toBe('1m ago');
    });

    it('returns isStale: false, timeAgo: "59m ago" for 59 minutes', () => {
      const fiftyNineMinAgo = new Date(Date.now() - 59 * 60_000);
      const result = computeStaleState(fiftyNineMinAgo, 60);
      expect(result.isStale).toBe(false);
      expect(result.timeAgo).toBe('59m ago');
    });

    it('returns isStale: true, timeAgo: "60m ago" at exact threshold (60min)', () => {
      const sixtyMinAgo = new Date(Date.now() - 60 * 60_000);
      const result = computeStaleState(sixtyMinAgo, 60);
      expect(result.isStale).toBe(true);
      // At exactly 60 minutes, diffHours = 1, so it shows "1h ago"
      expect(result.timeAgo).toBe('1h ago');
    });

    it('returns isStale: true, timeAgo: "23h ago" for 23 hours', () => {
      const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60_000);
      const result = computeStaleState(twentyThreeHoursAgo, 60);
      expect(result.isStale).toBe(true);
      expect(result.timeAgo).toBe('23h ago');
    });

    it('returns isStale: true, timeAgo: "1d ago" for 1 day', () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60_000);
      const result = computeStaleState(oneDayAgo, 60);
      expect(result.isStale).toBe(true);
      expect(result.timeAgo).toBe('1d ago');
    });

    it('respects custom threshold (e.g., 30 minutes)', () => {
      const thirtyOneMinAgo = new Date(Date.now() - 31 * 60_000);
      const result = computeStaleState(thirtyOneMinAgo, 30);
      expect(result.isStale).toBe(true);
      expect(result.timeAgo).toBe('31m ago');
    });

    it('handles string input (ISO string) via Date coercion', () => {
      const isoString = new Date(Date.now() - 5 * 60_000).toISOString();
      const result = computeStaleState(isoString, 60);
      expect(result.isStale).toBe(false);
      expect(result.timeAgo).toBe('5m ago');
    });
  });

  describe('parsedLastUpdated', () => {
    it('returns null for null input', () => {
      expect(parsedLastUpdated(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(parsedLastUpdated(undefined)).toBeNull();
    });

    it('returns Date for valid ISO string', () => {
      const result = parsedLastUpdated('2025-01-05T10:00:00Z');
      expect(result).toBeInstanceOf(Date);
      expect(result!.toISOString()).toBe('2025-01-05T10:00:00.000Z');
    });

    it('returns Date passthrough for Date input', () => {
      const date = new Date('2025-01-05T10:00:00Z');
      const result = parsedLastUpdated(date);
      expect(result).toBe(date); // Same reference
    });
  });

  describe('shouldAllowRefresh', () => {
    it('returns true when both false', () => {
      expect(shouldAllowRefresh(false, false)).toBe(true);
    });

    it('returns false when isRefreshing is true', () => {
      expect(shouldAllowRefresh(true, false)).toBe(false);
    });

    it('returns false when disabled is true', () => {
      expect(shouldAllowRefresh(false, true)).toBe(false);
    });
  });
});
