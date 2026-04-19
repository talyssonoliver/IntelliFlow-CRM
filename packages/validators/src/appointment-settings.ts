import { z } from 'zod';

export const appointmentSettingsSchema = z.object({
  defaultDurationMinutes: z.number().int().min(5).max(480),
  minDurationMinutes: z.number().int().min(5).max(480),
  maxDurationMinutes: z.number().int().min(5).max(480),
  defaultBufferBeforeMinutes: z.number().int().min(0).max(240),
  defaultBufferAfterMinutes: z.number().int().min(0).max(240),
  defaultReminderMinutes: z.number().int().min(0).max(60).nullable(),
  primaryCalendarId: z.string().nullable(),
  syncExternalCalendars: z.boolean(),
  defaultTimezone: z.string().min(1),
});

export const updateAppointmentSettingsSchema = appointmentSettingsSchema.partial();

export type AppointmentSettingsInput = z.infer<typeof appointmentSettingsSchema>;
export type UpdateAppointmentSettingsInput = z.infer<typeof updateAppointmentSettingsSchema>;
