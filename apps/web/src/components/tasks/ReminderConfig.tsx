'use client';

export interface ReminderConfigProps {
  readonly overdueCount: number;
  readonly dueTodayCount: number;
  readonly onFilter: (filter: 'overdue' | 'today') => void;
}

export function ReminderConfig({ overdueCount, dueTodayCount, onFilter }: ReminderConfigProps) {
  if (overdueCount === 0 && dueTodayCount === 0) return null;

  return (
    <div className="flex items-center gap-3 text-sm" role="status" aria-label="Task reminders">
      {overdueCount > 0 && (
        <button
          type="button"
          onClick={() => onFilter('overdue')}
          className="inline-flex items-center gap-1 text-destructive hover:underline font-medium"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            warning
          </span>
          {overdueCount} overdue
        </button>
      )}
      {overdueCount > 0 && dueTodayCount > 0 && <span className="text-muted-foreground">|</span>}
      {dueTodayCount > 0 && (
        <button
          type="button"
          onClick={() => onFilter('today')}
          className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:underline font-medium"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            today
          </span>
          {dueTodayCount} due today
        </button>
      )}
    </div>
  );
}
