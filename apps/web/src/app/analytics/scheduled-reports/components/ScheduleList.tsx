'use client';

// Scheduled reports list — PG-201. Each row: colour + name, template, cadence,
// recipients, format, tags, next run, an Active switch and Edit / Delete.

import { Badge, Button, EmptyState, Switch } from '@intelliflow/ui';
import { describeSchedule, type ScheduledReportView } from '@intelliflow/validators';
import { swatchClass } from './schedule-colors';

type DateLike = string | Date;

/** ScheduledReportView as the client receives it (dates arrive as ISO strings). */
export type ScheduleItem = Omit<
  ScheduledReportView,
  'lastRunAt' | 'nextRunAt' | 'createdAt' | 'updatedAt'
> & {
  lastRunAt: DateLike | null;
  nextRunAt: DateLike | null;
  createdAt: DateLike;
  updatedAt: DateLike;
};

const FORMAT_LABELS: Record<ScheduledReportView['format'], string> = {
  pdf: 'PDF',
  csv: 'CSV',
  email_body: 'Email body',
  excel: 'Excel',
};

export function formatLabel(format: ScheduledReportView['format']): string {
  return FORMAT_LABELS[format];
}

/** "13 Oct 2026, 09:00" in the schedule's own timezone. */
export function formatNextRun(value: DateLike, timezone: string): string {
  const date = new Date(value);
  try {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function templateLabel(s: ScheduleItem): string {
  if (s.templateName) return s.templateName;
  if (s.templateHidden) return 'Private template';
  if (s.reportId) return 'Report definition';
  return 'No template — choose one to activate';
}

export interface ScheduleListProps {
  readonly schedules: ScheduleItem[];
  readonly canEdit: boolean;
  readonly pendingId: string | null;
  readonly onToggle: (schedule: ScheduleItem, isActive: boolean) => void;
  readonly onEdit: (schedule: ScheduleItem) => void;
  readonly onDelete: (schedule: ScheduleItem) => void;
}

export function ScheduleList({
  schedules,
  canEdit,
  pendingId,
  onToggle,
  onEdit,
  onDelete,
}: ScheduleListProps) {
  if (schedules.length === 0) {
    return (
      <EmptyState
        entity="reports"
        phase="passive"
        size="sm"
        className="py-4 px-3 gap-2"
        title="No scheduled reports yet"
        description="Create a schedule to send a report template to recipients on a regular cadence."
      />
    );
  }

  return (
    <ul className="divide-y divide-border" aria-label="Scheduled reports">
      {schedules.map((s) => {
        const busy = pendingId === s.id;
        const missingTemplate = !s.templateId && !s.reportId;
        return (
          <li
            key={s.id}
            className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start"
            data-testid={`schedule-row-${s.id}`}
          >
            <span
              className={`mt-1.5 inline-block h-3 w-3 shrink-0 rounded-full ${swatchClass(s.colorToken)}`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-foreground">{s.name}</p>
              <p
                className={`text-xs ${missingTemplate ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}
              >
                {templateLabel(s)}
              </p>
              <p className="text-xs text-muted-foreground">
                {describeSchedule({
                  cadence: s.cadence,
                  dayOfWeek: s.dayOfWeek,
                  dayOfMonth: s.dayOfMonth,
                  timeOfDay: s.timeOfDay,
                  cronExpression: s.cronExpression,
                  timezone: s.timezone,
                })}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <Badge variant="outline" className="text-xs">
                  {formatLabel(s.format)}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {s.recipients.length === 1 ? '1 recipient' : `${s.recipients.length} recipients`}
                </Badge>
                {s.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {s.isActive && s.nextRunAt
                  ? `Next run: ${formatNextRun(s.nextRunAt, s.timezone)}`
                  : 'Paused'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Switch
                checked={s.isActive}
                disabled={!canEdit}
                aria-busy={busy || undefined}
                onCheckedChange={(checked) => {
                  if (!busy) onToggle(s, checked);
                }}
                aria-label={`Active: ${s.name}`}
              />
              {canEdit && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(s)}
                    disabled={busy}
                    aria-label={`Edit ${s.name}`}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(s)}
                    disabled={busy}
                    aria-label={`Delete ${s.name}`}
                  >
                    Delete
                  </Button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
