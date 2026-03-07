'use client';

import { useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { CalendarAppointment, CalendarTask } from './types';

const AppointmentCalendarInner = dynamic(
  () => import('./AppointmentCalendarInner').then((m) => ({ default: m.AppointmentCalendarInner })),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse space-y-2">
        <div className="h-64 bg-slate-100 dark:bg-slate-800/50 rounded" />
      </div>
    ),
  }
);

export interface AppointmentCalendarProps {
  appointments: CalendarAppointment[];
  tasks?: CalendarTask[];
  view: 'month' | 'week' | 'day';
  currentDate: Date;
  onViewChange: (view: 'month' | 'week' | 'day') => void;
  onDateChange: (date: Readonly<Date>) => void;
  onAppointmentClick: (id: string) => void;
  onTaskClick?: (id: string) => void;
  onCreateWithSlot: (startTime: Date, endTime: Date) => void;
  onCreateWithDate?: (date: Readonly<Date>) => void;
  isLoading?: boolean;
}

export function AppointmentCalendar({
  appointments,
  tasks,
  view,
  currentDate,
  onViewChange,
  onDateChange,
  onAppointmentClick,
  onTaskClick,
  onCreateWithSlot,
  onCreateWithDate,
  isLoading,
}: Readonly<AppointmentCalendarProps>) {
  const navigatePrev = useCallback(() => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() - 1);
    else if (view === 'week') d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    onDateChange(d);
  }, [currentDate, view, onDateChange]);

  const navigateNext = useCallback(() => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() + 1);
    else if (view === 'week') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    onDateChange(d);
  }, [currentDate, view, onDateChange]);

  const goToday = useCallback(() => {
    onDateChange(new Date());
  }, [onDateChange]);

  const headerText =
    view === 'day'
      ? currentDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  if (isLoading) {
    return (
      <div data-testid="calendar-skeleton">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded w-64" />
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, i) => (
              <div key={i} className="h-24 bg-slate-100 dark:bg-slate-800/50 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="appointment-calendar">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 px-4 py-3 bg-white dark:bg-slate-800 rounded-t-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={navigatePrev}
            className="p-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            aria-label="Previous"
          >
            <span
              className="material-symbols-outlined text-xl text-slate-600 dark:text-slate-300"
              aria-hidden="true"
            >
              chevron_left
            </span>
          </button>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white min-w-0 sm:min-w-50 text-center truncate">
            {headerText}
          </h2>
          <button
            type="button"
            onClick={navigateNext}
            className="p-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            aria-label="Next"
          >
            <span
              className="material-symbols-outlined text-xl text-slate-600 dark:text-slate-300"
              aria-hidden="true"
            >
              chevron_right
            </span>
          </button>
          <button
            type="button"
            onClick={goToday}
            className="px-3 py-1 text-sm rounded-md border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Today
          </button>
        </div>

        {/* View Switcher — week/day hidden on mobile */}
        <fieldset
          className="flex rounded-md border border-slate-200 dark:border-slate-600 overflow-hidden m-0 p-0 self-start sm:self-auto"
          aria-label="Calendar view"
        >
          <legend className="sr-only">Calendar view</legend>
          {(['month', 'week', 'day'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange(v)}
              className={`px-3 py-1.5 text-sm capitalize transition-colors ${
                v === 'month' ? '' : 'hidden sm:block'
              } ${
                view === v
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
              aria-pressed={view === v}
            >
              {v}
            </button>
          ))}
        </fieldset>
      </div>

      {/* Schedule-X Calendar — fixed-height container prevents layout shift on view toggle */}
      <div
        data-testid={`${view}-view`}
        className="sx-calendar-container bg-white dark:bg-slate-800 border border-t-0 border-slate-200 dark:border-slate-700 rounded-b-xl overflow-hidden"
      >
        <AppointmentCalendarInner
          appointments={appointments}
          tasks={tasks}
          view={view}
          currentDate={currentDate}
          onAppointmentClick={onAppointmentClick}
          onTaskClick={onTaskClick}
          onCreateWithSlot={onCreateWithSlot}
          onCreateWithDate={onCreateWithDate}
          onDateChange={onDateChange}
        />
      </div>

      {appointments.length === 0 && (!tasks || tasks.length === 0) && !isLoading && (
        <div
          className="text-center py-12 text-slate-500 dark:text-slate-400"
          data-testid="calendar-empty"
        >
          <span className="material-symbols-outlined text-4xl mb-2" aria-hidden="true">
            calendar_month
          </span>
          <p className="text-sm">No events this period</p>
        </div>
      )}
    </div>
  );
}
