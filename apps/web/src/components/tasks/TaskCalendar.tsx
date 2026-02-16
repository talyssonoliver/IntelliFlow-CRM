'use client';

import { useState, useMemo, useCallback } from 'react';
import type { TaskPriority } from '@intelliflow/domain';

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

const PRIORITY_CHIP_COLORS: Record<string, string> = {
  LOW: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  MEDIUM: 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  HIGH: 'bg-orange-200 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  URGENT: 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-300',
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_CHIPS_PER_DAY = 3;

function getMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Mon=0
  const days: Date[] = [];

  // Pad from previous month
  for (let i = startOffset - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // Pad to fill 6 rows (42 cells)
  while (days.length < 42) {
    const nextDate = days.length - startOffset - lastDay.getDate() + 1;
    days.push(new Date(year, month + 1, nextDate));
  }
  return days;
}

function toDateKey(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function TaskCalendar({ tasks, onTaskClick, onCreateWithDate }: TaskCalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const days = useMemo(() => getMonthDays(year, month), [year, month]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    for (const task of tasks) {
      const key = toDateKey(task.dueDate);
      const existing = map.get(key) ?? [];
      existing.push(task);
      map.set(key, existing);
    }
    return map;
  }, [tasks]);

  const goToPreviousMonth = useCallback(() => {
    setCurrentDate(new Date(year, month - 1, 1));
  }, [year, month]);

  const goToNextMonth = useCallback(() => {
    setCurrentDate(new Date(year, month + 1, 1));
  }, [year, month]);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const todayKey = toDateKey(new Date());
  const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div
      role="grid"
      aria-label="Task calendar"
      className="border rounded-lg overflow-hidden bg-background"
    >
      {/* Calendar header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToPreviousMonth}
            className="p-1 rounded hover:bg-accent"
            aria-label="Previous month"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              chevron_left
            </span>
          </button>
          <h2 className="text-sm font-semibold text-foreground min-w-[160px] text-center">
            {monthLabel}
          </h2>
          <button
            type="button"
            onClick={goToNextMonth}
            className="p-1 rounded hover:bg-accent"
            aria-label="Next month"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              chevron_right
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={goToToday}
          className="px-3 py-1 text-xs font-medium rounded border hover:bg-accent"
        >
          Today
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7" role="row">
        {DAY_NAMES.map((day) => (
          <div
            key={day}
            role="columnheader"
            className="px-2 py-2 text-center text-xs font-medium text-muted-foreground border-b"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dateKey = toDateKey(day);
          const dayTasks = tasksByDate.get(dateKey) ?? [];
          const isCurrentMonth = day.getMonth() === month;
          const isToday = dateKey === todayKey;
          const overflow =
            dayTasks.length > MAX_CHIPS_PER_DAY ? dayTasks.length - MAX_CHIPS_PER_DAY : 0;

          return (
            <div
              key={i}
              role="gridcell"
              className={`min-h-[80px] p-1 border-b border-r cursor-pointer hover:bg-accent/30 transition-colors ${
                !isCurrentMonth ? 'bg-muted/20 text-muted-foreground' : ''
              } ${isToday ? 'ring-1 ring-primary ring-inset' : ''}`}
              onClick={() => onCreateWithDate(day)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onCreateWithDate(day);
                }
              }}
              aria-label={`${day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${dayTasks.length > 0 ? `, ${dayTasks.length} tasks` : ''}`}
            >
              <div
                className={`text-xs font-medium mb-1 ${isToday ? 'text-primary font-bold' : ''}`}
              >
                {day.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, MAX_CHIPS_PER_DAY).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTaskClick(task.id);
                    }}
                    className={`block w-full text-left rounded px-1 py-0.5 text-[10px] truncate ${
                      PRIORITY_CHIP_COLORS[task.priority] ?? PRIORITY_CHIP_COLORS.MEDIUM
                    }`}
                    title={task.title}
                    data-testid="calendar-task-chip"
                  >
                    {task.title}
                  </button>
                ))}
                {overflow > 0 && (
                  <span
                    className="text-[10px] text-muted-foreground px-1"
                    data-testid="overflow-indicator"
                  >
                    +{overflow} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
