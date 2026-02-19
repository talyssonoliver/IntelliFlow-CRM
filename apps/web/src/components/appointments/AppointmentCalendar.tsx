'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  getTypeConfig,
  getStatusConfig,
  formatTimeRange,
  formatDuration,
} from '@/lib/appointments/appointment-utils';
import type { CalendarAppointment } from './types';

export interface AppointmentCalendarProps {
  appointments: CalendarAppointment[];
  view: 'month' | 'week' | 'day';
  currentDate: Date;
  onViewChange: (view: 'month' | 'week' | 'day') => void;
  onDateChange: (date: Date) => void;
  onAppointmentClick: (id: string) => void;
  onCreateWithSlot: (startTime: Date, endTime: Date) => void;
  isLoading?: boolean;
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8 AM - 5 PM

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonthDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const days: Date[] = [];
  for (let i = -startDay; i < 42 - startDay; i++) {
    days.push(new Date(year, month, 1 + i));
  }
  return days;
}

function getWeekDays(date: Date): Date[] {
  const day = date.getDay();
  const start = new Date(date);
  start.setDate(start.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const MAX_CHIPS = 3;

export function AppointmentCalendar({
  appointments,
  view,
  currentDate,
  onViewChange,
  onDateChange,
  onAppointmentClick,
  onCreateWithSlot,
  isLoading,
}: AppointmentCalendarProps) {
  const [focusedCell, setFocusedCell] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>();
    for (const appt of appointments) {
      const key = toDateKey(new Date(appt.startTime));
      const existing = map.get(key) || [];
      existing.push(appt);
      map.set(key, existing);
    }
    return map;
  }, [appointments]);

  const today = new Date();
  const todayKey = toDateKey(today);

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

  const handleCellClick = useCallback(
    (date: Date) => {
      const start = new Date(date);
      start.setHours(9, 0, 0, 0);
      const end = new Date(date);
      end.setHours(10, 0, 0, 0);
      onCreateWithSlot(start, end);
    },
    [onCreateWithSlot]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, date: Date, _dayIndex: number) => {
      let newDate: Date | null = null;
      switch (e.key) {
        case 'ArrowLeft':
          newDate = new Date(date);
          newDate.setDate(newDate.getDate() - 1);
          break;
        case 'ArrowRight':
          newDate = new Date(date);
          newDate.setDate(newDate.getDate() + 1);
          break;
        case 'ArrowUp':
          newDate = new Date(date);
          newDate.setDate(newDate.getDate() - 7);
          break;
        case 'ArrowDown':
          newDate = new Date(date);
          newDate.setDate(newDate.getDate() + 7);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          handleCellClick(date);
          return;
        default:
          return;
      }
      if (newDate) {
        e.preventDefault();
        setFocusedCell(toDateKey(newDate));
      }
    },
    [handleCellClick]
  );

  // Focus management
  useEffect(() => {
    if (focusedCell && gridRef.current) {
      const cell = gridRef.current.querySelector(`[data-date="${focusedCell}"]`) as HTMLElement;
      cell?.focus();
    }
  }, [focusedCell]);

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
      <div className="hidden md:block" data-testid="calendar-skeleton">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-200 rounded w-64" />
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hidden md:block" data-testid="appointment-calendar">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={navigatePrev}
            className="p-1.5 rounded-md hover:bg-gray-100"
            aria-label="Previous"
          >
            <span className="material-symbols-outlined text-xl">chevron_left</span>
          </button>
          <h2 className="text-lg font-semibold text-gray-900 min-w-[200px] text-center">
            {headerText}
          </h2>
          <button
            type="button"
            onClick={navigateNext}
            className="p-1.5 rounded-md hover:bg-gray-100"
            aria-label="Next"
          >
            <span className="material-symbols-outlined text-xl">chevron_right</span>
          </button>
          <button
            type="button"
            onClick={goToday}
            className="px-3 py-1 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
          >
            Today
          </button>
        </div>

        {/* View Switcher */}
        <div
          className="flex rounded-md border border-gray-300 overflow-hidden"
          role="group"
          aria-label="Calendar view"
        >
          {(['month', 'week', 'day'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange(v)}
              className={`px-3 py-1.5 text-sm capitalize ${
                view === v
                  ? 'bg-blue-100 text-blue-800 font-medium'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
              aria-pressed={view === v}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      {view === 'month' && (
        <div data-testid="month-view">
          <MonthView
            ref={gridRef}
            currentDate={currentDate}
            todayKey={todayKey}
            appointmentsByDate={appointmentsByDate}
            focusedCell={focusedCell}
            onCellClick={handleCellClick}
            onAppointmentClick={onAppointmentClick}
            onKeyDown={handleKeyDown}
          />
        </div>
      )}

      {view === 'week' && (
        <div data-testid="week-view">
          <WeekView
            currentDate={currentDate}
            todayKey={todayKey}
            appointments={appointments}
            onAppointmentClick={onAppointmentClick}
            onCellClick={handleCellClick}
          />
        </div>
      )}

      {view === 'day' && (
        <div data-testid="day-view">
          <DayView
            currentDate={currentDate}
            appointments={appointments}
            onAppointmentClick={onAppointmentClick}
            onCellClick={handleCellClick}
          />
        </div>
      )}

      {appointments.length === 0 && !isLoading && (
        <div className="text-center py-12 text-gray-500" data-testid="calendar-empty">
          <span className="material-symbols-outlined text-4xl mb-2">calendar_month</span>
          <p className="text-sm">No appointments found</p>
        </div>
      )}
    </div>
  );
}

// --- Month View ---

import { forwardRef } from 'react';

interface MonthViewProps {
  currentDate: Date;
  todayKey: string;
  appointmentsByDate: Map<string, CalendarAppointment[]>;
  focusedCell: string | null;
  onCellClick: (date: Date) => void;
  onAppointmentClick: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent, date: Date, dayIndex: number) => void;
}

const MonthView = forwardRef<HTMLDivElement, MonthViewProps>(function MonthView(
  {
    currentDate,
    todayKey,
    appointmentsByDate,
    focusedCell,
    onCellClick,
    onAppointmentClick,
    onKeyDown,
  },
  ref
) {
  const days = getMonthDays(currentDate.getFullYear(), currentDate.getMonth());

  return (
    <div ref={ref} role="grid" aria-label="Appointment calendar">
      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-t-lg overflow-hidden">
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            role="columnheader"
            className="bg-gray-50 px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-b-lg overflow-hidden">
        {days.map((date, i) => {
          const key = toDateKey(date);
          const dayAppts = appointmentsByDate.get(key) || [];
          const isCurrentMonth = date.getMonth() === currentDate.getMonth();
          const isToday = key === todayKey;
          const overflow = dayAppts.length - MAX_CHIPS;

          return (
            <div
              key={key}
              role="gridcell"
              data-date={key}
              tabIndex={focusedCell === key ? 0 : -1}
              aria-label={`${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, ${dayAppts.length} appointment${dayAppts.length !== 1 ? 's' : ''}`}
              className={`bg-white min-h-[100px] p-1 cursor-pointer hover:bg-gray-50 transition-colors ${
                !isCurrentMonth ? 'opacity-40' : ''
              } ${isToday ? 'ring-1 ring-primary ring-inset' : ''}`}
              onClick={() => onCellClick(date)}
              onKeyDown={(e) => onKeyDown(e, date, i)}
            >
              <span
                className={`text-xs font-medium ${isToday ? 'text-blue-600' : 'text-gray-700'}`}
              >
                {date.getDate()}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayAppts.slice(0, MAX_CHIPS).map((appt) => {
                  const typeConfig = getTypeConfig(appt.appointmentType);
                  return (
                    <button
                      key={appt.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAppointmentClick(appt.id);
                      }}
                      className={`w-full text-left text-xs px-1.5 py-0.5 rounded truncate ${typeConfig.bgColor} ${typeConfig.color} ${
                        appt.hasConflict ? 'ring-2 ring-red-400' : ''
                      }`}
                      title={appt.title}
                    >
                      {appt.hasConflict && (
                        <span className="material-symbols-outlined text-xs text-red-600 mr-0.5">
                          warning
                        </span>
                      )}
                      {appt.title}
                    </button>
                  );
                })}
                {overflow > 0 && (
                  <span className="text-xs text-gray-500 pl-1">+{overflow} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// --- Week View ---

interface WeekViewProps {
  currentDate: Date;
  todayKey: string;
  appointments: CalendarAppointment[];
  onAppointmentClick: (id: string) => void;
  onCellClick: (date: Date) => void;
}

function WeekView({
  currentDate,
  todayKey,
  appointments,
  onAppointmentClick,
  onCellClick,
}: WeekViewProps) {
  const weekDays = getWeekDays(currentDate);

  return (
    <div
      className="border border-gray-200 rounded-lg overflow-hidden"
      role="grid"
      aria-label="Week view"
    >
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] bg-gray-50 border-b">
        <div className="p-2" />
        {weekDays.map((d) => {
          const key = toDateKey(d);
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              role="columnheader"
              className={`p-2 text-center text-xs font-medium ${isToday ? 'text-blue-600 bg-blue-50' : 'text-gray-500'}`}
            >
              <div>{DAY_HEADERS[d.getDay()]}</div>
              <div className="text-lg font-semibold">{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* Hour rows */}
      {HOURS.map((hour) => (
        <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-gray-100">
          <div className="p-1 text-xs text-gray-400 text-right pr-2 pt-1">
            {hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`}
          </div>
          {weekDays.map((d) => {
            const key = toDateKey(d);
            const hourAppts = appointments.filter((a) => {
              const s = new Date(a.startTime);
              return isSameDay(s, d) && s.getHours() === hour;
            });
            return (
              <div
                key={`${key}-${hour}`}
                role="gridcell"
                className="border-l border-gray-100 min-h-[48px] p-0.5 cursor-pointer hover:bg-gray-50"
                onClick={() => {
                  const slot = new Date(d);
                  slot.setHours(hour, 0, 0, 0);
                  const end = new Date(slot);
                  end.setHours(hour + 1);
                  onCellClick(slot);
                }}
              >
                {hourAppts.map((appt) => {
                  const typeConfig = getTypeConfig(appt.appointmentType);
                  return (
                    <button
                      key={appt.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAppointmentClick(appt.id);
                      }}
                      className={`w-full text-left text-xs px-1.5 py-1 rounded mb-0.5 truncate ${typeConfig.bgColor} ${typeConfig.color} ${
                        appt.hasConflict ? 'ring-2 ring-red-400' : ''
                      }`}
                    >
                      {appt.hasConflict && (
                        <span className="material-symbols-outlined text-xs text-red-600 mr-0.5">
                          warning
                        </span>
                      )}
                      {appt.title}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// --- Day View ---

interface DayViewProps {
  currentDate: Date;
  appointments: CalendarAppointment[];
  onAppointmentClick: (id: string) => void;
  onCellClick: (date: Date) => void;
}

function DayView({ currentDate, appointments, onAppointmentClick, onCellClick }: DayViewProps) {
  const dayAppts = appointments.filter((a) => isSameDay(new Date(a.startTime), currentDate));

  return (
    <div
      className="border border-gray-200 rounded-lg overflow-hidden"
      role="grid"
      aria-label="Day view"
    >
      {HOURS.map((hour) => {
        const hourAppts = dayAppts.filter((a) => new Date(a.startTime).getHours() === hour);
        return (
          <div key={hour} className="grid grid-cols-[60px_1fr] border-b border-gray-100">
            <div className="p-2 text-xs text-gray-400 text-right pr-3 pt-2">
              {hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`}
            </div>
            <div
              role="gridcell"
              className="min-h-[56px] p-1 border-l border-gray-100 cursor-pointer hover:bg-gray-50"
              onClick={() => {
                const slot = new Date(currentDate);
                slot.setHours(hour, 0, 0, 0);
                const end = new Date(slot);
                end.setHours(hour + 1);
                onCellClick(slot);
              }}
            >
              {hourAppts.map((appt) => {
                const typeConfig = getTypeConfig(appt.appointmentType);
                const statusConfig = getStatusConfig(appt.status);
                return (
                  <button
                    key={appt.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAppointmentClick(appt.id);
                    }}
                    className={`w-full text-left p-2 rounded mb-1 ${typeConfig.bgColor} ${
                      appt.hasConflict ? 'ring-2 ring-red-400' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${typeConfig.color}`}>
                        {appt.title}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${statusConfig.bgColor} ${statusConfig.color}`}
                      >
                        {statusConfig.label}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      {formatTimeRange(appt.startTime, appt.endTime)} ·{' '}
                      {formatDuration(appt.startTime, appt.endTime)}
                    </div>
                    {appt.hasConflict && (
                      <div className="flex items-center gap-1 text-xs text-red-600 mt-1">
                        <span className="material-symbols-outlined text-xs">warning</span>
                        <span>Conflict detected</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
