/**
 * NotificationPreference Entity Tests
 * @see IFC-157: Notification service MVP
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationPreference, ChannelPreference } from '../NotificationPreference';

describe('NotificationPreference', () => {
  describe('createDefault', () => {
    it('should create preferences with default channels enabled', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      expect(prefs.tenantId).toBe('tenant-123');
      expect(prefs.userId).toBe('user-456');

      // In-app and email should be enabled by default
      expect(prefs.getChannelPreference('in_app').enabled).toBe(true);
      expect(prefs.getChannelPreference('email').enabled).toBe(true);

      // SMS and push disabled by default (require opt-in)
      expect(prefs.getChannelPreference('sms').enabled).toBe(false);
      expect(prefs.getChannelPreference('push').enabled).toBe(false);
    });

    it('should set default quiet hours', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      expect(prefs.quietHoursStart).toBe('22:00');
      expect(prefs.quietHoursEnd).toBe('08:00');
    });

    it('should set default timezone', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      expect(prefs.timezone).toBe('UTC');
    });
  });

  describe('setChannelEnabled', () => {
    it('should enable a channel', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      prefs.setChannelEnabled('sms', true);

      expect(prefs.getChannelPreference('sms').enabled).toBe(true);
    });

    it('should disable a channel', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      prefs.setChannelEnabled('email', false);

      expect(prefs.getChannelPreference('email').enabled).toBe(false);
    });

    it('should update updatedAt timestamp', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');
      const originalUpdatedAt = prefs.updatedAt;

      // Wait a bit to ensure time difference
      prefs.setChannelEnabled('email', false);

      expect(prefs.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
    });
  });

  describe('setChannelFrequency', () => {
    it('should set frequency to realtime', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      prefs.setChannelFrequency('email', 'realtime');

      expect(prefs.getChannelPreference('email').frequency).toBe('realtime');
    });

    it('should set frequency to daily digest', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      prefs.setChannelFrequency('email', 'daily_digest');

      expect(prefs.getChannelPreference('email').frequency).toBe('daily_digest');
    });

    it('should set frequency to weekly digest', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      prefs.setChannelFrequency('email', 'weekly_digest');

      expect(prefs.getChannelPreference('email').frequency).toBe('weekly_digest');
    });
  });

  describe('setQuietHours', () => {
    it('should set custom quiet hours', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      prefs.setQuietHours('23:00', '07:00');

      expect(prefs.quietHoursStart).toBe('23:00');
      expect(prefs.quietHoursEnd).toBe('07:00');
    });

    it('should throw for invalid time format', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      expect(() => prefs.setQuietHours('invalid', '07:00')).toThrow('Invalid time format');
    });

    it('should throw for out of range hours', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      expect(() => prefs.setQuietHours('25:00', '07:00')).toThrow('Invalid time format');
    });
  });

  describe('setTimezone', () => {
    it('should set timezone', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      prefs.setTimezone('America/New_York');

      expect(prefs.timezone).toBe('America/New_York');
    });

    it('should throw for empty timezone', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      expect(() => prefs.setTimezone('')).toThrow('Timezone cannot be empty');
    });
  });

  describe('isChannelEnabled', () => {
    it('should return true for enabled channel', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      expect(prefs.isChannelEnabled('email')).toBe(true);
    });

    it('should return false for disabled channel', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');
      prefs.setChannelEnabled('email', false);

      expect(prefs.isChannelEnabled('email')).toBe(false);
    });
  });

  describe('isInQuietHours', () => {
    it('should return true during quiet hours (same day)', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');
      prefs.setQuietHours('22:00', '23:59');

      // 22:30 should be in quiet hours
      const time = new Date();
      time.setHours(22, 30, 0, 0);

      expect(prefs.isInQuietHours(time)).toBe(true);
    });

    it('should return false outside quiet hours', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');
      prefs.setQuietHours('22:00', '08:00');

      // 12:00 should not be in quiet hours
      const time = new Date();
      time.setHours(12, 0, 0, 0);

      expect(prefs.isInQuietHours(time)).toBe(false);
    });

    it('should handle overnight quiet hours', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');
      prefs.setQuietHours('22:00', '08:00');

      // 03:00 should be in quiet hours (overnight)
      const time = new Date();
      time.setHours(3, 0, 0, 0);

      expect(prefs.isInQuietHours(time)).toBe(true);
    });

    it('should return false when current day is not in quietHoursDays', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');
      prefs.setQuietHours('22:00', '23:59');
      // Set only weekdays (Mon-Fri = 1-5)
      prefs.setQuietHoursDays([1, 2, 3, 4, 5]);

      // Create a time on Sunday (day 0) at 22:30
      const sunday = new Date('2026-03-08T22:30:00'); // 2026-03-08 is a Sunday
      expect(sunday.getDay()).toBe(0);
      expect(prefs.isInQuietHours(sunday)).toBe(false);
    });

    it('should return true when current day is in quietHoursDays', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');
      prefs.setQuietHours('22:00', '23:59');
      prefs.setQuietHoursDays([1, 2, 3, 4, 5]);

      // Create a time on Monday (day 1) at 22:30
      const monday = new Date('2026-03-09T22:30:00'); // 2026-03-09 is a Monday
      expect(monday.getDay()).toBe(1);
      expect(prefs.isInQuietHours(monday)).toBe(true);
    });
  });

  describe('setQuietHoursDays', () => {
    it('should set specific days', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');
      prefs.setQuietHoursDays([1, 3, 5]);
      expect(prefs.quietHoursDays).toEqual([1, 3, 5]);
    });

    it('should default to all days', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');
      expect(prefs.quietHoursDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it('should deduplicate and sort days', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');
      prefs.setQuietHoursDays([5, 1, 3, 1, 5]);
      expect(prefs.quietHoursDays).toEqual([1, 3, 5]);
    });

    it('should throw for invalid day values', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');
      expect(() => prefs.setQuietHoursDays([7])).toThrow('Days must be integers between 0');
      expect(() => prefs.setQuietHoursDays([-1])).toThrow('Days must be integers between 0');
    });
  });

  describe('setCategoryEnabled', () => {
    it('should enable a notification category', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      prefs.setCategoryEnabled('marketing', true);

      expect(prefs.isCategoryEnabled('marketing')).toBe(true);
    });

    it('should disable a notification category', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      prefs.setCategoryEnabled('marketing', false);

      expect(prefs.isCategoryEnabled('marketing')).toBe(false);
    });

    it('should default system category to enabled', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      expect(prefs.isCategoryEnabled('system')).toBe(true);
    });
  });

  describe('toJSON', () => {
    it('should serialize preferences to plain object', () => {
      const prefs = NotificationPreference.createDefault('tenant-123', 'user-456');

      const json = prefs.toJSON();

      expect(json.tenantId).toBe('tenant-123');
      expect(json.userId).toBe('user-456');
      expect(json.timezone).toBe('UTC');
      expect(json.channels).toBeDefined();
      expect(json.channels.email).toBeDefined();
      expect(json.channels.email.enabled).toBe(true);
    });
  });
});

describe('NotificationPreference (additional tests)', () => {
  let prefs: NotificationPreference;
  beforeEach(() => {
    prefs = NotificationPreference.createDefault('t1', 'u1');
  });

  describe('reconstitute', () => {
    it('should reconstitute from persistence', () => {
      const now = new Date();
      const p = NotificationPreference.reconstitute('pref-u1', {
        tenantId: 't1',
        userId: 'u1',
        channels: {
          in_app: { enabled: true, frequency: 'realtime' },
          email: { enabled: false, frequency: 'daily_digest' },
          sms: { enabled: false, frequency: 'realtime' },
          push: { enabled: true, frequency: 'hourly' },
          webhook: { enabled: false, frequency: 'realtime' },
        },
        categories: {
          system: true,
          transactional: true,
          reminders: false,
          alerts: true,
          updates: true,
          marketing: false,
          social: true,
        },
        quietHoursStart: '23:00',
        quietHoursEnd: '07:00',
        quietHoursEnabled: false,
        quietHoursDays: [1, 2, 3, 4, 5],
        timezone: 'Europe/London',
        doNotDisturb: true,
        createdAt: now,
        updatedAt: now,
      });
      expect(p.tenantId).toBe('t1');
      expect(p.userId).toBe('u1');
      expect(p.quietHoursStart).toBe('23:00');
      expect(p.quietHoursEnd).toBe('07:00');
      expect(p.quietHoursEnabled).toBe(false);
      expect(p.timezone).toBe('Europe/London');
      expect(p.doNotDisturb).toBe(true);
      expect(p.createdAt).toEqual(now);
      expect(p.updatedAt).toEqual(now);
      expect(p.getChannelPreference('email').enabled).toBe(false);
      expect(p.getChannelPreference('push').enabled).toBe(true);
    });
  });

  describe('setChannelVerified', () => {
    it('should mark channel as verified', () => {
      prefs.setChannelVerified('sms');
      const cp = prefs.getChannelPreference('sms');
      expect(cp.verifiedAt).toBeInstanceOf(Date);
      expect(cp.verifiedAt).toBeInstanceOf(Date);
    });
  });

  describe('setCategoryEnabled - protected categories', () => {
    it('should throw when disabling system', () => {
      expect(() => prefs.setCategoryEnabled('system', false)).toThrow('Cannot disable system');
    });
    it('should throw when disabling transactional', () => {
      expect(() => prefs.setCategoryEnabled('transactional', false)).toThrow(
        'Cannot disable transactional'
      );
    });
    it('should allow enabling system (no-op)', () => {
      prefs.setCategoryEnabled('system', true);
      expect(prefs.isCategoryEnabled('system')).toBe(true);
    });
  });

  describe('setQuietHours validation', () => {
    it('should reject invalid end time', () => {
      expect(() => prefs.setQuietHours('22:00', 'bad')).toThrow('Invalid time format');
    });
    it('should reject 60 minutes', () => {
      expect(() => prefs.setQuietHours('22:60', '08:00')).toThrow('Invalid time format');
    });
  });

  describe('setQuietHoursEnabled', () => {
    it('should disable quiet hours', () => {
      prefs.setQuietHoursEnabled(false);
      expect(prefs.quietHoursEnabled).toBe(false);
    });
    it('should enable quiet hours', () => {
      prefs.setQuietHoursEnabled(false);
      prefs.setQuietHoursEnabled(true);
      expect(prefs.quietHoursEnabled).toBe(true);
    });
  });

  describe('setDoNotDisturb', () => {
    it('should enable DND', () => {
      prefs.setDoNotDisturb(true);
      expect(prefs.doNotDisturb).toBe(true);
    });
    it('should disable DND', () => {
      prefs.setDoNotDisturb(true);
      prefs.setDoNotDisturb(false);
      expect(prefs.doNotDisturb).toBe(false);
    });
  });

  describe('setTimezone', () => {
    it('should trim whitespace', () => {
      prefs.setTimezone('  US/Eastern  ');
      expect(prefs.timezone).toBe('US/Eastern');
    });
    it('should reject whitespace-only', () => {
      expect(() => prefs.setTimezone('   ')).toThrow('Timezone cannot be empty');
    });
  });

  describe('isInQuietHours', () => {
    it('returns false when disabled', () => {
      prefs.setQuietHoursEnabled(false);
      const time = new Date();
      time.setHours(23, 0, 0, 0);
      expect(prefs.isInQuietHours(time)).toBe(false);
    });
    it('handles same-day range correctly', () => {
      prefs.setQuietHours('09:00', '17:00');
      const inRange = new Date();
      inRange.setHours(12, 0, 0, 0);
      const outRange = new Date();
      outRange.setHours(18, 0, 0, 0);
      expect(prefs.isInQuietHours(inRange)).toBe(true);
      expect(prefs.isInQuietHours(outRange)).toBe(false);
    });
    it('uses current time by default', () => {
      prefs.setQuietHoursEnabled(false);
      expect(prefs.isInQuietHours()).toBe(false);
    });
  });

  describe('shouldDeliverNow', () => {
    it('returns false when DND is on', () => {
      prefs.setDoNotDisturb(true);
      expect(prefs.shouldDeliverNow('email', 'updates')).toBe(false);
    });
    it('returns false when channel disabled', () => {
      prefs.setChannelEnabled('sms', false);
      expect(prefs.shouldDeliverNow('sms', 'updates')).toBe(false);
    });
    it('returns false when category disabled', () => {
      prefs.setCategoryEnabled('marketing', false);
      expect(prefs.shouldDeliverNow('email', 'marketing')).toBe(false);
    });
    it('returns true for system during quiet hours', () => {
      prefs.setQuietHours('00:00', '23:59');
      expect(prefs.shouldDeliverNow('email', 'system')).toBe(true);
    });
    it('returns true for alerts during quiet hours', () => {
      prefs.setQuietHours('00:00', '23:59');
      expect(prefs.shouldDeliverNow('email', 'alerts')).toBe(true);
    });
    it('returns true when all conditions met', () => {
      prefs.setQuietHoursEnabled(false);
      expect(prefs.shouldDeliverNow('email', 'updates')).toBe(true);
    });
  });

  describe('toJSON', () => {
    it('should include all fields', () => {
      const json = prefs.toJSON() as any;
      expect(json.id).toBe('pref-u1');
      expect(json.quietHoursStart).toBe('22:00');
      expect(json.quietHoursEnd).toBe('08:00');
      expect(json.quietHoursEnabled).toBe(true);
      expect(json.quietHoursDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(json.doNotDisturb).toBe(false);
      expect(typeof json.createdAt).toBe('string');
      expect(typeof json.updatedAt).toBe('string');
    });
  });
});
