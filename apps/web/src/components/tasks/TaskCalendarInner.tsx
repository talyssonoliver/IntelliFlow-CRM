'use client';

import 'temporal-polyfill/global';
import '@schedule-x/theme-default/dist/index.css';

import { useMemo, useEffect, useState, useRef } from 'react';
import { useNextCalendarApp, ScheduleXCalendar } from '@schedule-x/react';
import { createViewMonthGrid } from '@schedule-x/calendar';
import { createEventsServicePlugin } from '@schedule-x/events-service';
import { createCalendarControlsPlugin } from '@schedule-x/calendar-controls';
import type { CalendarTask } from './TaskCalendar';

const PRIORITY_CHIP_COLORS: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  MEDIUM: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  HIGH: 'bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  URGENT: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export interface TaskCalendarInnerProps {
  tasks: readonly CalendarTask[];
  currentDate: Date;
  onTaskClick: (id: string) => void;
  onCreateWithDate: (date: Date) => void;
}

function toTemporalPlainDate(date: Date): Temporal.PlainDate {
  return Temporal.PlainDate.from({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

function mapTasksToEvents(tasks: readonly CalendarTask[]) {
  return tasks.map((task) => {
    const d = typeof task.dueDate === 'string' ? new Date(task.dueDate) : task.dueDate;
    const plainDate = toTemporalPlainDate(d);
    return {
      id: task.id,
      title: task.title,
      start: plainDate,
      end: plainDate,
      _custom: { priority: task.priority },
    };
  });
}

function MonthGridEvent({ calendarEvent }: { calendarEvent: Record<string, unknown> }) {
  const custom = calendarEvent._custom as { priority: string } | undefined;
  const chipColor =
    PRIORITY_CHIP_COLORS[custom?.priority ?? 'MEDIUM'] ?? PRIORITY_CHIP_COLORS.MEDIUM;

  return (
    <div
      className={`w-full text-left rounded px-1 py-0.5 text-[10px] truncate ${chipColor}`}
      data-testid="calendar-task-chip"
    >
      {calendarEvent.title as string}
    </div>
  );
}

export function TaskCalendarInner({
  tasks,
  currentDate,
  onTaskClick,
  onCreateWithDate,
}: Readonly<TaskCalendarInnerProps>) {
  const [eventsService] = useState(() => createEventsServicePlugin());
  const [calendarControls] = useState(() => createCalendarControlsPlugin());

  const onTaskClickRef = useRef(onTaskClick);
  const onCreateWithDateRef = useRef(onCreateWithDate);

  useEffect(() => {
    onTaskClickRef.current = onTaskClick;
    onCreateWithDateRef.current = onCreateWithDate;
  }, [onTaskClick, onCreateWithDate]);

  const calendar = useNextCalendarApp({
    views: [createViewMonthGrid()],
    defaultView: 'month-grid',
    selectedDate: toTemporalPlainDate(currentDate),
    events: mapTasksToEvents(tasks),
    plugins: [eventsService, calendarControls],
    firstDayOfWeek: 1, // Monday
    callbacks: {
      onEventClick(event) {
        onTaskClickRef.current(String(event.id));
      },
      onClickDateTime(dateTime) {
        const epochMs = dateTime.epochMilliseconds;
        onCreateWithDateRef.current(new Date(epochMs));
      },
      onClickDate(date) {
        const jsDate = new Date(date.year, date.month - 1, date.day);
        onCreateWithDateRef.current(jsDate);
      },
    },
  });

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

  // Sync events when tasks prop changes
  const tasksKey = useMemo(
    () => JSON.stringify(tasks.map((t) => t.id + t.title + String(t.dueDate) + t.priority)),
    [tasks]
  );

  useEffect(() => {
    eventsService.set(mapTasksToEvents(tasks));
  }, [tasksKey, eventsService, tasks]);

  const customComponents = useMemo(() => ({ monthGridEvent: MonthGridEvent }), []);

  return <ScheduleXCalendar calendarApp={calendar} customComponents={customComponents} />;
}
