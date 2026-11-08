import { describe, it, expect } from 'vitest';
import {
  calculateTrend,
  formatTimestamp,
  getDeltaColorClass,
  getTrendIcon,
  getTrendText,
} from '../../components/tracking/status-history-logic';

/**
 * StatusHistory's calculations, imported from the product. This file used to copy them, and
 * tested getDeltaColorClass(value, label) while the component has getDeltaColorClass(label,
 * isPositive); its other blocks asserted only the test's own fixtures (#1216).
 */

const entry = (completed?: number) => ({
  delta:
    completed === undefined ? undefined : { completed, in_progress: 0, blocked: 0, backlog: 0 },
});

describe('calculateTrend', () => {
  it('needs at least two entries', () => {
    expect(calculateTrend([])).toBeNull();
    expect(calculateTrend([entry(3)])).toBeNull();
  });

  it('is up by the completed tasks, down by the regressed ones, stable otherwise', () => {
    expect(calculateTrend([entry(2), entry(1)])).toEqual({ direction: 'up', value: 3 });
    expect(calculateTrend([entry(-2), entry()])).toEqual({ direction: 'down', value: 2 });
    expect(calculateTrend([entry(0), entry()])).toEqual({ direction: 'stable', value: 0 });
  });

  it('sums only the five newest entries', () => {
    expect(calculateTrend([entry(1), entry(1), entry(1), entry(1), entry(1), entry(100)])).toEqual({
      direction: 'up',
      value: 5,
    });
  });
});

describe('formatTimestamp', () => {
  const now = new Date('2025-01-05T15:00:00Z');

  it('shows only the time for an entry from today', () => {
    expect(formatTimestamp('2025-01-05T10:30:00Z', now)).toMatch(/^\d{2}:\d{2}$/);
  });

  it('shows the date and time for an older entry', () => {
    const result = formatTimestamp('2025-01-03T10:30:00Z', now);
    expect(result).toContain('Jan');
    expect(result).toContain('3');
  });
});

describe('getDeltaColorClass', () => {
  it('more completed is green, fewer is red', () => {
    expect(getDeltaColorClass('completed', true)).toBe('text-green-600');
    expect(getDeltaColorClass('completed', false)).toBe('text-red-600');
  });

  it('more blocked is red, fewer is green', () => {
    expect(getDeltaColorClass('blocked', true)).toBe('text-red-600');
    expect(getDeltaColorClass('blocked', false)).toBe('text-green-600');
  });

  it('other counts are neutral', () => {
    expect(getDeltaColorClass('in_progress', true)).toBe('text-gray-500');
    expect(getDeltaColorClass('backlog', false)).toBe('text-gray-500');
  });
});

describe('trend summary', () => {
  it('picks an icon per direction', () => {
    expect(getTrendIcon('up')).toEqual({ name: 'trending_up', className: 'text-green-600' });
    expect(getTrendIcon('down')).toEqual({ name: 'trending_down', className: 'text-red-600' });
    expect(getTrendIcon('stable')).toEqual({ name: 'remove', className: 'text-gray-500' });
  });

  it('describes the trend, singular and plural', () => {
    expect(getTrendText({ direction: 'up', value: 1 }).content).toBe('1 task completed');
    expect(getTrendText({ direction: 'down', value: 3 }).content).toBe('3 tasks regressed');
    expect(getTrendText({ direction: 'stable', value: 0 }).content).toBe('No change');
  });
});
