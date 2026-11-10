import { describe, it, expect } from 'vitest';
import {
  completionRate as computeCompletionRate,
  sprintsToShow as sortedSprintEntries,
} from '../../components/tracking/status-tracker-logic';
import { computeStaleState } from '../../components/tracking/shared/StaleIndicator';

/**
 * StatusTracker's and StaleIndicator's calculations, imported from the product. This file used
 * to copy them, and its sprint sort was right where the component's was not (the component used
 * parseInt(a) - parseInt(b), NaN for "backlog" and "Continuous") (#1216).
 * The refresh guard is tested by rendering RefreshButton (RefreshButton.test.tsx).
 */

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

    it('puts named sprints after numbered ones, in alphabetical order', () => {
      const result = sortedSprintEntries({
        Continuous: { total: 1, completed: 0 },
        '3': { total: 1, completed: 0 },
        backlog: { total: 1, completed: 0 },
        '1': { total: 1, completed: 0 },
      });
      expect(result.map(([key]) => key)).toEqual(['1', '3', 'backlog', 'Continuous']);
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
});
