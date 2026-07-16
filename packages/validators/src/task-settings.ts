// IntelliFlow CRM - Task Settings Validators (PG-191)
// Zod schemas for the /tasks/task-settings page: default due-date offset,
// reminder defaults, and a bounded task-template config list.
//
// Pattern mirrors packages/validators/src/report-settings.ts (singleton
// settings). taskPrioritySchema is imported from ./task (single source of
// truth) — do NOT redefine a priority enum here.

import { z } from 'zod';
import { taskPrioritySchema } from './task';

// ─── Due-date offset ─────────────────────────────────────────────────────────

/** Default number of days after creation a task is due. 0..365. */
export const dueDateOffsetDaysSchema = z.number().int().min(0).max(365);

// ─── Reminder defaults ───────────────────────────────────────────────────────

/** Upper bound = 28 days in minutes; a defensive cap, not a UX limit. */
const MAX_REMINDER_MINUTES = 40320;

export const reminderDefaultsSchema = z
  .object({
    enabled: z.boolean(),
    minutesBefore: z.number().int().min(0).max(MAX_REMINDER_MINUTES),
  })
  .superRefine((val, ctx) => {
    if (val.enabled && val.minutesBefore <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minutesBefore'],
        message: 'Reminder lead time must be greater than 0 when reminders are enabled.',
      });
    }
  });
export type ReminderDefaults = z.infer<typeof reminderDefaultsSchema>;

// ─── Task templates ──────────────────────────────────────────────────────────

export const taskTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  defaultPriority: taskPrioritySchema,
  defaultDueOffsetDays: dueDateOffsetDaysSchema,
});
export type TaskTemplateInput = z.infer<typeof taskTemplateSchema>;

/** Max templates per tenant — a defensive bound on the JSON column. */
export const MAX_TASK_TEMPLATES = 50;

export const taskTemplatesSchema = z
  .array(taskTemplateSchema)
  .max(MAX_TASK_TEMPLATES, `At most ${MAX_TASK_TEMPLATES} templates are allowed`)
  .superRefine((templates, ctx) => {
    const seen = new Map<string, number>();
    templates.forEach((template, index) => {
      const key = template.name.trim().toLowerCase();
      const first = seen.get(key);
      if (first !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'name'],
          message: `Duplicate template name "${template.name}" appears in rows ${first + 1} and ${index + 1}`,
        });
      } else {
        seen.set(key, index);
      }
    });
  });
export type TaskTemplatesInput = z.infer<typeof taskTemplatesSchema>;

// ─── Composite settings ──────────────────────────────────────────────────────

export const taskSettingsSchema = z.object({
  dueDateOffsetDays: dueDateOffsetDaysSchema,
  reminderDefaults: reminderDefaultsSchema,
  taskTemplates: taskTemplatesSchema,
});
export type TaskSettingsInput = z.infer<typeof taskSettingsSchema>;

export const updateTaskSettingsSchema = z.object({
  dueDateOffsetDays: dueDateOffsetDaysSchema.optional(),
  reminderDefaults: reminderDefaultsSchema.optional(),
  taskTemplates: taskTemplatesSchema.optional(),
});
export type UpdateTaskSettingsInput = z.infer<typeof updateTaskSettingsSchema>;

// ─── Factory defaults (shared by router seed + tests + client fallback) ───────

export const DEFAULT_TASK_SETTINGS: TaskSettingsInput = {
  dueDateOffsetDays: 3,
  reminderDefaults: { enabled: true, minutesBefore: 60 },
  taskTemplates: [],
};
