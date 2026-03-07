'use client';

import { Card, Skeleton, ConfirmationDialog } from '@intelliflow/ui';
import { useState } from 'react';
import Link from 'next/link';
import type { TaskStatus, TaskPriority } from '@intelliflow/domain';

type DateStringNull = Date | string | null;

export interface TaskDetailData {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: DateStringNull;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly ownerId: string;
  readonly owner: { id: string; email: string; name: string | null };
  readonly lead: { id: string; email?: string; firstName: string | null; lastName: string | null } | null;
  readonly contact: { id: string; email?: string; firstName: string; lastName: string } | null;
  readonly opportunity: { id: string; name: string; stage: string } | null;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
  readonly completedAt: DateStringNull;
}

export interface TaskDetailProps {
  readonly task: TaskDetailData | null | undefined;
  readonly isLoading: boolean;
  readonly isNotFound?: boolean;
  readonly onComplete: (id: string) => void;
  readonly onStart: (id: string) => void;
  readonly onEdit: (task: TaskDetailData) => void;
  readonly onDelete: (id: string) => void;
  readonly onArchive: (id: string) => void;
  readonly isCompleting?: boolean;
  readonly isStarting?: boolean;
  readonly isDeleting?: boolean;
  readonly isArchiving?: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  ARCHIVED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

const PRIORITY_STYLES: Record<string, { color: string; icon: string }> = {
  LOW: { color: 'text-gray-500', icon: 'flag' },
  MEDIUM: { color: 'text-yellow-500', icon: 'flag' },
  HIGH: { color: 'text-orange-500', icon: 'flag' },
  URGENT: { color: 'text-red-500', icon: 'priority_high' },
};

function formatDate(date: DateStringNull): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDueDateStatus(date: DateStringNull): 'overdue' | 'today' | 'normal' {
  if (!date) return 'normal';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (dueDay < today) return 'overdue';
  if (dueDay.getTime() === today.getTime()) return 'today';
  return 'normal';
}

function getEntityInfo(
  task: Readonly<TaskDetailData>
): { type: string; name: string; href: string; icon: string } | null {
  if (task.lead)
    return {
      type: 'Lead',
      name: `${task.lead.firstName} ${task.lead.lastName}`,
      href: `/leads/${task.lead.id}`,
      icon: 'group',
    };
  if (task.contact)
    return {
      type: 'Contact',
      name: `${task.contact.firstName} ${task.contact.lastName}`,
      href: `/contacts/${task.contact.id}`,
      icon: 'person',
    };
  if (task.opportunity)
    return {
      type: 'Deal',
      name: task.opportunity.name,
      href: `/deals/${task.opportunity.id}`,
      icon: 'handshake',
    };
  return null;
}

export function TaskDetail({
  task,
  isLoading,
  isNotFound,
  onComplete,
  onStart,
  onEdit,
  onDelete,
  onArchive,
  isCompleting = false,
  isStarting = false,
  isDeleting = false,
  isArchiving = false,
}: Readonly<TaskDetailProps>) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="task-detail-skeleton">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isNotFound || !task) {
    return (
      <div className="flex flex-col items-center justify-center py-12" data-testid="task-not-found">
        <span
          className="material-symbols-outlined text-4xl text-muted-foreground mb-2"
          aria-hidden="true"
        >
          search_off
        </span>
        <p className="text-lg font-medium text-foreground">Task not found</p>
        <p className="text-sm text-muted-foreground mt-1">
          The task may have been deleted or doesn&apos;t exist
        </p>
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[task.status] ?? STATUS_STYLES.PENDING;
  const priority = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.MEDIUM;
  const entity = getEntityInfo(task);
  const dueStatus = getDueDateStatus(task.dueDate);
  let dueDateColor: string;
  if (dueStatus === 'overdue') {
    dueDateColor = 'text-red-600 dark:text-red-400';
  } else if (dueStatus === 'today') {
    dueDateColor = 'text-amber-600 dark:text-amber-400';
  } else {
    dueDateColor = 'text-foreground';
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{task.title}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle}`}
            >
              {task.status.replace('_', ' ')}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-sm font-medium ${priority.color}`}
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {priority.icon}
              </span>{' '}
              {task.priority}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent"
          aria-label="Edit task"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            edit
          </span>
        </button>
      </div>

      {/* Details card */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Due Date</p>
            <p
              className={`text-sm font-medium mt-0.5 ${dueDateColor}`}
              data-testid={`due-${dueStatus}`}
            >
              {formatDate(task.dueDate)}
              {dueStatus === 'overdue' && <span className="ml-1 text-xs">(overdue)</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Owner</p>
            <p className="text-sm font-medium mt-0.5">
              {task.owner?.name ?? task.owner?.email ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Created</p>
            <p className="text-sm text-muted-foreground mt-0.5">{formatDate(task.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Updated</p>
            <p className="text-sm text-muted-foreground mt-0.5">{formatDate(task.updatedAt)}</p>
          </div>
          {task.completedAt && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Completed</p>
              <p className="text-sm text-green-600 dark:text-green-400 mt-0.5">
                {formatDate(task.completedAt)}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Entity link */}
      {entity && (
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Linked {entity.type}
          </p>
          <Link
            href={entity.href}
            className="inline-flex items-center gap-2 text-primary hover:underline"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              {entity.icon}
            </span>{' '}
            {entity.name}
          </Link>
        </Card>
      )}

      {/* Description */}
      {task.description && (
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Description</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{task.description}</p>
        </Card>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {task.status === 'PENDING' && (
          <button
            type="button"
            onClick={() => onStart(task.id)}
            disabled={isStarting}
            className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Start task"
          >
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {isStarting ? 'hourglass_empty' : 'play_arrow'}
              </span>{' '}
              {isStarting ? 'Starting...' : 'Start'}
            </span>
          </button>
        )}
        {task.status === 'IN_PROGRESS' && (
          <button
            type="button"
            onClick={() => onComplete(task.id)}
            disabled={isCompleting}
            className="px-4 py-2 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Complete task"
          >
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {isCompleting ? 'hourglass_empty' : 'check_circle'}
              </span>{' '}
              {isCompleting ? 'Completing...' : 'Complete'}
            </span>
          </button>
        )}
        {(task.status === 'COMPLETED' || task.status === 'CANCELLED') && (
          <button
            type="button"
            onClick={() => setShowArchiveConfirm(true)}
            disabled={isArchiving}
            className="px-4 py-2 text-sm rounded-md border border-muted-foreground text-muted-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Archive task"
          >
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {isArchiving ? 'hourglass_empty' : 'archive'}
              </span>{' '}
              {isArchiving ? 'Archiving...' : 'Archive'}
            </span>
          </button>
        )}
        {task.status !== 'COMPLETED' &&
          task.status !== 'CANCELLED' &&
          task.status !== 'ARCHIVED' && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              className="px-4 py-2 text-sm rounded-md border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Delete task"
            >
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  {isDeleting ? 'hourglass_empty' : 'delete'}
                </span>{' '}
                {isDeleting ? 'Deleting...' : 'Delete'}
              </span>
            </button>
          )}
      </div>

      <ConfirmationDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!open) setShowDeleteConfirm(false);
        }}
        onConfirm={() => {
          onDelete(task.id);
          setShowDeleteConfirm(false);
        }}
        title="Delete Task"
        description="Are you sure you want to delete this task? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
      />

      <ConfirmationDialog
        open={showArchiveConfirm}
        onOpenChange={(open) => {
          if (!open) setShowArchiveConfirm(false);
        }}
        onConfirm={() => {
          onArchive(task.id);
          setShowArchiveConfirm(false);
        }}
        title="Archive Task"
        description="This task will be archived and hidden from active views. You can still find it by filtering for archived tasks."
        confirmLabel="Archive"
      />
    </div>
  );
}
