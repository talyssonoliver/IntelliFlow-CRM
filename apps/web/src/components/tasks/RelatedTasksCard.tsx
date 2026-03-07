'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, Skeleton, toast } from '@intelliflow/ui';
import { api } from '@/lib/api';
import { TaskCreateSheet } from './TaskCreateSheet';

type TaskApiEntityType = 'lead' | 'contact' | 'opportunity';
type TaskEntityType = TaskApiEntityType | 'account';

export interface RelatedTasksCardProps {
  readonly entityType: TaskEntityType;
  readonly entityId: string;
  readonly title?: string;
  readonly maxItems?: number;
  readonly onViewAll?: () => void;
  readonly viewAllHref?: string;
  readonly showAddButton?: boolean;
  readonly compact?: boolean;
}

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'text-gray-500',
  MEDIUM: 'text-yellow-500',
  HIGH: 'text-orange-500',
  URGENT: 'text-red-500',
};

function formatDueDate(date: Date | string | null): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDueDateColor(date: Date | string | null): string {
  if (!date) return 'text-muted-foreground';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (dueDay < today) return 'text-red-600 dark:text-red-400';
  if (dueDay.getTime() === today.getTime()) return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground';
}

export function RelatedTasksCard({
  entityType,
  entityId,
  title = 'Tasks',
  maxItems = 3,
  onViewAll,
  viewAllHref,
  showAddButton = true,
  compact = false,
}: Readonly<RelatedTasksCardProps>) {
  const [createOpen, setCreateOpen] = useState(false);

  // account type not supported by API, skip query
  const queryEntityType = entityType === 'account' ? undefined : entityType;
  const { data, isLoading, error } = api.task.getByEntity.useQuery(
    { entityType: queryEntityType as TaskApiEntityType, entityId },
    { enabled: !!queryEntityType && !!entityId }
  );

  const utils = api.useUtils();
  const completeMutation = api.task.complete.useMutation({
    onSuccess: () => {
      utils.task.getByEntity.invalidate({
        entityType: queryEntityType as 'lead' | 'contact' | 'opportunity',
        entityId,
      });
      utils.task.list.invalidate();
      toast({ title: 'Task completed' });
    },
    onError: (err) => {
      toast({ title: 'Failed to complete task', description: err.message, variant: 'destructive' });
    },
  });

  const tasks = data ?? [];
  const openTasks = tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
  const displayTasks = openTasks.slice(0, maxItems);
  const hasMore = openTasks.length > maxItems;

  function handleComplete(taskId: string) {
    completeMutation.mutate({ taskId });
  }

  // Account type: show empty state since API doesn't support it
  if (entityType === 'account') {
    return (
      <Card className={compact ? 'p-4' : 'p-5'}>
        <div className="flex items-center justify-between mb-4">
          <h3
            className={`font-bold text-slate-900 dark:text-white ${compact ? 'text-sm' : 'text-base'}`}
          >
            {title}
          </h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-2">
          No tasks linked to this account
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card className={compact ? 'p-4' : 'p-5'}>
        <div className="flex items-center justify-between mb-4">
          <h3
            className={`font-bold text-slate-900 dark:text-white ${compact ? 'text-sm' : 'text-base'}`}
          >
            {title}
          </h3>
          <div className="flex items-center gap-2">
            {(onViewAll || viewAllHref) &&
              hasMore &&
              (viewAllHref ? (
                <Link href={viewAllHref} className="text-xs text-primary hover:underline">
                  View All
                </Link>
              ) : (
                <button onClick={onViewAll} className="text-xs text-primary hover:underline">
                  View All
                </button>
              ))}
            {showAddButton && (
              <button
                onClick={() => setCreateOpen(true)}
                className="w-6 h-6 rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"
                aria-label="Add task"
              >
                <span className="material-symbols-outlined !text-[20px]">add</span>
              </button>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: Math.min(maxItems, 3) }).map((_, i) => (
              <Skeleton key={i} className={compact ? 'h-8 w-full' : 'h-10 w-full'} /> // NOSONAR typescript:S6479 — static skeleton placeholder, no data identity
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive text-center py-2">Failed to load tasks</p>}

        {!isLoading && !error && displayTasks.length === 0 && (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-2">No tasks yet</p>
            {showAddButton && (
              <button
                onClick={() => setCreateOpen(true)}
                className="text-sm text-primary hover:underline"
              >
                Add a task
              </button>
            )}
          </div>
        )}

        {!isLoading && !error && displayTasks.length > 0 && (
          <div className={compact ? 'space-y-2' : 'space-y-3'}>
            {displayTasks.map((task) => (
              <label
                key={task.id}
                className={`flex items-start gap-3 group cursor-pointer ${compact ? '' : 'p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => handleComplete(task.id)}
                  className="rounded border-slate-300 text-primary focus:ring-primary mt-0.5 cursor-pointer"
                  aria-label={`Complete task: ${task.title}`}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-medium text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors truncate ${compact ? 'text-xs' : 'text-sm'}`}
                  >
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {task.dueDate && (
                      <span className={`text-xs ${getDueDateColor(task.dueDate)}`}>
                        {formatDueDate(task.dueDate)}
                      </span>
                    )}
                    <span
                      className={`text-xs ${PRIORITY_COLORS[task.priority] ?? 'text-muted-foreground'}`}
                    >
                      {task.priority?.charAt(0) + task.priority?.slice(1).toLowerCase()}
                    </span>
                  </div>
                </div>
              </label>
            ))}
            {hasMore && !onViewAll && !viewAllHref && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                +{openTasks.length - maxItems} more
              </p>
            )}
          </div>
        )}
      </Card>

      <TaskCreateSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultEntityType={entityType}
        defaultEntityId={entityId}
        onSuccess={() => {
          utils.task.getByEntity.invalidate({
            entityType: queryEntityType as 'lead' | 'contact' | 'opportunity',
            entityId,
          });
        }}
      />
    </>
  );
}
