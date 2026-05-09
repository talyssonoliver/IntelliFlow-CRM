'use client';

import { HoverCard, HoverCardContent, HoverCardTrigger, cn } from '@intelliflow/ui';
import {
  formatTimeRange,
  formatDuration,
  getStatusConfig,
  getTypeConfig,
} from '@/lib/appointments/appointment-utils';

export interface CalendarEventHoverCardAppointment {
  kind: 'appointment';
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  appointmentType: string;
  status: string;
  location?: string;
  attendeeCount?: number;
  linkedCaseCount?: number;
  hasConflict?: boolean;
  isRecurring?: boolean;
}

export interface CalendarEventHoverCardTask {
  kind: 'task';
  id: string;
  title: string;
  dueDate: Date;
  priority: string;
}

export type CalendarEventHoverCardData =
  | CalendarEventHoverCardAppointment
  | CalendarEventHoverCardTask;

interface CalendarEventHoverCardProps {
  event: CalendarEventHoverCardData;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

const PRIORITY_ACCENT: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  MEDIUM: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  HIGH: 'bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  URGENT: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const PRIORITY_STRIPE: Record<string, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-yellow-400',
  HIGH: 'bg-orange-500',
  URGENT: 'bg-red-500',
};

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const d = new Date(date);
  // Compare UTC midnights to avoid server-local timezone influence on day boundaries.
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diffDays = Math.round((targetDay - nowDay) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 0 && diffDays < 7) return `In ${diffDays} days`;
  if (diffDays < 0 && diffDays > -7) return `${Math.abs(diffDays)} days ago`;
  if (diffDays >= 7 && diffDays < 30) return `In ${Math.ceil(diffDays / 7)} weeks`;
  if (diffDays < 0) return 'Overdue';
  return '';
}

interface MetaItemProps {
  icon: string;
  iconClassName?: string;
  label: string;
  value: React.ReactNode;
}

function MetaItem({ icon, iconClassName, label, value }: Readonly<MetaItemProps>) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-md shrink-0',
          iconClassName ?? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
        )}
      >
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 leading-tight">
          {label}
        </p>
        <div className="text-xs text-slate-700 dark:text-slate-200 leading-snug mt-0.5 break-words">
          {value}
        </div>
      </div>
    </div>
  );
}

function Footer({ href, label }: Readonly<{ href: string; label: string }>) {
  return (
    <a
      href={href}
      className="group flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-800 text-xs font-medium text-primary hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
    >
      <span>{label}</span>
      <span
        className="material-symbols-outlined text-[16px] transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      >
        arrow_outward
      </span>
    </a>
  );
}

function AppointmentHoverBody({ data }: Readonly<{ data: CalendarEventHoverCardAppointment }>) {
  const typeConfig = getTypeConfig(data.appointmentType);
  const statusConfig = getStatusConfig(data.status);
  const startDate = new Date(data.startTime);
  const dateLabel = startDate.toLocaleDateString('en-GB', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const relative = formatRelativeDate(startDate);

  return (
    <>
      {/* Accent stripe keyed to appointment type */}
      <div className={cn('h-1 w-full', typeConfig.bgColor)} aria-hidden="true" />

      {/* Header */}
      <div className="px-5 pt-4 pb-4">
        <div className="flex items-center gap-1.5 mb-2.5">
          <span
            className={cn(
              'text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded',
              typeConfig.bgColor,
              typeConfig.color
            )}
          >
            {data.appointmentType}
          </span>
          <span
            className={cn(
              'text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded',
              statusConfig.bgColor,
              statusConfig.color
            )}
          >
            {statusConfig.label}
          </span>
          {data.hasConflict && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
              <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
                warning
              </span>{' '}
              Conflict
            </span>
          )}
        </div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-white leading-snug break-words">
          {data.title}
        </h3>
      </div>

      {/* Meta */}
      <div className="px-5 pb-4 space-y-3 border-t border-slate-100 dark:border-slate-800/60 pt-4">
        <MetaItem
          icon="schedule"
          iconClassName="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
          label={relative || 'Scheduled'}
          value={
            <>
              <div className="font-medium">{formatTimeRange(data.startTime, data.endTime)}</div>
              <div className="text-slate-500 dark:text-slate-400">
                {dateLabel} · {formatDuration(data.startTime, data.endTime)}
              </div>
            </>
          }
        />
        {data.location && (
          <MetaItem
            icon="place"
            iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300"
            label="Location"
            value={data.location}
          />
        )}
        {typeof data.attendeeCount === 'number' && data.attendeeCount > 0 && (
          <MetaItem
            icon="group"
            iconClassName="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300"
            label="Attendees"
            value={`${data.attendeeCount} ${data.attendeeCount === 1 ? 'person' : 'people'}`}
          />
        )}
        {typeof data.linkedCaseCount === 'number' && data.linkedCaseCount > 0 && (
          <MetaItem
            icon="folder_open"
            iconClassName="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300"
            label="Linked cases"
            value={`${data.linkedCaseCount} ${data.linkedCaseCount === 1 ? 'case' : 'cases'}`}
          />
        )}
        {data.isRecurring && (
          <MetaItem
            icon="repeat"
            iconClassName="bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300"
            label="Recurrence"
            value="Recurring event"
          />
        )}
      </div>

      <Footer href={`/appointments/${data.id}`} label="Open appointment" />
    </>
  );
}

function TaskHoverBody({ data }: Readonly<{ data: CalendarEventHoverCardTask }>) {
  const priority = data.priority || 'MEDIUM';
  const priorityAccent = PRIORITY_ACCENT[priority] ?? PRIORITY_ACCENT.MEDIUM;
  const priorityStripe = PRIORITY_STRIPE[priority] ?? PRIORITY_STRIPE.MEDIUM;
  const due = new Date(data.dueDate);
  const dueLabel = due.toLocaleDateString('en-GB', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const relative = formatRelativeDate(due);
  const isOverdue = due.getTime() < Date.now() - 86400000;

  return (
    <>
      {/* Accent stripe keyed to priority */}
      <div className={cn('h-1 w-full', priorityStripe)} aria-hidden="true" />

      {/* Header */}
      <div className="px-5 pt-4 pb-4">
        <div className="flex items-center gap-1.5 mb-2.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
            <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
              task_alt
            </span>{' '}
            Task
          </span>
          {isOverdue && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
              <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
                warning
              </span>{' '}
              Overdue
            </span>
          )}
          <span
            className={cn(
              'ml-auto text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded',
              priorityAccent
            )}
          >
            {PRIORITY_LABELS[priority] ?? priority}
          </span>
        </div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-white leading-snug break-words">
          {data.title}
        </h3>
      </div>

      {/* Meta */}
      <div className="px-5 pb-4 border-t border-slate-100 dark:border-slate-800/60 pt-4">
        <MetaItem
          icon="event"
          iconClassName={cn(
            isOverdue
              ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300'
              : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
          )}
          label={relative || 'Due date'}
          value={<span className="font-medium">{dueLabel}</span>}
        />
      </div>

      <Footer href={`/tasks/${data.id}`} label="Open task" />
    </>
  );
}

export function CalendarEventHoverCard({
  event,
  children,
  side = 'right',
  align = 'start',
  className,
}: Readonly<CalendarEventHoverCardProps>) {
  return (
    <HoverCard openDelay={250} closeDelay={150}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        sideOffset={8}
        className={cn(
          'z-[999] w-80 p-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl',
          className
        )}
      >
        {event.kind === 'appointment' ? (
          <AppointmentHoverBody data={event} />
        ) : (
          <TaskHoverBody data={event} />
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
