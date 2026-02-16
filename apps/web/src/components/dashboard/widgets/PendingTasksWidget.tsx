'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Skeleton } from '@intelliflow/ui';
import { TaskCreateSheet } from '@/components/tasks/TaskCreateSheet';
import type { WidgetProps } from './index';

export function PendingTasksWidget(_props: WidgetProps) {
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = api.task.list.useQuery({
    status: ['PENDING'] as any,
    limit: 3,
    page: 1,
  });

  const utils = api.useUtils();
  const completeMutation = api.task.complete.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      utils.task.getReminders.invalidate();
    },
  });

  const tasks = (data as any)?.tasks ?? [];

  return (
    <div className="p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <span className="material-symbols-outlined text-muted-foreground">check_circle</span>
          Pending Tasks
        </h3>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          title="Add new task"
          aria-label="Add new task"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            add
          </span>
        </button>
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto max-h-[240px] pr-2 flex-1">
        {isLoading && (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </>
        )}
        {!isLoading && tasks.length === 0 && (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">No pending tasks</p>
          </div>
        )}
        {!isLoading &&
          tasks.map((task: any) => (
            <Link
              key={task.id}
              href={`/tasks/${task.id}`}
              className="flex items-start gap-3 p-2 hover:bg-muted rounded-lg transition-colors cursor-pointer group/item"
            >
              <input
                type="checkbox"
                className="mt-1 rounded border-border text-primary focus:ring-primary bg-transparent cursor-pointer"
                checked={false}
                title="Mark as complete"
                onChange={() => completeMutation.mutate({ taskId: task.id })}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                aria-label={`Complete task: ${task.title}`}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground group-hover/item:text-primary transition-colors truncate">
                  {task.title}
                </p>
                <p
                  className={`text-xs ${task.dueDate && new Date(task.dueDate) < new Date() ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {task.dueDate
                    ? new Date(task.dueDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'No due date'}
                </p>
              </div>
            </Link>
          ))}
      </div>

      <Link
        href="/tasks?status=PENDING"
        className="text-xs text-primary hover:underline text-center mt-2"
      >
        View all pending tasks
      </Link>

      <TaskCreateSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => utils.task.list.invalidate()}
      />
    </div>
  );
}
