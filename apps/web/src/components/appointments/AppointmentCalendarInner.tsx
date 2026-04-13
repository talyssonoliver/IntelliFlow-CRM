'use client';

import 'temporal-polyfill/global';
import '@schedule-x/theme-default/dist/index.css';

import { useMemo, useEffect, useState, useRef } from 'react';
import { useNextCalendarApp, ScheduleXCalendar } from '@schedule-x/react';
import { createViewDay, createViewWeek, createViewMonthGrid } from '@schedule-x/calendar';
import { createEventsServicePlugin } from '@schedule-x/events-service';
import { createCalendarControlsPlugin } from '@schedule-x/calendar-controls';
import {
  getTypeConfig,
  getStatusConfig,
  formatTimeRange,
  formatDuration,
} from '@/lib/appointments/appointment-utils';
import type { CalendarAppointment, CalendarTask } from './types';
import { CalendarEventHoverCard, type CalendarEventHoverCardData } from './CalendarEventHoverCard';

export interface AppointmentCalendarInnerProps {
  appointments: CalendarAppointment[];
  tasks?: CalendarTask[];
  view: 'month' | 'week' | 'day';
  currentDate: Date;
  onAppointmentClick: (id: string) => void;
  onTaskClick?: (id: string) => void;
  onCreateWithSlot: (startTime: Date, endTime: Date) => void;
  onCreateWithDate?: (date: Date) => void;
  onDateChange: (date: Date) => void;
  /** Called when user clicks the "+N more" link in month view */
  onMoreClick?: (date: Date) => void;
}

const PRIORITY_CHIP_COLORS: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  MEDIUM: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  HIGH: 'bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  URGENT: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const VIEW_NAME_MAP = {
  month: 'month-grid',
  week: 'week',
  day: 'day',
} as const;

function toTemporalZonedDateTime(date: Readonly<Date>): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(
    Temporal.Now.timeZoneId()
  );
}

function toTemporalPlainDate(date: Readonly<Date>): Temporal.PlainDate {
  return Temporal.PlainDate.from({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function mapAppointmentsToEvents(appointments: CalendarAppointment[]) {
  return appointments.map((appt) => ({
    id: appt.id,
    title: appt.title,
    start: toTemporalZonedDateTime(new Date(appt.startTime)),
    end: toTemporalZonedDateTime(new Date(appt.endTime)),
    _custom: {
      _type: 'appointment' as const,
      appointmentType: appt.appointmentType,
      status: appt.status,
      hasConflict: appt.hasConflict,
      startTime: appt.startTime,
      endTime: appt.endTime,
      location: appt.location,
      attendeeCount: appt.attendeeCount,
      linkedCaseCount: appt.linkedCaseCount,
      isRecurring: appt.isRecurring,
    },
  }));
}

/**
 * Default time slot for tasks that only have a due date (no time component).
 * Placing tasks at 09:00 with a 30-minute block renders them inside the
 * calendar time grid instead of the all-day header row.
 */
const TASK_DEFAULT_HOUR = 9;
const TASK_DEFAULT_MINUTE = 0;
const TASK_DEFAULT_DURATION_MIN = 30;

function toTaskZonedRange(date: Readonly<Date>): {
  start: Temporal.ZonedDateTime;
  end: Temporal.ZonedDateTime;
} {
  const tz = Temporal.Now.timeZoneId();
  const plainDate = toTemporalPlainDate(date);
  // If the stored dueDate already carries a non-midnight time, honour it.
  const hasExplicitTime =
    date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0 || date.getUTCSeconds() !== 0;
  const startHour = hasExplicitTime ? date.getHours() : TASK_DEFAULT_HOUR;
  const startMinute = hasExplicitTime ? date.getMinutes() : TASK_DEFAULT_MINUTE;
  const start = plainDate
    .toPlainDateTime({ hour: startHour, minute: startMinute })
    .toZonedDateTime(tz);
  const end = start.add({ minutes: TASK_DEFAULT_DURATION_MIN });
  return { start, end };
}

function mapTasksToEvents(tasks: CalendarTask[]) {
  return tasks.map((task) => {
    const d = typeof task.dueDate === 'string' ? new Date(task.dueDate) : task.dueDate;
    const { start, end } = toTaskZonedRange(d);
    return {
      id: `task--${task.id}`,
      title: task.title,
      start,
      end,
      _custom: {
        _type: 'task' as const,
        priority: task.priority,
        dueDate: d,
      },
    };
  });
}

/**
 * Convert a Schedule-X calendar event into the shape the hover card expects.
 * Returns null when the event lacks the custom payload (shouldn't happen in
 * practice but keeps rendering safe).
 */
function toHoverCardData(
  calendarEvent: Record<string, unknown>
): CalendarEventHoverCardData | null {
  const title = (calendarEvent.title as string) ?? '';
  const id = String(calendarEvent.id ?? '');
  const custom = calendarEvent._custom as
    | {
        _type?: 'appointment' | 'task';
        appointmentType?: string;
        status?: string;
        hasConflict?: boolean;
        startTime?: Date;
        endTime?: Date;
        location?: string;
        attendeeCount?: number;
        linkedCaseCount?: number;
        isRecurring?: boolean;
        priority?: string;
        dueDate?: Date;
      }
    | undefined;

  if (!custom) return null;

  if (custom._type === 'task') {
    return {
      kind: 'task',
      id: id.startsWith('task--') ? id.slice(6) : id,
      title,
      dueDate: custom.dueDate ?? new Date(),
      priority: custom.priority ?? 'MEDIUM',
    };
  }

  if (!custom.startTime || !custom.endTime) return null;
  return {
    kind: 'appointment',
    id,
    title,
    startTime: custom.startTime,
    endTime: custom.endTime,
    appointmentType: custom.appointmentType ?? 'OTHER',
    status: custom.status ?? 'SCHEDULED',
    location: custom.location,
    attendeeCount: custom.attendeeCount,
    linkedCaseCount: custom.linkedCaseCount,
    hasConflict: custom.hasConflict,
    isRecurring: custom.isRecurring,
  };
}

/**
 * Wraps the visual event in a hover card. Kept as its own tiny component so
 * each event renderer can add the tooltip without duplicating the guard logic.
 */
function EventHoverWrap({
  calendarEvent,
  side,
  children,
}: Readonly<{
  calendarEvent: Record<string, unknown>;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
}>) {
  const data = toHoverCardData(calendarEvent);
  if (!data) return <>{children}</>;
  return (
    <CalendarEventHoverCard event={data} side={side}>
      {children}
    </CalendarEventHoverCard>
  );
}

function TimeGridEvent({ calendarEvent }: Readonly<{ calendarEvent: Record<string, unknown> }>) {
  const custom = calendarEvent._custom as
    | {
        _type?: 'appointment' | 'task';
        appointmentType?: string;
        status?: string;
        hasConflict?: boolean;
        startTime?: Date;
        endTime?: Date;
        priority?: string;
        dueDate?: Date;
      }
    | undefined;

  // Tasks rendered inside the time grid — use priority chip style to visually
  // distinguish from appointments and avoid the all-day header stacking.
  if (custom?._type === 'task') {
    const priority = custom.priority ?? 'MEDIUM';
    const chipColor = PRIORITY_CHIP_COLORS[priority] ?? PRIORITY_CHIP_COLORS.MEDIUM;
    return (
      <EventHoverWrap calendarEvent={calendarEvent} side="right">
        <div
          className={`w-full h-full p-1.5 rounded text-left overflow-hidden cursor-pointer ${chipColor}`}
          data-testid="calendar-task-chip"
        >
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px] shrink-0" aria-hidden="true">
              task_alt
            </span>
            <span className="text-xs font-medium truncate">{calendarEvent.title as string}</span>
          </div>
          <div className="text-[10px] opacity-75 mt-0.5 truncate">
            {priority.toLowerCase()} priority
          </div>
        </div>
      </EventHoverWrap>
    );
  }

  const typeConfig = getTypeConfig(custom?.appointmentType ?? 'OTHER');
  const statusConfig = getStatusConfig(custom?.status ?? 'SCHEDULED');

  return (
    <EventHoverWrap calendarEvent={calendarEvent} side="right">
      <div
        className={`w-full h-full p-1.5 rounded text-left overflow-hidden border border-slate-200 dark:border-slate-600 cursor-pointer ${typeConfig.bgColor} ${
          custom?.hasConflict ? 'ring-2 ring-destructive' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-1">
          <span className={`text-xs font-medium truncate ${typeConfig.color}`}>
            {calendarEvent.title as string}
          </span>
          <span
            className={`text-[10px] px-1 py-0.5 rounded whitespace-nowrap ${statusConfig.bgColor} ${statusConfig.color}`}
          >
            {statusConfig.label}
          </span>
        </div>
        {custom?.startTime && custom?.endTime && (
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {formatTimeRange(custom.startTime, custom.endTime)} ·{' '}
            {formatDuration(custom.startTime, custom.endTime)}
          </div>
        )}
        {custom?.hasConflict && (
          <div className="flex items-center gap-0.5 text-[10px] text-destructive mt-0.5">
            <span className="material-symbols-outlined text-[10px]" aria-hidden="true">
              warning
            </span>
            <span>Conflict</span>
          </div>
        )}
      </div>
    </EventHoverWrap>
  );
}

function MonthGridEvent({ calendarEvent }: Readonly<{ calendarEvent: Record<string, unknown> }>) {
  const custom = calendarEvent._custom as { _type?: string; [key: string]: unknown } | undefined;

  if (custom?._type === 'task') {
    const priority = (custom.priority as string) ?? 'MEDIUM';
    const chipColor = PRIORITY_CHIP_COLORS[priority] ?? PRIORITY_CHIP_COLORS.MEDIUM;
    return (
      <EventHoverWrap calendarEvent={calendarEvent} side="right">
        <div
          className={`w-full text-left rounded px-1 py-0.5 text-[10px] truncate cursor-pointer ${chipColor}`}
          data-testid="calendar-task-chip"
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 align-middle"
            aria-hidden="true"
          />
          {calendarEvent.title as string}
        </div>
      </EventHoverWrap>
    );
  }

  const typeConfig = getTypeConfig((custom?.appointmentType as string) ?? 'OTHER');
  const hasConflict = custom?.hasConflict as boolean | undefined;

  return (
    <EventHoverWrap calendarEvent={calendarEvent} side="right">
      <div
        className={`w-full text-left text-xs px-1.5 py-0.5 rounded truncate cursor-pointer ${typeConfig.bgColor} ${typeConfig.color} ${
          hasConflict ? 'ring-2 ring-destructive' : ''
        }`}
      >
        {hasConflict && (
          <span
            className="material-symbols-outlined text-xs text-destructive mr-0.5"
            aria-hidden="true"
          >
            warning
          </span>
        )}
        {calendarEvent.title as string}
      </div>
    </EventHoverWrap>
  );
}

function DateGridEvent({ calendarEvent }: Readonly<{ calendarEvent: Record<string, unknown> }>) {
  const custom = calendarEvent._custom as { _type?: string; [key: string]: unknown } | undefined;

  if (custom?._type === 'task') {
    const priority = (custom.priority as string) ?? 'MEDIUM';
    const chipColor = PRIORITY_CHIP_COLORS[priority] ?? PRIORITY_CHIP_COLORS.MEDIUM;
    return (
      <EventHoverWrap calendarEvent={calendarEvent} side="bottom">
        <div
          className={`w-full text-left rounded px-1 py-0.5 text-[10px] truncate cursor-pointer ${chipColor}`}
          data-testid="calendar-task-chip"
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 align-middle"
            aria-hidden="true"
          />
          {calendarEvent.title as string}
        </div>
      </EventHoverWrap>
    );
  }

  // Appointment all-day events — use type-based colors
  const typeConfig = getTypeConfig((custom?.appointmentType as string) ?? 'OTHER');
  return (
    <EventHoverWrap calendarEvent={calendarEvent} side="bottom">
      <div
        className={`w-full text-left text-xs px-1.5 py-0.5 rounded truncate cursor-pointer ${typeConfig.bgColor} ${typeConfig.color}`}
      >
        {calendarEvent.title as string}
      </div>
    </EventHoverWrap>
  );
}

/** Fixed grid height (px) for week/day time grid — keeps container stable across views */
const WEEK_GRID_HEIGHT = 660;

export function AppointmentCalendarInner({
  appointments,
  tasks = [],
  view,
  currentDate,
  onAppointmentClick,
  onTaskClick,
  onCreateWithSlot,
  onCreateWithDate,
  onDateChange,
  onMoreClick,
}: Readonly<AppointmentCalendarInnerProps>) {
  const [eventsService] = useState(() => createEventsServicePlugin());
  const [calendarControls] = useState(() => createCalendarControlsPlugin());

  // Store callbacks in refs to avoid re-creating the calendar on every render
  const onAppointmentClickRef = useRef(onAppointmentClick);
  const onTaskClickRef = useRef(onTaskClick);
  const onCreateWithSlotRef = useRef(onCreateWithSlot);
  const onCreateWithDateRef = useRef(onCreateWithDate);
  const onDateChangeRef = useRef(onDateChange);
  const onMoreClickRef = useRef(onMoreClick);
  /** Guards against feedback loop: programmatic setDate → onSelectedDateUpdate → setCurrentDate → repeat */
  const isSyncingDateRef = useRef(false);

  useEffect(() => {
    onAppointmentClickRef.current = onAppointmentClick;
    onTaskClickRef.current = onTaskClick;
    onCreateWithSlotRef.current = onCreateWithSlot;
    onCreateWithDateRef.current = onCreateWithDate;
    onDateChangeRef.current = onDateChange;
    onMoreClickRef.current = onMoreClick;
  }, [
    onAppointmentClick,
    onTaskClick,
    onCreateWithSlot,
    onCreateWithDate,
    onDateChange,
    onMoreClick,
  ]);

  const calendar = useNextCalendarApp({
    views: [createViewDay(), createViewWeek(), createViewMonthGrid()],
    defaultView: VIEW_NAME_MAP[view],
    selectedDate: toTemporalPlainDate(currentDate),
    events: [...mapAppointmentsToEvents(appointments), ...mapTasksToEvents(tasks)],
    plugins: [eventsService, calendarControls],
    dayBoundaries: { start: '07:00', end: '19:00' },
    weekOptions: {
      gridHeight: WEEK_GRID_HEIGHT,
      nDays: 7,
      eventWidth: 95,
      timeAxisFormatOptions: { hour: 'numeric' },
      eventOverlap: true,
      gridStep: 60,
    },
    callbacks: {
      onEventClick(event) {
        const eventId = String(event.id);
        if (eventId.startsWith('task--')) {
          onTaskClickRef.current?.(eventId.slice(6));
        } else {
          onAppointmentClickRef.current(eventId);
        }
      },
      onClickDateTime(dateTime) {
        const epochMs = dateTime.epochMilliseconds;
        const start = new Date(epochMs);
        const end = new Date(epochMs + 3600000); // +1 hour
        onCreateWithSlotRef.current(start, end);
      },
      onClickDate(date) {
        const jsDate = new Date(date.year, date.month - 1, date.day);
        onCreateWithDateRef.current?.(jsDate);
      },
      onSelectedDateUpdate(date) {
        if (isSyncingDateRef.current) return;
        const jsDate = new Date(date.year, date.month - 1, date.day);
        onDateChangeRef.current(jsDate);
      },
      onClickPlusEvents(date) {
        const jsDate = new Date(date.year, date.month - 1, date.day);
        onMoreClickRef.current?.(jsDate);
      },
    },
  });

  // Sync view from shell → Schedule-X when view prop changes
  const prevViewRef = useRef(view);
  useEffect(() => {
    if (!calendar) return;
    if (prevViewRef.current !== view) {
      calendarControls.setView(VIEW_NAME_MAP[view]);
      prevViewRef.current = view;
    }
  }, [view, calendar, calendarControls]);

  // Sync the selected date from shell → Schedule-X when currentDate prop changes
  const prevDateRef = useRef(currentDate);
  useEffect(() => {
    if (!calendar) return;
    const prev = prevDateRef.current;
    if (
      prev.getUTCFullYear() !== currentDate.getUTCFullYear() ||
      prev.getUTCMonth() !== currentDate.getUTCMonth() ||
      prev.getUTCDate() !== currentDate.getUTCDate()
    ) {
      isSyncingDateRef.current = true;
      calendarControls.setDate(toTemporalPlainDate(currentDate));
      isSyncingDateRef.current = false;
      prevDateRef.current = currentDate;
    }
  }, [currentDate, calendar, calendarControls]);

  // Sync events when appointments or tasks change
  const eventsJson = useMemo(
    () =>
      JSON.stringify(
        appointments.map((a) => a.id + a.title + String(a.startTime) + String(a.endTime) + a.status)
      ) + JSON.stringify(tasks.map((t) => t.id + t.title + String(t.dueDate) + t.priority)),
    [appointments, tasks]
  );

  useEffect(() => {
    eventsService.set([...mapAppointmentsToEvents(appointments), ...mapTasksToEvents(tasks)]);
  }, [eventsJson, eventsService, appointments, tasks]);

  const customComponents = useMemo(
    () => ({
      timeGridEvent: TimeGridEvent,
      monthGridEvent: MonthGridEvent,
      dateGridEvent: DateGridEvent,
    }),
    []
  );

  return <ScheduleXCalendar calendarApp={calendar} customComponents={customComponents} />;
}
