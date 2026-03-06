import { z } from 'zod';
import { idSchema } from './common';

export const createCalendarSchema = z.object({
  name: z.string().min(1, 'Calendar name is required').max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex color (e.g. #3b82f6)'),
});
export type CreateCalendarInput = z.infer<typeof createCalendarSchema>;

export const updateCalendarSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
export type UpdateCalendarInput = z.infer<typeof updateCalendarSchema>;

export const calendarResponseSchema = z.object({
  id: idSchema,
  name: z.string(),
  color: z.string(),
  ownerId: idSchema,
  createdAt: z.coerce.date(),
});
export type CalendarResponse = z.infer<typeof calendarResponseSchema>;
