// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

// These will be imported once implemented — for now they should cause test failures
import {
  getTypeConfig,
  getPriorityConfig,
  formatRelativeTime,
  getTypesByGroup,
} from '../notification-utils';
import { NOTIFICATION_PRIORITIES, NOTIFICATION_TYPES } from '../types';
import type { NotificationType } from '../types';

describe('notification-utils', () => {
  describe('getTypeConfig', () => {
    it.each([
      ['lead_assigned', 'Lead'],
      ['deal_stage_changed', 'Deal'],
      ['task_assigned', 'Task'],
      ['appointment_scheduled', 'Calendar'],
      ['ai_insight', 'AI'],
      ['team_mention', 'Team'],
      ['system_alert', 'System'],
      ['document_shared', 'Document'],
      ['email_received', 'Email'],
    ] as [NotificationType, string][])(
      'returns correct config for %s (group: %s)',
      (type, expectedGroup) => {
        const config = getTypeConfig(type);
        expect(config).toBeDefined();
        expect(config.icon).toBeTruthy();
        expect(config.bgColor).toBeTruthy();
        expect(config.iconColor).toBeTruthy();
        expect(config.ringColor).toBeTruthy();
        expect(config.label).toBeTruthy();
        expect(config.group).toBe(expectedGroup);
      }
    );

    it('returns config for all 35 notification types', () => {
      for (const type of NOTIFICATION_TYPES) {
        const config = getTypeConfig(type as NotificationType);
        expect(config).toBeDefined();
        expect(config.icon).toBeTruthy();
        expect(config.group).toBeTruthy();
      }
    });

    it('returns default config for unknown type', () => {
      const config = getTypeConfig('unknown_type' as NotificationType);
      expect(config).toBeDefined();
      expect(config.icon).toBeTruthy();
      expect(config.group).toBe('System');
    });
  });

  describe('getPriorityConfig', () => {
    it('returns destructive styling for high priority', () => {
      const config = getPriorityConfig('high');
      expect(config).toBeDefined();
      expect(config!.borderColor).toContain('red');
      expect(config!.label).toBe('High');
    });

    it('returns default styling for normal priority', () => {
      const config = getPriorityConfig('normal');
      expect(config).toBeDefined();
      expect(config!.label).toBe('Normal');
    });

    it('returns muted styling for low priority', () => {
      const config = getPriorityConfig('low');
      expect(config).toBeDefined();
      expect(config!.borderColor).toContain('slate');
      expect(config!.label).toBe('Low');
    });

    it('does not accept urgent as a priority', () => {
      expect(() => getPriorityConfig('urgent')).not.toThrow();
      const config = getPriorityConfig('urgent');
      expect(config).toBeUndefined();
    });

    it('does not accept medium as a priority', () => {
      const config = getPriorityConfig('medium');
      expect(config).toBeUndefined();
    });
  });

  describe('formatRelativeTime', () => {
    it('returns "Just now" for times less than 1 minute ago', () => {
      const now = new Date();
      expect(formatRelativeTime(now.toISOString())).toBe('Just now');
    });

    it('returns "X min ago" for times within the hour', () => {
      const date = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatRelativeTime(date.toISOString())).toBe('5 min ago');
    });

    it('returns "X hours ago" for times within the day', () => {
      const date = new Date(Date.now() - 3 * 60 * 60 * 1000);
      expect(formatRelativeTime(date.toISOString())).toMatch(/3 hours? ago/);
    });

    it('returns "1 hour ago" singular form', () => {
      const date = new Date(Date.now() - 1 * 60 * 60 * 1000);
      expect(formatRelativeTime(date.toISOString())).toBe('1 hour ago');
    });

    it('returns "X days ago" for times within the week', () => {
      const date = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(date.toISOString())).toMatch(/2 days? ago/);
    });

    it('returns formatted date for times older than a week', () => {
      const date = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(date.toISOString());
      // Should be a locale date string, not relative
      expect(result).not.toContain('ago');
    });

    it('handles invalid date strings gracefully', () => {
      const result = formatRelativeTime('invalid-date');
      expect(result).toBeDefined();
    });

    it('handles future dates', () => {
      const future = new Date(Date.now() + 60 * 60 * 1000);
      const result = formatRelativeTime(future.toISOString());
      expect(result).toBeDefined();
      expect(result).toBe('Just now');
    });
  });

  describe('getTypesByGroup', () => {
    it('returns all 9 groups', () => {
      const groups = getTypesByGroup();
      const groupNames = Object.keys(groups);
      expect(groupNames).toContain('Lead');
      expect(groupNames).toContain('Deal');
      expect(groupNames).toContain('Task');
      expect(groupNames).toContain('Calendar');
      expect(groupNames).toContain('AI');
      expect(groupNames).toContain('Team');
      expect(groupNames).toContain('System');
      expect(groupNames).toContain('Document');
      expect(groupNames).toContain('Email');
    });

    it('contains all 35 types across all groups', () => {
      const groups = getTypesByGroup();
      const allTypes = Object.values(groups).flat();
      expect(allTypes).toHaveLength(35);
    });

    it('places lead types in Lead group', () => {
      const groups = getTypesByGroup();
      expect(groups.Lead).toContain('lead_assigned');
      expect(groups.Lead).toContain('lead_scored');
      expect(groups.Lead).toContain('lead_converted');
      expect(groups.Lead).toContain('lead_activity');
    });
  });

  describe('NOTIFICATION_PRIORITIES constant', () => {
    it('only contains high, normal, low', () => {
      expect(NOTIFICATION_PRIORITIES).toEqual(
        expect.arrayContaining(['high', 'normal', 'low'])
      );
      expect(NOTIFICATION_PRIORITIES).toHaveLength(3);
    });

    it('does not contain urgent or medium', () => {
      expect(NOTIFICATION_PRIORITIES).not.toContain('urgent');
      expect(NOTIFICATION_PRIORITIES).not.toContain('medium');
    });
  });
});
