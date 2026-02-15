'use client';

import { useCallback, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  TableRowActions,
  type BulkAction,
  ConfirmationDialog,
  toast,
  Skeleton,
} from '@intelliflow/ui';
import type { TaskStatus, TaskPriority } from '@intelliflow/domain';

export interface TaskListItem {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: Date | string | null;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly ownerId: string;
  readonly owner: { id: string; email: string; name: string | null };
  readonly lead: { id: string; firstName: string; lastName: string } | null;
  readonly contact: { id: string; firstName: string; lastName: string } | null;
  readonly opportunity: { id: string; name: string; stage: string } | null;
}

export interface TaskListProps {
  readonly tasks: readonly TaskListItem[];
  readonly isLoading: boolean;
  readonly onRowClick: (id: string) => void;
  readonly onComplete: (id: string) => void;
  readonly onEdit: (task: TaskListItem) => void;
  readonly onDelete: (id: string) => void;
  readonly onArchive: (id: string) => void;
  readonly onBulkComplete: (ids: string[]) => void;
  readonly onBulkDelete: (ids: string[]) => void;
  readonly onBulkArchive: (ids: string[]) => void;
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

const ENTITY_ICONS: Record<string, string> = {
  lead: 'group',
  contact: 'person',
  deal: 'handshake',
};

function getDueDateStatus(date: Date | string | null): 'overdue' | 'today' | 'normal' {
  if (!date) return 'normal';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (dueDay < today) return 'overdue';
  if (dueDay.getTime() === today.getTime()) return 'today';
  return 'normal';
}

function formatDueDate(date: Date | string | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getEntityInfo(task: TaskListItem): { type: string; name: string; href: string } | null {
  if (task.lead) return { type: 'lead', name: `${task.lead.firstName} ${task.lead.lastName}`, href: `/leads/${task.lead.id}` };
  if (task.contact) return { type: 'contact', name: `${task.contact.firstName} ${task.contact.lastName}`, href: `/contacts/${task.contact.id}` };
  if (task.opportunity) return { type: 'deal', name: task.opportunity.name, href: `/deals/${task.opportunity.id}` };
  return null;
}

function createColumns(handlers: {
  onComplete: (id: string) => void;
  onEdit: (task: TaskListItem) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
}): ColumnDef<TaskListItem>[] {
  return [
    {
      accessorKey: 'title',
      header: 'Task',
      size: 280,
      cell: ({ row }) => {
        const task = row.original;
        return (
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground truncate">{task.title}</span>
            {task.description && (
              <span className="text-xs text-muted-foreground truncate">{task.description}</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 120,
      cell: ({ row }) => {
        const style = STATUS_STYLES[row.original.status] ?? STATUS_STYLES.PENDING;
        return (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
            {row.original.status.replace('_', ' ')}
          </span>
        );
      },
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      size: 100,
      cell: ({ row }) => {
        const p = PRIORITY_STYLES[row.original.priority] ?? PRIORITY_STYLES.MEDIUM;
        return (
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${p.color}`}>
            <span className="material-symbols-outlined text-sm" aria-hidden="true">{p.icon}</span>
            {row.original.priority}
          </span>
        );
      },
    },
    {
      accessorKey: 'dueDate',
      header: 'Due Date',
      size: 120,
      cell: ({ row }) => {
        const status = getDueDateStatus(row.original.dueDate);
        const colorClass = status === 'overdue' ? 'text-red-600 dark:text-red-400' :
          status === 'today' ? 'text-amber-600 dark:text-amber-400' :
          'text-muted-foreground';
        return (
          <span className={`text-sm ${colorClass}`} data-testid={`due-${status}`}>
            {formatDueDate(row.original.dueDate)}
          </span>
        );
      },
    },
    {
      id: 'entity',
      header: 'Linked Entity',
      size: 180,
      cell: ({ row }) => {
        const entity = getEntityInfo(row.original);
        if (!entity) return <span className="text-sm text-muted-foreground">—</span>;
        return (
          <a
            href={entity.href}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">{ENTITY_ICONS[entity.type]}</span>
            <span className="truncate">{entity.name}</span>
          </a>
        );
      },
    },
    {
      id: 'owner',
      header: 'Owner',
      size: 120,
      cell: ({ row }) => {
        const owner = row.original.owner;
        return (
          <span className="text-sm text-muted-foreground truncate">
            {owner?.name ?? owner?.email ?? '—'}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: () => <span className="block text-right">Actions</span>,
      size: 100,
      cell: ({ row }) => {
        const task = row.original;
        return (
          <TableRowActions
            quickActions={
              task.status === 'COMPLETED' || task.status === 'CANCELLED'
                ? []
                : [
                    {
                      icon: 'check_circle',
                      label: 'Complete',
                      onClick: () => handlers.onComplete(task.id),
                    },
                  ]
            }
            dropdownActions={[
              { icon: 'edit', label: 'Edit', onClick: () => handlers.onEdit(task) },
              ...(task.status === 'COMPLETED' || task.status === 'CANCELLED'
                ? [{ icon: 'archive', label: 'Archive', onClick: () => handlers.onArchive(task.id) }]
                : task.status !== 'ARCHIVED'
                  ? [{ icon: 'delete', label: 'Delete', onClick: () => handlers.onDelete(task.id), variant: 'destructive' as const }]
                  : []),
            ]}
          />
        );
      },
    },
  ];
}

export function TaskList({
  tasks,
  isLoading,
  onRowClick,
  onComplete,
  onEdit,
  onDelete,
  onArchive,
  onBulkComplete,
  onBulkDelete,
  onBulkArchive,
}: TaskListProps) {
  const columns = useMemo(() => createColumns({ onComplete, onEdit, onDelete, onArchive }), [onComplete, onEdit, onDelete, onArchive]);

  const bulkActions: BulkAction<TaskListItem>[] = useMemo(() => [
    {
      label: 'Mark Complete',
      icon: 'check_circle',
      onExecute: (selected) => onBulkComplete(selected.map((t) => t.id)),
    },
    {
      label: 'Archive',
      icon: 'archive',
      onExecute: (selected) => onBulkArchive(selected.filter((t) => t.status === 'COMPLETED' || t.status === 'CANCELLED').map((t) => t.id)),
    },
    {
      label: 'Delete',
      icon: 'delete',
      variant: 'destructive' as const,
      onExecute: (selected) => onBulkDelete(selected.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && t.status !== 'ARCHIVED').map((t) => t.id)),
    },
  ], [onBulkComplete, onBulkDelete, onBulkArchive]);

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="task-list-skeleton">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="task-list-empty">
        <span className="material-symbols-outlined text-4xl text-muted-foreground mb-2" aria-hidden="true">
          task_alt
        </span>
        <p className="text-muted-foreground">No tasks found</p>
        <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters or create a new task</p>
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={tasks as TaskListItem[]}
      onRowClick={(row) => onRowClick(row.id)}
      enableRowSelection
      bulkActions={bulkActions}
    />
  );
}
