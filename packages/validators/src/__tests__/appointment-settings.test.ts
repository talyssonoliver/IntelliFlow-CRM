import { describe, it, expect } from 'vitest';
import {
  appointmentSettingsSchema,
  updateAppointmentSettingsSchema,
} from '../appointment-settings';

describe('appointment-settings validators', () => {
  const validSettings = {
    defaultDurationMinutes: 30,
    minDurationMinutes: 5,
    maxDurationMinutes: 480,
    defaultBufferBeforeMinutes: 0,
    defaultBufferAfterMinutes: 0,
    defaultReminderMinutes: 15,
    primaryCalendarId: null,
    syncExternalCalendars: false,
    defaultTimezone: 'UTC',
  };

  describe('appointmentSettingsSchema', () => {
    it('accepts a fully valid settings object', () => {
      expect(() => appointmentSettingsSchema.parse(validSettings)).not.toThrow();
    });

    describe('buffer constraints', () => {
      it('accepts bufferBefore = 0 (minimum)', () => {
        const result = appointmentSettingsSchema.safeParse({
          ...validSettings,
          defaultBufferBeforeMinutes: 0,
        });
        expect(result.success).toBe(true);
      });

      it('accepts bufferBefore = 240 (maximum)', () => {
        const result = appointmentSettingsSchema.safeParse({
          ...validSettings,
          defaultBufferBeforeMinutes: 240,
        });
        expect(result.success).toBe(true);
      });

      it('rejects bufferBefore > 240', () => {
        const result = appointmentSettingsSchema.safeParse({
          ...validSettings,
          defaultBufferBeforeMinutes: 241,
        });
        expect(result.success).toBe(false);
      });

      it('rejects bufferAfter > 240', () => {
        const result = appointmentSettingsSchema.safeParse({
          ...validSettings,
          defaultBufferAfterMinutes: 241,
        });
        expect(result.success).toBe(false);
      });

      it('rejects negative buffer values', () => {
        const result = appointmentSettingsSchema.safeParse({
          ...validSettings,
          defaultBufferBeforeMinutes: -1,
        });
        expect(result.success).toBe(false);
      });
    });

    describe('duration constraints', () => {
      it('rejects defaultDurationMinutes < 5', () => {
        const result = appointmentSettingsSchema.safeParse({
          ...validSettings,
          defaultDurationMinutes: 4,
        });
        expect(result.success).toBe(false);
      });

      it('rejects defaultDurationMinutes > 480', () => {
        const result = appointmentSettingsSchema.safeParse({
          ...validSettings,
          defaultDurationMinutes: 481,
        });
        expect(result.success).toBe(false);
      });

      it('rejects minDurationMinutes < 5', () => {
        const result = appointmentSettingsSchema.safeParse({
          ...validSettings,
          minDurationMinutes: 4,
        });
        expect(result.success).toBe(false);
      });

      it('accepts maxDurationMinutes = 480', () => {
        const result = appointmentSettingsSchema.safeParse({
          ...validSettings,
          maxDurationMinutes: 480,
        });
        expect(result.success).toBe(true);
      });

      it('rejects maxDurationMinutes > 480', () => {
        const result = appointmentSettingsSchema.safeParse({
          ...validSettings,
          maxDurationMinutes: 481,
        });
        expect(result.success).toBe(false);
      });
    });

    describe('nullable fields', () => {
      it('accepts null primaryCalendarId', () => {
        const result = appointmentSettingsSchema.safeParse({
          ...validSettings,
          primaryCalendarId: null,
        });
        expect(result.success).toBe(true);
      });

      it('accepts string primaryCalendarId', () => {
        const result = appointmentSettingsSchema.safeParse({
          ...validSettings,
          primaryCalendarId: 'cal_abc123',
        });
        expect(result.success).toBe(true);
      });

      it('accepts null defaultReminderMinutes', () => {
        const result = appointmentSettingsSchema.safeParse({
          ...validSettings,
          defaultReminderMinutes: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe('timezone', () => {
      it('rejects empty string defaultTimezone', () => {
        const result = appointmentSettingsSchema.safeParse({
          ...validSettings,
          defaultTimezone: '',
        });
        expect(result.success).toBe(false);
      });

      it('accepts valid IANA timezone string', () => {
        const result = appointmentSettingsSchema.safeParse({
          ...validSettings,
          defaultTimezone: 'America/New_York',
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('cross-field duration constraints (PG-189 AC-004)', () => {
    it('rejects min > max on full schema', () => {
      const result = appointmentSettingsSchema.safeParse({
        ...validSettings,
        minDurationMinutes: 400,
        defaultDurationMinutes: 30,
        maxDurationMinutes: 50,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('minDurationMinutes');
      }
    });

    it('rejects default < min on full schema', () => {
      const result = appointmentSettingsSchema.safeParse({
        ...validSettings,
        minDurationMinutes: 60,
        defaultDurationMinutes: 30,
        maxDurationMinutes: 480,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('defaultDurationMinutes');
      }
    });

    it('rejects default > max via refine path on full schema', () => {
      // defaultDurationMinutes: 470 is within per-field [5,480] range but
      // above maxDurationMinutes: 120 — the refine fires.
      const result = appointmentSettingsSchema.safeParse({
        ...validSettings,
        minDurationMinutes: 5,
        defaultDurationMinutes: 470,
        maxDurationMinutes: 120,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('defaultDurationMinutes');
      }
    });
  });

  describe('updateAppointmentSettingsSchema', () => {
    it('accepts partial updates (only provided fields)', () => {
      const result = updateAppointmentSettingsSchema.safeParse({
        defaultDurationMinutes: 60,
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty object (no-op update)', () => {
      const result = updateAppointmentSettingsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('still validates provided fields', () => {
      const result = updateAppointmentSettingsSchema.safeParse({
        defaultBufferBeforeMinutes: 999,
      });
      expect(result.success).toBe(false);
    });

    it('partial update with ONLY defaultDurationMinutes does NOT fail cross-field check (AC-004)', () => {
      // Refine must skip when any of the three duration fields is absent.
      const result = updateAppointmentSettingsSchema.safeParse({
        defaultDurationMinutes: 60,
      });
      expect(result.success).toBe(true);
    });

    it('partial update with all three durations and min > max rejects (AC-004)', () => {
      const result = updateAppointmentSettingsSchema.safeParse({
        minDurationMinutes: 300,
        defaultDurationMinutes: 100,
        maxDurationMinutes: 60,
      });
      expect(result.success).toBe(false);
    });

    it('defaultReminderMinutes: null parses successfully (AC-008 regression lock)', () => {
      // Locks in that BufferSettings.defaultReminderMinutes is `number | null`
      // at the schema level — a future narrowing to `number` would break this.
      const result = updateAppointmentSettingsSchema.safeParse({
        defaultReminderMinutes: null,
      });
      expect(result.success).toBe(true);
    });
  });
});
