/**
 * Scheduled report helpers — PG-201
 *
 * Pure functions behind analytics.scheduledReports. cron-parser (the version
 * BullMQ itself uses) stays server-side; the web page only uses the pure
 * presetToCron / describeSchedule helpers from @intelliflow/validators.
 *
 * PG-201 adds no scheduler: `nextRunAt` is stored as IFC-308's starting point and
 * the page shows the next occurrence computed on read (displayNextRun); IFC-308
 * registers the BullMQ job schedulers (ADR-075).
 */

import parser from 'cron-parser';
import type { Prisma, ReportSchedule } from '@intelliflow/db';
import {
  presetToCron,
  scheduleCadenceSchema,
  scheduleDeliveryFormatSchema,
  SCHEDULE_LIMITS,
  type ScheduleCadence,
  type ScheduledReportView,
} from '@intelliflow/validators';

export class InvalidCronError extends Error {
  constructor(expression: string, cause?: unknown) {
    super(`Invalid cron expression or timezone: ${expression}`);
    this.name = 'InvalidCronError';
    this.cause = cause;
  }
}

/** Upcoming fire times of a cron expression in an IANA timezone, after `from`. */
function upcomingRuns(cron: string, timezone: string, from: Date, count: number): Date[] {
  try {
    const iterator = parser.parseExpression(cron, { currentDate: from, tz: timezone });
    return Array.from({ length: count }, () => iterator.next().toDate());
  } catch (err) {
    throw new InvalidCronError(cron, err);
  }
}

/** Next fire time of `cron` in `timezone` strictly after `from`. Throws InvalidCronError. */
export function computeNextRun(cron: string, timezone: string, from: Date): Date {
  return upcomingRuns(cron, timezone, from, 1)[0];
}

const DAY_MS = 86_400_000;

function gapsAllowed(runs: Date[]): boolean {
  const minGapMs = SCHEDULE_LIMITS.minIntervalMinutes * 60_000;
  return runs.every((run, i) => i === 0 || run.getTime() - runs[i - 1].getTime() >= minGapMs);
}

/**
 * Start of each day, in the coming year, on which `timezone` changes its UTC offset
 * (DST). One offset lookup per day with a single formatter.
 */
export function offsetTransitionDays(timezone: string, from: Date): Date[] {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' });
  } catch (err) {
    throw new InvalidCronError(timezone, err);
  }
  const offsetAt = (at: Date) =>
    format.formatToParts(at).find((part) => part.type === 'timeZoneName')?.value ?? '';
  const days: Date[] = [];
  let previous = offsetAt(from);
  for (let day = 1; day <= 366; day++) {
    const at = new Date(from.getTime() + day * DAY_MS);
    const offset = offsetAt(at);
    if (offset !== previous) days.push(new Date(at.getTime() - DAY_MS));
    previous = offset;
  }
  return days;
}

/**
 * Abuse guard for IFC-308: a schedule may not fire more often than
 * SCHEDULE_LIMITS.minIntervalMinutes. Checks the next runs, and the runs around every
 * UTC-offset change in the coming year — a half-hour DST shift (e.g. Lord Howe) can
 * put an hourly schedule's runs 30 minutes apart.
 */
export function isIntervalAllowed(cron: string, timezone: string, from: Date): boolean {
  if (!gapsAllowed(upcomingRuns(cron, timezone, from, 6))) return false;
  return offsetTransitionDays(timezone, from).every((day) =>
    gapsAllowed(upcomingRuns(cron, timezone, day, 30))
  );
}

export interface ScheduleDefinitionInput {
  cadence: ScheduleCadence;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeOfDay?: string;
  cronExpression?: string;
}

export interface ScheduleColumns {
  frequency: ScheduleCadence;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string | null;
  cronExpression: string | null;
}

/**
 * Owner ruling Q2: the cron is the source of truth, and a preset keeps the legacy
 * frequency/dayOfWeek/dayOfMonth/timeOfDay columns consistent with it. For presets
 * the server derives the cron (any client-sent cron is ignored).
 */
export function buildScheduleColumns(input: ScheduleDefinitionInput): ScheduleColumns {
  if (input.cadence === 'custom') {
    return {
      frequency: 'custom',
      dayOfWeek: null,
      dayOfMonth: null,
      timeOfDay: null,
      cronExpression: input.cronExpression ?? null,
    };
  }
  return {
    frequency: input.cadence,
    dayOfWeek: input.cadence === 'weekly' ? (input.dayOfWeek ?? null) : null,
    dayOfMonth:
      input.cadence === 'monthly' || input.cadence === 'quarterly'
        ? (input.dayOfMonth ?? null)
        : null,
    timeOfDay: input.timeOfDay ?? null,
    cronExpression: presetToCron(input),
  };
}

export interface TemplateVisibility {
  createdBy: string;
  sharingScope: string;
}

/** PG-200 visibility rule: own templates, plus any template that is not private. */
export function isTemplateVisible(template: TemplateVisibility, userId: string): boolean {
  return template.createdBy === userId || template.sharingScope !== 'private';
}

export const SCHEDULE_TEMPLATE_SELECT = {
  id: true,
  name: true,
  createdBy: true,
  sharingScope: true,
} as const;

export type ScheduleRowWithTemplate = ReportSchedule & {
  template: (TemplateVisibility & { id: string; name: string }) | null;
};

function toRecipients(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Next run to show for a row. Nothing advances the stored nextRunAt until IFC-308's
 * runner exists, so an active row's next occurrence is computed from its cron and
 * timezone at read time. Without a usable cron, a stored value is shown only while it
 * is still in the future; paused rows have no next run.
 */
export function displayNextRun(row: ReportSchedule, now: Date): Date | null {
  if (!row.isActive) return null;
  if (row.cronExpression) {
    try {
      return computeNextRun(row.cronExpression, row.timezone, now);
    } catch (err) {
      if (!(err instanceof InvalidCronError)) throw err;
    }
  }
  return row.nextRunAt && row.nextRunAt.getTime() > now.getTime() ? row.nextRunAt : null;
}

/** Row -> explicit view contract. Legacy values are normalised instead of crashing the page. */
export function normalizeScheduleRow(
  row: ScheduleRowWithTemplate,
  viewerId: string,
  now: Date = new Date()
): ScheduledReportView {
  const cadence = scheduleCadenceSchema.safeParse(row.frequency);
  const format = scheduleDeliveryFormatSchema.safeParse(row.format);
  const visible = row.template ? isTemplateVisible(row.template, viewerId) : false;
  return {
    id: row.id,
    name: row.name ?? 'Untitled schedule',
    description: row.description,
    templateId: row.templateId,
    templateName: row.template && visible ? row.template.name : null,
    templateHidden: row.template !== null && !visible,
    reportId: row.reportId,
    cadence: cadence.success ? cadence.data : 'custom',
    dayOfWeek: row.dayOfWeek,
    dayOfMonth: row.dayOfMonth,
    timeOfDay: row.timeOfDay,
    cronExpression: row.cronExpression,
    timezone: row.timezone,
    recipients: toRecipients(row.recipients),
    format: format.success ? format.data : 'pdf',
    colorToken: row.colorToken,
    tags: row.tags ?? [],
    isActive: row.isActive,
    lastRunAt: row.lastRunAt,
    nextRunAt: displayNextRun(row, now),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
