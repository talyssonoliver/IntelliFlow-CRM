'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { TaskPriority } from '@intelliflow/domain';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

export interface CalendarTask {
  readonly id: string;
  readonly title: string;
  readonly dueDate: Date | string;
  readonly priority: TaskPriority;
}

export interface TaskCalendarProps {
  readonly tasks: readonly CalendarTask[];
  readonly onTaskClick: (id: string) => void;
  readonly onCreateWithDate: (date: Date) => void;
}

const TaskCalendarInner = dynamic(
  () => import('./TaskCalendarInner').then((m) => ({ default: m.TaskCalendarInner })),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse">
        <div className="h-64 bg-slate-100 dark:bg-slate-800/50 rounded" />
      </div>
    ),
  }
);

export function TaskCalendar({
  tasks,
  onTaskClick,
  onCreateWithDate,
}: Readonly<TaskCalendarProps>) {
  const { timezone } = useTimezoneContext();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const goToPreviousMonth = useCallback(() => {
    setCurrentDate(new Date(year, month - 1, 1));
  }, [year, month]);

  const goToNextMonth = useCallback(() => {
    setCurrentDate(new Date(year, month + 1, 1));
  }, [year, month]);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const monthLabel = currentDate.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  });

  return (
    <div
      role="grid"
      aria-label="Task calendar"
      className="rounded-xl overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
    >
      {/* Calendar header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToPreviousMonth}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Previous month"
          >
            <span
              className="material-symbols-outlined text-lg text-slate-600 dark:text-slate-300"
              aria-hidden="true"
            >
              chevron_left
            </span>
          </button>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white min-w-[160px] text-center">
            {monthLabel}
          </h2>
          <button
            type="button"
            onClick={goToNextMonth}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Next month"
          >
            <span
              className="material-symbols-outlined text-lg text-slate-600 dark:text-slate-300"
              aria-hidden="true"
            >
              chevron_right
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={goToToday}
          className="px-3 py-1 text-xs font-medium rounded border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          Today
        </button>
      </div>

      {/* Schedule-X Calendar */}
      <TaskCalendarInner
        tasks={tasks}
        currentDate={currentDate}
        onTaskClick={onTaskClick}
        onCreateWithDate={onCreateWithDate}
      />
    </div>
  );
}
