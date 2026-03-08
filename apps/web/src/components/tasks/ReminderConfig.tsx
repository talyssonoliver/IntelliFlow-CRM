'use client';

export interface ReminderConfigProps {
  readonly overdueCount: number;
  readonly dueTodayCount: number;
  readonly onFilter: (filter: 'overdue' | 'today') => void;
}

function formatTaskCount(count: number): string {
  return `${count} task${count === 1 ? '' : 's'}`;
}

export function ReminderConfig({ overdueCount, dueTodayCount, onFilter }: Readonly<ReminderConfigProps>) {
  if (overdueCount === 0 && dueTodayCount === 0) return null;

  const hasOverdue = overdueCount > 0;
  const hasDueToday = dueTodayCount > 0;

  return (
    <div
      className="space-y-3"
      role={hasOverdue ? 'alert' : 'status'} // NOSONAR typescript:S6819 — alert for overdue tasks, status region for due-today reminders
      aria-live={hasOverdue ? 'assertive' : 'polite'}
      aria-label="Task reminders"
    >
      {hasOverdue && (
        <div className="flex flex-col gap-4 rounded-lg border border-red-200 bg-red-50 p-4 md:flex-row md:items-center dark:border-red-900/60 dark:bg-red-950/20">
          <span
            className="material-symbols-outlined text-2xl text-red-600 dark:text-red-400"
            aria-hidden="true"
          >
            timer_off
          </span>
          <div className="flex-1">
            <p className="font-bold text-red-600 dark:text-red-400">Tasks Overdue</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {formatTaskCount(overdueCount)} past due. Immediate follow-up recommended.
              {hasDueToday && ` ${formatTaskCount(dueTodayCount)} due today.`}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 md:justify-end">
            <div className="font-mono text-xl font-bold text-red-600 dark:text-red-400">
              {overdueCount} overdue
            </div>
            <button
              type="button"
              onClick={() => onFilter('overdue')}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-700"
            >
              Review
            </button>
          </div>
        </div>
      )}
      {!hasOverdue && hasDueToday && (
        <div className="flex flex-col gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4 md:flex-row md:items-center dark:border-amber-900/60 dark:bg-amber-950/20">
          <span
            className="material-symbols-outlined text-2xl text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          >
            today
          </span>
          <div className="flex-1">
            <p className="font-bold text-amber-700 dark:text-amber-400">Due Today</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {formatTaskCount(dueTodayCount)} due today. Keep them moving before they become
              overdue.
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 md:justify-end">
            <div className="font-mono text-xl font-bold text-amber-700 dark:text-amber-400">
              {dueTodayCount} today
            </div>
            <button
              type="button"
              onClick={() => onFilter('today')}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-600"
            >
              Review
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
