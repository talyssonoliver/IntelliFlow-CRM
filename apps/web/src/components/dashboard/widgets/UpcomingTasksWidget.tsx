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
import { useFollowUpDone, useWaitingDismiss } from './useTodoDone';
import { TodoRow } from './CardListSection';
import type { WidgetProps } from './index';
import type { TaskStatus } from '@intelliflow/domain';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { WidgetHeader } from '../WidgetHeader';

/** "High · Overdue": the task's part of the meta line, after "Task ·". */
function taskDetail(
  priority: string | null | undefined,
  dueDate: Date | string | null,
  timezone: string
): string {
  const level = priority ? priority.charAt(0) + priority.slice(1).toLowerCase() : '';
  const due = formatDueDate(dueDate, timezone);
  return level ? `${level} · ${due}` : due;
}

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
  const followUpDone = useFollowUpDone();
  const waitingDismiss = useWaitingDismiss();

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
        {!isLoading && tasks.length > 0 && (
          <ul className="divide-y divide-border" aria-label="Tasks">
            {tasks.map((task) => (
              <TodoRow
                key={task.id}
                href={`/tasks/${task.id}`}
                title={task.title}
                kind="Task"
                detail={taskDetail(task.priority, task.dueDate, timezone)}
                detailClassName={getDueDateColor(task.dueDate) || 'text-muted-foreground'}
                doneLabel={`Complete task: ${task.title}`}
                onDone={() => completeMutation.mutate({ taskId: task.id })}
                pending={
                  completeMutation.isPending && completeMutation.variables?.taskId === task.id
                }
              />
            ))}
          </ul>
        )}
        {!isLoading && (
          <FollowUpsDueSection
            leads={followUps.leads}
            total={followUps.total}
            dueToday={followUps.dueToday}
            dueTodayIsLowerBound={followUps.dueTodayIsLowerBound}
            onDone={followUpDone.markDone}
            pendingLeadId={followUpDone.pendingLeadId}
          />
        )}
        {!isLoading && (
          <WaitingForReplySection
            people={waiting.people}
            total={waiting.total}
            leadTotal={waiting.leadTotal}
            onDone={(p) => waitingDismiss.markDone(p.kind, p.id)}
            pendingKey={waitingDismiss.pendingKey}
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
