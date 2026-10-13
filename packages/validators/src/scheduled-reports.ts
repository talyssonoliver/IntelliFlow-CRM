// IntelliFlow CRM - Scheduled Report Validators (PG-201)
// Zod schemas for /analytics/scheduled-reports. Rows live in `report_schedules`;
// IFC-308's BullMQ cron reads `cronExpression` + `timezone` (ADR-075).

import { z } from 'zod';
import { ACCOUNT_TAG_COLOR_TOKENS } from './account-settings';

export const scheduleCadenceSchema = z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'custom']);
export type ScheduleCadence = z.infer<typeof scheduleCadenceSchema>;

// `excel` is kept for rows copied from the legacy Report Settings delivery.
export const scheduleDeliveryFormatSchema = z.enum(['pdf', 'csv', 'email_body', 'excel']);
export type ScheduleDeliveryFormat = z.infer<typeof scheduleDeliveryFormatSchema>;

// Same 18-token palette as account tags/territories/tiers (DB CHECK mirrors it).
export const REPORT_SCHEDULE_COLOR_TOKENS = ACCOUNT_TAG_COLOR_TOKENS;
export const reportScheduleColorTokenSchema = z.enum(REPORT_SCHEDULE_COLOR_TOKENS);
export type ReportScheduleColorToken = z.infer<typeof reportScheduleColorTokenSchema>;

export const SCHEDULE_LIMITS = {
  maxRecipients: 50,
  maxTags: 10,
  maxActivePerTenant: 100,
  minIntervalMinutes: 60,
  maxNameLength: 100,
  maxTagNameLength: 50,
  maxCronLength: 100,
  maxTimezoneLength: 64,
  maxDayOfMonth: 28,
} as const;

export const SCHEDULE_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const CRON_FIELD_REGEX = /^[0-9*,/-]+$/;
const IANA_ZONE_REGEX = /^(UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/;

export const cronExpressionSchema = z
  .string()
  .trim()
  // Single spaces between fields: the stored value must match the DB CHECK
  // (report_schedules_cronExpression_check) and BullMQ's pattern verbatim.
  .overwrite((value) => value.split(/\s+/).join(' '))
  .max(SCHEDULE_LIMITS.maxCronLength)
  .refine((value) => {
    const fields = value.split(' ');
    return fields.length === 5 && fields.every((f) => CRON_FIELD_REGEX.test(f));
  }, 'Use a 5-field cron expression: minute hour day-of-month month day-of-week.');

export function isValidIanaTimezone(value: string): boolean {
  if (!IANA_ZONE_REGEX.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const ianaTimezoneSchema = z
  .string()
  .trim()
  .max(SCHEDULE_LIMITS.maxTimezoneLength)
  .refine(isValidIanaTimezone, 'Choose a valid IANA timezone, for example Europe/London.');

export const recipientsSchema = z
  .array(z.string().trim().toLowerCase().max(254).email('Enter a valid email address.'))
  .min(1, 'Add at least one recipient.')
  .max(SCHEDULE_LIMITS.maxRecipients, `At most ${SCHEDULE_LIMITS.maxRecipients} recipients.`)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    list.forEach((email, index) => {
      if (seen.has(email)) {
        ctx.addIssue({
          code: 'custom',
          path: [index],
          message: `Duplicate recipient: ${email}.`,
        });
      }
      seen.add(email);
    });
  });

const tagNamesSchema = z
  .array(z.string().trim().min(1).max(SCHEDULE_LIMITS.maxTagNameLength))
  .max(SCHEDULE_LIMITS.maxTags, `At most ${SCHEDULE_LIMITS.maxTags} tags.`)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    list.forEach((name, index) => {
      const key = name.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({ code: 'custom', path: [index], message: `Duplicate tag: ${name}.` });
      }
      seen.add(key);
    });
  });

const scheduleIdField = z.string().trim().min(1).max(191);

// Shared field definitions. Create and update are built as independent objects
// (not .partial().extend()) to avoid TS2589 through tRPC generics (PG-200 note).
const nameField = z.string().trim().min(1).max(SCHEDULE_LIMITS.maxNameLength);
const descriptionField = z.string().trim().max(500);
const dayOfWeekField = z.number().int().min(0).max(6);
const dayOfMonthField = z.number().int().min(1).max(SCHEDULE_LIMITS.maxDayOfMonth);
const timeOfDayField = z.string().regex(SCHEDULE_TIME_REGEX, 'Use HH:MM (24-hour) format.');

interface CadenceFields {
  cadence?: ScheduleCadence;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeOfDay?: string;
  cronExpression?: string;
  timezone?: string;
}

function checkCadenceRules(value: CadenceFields, ctx: z.RefinementCtx): void {
  const { cadence } = value;
  if (cadence === undefined) return;
  if (cadence === 'custom') {
    if (!value.cronExpression) {
      ctx.addIssue({
        code: 'custom',
        path: ['cronExpression'],
        message: 'Enter a cron expression.',
      });
    }
    return;
  }
  if (cadence === 'weekly' && value.dayOfWeek === undefined) {
    ctx.addIssue({ code: 'custom', path: ['dayOfWeek'], message: 'Choose a day of the week.' });
  }
  if ((cadence === 'monthly' || cadence === 'quarterly') && value.dayOfMonth === undefined) {
    ctx.addIssue({ code: 'custom', path: ['dayOfMonth'], message: 'Choose a day of the month.' });
  }
  if (value.timeOfDay === undefined) {
    ctx.addIssue({ code: 'custom', path: ['timeOfDay'], message: 'Choose a time of day.' });
  }
}

export const createScheduledReportSchema = z
  .strictObject({
    name: nameField,
    description: descriptionField.optional(),
    templateId: z.string().cuid(),
    cadence: scheduleCadenceSchema,
    dayOfWeek: dayOfWeekField.optional(),
    dayOfMonth: dayOfMonthField.optional(),
    timeOfDay: timeOfDayField.optional(),
    cronExpression: cronExpressionSchema.optional(),
    timezone: ianaTimezoneSchema,
    recipients: recipientsSchema,
    format: scheduleDeliveryFormatSchema,
    colorToken: reportScheduleColorTokenSchema.optional(),
    tags: tagNamesSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine(checkCadenceRules);
export type CreateScheduledReportInput = z.infer<typeof createScheduledReportSchema>;

const SCHEDULE_DEFINITION_KEYS = [
  'dayOfWeek',
  'dayOfMonth',
  'timeOfDay',
  'cronExpression',
  'timezone',
] as const;

export const updateScheduledReportSchema = z
  .strictObject({
    id: scheduleIdField,
    name: nameField.optional(),
    description: descriptionField.optional(),
    templateId: z.string().cuid().optional(),
    cadence: scheduleCadenceSchema.optional(),
    dayOfWeek: dayOfWeekField.optional(),
    dayOfMonth: dayOfMonthField.optional(),
    timeOfDay: timeOfDayField.optional(),
    cronExpression: cronExpressionSchema.optional(),
    timezone: ianaTimezoneSchema.optional(),
    recipients: recipientsSchema.optional(),
    format: scheduleDeliveryFormatSchema.optional(),
    colorToken: reportScheduleColorTokenSchema.optional(),
    tags: tagNamesSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const changesSchedule = SCHEDULE_DEFINITION_KEYS.some((key) => value[key] !== undefined);
    if (changesSchedule && value.cadence === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['cadence'],
        message: 'Send the cadence together with any schedule change.',
      });
      return;
    }
    checkCadenceRules(value, ctx);
  });
export type UpdateScheduledReportInput = z.infer<typeof updateScheduledReportSchema>;

export const scheduledReportIdSchema = z.object({ id: scheduleIdField });
export type ScheduledReportIdInput = z.infer<typeof scheduledReportIdSchema>;

export const setScheduledReportActiveSchema = z.object({
  id: scheduleIdField,
  isActive: z.boolean(),
});
export type SetScheduledReportActiveInput = z.infer<typeof setScheduledReportActiveSchema>;

/**
 * Client-side duplicate-name guard (DoD: "Zod superRefine for duplicate schedule
 * names"). The `(tenantId, lower(name))` unique index is the authority; this gives
 * the dialog instant feedback against the already-loaded list.
 */
export function scheduleNameConflictSchema(
  existing: ReadonlyArray<{ id: string; name: string }>,
  selfId?: string
) {
  return z.string().superRefine((name, ctx) => {
    const key = name.trim().toLowerCase();
    const clash = existing.some((s) => s.id !== selfId && s.name.trim().toLowerCase() === key);
    if (clash) {
      ctx.addIssue({
        code: 'custom',
        message: 'A scheduled report with this name already exists.',
      });
    }
  });
}

export interface SchedulePresetInput {
  cadence: ScheduleCadence;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  timeOfDay?: string | null;
}

/** Cron for a preset cadence, or null for custom / incomplete input. Pure; shared by API and UI. */
export function presetToCron(input: SchedulePresetInput): string | null {
  const { cadence, dayOfWeek, dayOfMonth, timeOfDay } = input;
  if (cadence === 'custom' || !timeOfDay || !SCHEDULE_TIME_REGEX.test(timeOfDay)) return null;
  const [hourText, minuteText] = timeOfDay.split(':');
  const time = `${Number(minuteText)} ${Number(hourText)}`;
  switch (cadence) {
    case 'daily':
      return `${time} * * *`;
    case 'weekly':
      return dayOfWeek == null ? null : `${time} * * ${dayOfWeek}`;
    case 'monthly':
      return dayOfMonth == null ? null : `${time} ${dayOfMonth} * *`;
    case 'quarterly':
      return dayOfMonth == null ? null : `${time} ${dayOfMonth} 1,4,7,10 *`;
  }
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface DescribeScheduleInput extends SchedulePresetInput {
  cronExpression?: string | null;
  timezone: string;
}

/** Plain-English cadence summary. Fixed English names — no locale APIs (stable in tests). */
export function describeSchedule(input: DescribeScheduleInput): string {
  const zone = ` (${input.timezone})`;
  if (input.cadence === 'custom') {
    return input.cronExpression
      ? `Custom schedule: ${input.cronExpression}${zone}`
      : 'Schedule not set';
  }
  if (presetToCron(input) === null) return 'Schedule not set';
  const at = ` at ${input.timeOfDay}`;
  switch (input.cadence) {
    case 'daily':
      return `Every day${at}${zone}`;
    case 'weekly':
      return `Every ${DAY_NAMES[input.dayOfWeek as number]}${at}${zone}`;
    case 'monthly':
      return `Monthly on day ${input.dayOfMonth}${at}${zone}`;
    case 'quarterly':
      return `Quarterly (Jan, Apr, Jul, Oct) on day ${input.dayOfMonth}${at}${zone}`;
  }
}

// ─── Tags ────────────────────────────────────────────────────────────────────

const tagNameField = z.string().trim().min(1).max(SCHEDULE_LIMITS.maxTagNameLength);

export const createReportScheduleTagSchema = z.object({
  name: tagNameField,
  colorToken: reportScheduleColorTokenSchema.optional(),
  description: z.string().trim().max(200).optional(),
});
export type CreateReportScheduleTagInput = z.infer<typeof createReportScheduleTagSchema>;

export const updateReportScheduleTagSchema = z.object({
  id: scheduleIdField,
  name: tagNameField.optional(),
  colorToken: reportScheduleColorTokenSchema.optional(),
  description: z.string().trim().max(200).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateReportScheduleTagInput = z.infer<typeof updateReportScheduleTagSchema>;

export const deleteReportScheduleTagSchema = z.object({ id: scheduleIdField });
export type DeleteReportScheduleTagInput = z.infer<typeof deleteReportScheduleTagSchema>;

// ─── Output contracts (explicit, no Prisma JsonValue through tRPC — #772) ────

export interface ScheduledReportView {
  id: string;
  name: string;
  description: string | null;
  templateId: string | null;
  templateName: string | null;
  templateHidden: boolean;
  reportId: string | null;
  cadence: ScheduleCadence;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string | null;
  cronExpression: string | null;
  timezone: string;
  recipients: string[];
  format: ScheduleDeliveryFormat;
  colorToken: string;
  tags: string[];
  isActive: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportScheduleTagView {
  id: string;
  name: string;
  colorToken: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}
