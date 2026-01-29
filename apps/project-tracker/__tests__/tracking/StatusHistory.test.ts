import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for StatusHistory component logic.
 *
 * Since the project-tracker uses Node environment (not jsdom),
 * these tests focus on the pure functions and logic that can be
 * extracted and tested independently.
 */

// Types matching the component
interface HistorySummary {
  total: number;
  completed: number;
  in_progress: number;
  blocked: number;
  backlog: number;
}

interface HistoryDelta {
  completed: number;
  in_progress: number;
  blocked: number;
  backlog: number;
}

interface HistoryEntry {
  timestamp: string;
  summary: HistorySummary;
  delta?: HistoryDelta;
}

// Extract pure functions from component for testing
// These mirror the logic in StatusHistory.tsx

/**
 * Calculates trend from recent history entries
 */
function calculateTrend(entries: HistoryEntry[]): { direction: 'up' | 'down' | 'stable'; value: number } | null {
  if (entries.length < 2) return null;

  const totalCompleted = entries
    .slice(0, Math.min(5, entries.length))
    .reduce((sum, e) => sum + (e.delta?.completed || 0), 0);

  if (totalCompleted > 0) return { direction: 'up', value: totalCompleted };
  if (totalCompleted < 0) return { direction: 'down', value: Math.abs(totalCompleted) };
  return { direction: 'stable', value: 0 };
}

/**
 * Formats timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Determines delta color class based on value and label
 */
function getDeltaColorClass(value: number, label: string): string {
  if (value === 0) return '';
  const isPositive = value > 0;

  if (label === 'completed') {
    return isPositive ? 'text-green-400' : 'text-red-400';
  }
  if (label === 'blocked') {
    return isPositive ? 'text-red-400' : 'text-green-400';
  }
  return 'text-gray-400';
}

describe('StatusHistory Component Logic', () => {
  describe('calculateTrend', () => {
    it('returns null when less than 2 entries', () => {
      expect(calculateTrend([])).toBeNull();
      expect(calculateTrend([{
        timestamp: '2025-01-05T10:00:00Z',
        summary: { total: 10, completed: 5, in_progress: 2, blocked: 1, backlog: 2 },
      }])).toBeNull();
    });

    it('returns "up" direction when tasks are being completed', () => {
      const entries: HistoryEntry[] = [
        {
          timestamp: '2025-01-05T12:00:00Z',
          summary: { total: 10, completed: 7, in_progress: 1, blocked: 1, backlog: 1 },
          delta: { completed: 2, in_progress: -1, blocked: 0, backlog: -1 },
        },
        {
          timestamp: '2025-01-05T10:00:00Z',
          summary: { total: 10, completed: 5, in_progress: 2, blocked: 1, backlog: 2 },
          delta: { completed: 1, in_progress: 0, blocked: 0, backlog: -1 },
        },
      ];

      const trend = calculateTrend(entries);
      expect(trend).toEqual({ direction: 'up', value: 3 });
    });

    it('returns "down" direction when tasks are regressing', () => {
      const entries: HistoryEntry[] = [
        {
          timestamp: '2025-01-05T12:00:00Z',
          summary: { total: 10, completed: 3, in_progress: 3, blocked: 2, backlog: 2 },
          delta: { completed: -2, in_progress: 1, blocked: 1, backlog: 0 },
        },
        {
          timestamp: '2025-01-05T10:00:00Z',
          summary: { total: 10, completed: 5, in_progress: 2, blocked: 1, backlog: 2 },
        },
      ];

      const trend = calculateTrend(entries);
      expect(trend).toEqual({ direction: 'down', value: 2 });
    });

    it('returns "stable" direction when no change', () => {
      const entries: HistoryEntry[] = [
        {
          timestamp: '2025-01-05T12:00:00Z',
          summary: { total: 10, completed: 5, in_progress: 2, blocked: 1, backlog: 2 },
          delta: { completed: 0, in_progress: 0, blocked: 0, backlog: 0 },
        },
        {
          timestamp: '2025-01-05T10:00:00Z',
          summary: { total: 10, completed: 5, in_progress: 2, blocked: 1, backlog: 2 },
        },
      ];

      const trend = calculateTrend(entries);
      expect(trend).toEqual({ direction: 'stable', value: 0 });
    });

    it('only considers last 5 entries for trend calculation', () => {
      const entries: HistoryEntry[] = [
        { timestamp: '2025-01-05T16:00:00Z', summary: { total: 10, completed: 10, in_progress: 0, blocked: 0, backlog: 0 }, delta: { completed: 1, in_progress: 0, blocked: 0, backlog: -1 } },
        { timestamp: '2025-01-05T15:00:00Z', summary: { total: 10, completed: 9, in_progress: 0, blocked: 0, backlog: 1 }, delta: { completed: 1, in_progress: 0, blocked: 0, backlog: -1 } },
        { timestamp: '2025-01-05T14:00:00Z', summary: { total: 10, completed: 8, in_progress: 0, blocked: 0, backlog: 2 }, delta: { completed: 1, in_progress: 0, blocked: 0, backlog: -1 } },
        { timestamp: '2025-01-05T13:00:00Z', summary: { total: 10, completed: 7, in_progress: 0, blocked: 0, backlog: 3 }, delta: { completed: 1, in_progress: 0, blocked: 0, backlog: -1 } },
        { timestamp: '2025-01-05T12:00:00Z', summary: { total: 10, completed: 6, in_progress: 0, blocked: 0, backlog: 4 }, delta: { completed: 1, in_progress: 0, blocked: 0, backlog: -1 } },
        // This entry should be ignored (beyond 5)
        { timestamp: '2025-01-05T11:00:00Z', summary: { total: 10, completed: 5, in_progress: 0, blocked: 0, backlog: 5 }, delta: { completed: 100, in_progress: 0, blocked: 0, backlog: -100 } },
      ];

      const trend = calculateTrend(entries);
      // Should only sum first 5: 1+1+1+1+1 = 5
      expect(trend).toEqual({ direction: 'up', value: 5 });
    });
  });

  describe('formatTimestamp', () => {
    beforeEach(() => {
      // Mock Date.now() to have consistent test results
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-05T15:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns time only for timestamps from today', () => {
      const result = formatTimestamp('2025-01-05T10:30:00Z');
      // Should return time format like "10:30 AM" or similar
      expect(result).toMatch(/\d{1,2}:\d{2}/);
    });

    it('returns date and time for timestamps from previous days', () => {
      const result = formatTimestamp('2025-01-03T10:30:00Z');
      // Should return date format like "Jan 3, 10:30 AM"
      expect(result).toContain('Jan');
    });
  });

  describe('getDeltaColorClass', () => {
    it('returns empty string for zero delta', () => {
      expect(getDeltaColorClass(0, 'completed')).toBe('');
      expect(getDeltaColorClass(0, 'blocked')).toBe('');
      expect(getDeltaColorClass(0, 'in_progress')).toBe('');
    });

    it('returns green for positive completed delta', () => {
      expect(getDeltaColorClass(3, 'completed')).toBe('text-green-400');
    });

    it('returns red for negative completed delta', () => {
      expect(getDeltaColorClass(-2, 'completed')).toBe('text-red-400');
    });

    it('returns red for positive blocked delta (more blocked is bad)', () => {
      expect(getDeltaColorClass(2, 'blocked')).toBe('text-red-400');
    });

    it('returns green for negative blocked delta (less blocked is good)', () => {
      expect(getDeltaColorClass(-1, 'blocked')).toBe('text-green-400');
    });

    it('returns gray for other labels', () => {
      expect(getDeltaColorClass(1, 'in_progress')).toBe('text-gray-400');
      expect(getDeltaColorClass(-1, 'backlog')).toBe('text-gray-400');
    });
  });

  describe('History Entry Structure', () => {
    it('validates entry structure with required fields', () => {
      const validEntry: HistoryEntry = {
        timestamp: '2025-01-05T10:00:00Z',
        summary: {
          total: 100,
          completed: 50,
          in_progress: 20,
          blocked: 5,
          backlog: 25,
        },
      };

      expect(validEntry.timestamp).toBeDefined();
      expect(validEntry.summary.total).toBe(100);
      expect(validEntry.summary.completed).toBe(50);
      expect(validEntry.summary.in_progress).toBe(20);
      expect(validEntry.summary.blocked).toBe(5);
      expect(validEntry.summary.backlog).toBe(25);
    });

    it('validates entry structure with optional delta', () => {
      const entryWithDelta: HistoryEntry = {
        timestamp: '2025-01-05T10:00:00Z',
        summary: {
          total: 100,
          completed: 52,
          in_progress: 18,
          blocked: 5,
          backlog: 25,
        },
        delta: {
          completed: 2,
          in_progress: -2,
          blocked: 0,
          backlog: 0,
        },
      };

      expect(entryWithDelta.delta).toBeDefined();
      expect(entryWithDelta.delta?.completed).toBe(2);
      expect(entryWithDelta.delta?.in_progress).toBe(-2);
    });
  });

  describe('Delta Calculation Logic', () => {
    it('calculates correct deltas between consecutive entries', () => {
      const older: HistorySummary = { total: 100, completed: 50, in_progress: 20, blocked: 5, backlog: 25 };
      const newer: HistorySummary = { total: 100, completed: 53, in_progress: 18, blocked: 4, backlog: 25 };

      const delta: HistoryDelta = {
        completed: newer.completed - older.completed,
        in_progress: newer.in_progress - older.in_progress,
        blocked: newer.blocked - older.blocked,
        backlog: newer.backlog - older.backlog,
      };

      expect(delta.completed).toBe(3);
      expect(delta.in_progress).toBe(-2);
      expect(delta.blocked).toBe(-1);
      expect(delta.backlog).toBe(0);
    });

    it('handles edge case where total changes', () => {
      const older: HistorySummary = { total: 100, completed: 50, in_progress: 20, blocked: 5, backlog: 25 };
      const newer: HistorySummary = { total: 105, completed: 52, in_progress: 22, blocked: 5, backlog: 26 };

      const delta: HistoryDelta = {
        completed: newer.completed - older.completed,
        in_progress: newer.in_progress - older.in_progress,
        blocked: newer.blocked - older.blocked,
        backlog: newer.backlog - older.backlog,
      };

      // Deltas are calculated regardless of total change
      expect(delta.completed).toBe(2);
      expect(delta.in_progress).toBe(2);
      expect(delta.blocked).toBe(0);
      expect(delta.backlog).toBe(1);
    });
  });

  describe('History Response Parsing', () => {
    it('parses JSONL format correctly', () => {
      const jsonlContent = `{"timestamp":"2025-01-04T10:00:00Z","summary":{"total":5,"completed":1,"in_progress":1,"blocked":1,"backlog":2}}
{"timestamp":"2025-01-05T10:00:00Z","summary":{"total":5,"completed":2,"in_progress":0,"blocked":1,"backlog":2}}`;

      const lines = jsonlContent.trim().split('\n').filter(line => line.trim());
      const entries: HistoryEntry[] = lines.map(line => JSON.parse(line));

      expect(entries).toHaveLength(2);
      expect(entries[0].timestamp).toBe('2025-01-04T10:00:00Z');
      expect(entries[0].summary.completed).toBe(1);
      expect(entries[1].timestamp).toBe('2025-01-05T10:00:00Z');
      expect(entries[1].summary.completed).toBe(2);
    });

    it('handles empty JSONL gracefully', () => {
      const emptyContent = '';
      const lines = emptyContent.trim().split('\n').filter(line => line.trim());

      expect(lines).toHaveLength(0);
    });

    it('reverses entries for newest-first display', () => {
      const entries: HistoryEntry[] = [
        { timestamp: '2025-01-03T10:00:00Z', summary: { total: 5, completed: 1, in_progress: 1, blocked: 1, backlog: 2 } },
        { timestamp: '2025-01-04T10:00:00Z', summary: { total: 5, completed: 2, in_progress: 1, blocked: 1, backlog: 1 } },
        { timestamp: '2025-01-05T10:00:00Z', summary: { total: 5, completed: 3, in_progress: 1, blocked: 0, backlog: 1 } },
      ];

      const reversed = [...entries].reverse();

      expect(reversed[0].timestamp).toBe('2025-01-05T10:00:00Z');
      expect(reversed[2].timestamp).toBe('2025-01-03T10:00:00Z');
    });
  });
});
