import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationPreference } from '../NotificationPreference';

describe('NotificationPreference - Additional Coverage', () => {
  let prefs: NotificationPreference;
  beforeEach(() => { prefs = NotificationPreference.createDefault('t1', 'u1'); });

  describe('reconstitute', () => {
    it('should reconstitute from persistence', () => {
      const now = new Date();
      const p = NotificationPreference.reconstitute('pref-u1', {
        tenantId: 't1', userId: 'u1',
        channels: { in_app: { enabled: true, frequency: 'realtime' }, email: { enabled: false, frequency: 'daily_digest' }, sms: { enabled: false, frequency: 'realtime' }, push: { enabled: true, frequency: 'hourly' }, webhook: { enabled: false, frequency: 'realtime' } },
        categories: { system: true, transactional: true, reminders: false, alerts: true, updates: true, marketing: false, social: true },
        quietHoursStart: '23:00', quietHoursEnd: '07:00', quietHoursEnabled: false,
        timezone: 'Europe/London', doNotDisturb: true, createdAt: now, updatedAt: now,
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
      expect(cp.verifiedAt).toBeDefined();
      expect(cp.verifiedAt).toBeInstanceOf(Date);
    });
  });

  describe('setCategoryEnabled - protected categories', () => {
    it('should throw when disabling system', () => {
      expect(() => prefs.setCategoryEnabled('system', false)).toThrow('Cannot disable system');
    });
    it('should throw when disabling transactional', () => {
      expect(() => prefs.setCategoryEnabled('transactional', false)).toThrow('Cannot disable transactional');
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
      const time = new Date(); time.setHours(23, 0, 0, 0);
      expect(prefs.isInQuietHours(time)).toBe(false);
    });
    it('handles same-day range correctly', () => {
      prefs.setQuietHours('09:00', '17:00');
      const inRange = new Date(); inRange.setHours(12, 0, 0, 0);
      const outRange = new Date(); outRange.setHours(18, 0, 0, 0);
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
      expect(json.doNotDisturb).toBe(false);
      expect(typeof json.createdAt).toBe('string');
      expect(typeof json.updatedAt).toBe('string');
    });
  });
});
