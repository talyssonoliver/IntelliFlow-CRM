'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Skeleton } from '@intelliflow/ui';
import { TaskCreateSheet } from '@/components/tasks/TaskCreateSheet';
import type { WidgetProps } from './index';
import type { TaskStatus } from '@intelliflow/domain';

const priorityColors: Record<string, string> = {
  URGENT: 'text-red-600 dark:text-red-400',
  HIGH: 'text-red-600 dark:text-red-400',
  MEDIUM: 'text-amber-600 dark:text-amber-400',
  LOW: 'text-green-600 dark:text-green-400',
};

function formatDueDate(date: Date | string | null): string {
  if (!date) return 'No due date';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return 'No due date';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Due Today';
  if (diffDays === 1) return 'Due Tomorrow';
  return `Due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function getDueDateColor(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (dueDay < today) return 'text-red-600 dark:text-red-400';
  if (dueDay.getTime() === today.getTime()) return 'text-amber-600 dark:text-amber-400';
  return 'text-slate-500 dark:text-slate-400';
}

export function UpcomingTasksWidget(_props: Readonly<WidgetProps>) {
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = api.task.list.useQuery({
    sortBy: 'dueDate',
    sortOrder: 'asc',
    limit: 3,
    page: 1,
    status: ['PENDING', 'IN_PROGRESS'] as TaskStatus[],
  });

  const utils = api.useUtils();
  const completeMutation = api.task.complete.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      utils.task.getReminders.invalidate();
    },
  });

  const tasks = data?.tasks ?? [];

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Upcoming Tasks</h3>
        <Link href="/tasks" className="text-sm text-ds-primary hover:underline">
          View All
        </Link>
      </div>

      <div className="space-y-3 flex-1">
        {isLoading && (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        )}
        {!isLoading && tasks.length === 0 && (
          <div className="text-center py-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">No upcoming tasks</p>
          </div>
        )}
        {!isLoading &&
          tasks.map((task) => (
            <Link
              key={task.id}
              href={`/tasks/${task.id}`}
              className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <input
                type="checkbox"
                className="mt-1 rounded border-slate-300 dark:border-slate-600 cursor-pointer"
                checked={false}
                title="Mark as complete"
                onChange={() => completeMutation.mutate({ taskId: task.id })}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                aria-label={`Complete task: ${task.title}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {task.title}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`text-xs font-medium ${priorityColors[task.priority] ?? 'text-slate-500'}`}
                  >
                    {task.priority?.charAt(0) + task.priority?.slice(1).toLowerCase()}
                  </span>
                  <span className={`text-xs ${getDueDateColor(task.dueDate)}`}>
                    {formatDueDate(task.dueDate)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
      </div>

      <button
        onClick={() => setCreateOpen(true)}
        className="mt-3 w-full py-2 text-sm text-primary font-medium hover:bg-primary/5 rounded-lg border border-transparent hover:border-primary/20 transition-all"
      >
        + Add New Task
      </button>

      <TaskCreateSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => utils.task.list.invalidate()}
      />
    </div>
  );
}
