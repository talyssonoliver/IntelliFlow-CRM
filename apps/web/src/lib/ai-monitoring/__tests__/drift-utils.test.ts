import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getSeverityBadgeClass,
  getSeverityColor,
  getSeverityIcon,
  formatDriftScore,
  formatPValue,
  getRecommendationPriority,
  formatRelativeTime,
  isStaleData,
} from '../drift-utils';

describe('drift-utils', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getSeverityBadgeClass', () => {
    it('returns destructive class for critical', () => {
      expect(getSeverityBadgeClass('critical')).toContain('destructive');
    });

    it('returns orange class for high', () => {
      expect(getSeverityBadgeClass('high')).toContain('orange');
    });

    it('returns amber class for medium', () => {
      expect(getSeverityBadgeClass('medium')).toContain('amber');
    });

    it('returns blue class for low', () => {
      expect(getSeverityBadgeClass('low')).toContain('blue');
    });

    it('returns muted class for none', () => {
      expect(getSeverityBadgeClass('none')).toContain('muted');
    });

    it('returns muted class for unknown severity', () => {
      expect(getSeverityBadgeClass('unknown')).toContain('muted');
    });
  });

  describe('getSeverityColor', () => {
    it('returns destructive for critical', () => {
      expect(getSeverityColor('critical')).toBe('text-destructive');
    });

    it('returns orange for high', () => {
      expect(getSeverityColor('high')).toContain('orange');
    });

    it('returns amber for medium', () => {
      expect(getSeverityColor('medium')).toContain('amber');
    });

    it('returns blue for low', () => {
      expect(getSeverityColor('low')).toContain('blue');
    });

    it('returns muted for none', () => {
      expect(getSeverityColor('none')).toContain('muted');
    });

    it('returns muted for unknown', () => {
      expect(getSeverityColor('unknown')).toContain('muted');
    });
  });

  describe('getSeverityIcon', () => {
    it.each([
      ['critical', 'error'],
      ['high', 'warning'],
      ['medium', 'info'],
      ['low', 'check_circle'],
      ['none', 'verified'],
      ['unknown', 'help'],
    ])('returns %s icon for %s severity', (severity, icon) => {
      expect(getSeverityIcon(severity)).toBe(icon);
    });
  });

  describe('formatDriftScore', () => {
    it('formats to 4 decimal places', () => {
      expect(formatDriftScore(0.82345678)).toBe('0.8235');
    });

    it('pads with zeros', () => {
      expect(formatDriftScore(0.5)).toBe('0.5000');
    });

    it('handles zero', () => {
      expect(formatDriftScore(0)).toBe('0.0000');
    });
  });

  describe('formatPValue', () => {
    it('formats to 4 decimal places', () => {
      expect(formatPValue(0.0012)).toBe('0.0012');
    });

    it('pads with zeros', () => {
      expect(formatPValue(0.1)).toBe('0.1000');
    });
  });

  describe('getRecommendationPriority', () => {
    it('returns 4 for critical', () => {
      expect(getRecommendationPriority('critical')).toBe(4);
    });

    it('returns 3 for high', () => {
      expect(getRecommendationPriority('high')).toBe(3);
    });

    it('returns 0 for unknown severity', () => {
      expect(getRecommendationPriority('bogus')).toBe(0);
    });
  });

  describe('formatRelativeTime', () => {
    it('returns "just now" for < 1 minute', () => {
      const ts = new Date(Date.now() - 30000).toISOString(); // 30s ago
      expect(formatRelativeTime(ts)).toBe('just now');
    });

    it('returns minutes for < 1 hour', () => {
      const ts = new Date(Date.now() - 5 * 60000).toISOString();
      expect(formatRelativeTime(ts)).toBe('5m ago');
    });

    it('returns hours for < 24 hours', () => {
      const ts = new Date(Date.now() - 3 * 3600000).toISOString();
      expect(formatRelativeTime(ts)).toBe('3h ago');
    });

    it('returns days for >= 24 hours', () => {
      const ts = new Date(Date.now() - 2 * 86400000).toISOString();
      expect(formatRelativeTime(ts)).toBe('2d ago');
    });
  });

  describe('isStaleData', () => {
    it('returns false for null', () => {
      expect(isStaleData(null)).toBe(false);
    });

    it('returns false for recent check', () => {
      const ts = new Date(Date.now() - 5 * 60000).toISOString(); // 5m ago
      expect(isStaleData(ts)).toBe(false);
    });

    it('returns true for check > 1 hour ago', () => {
      const ts = new Date(Date.now() - 2 * 3600000).toISOString(); // 2h ago
      expect(isStaleData(ts)).toBe(true);
    });

    it('returns false for exactly 1 hour (boundary)', () => {
      const ts = new Date(Date.now() - 3600000).toISOString();
      expect(isStaleData(ts)).toBe(false);
    });
  });
});
