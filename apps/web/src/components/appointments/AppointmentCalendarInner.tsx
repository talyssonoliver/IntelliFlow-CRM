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

function toTemporalZonedDateTime(date: Date): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(
    Temporal.Now.timeZoneId()
  );
}

function toTemporalPlainDate(date: Date): Temporal.PlainDate {
  return Temporal.PlainDate.from({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
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
    },
  }));
}

function mapTasksToEvents(tasks: CalendarTask[]) {
  return tasks.map((task) => {
    const d = typeof task.dueDate === 'string' ? new Date(task.dueDate) : task.dueDate;
    const plainDate = toTemporalPlainDate(d);
    return {
      id: `task--${task.id}`,
      title: task.title,
      start: plainDate,
      end: plainDate,
      _custom: {
        _type: 'task' as const,
        priority: task.priority,
      },
    };
  });
}

function TimeGridEvent({ calendarEvent }: { calendarEvent: Record<string, unknown> }) {
  const custom = calendarEvent._custom as
    | {
        appointmentType: string;
        status: string;
        hasConflict: boolean;
        startTime: Date;
        endTime: Date;
      }
    | undefined;

  const typeConfig = getTypeConfig(custom?.appointmentType ?? 'OTHER');
  const statusConfig = getStatusConfig(custom?.status ?? 'SCHEDULED');

  return (
    <div
      className={`w-full h-full p-1.5 rounded text-left overflow-hidden border border-slate-200 dark:border-slate-600 ${typeConfig.bgColor} ${
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
      {custom && (
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
  );
}

function MonthGridEvent({ calendarEvent }: { calendarEvent: Record<string, unknown> }) {
  const custom = calendarEvent._custom as { _type?: string; [key: string]: unknown } | undefined;

  if (custom?._type === 'task') {
    const priority = (custom.priority as string) ?? 'MEDIUM';
    const chipColor = PRIORITY_CHIP_COLORS[priority] ?? PRIORITY_CHIP_COLORS.MEDIUM;
    return (
      <div
        className={`w-full text-left rounded px-1 py-0.5 text-[10px] truncate ${chipColor}`}
        data-testid="calendar-task-chip"
      >
        <span
          className="material-symbols-outlined text-[10px] mr-0.5 align-middle"
          aria-hidden="true"
        >
          task_alt
        </span>
        {calendarEvent.title as string}
      </div>
    );
  }

  const typeConfig = getTypeConfig((custom?.appointmentType as string) ?? 'OTHER');
  const hasConflict = custom?.hasConflict as boolean | undefined;

  return (
    <div
      className={`w-full text-left text-xs px-1.5 py-0.5 rounded truncate ${typeConfig.bgColor} ${typeConfig.color} ${
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
}: Readonly<AppointmentCalendarInnerProps>) {
  const [eventsService] = useState(() => createEventsServicePlugin());
  const [calendarControls] = useState(() => createCalendarControlsPlugin());

  // Store callbacks in refs to avoid re-creating the calendar on every render
  const onAppointmentClickRef = useRef(onAppointmentClick);
  const onTaskClickRef = useRef(onTaskClick);
  const onCreateWithSlotRef = useRef(onCreateWithSlot);
  const onCreateWithDateRef = useRef(onCreateWithDate);
  const onDateChangeRef = useRef(onDateChange);

  useEffect(() => {
    onAppointmentClickRef.current = onAppointmentClick;
    onTaskClickRef.current = onTaskClick;
    onCreateWithSlotRef.current = onCreateWithSlot;
    onCreateWithDateRef.current = onCreateWithDate;
    onDateChangeRef.current = onDateChange;
  }, [onAppointmentClick, onTaskClick, onCreateWithSlot, onCreateWithDate, onDateChange]);

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
        const jsDate = new Date(date.year, date.month - 1, date.day);
        onDateChangeRef.current(jsDate);
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
      prev.getFullYear() !== currentDate.getFullYear() ||
      prev.getMonth() !== currentDate.getMonth() ||
      prev.getDate() !== currentDate.getDate()
    ) {
      calendarControls.setDate(toTemporalPlainDate(currentDate));
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
    }),
    []
  );

  return <ScheduleXCalendar calendarApp={calendar} customComponents={customComponents} />;
}
