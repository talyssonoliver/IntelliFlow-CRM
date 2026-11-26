'use client';

import { useCallback } from 'react';
import { EmptyState } from '@intelliflow/ui';
import dynamic from 'next/dynamic';
import type { CalendarAppointment, CalendarTask } from './types';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

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
  onDateChange: (date: Date) => void;
  onAppointmentClick: (id: string) => void;
  onTaskClick?: (id: string) => void;
  onCreateWithSlot: (startTime: Date, endTime: Date) => void;
  onCreateWithDate?: (date: Date) => void;
  /** Called when user clicks the "+N more" link in month view */
  onMoreClick?: (date: Date) => void;
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
  onMoreClick,
  isLoading,
}: Readonly<AppointmentCalendarProps>) {
  const { timezone } = useTimezoneContext();
  const navigatePrev = useCallback(() => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() - 1);
    else if (view === 'week') d.setUTCDate(d.getUTCDate() - 7);
    else d.setUTCDate(d.getUTCDate() - 1);
    onDateChange(d);
  }, [currentDate, view, onDateChange]);

  const navigateNext = useCallback(() => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() + 1);
    else if (view === 'week') d.setUTCDate(d.getUTCDate() + 7);
    else d.setUTCDate(d.getUTCDate() + 1);
    onDateChange(d);
  }, [currentDate, view, onDateChange]);

  const goToday = useCallback(() => {
    onDateChange(new Date());
  }, [onDateChange]);

  const headerText =
    view === 'day'
      ? currentDate.toLocaleDateString('en-GB', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          timeZone: timezone,
        })
      : currentDate.toLocaleDateString('en-GB', {
          month: 'long',
          year: 'numeric',
          timeZone: timezone,
        });

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
      {/* Header. Owner 21/11: on phones this split over two lines. Date navigation and Today stay
          on one line with 44px targets; the view switch shows from sm, where it has three views
          (below sm only Month was offered, and the grid shows a day there). */}
      <div className="flex items-center justify-between gap-2 mb-4 px-2 py-2 sm:px-4 sm:py-3 bg-white dark:bg-slate-800 rounded-t-xl border border-slate-200 dark:border-slate-700">
        <div className="flex min-w-0 items-center gap-1 sm:gap-3">
          <button
            type="button"
            onClick={navigatePrev}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
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
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
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
            className="min-h-11 shrink-0 px-3 text-sm rounded-md border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Today
          </button>
        </div>

        {/* View Switcher — week/day hidden on mobile */}
        <fieldset
          className="hidden sm:flex rounded-md border border-slate-200 dark:border-slate-600 overflow-hidden m-0 p-0"
          aria-label="Calendar view"
        >
          <legend className="sr-only">Calendar view</legend>
          {(['month', 'week', 'day'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange(v)}
              className={`min-h-11 px-3 text-sm capitalize transition-colors ${
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

      {/* Schedule-X Calendar — fixed-height container prevents layout shift on view toggle.
          `isolate` (owner 26/11, calendar on a phone): the Schedule-X theme gives its sticky
          week/day header z-index 100 and its popups 101-102, above our menus and dialogs (z-50),
          so the "SAT 26" header drew over the open side menu. Isolating the container keeps
          those layers inside the calendar: still above its own grid, never above the page. */}
      <div
        data-testid={`${view}-view`}
        className="sx-calendar-container isolate bg-white dark:bg-slate-800 border border-t-0 border-slate-200 dark:border-slate-700 rounded-b-xl overflow-hidden"
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
          onMoreClick={onMoreClick}
          onDateChange={onDateChange}
        />
      </div>

      {appointments.length === 0 && (!tasks || tasks.length === 0) && !isLoading && (
        <div data-testid="calendar-empty">
          <EmptyState entity="appointments" ctaHref="/appointments/new" />
        </div>
      )}
    </div>
  );
}
