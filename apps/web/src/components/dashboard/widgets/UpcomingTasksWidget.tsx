'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  EmptyState,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@intelliflow/ui';
import { TaskCreateSheet } from '@/components/tasks/TaskCreateSheet';
import { FollowUpsDueSection } from './FollowUpsDueSection';
import { useFollowUpsDue } from './useFollowUpsDue';
import { WaitingForReplySection } from './WaitingForReplySection';
import { useWaitingForReply } from './useWaitingForReply';
import type { WidgetProps } from './index';
import type { TaskStatus } from '@intelliflow/domain';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { WidgetHeader } from '../WidgetHeader';

const priorityColors: Record<string, string> = {
  URGENT: 'text-red-600 dark:text-red-400',
  HIGH: 'text-red-600 dark:text-red-400',
  MEDIUM: 'text-amber-600 dark:text-amber-400',
  LOW: 'text-green-600 dark:text-green-400',
};

function formatDueDate(date: Date | string | null, timezone: string = 'Europe/London'): string {
  if (!date) return 'No due date';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return 'No due date';
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dueDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Due Today';
  if (diffDays === 1) return 'Due Tomorrow';
  return `Due ${d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: timezone })}`;
}

function getDueDateColor(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dueDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (dueDay < today) return 'text-red-600 dark:text-red-400';
  if (dueDay.getTime() === today.getTime()) return 'text-amber-600 dark:text-amber-400';
  return 'text-slate-500 dark:text-slate-400';
}

export function UpcomingTasksWidget(_props: Readonly<WidgetProps>) {
  const { timezone } = useTimezoneContext();
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
    onSuccess: () =>
      Promise.all([utils.task.list.invalidate(), utils.task.getReminders.invalidate()]),
  });

  const tasks = data?.tasks ?? [];
  // Contacted leads due a follow-up (MVP-010): there is no stored follow-up task, so they are
  // derived from the leads themselves and listed after the real tasks.
  const followUps = useFollowUpsDue();
  // Leads and contacts whose last email to us is unanswered (MVP-014).
  const waiting = useWaitingForReply();

  return (
    <div className="p-4 sm:p-6 h-full flex flex-col">
      {/* Owner 21/11: one header with both actions, not a second "+ Add New Task" at the bottom
          next to the "see all" link. */}
      <WidgetHeader
        title="Upcoming Tasks"
        titleClassName="text-lg font-semibold text-slate-900 dark:text-white"
        actions={
          <>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    aria-label="Add task"
                    className="inline-flex size-11 items-center justify-center rounded-md text-ds-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                      add
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add task</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Link href="/tasks" className="px-1 py-2 text-sm text-ds-primary hover:underline">
              View All
            </Link>
          </>
        }
      />

      <div className="space-y-5 flex-1">
        {isLoading && (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        )}
        {!isLoading &&
          tasks.length === 0 &&
          !followUps.isLoading &&
          followUps.leads.length === 0 &&
          !waiting.isLoading &&
          waiting.people.length === 0 && (
            // The card header's (+) is the one create action, so the empty state shows no
            // second button for the same thing.
            <EmptyState entity="tasks" showCta={false} className="py-2" />
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
                    {formatDueDate(task.dueDate, timezone)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        {!isLoading && (
          <FollowUpsDueSection
            leads={followUps.leads}
            total={followUps.total}
            dueToday={followUps.dueToday}
            dueTodayIsLowerBound={followUps.dueTodayIsLowerBound}
          />
        )}
        {!isLoading && (
          <WaitingForReplySection
            people={waiting.people}
            total={waiting.total}
            leadTotal={waiting.leadTotal}
          />
        )}
      </div>

      <TaskCreateSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => utils.task.list.invalidate()}
      />
    </div>
  );
}
