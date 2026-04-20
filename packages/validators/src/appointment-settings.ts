import { z } from 'zod';

const durationConsistency = (
  val: {
    minDurationMinutes?: number;
    defaultDurationMinutes?: number;
    maxDurationMinutes?: number;
  },
  ctx: z.RefinementCtx
) => {
  const { minDurationMinutes: mn, defaultDurationMinutes: df, maxDurationMinutes: mx } = val;
  if (mn !== undefined && mx !== undefined && mn > mx) {
    ctx.addIssue({
      code: 'custom',
      path: ['minDurationMinutes'],
      message: 'minDurationMinutes cannot exceed maxDurationMinutes',
    });
  }
  if (df !== undefined && mn !== undefined && df < mn) {
    ctx.addIssue({
      code: 'custom',
      path: ['defaultDurationMinutes'],
      message: 'defaultDurationMinutes cannot be below minDurationMinutes',
    });
  }
  if (df !== undefined && mx !== undefined && df > mx) {
    ctx.addIssue({
      code: 'custom',
      path: ['defaultDurationMinutes'],
      message: 'defaultDurationMinutes cannot exceed maxDurationMinutes',
    });
  }
};

const appointmentSettingsShape = z.object({
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

export const appointmentSettingsSchema = appointmentSettingsShape.superRefine(durationConsistency);

export const updateAppointmentSettingsSchema = appointmentSettingsShape
  .partial()
  .superRefine(durationConsistency);

export type AppointmentSettingsInput = z.infer<typeof appointmentSettingsSchema>;
export type UpdateAppointmentSettingsInput = z.infer<typeof updateAppointmentSettingsSchema>;
