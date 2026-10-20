/**
 * System defaults for a tenant's appointment settings row (PG-189).
 *
 * Shared by appointment-settings.router.ts (lazy create, reset) and
 * calendar/availability.router.ts (first availability save creates the row),
 * so the defaults live in one dependency-free module (PG-202).
 */
export const DEFAULT_APPOINTMENT_SETTINGS = {
  defaultDurationMinutes: 30,
  minDurationMinutes: 5,
  maxDurationMinutes: 480,
  defaultBufferBeforeMinutes: 0,
  defaultBufferAfterMinutes: 0,
  defaultReminderMinutes: 15,
  primaryCalendarId: null,
  syncExternalCalendars: false,
  defaultTimezone: 'UTC',
} as const;

/**
 * What `appointmentSettings.resetToDefaults` restores. Buffers and the timezone
 * are edited on /calendar/availability (owner Q2), so this reset leaves them.
 */
export const APPOINTMENT_SETTINGS_RESET_FIELDS = {
  defaultDurationMinutes: DEFAULT_APPOINTMENT_SETTINGS.defaultDurationMinutes,
  minDurationMinutes: DEFAULT_APPOINTMENT_SETTINGS.minDurationMinutes,
  maxDurationMinutes: DEFAULT_APPOINTMENT_SETTINGS.maxDurationMinutes,
  defaultReminderMinutes: DEFAULT_APPOINTMENT_SETTINGS.defaultReminderMinutes,
  syncExternalCalendars: DEFAULT_APPOINTMENT_SETTINGS.syncExternalCalendars,
} as const;
