'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable, TableRowActions, type BulkAction, Skeleton, EmptyState } from '@intelliflow/ui';
import type { TaskStatus, TaskPriority } from '@intelliflow/domain';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

const TASK_LIST_SKELETON_KEYS = ['task-0', 'task-1', 'task-2', 'task-3', 'task-4'] as const;

type DateStringNull = Date | string | null;

export interface TaskListItem {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: DateStringNull;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly ownerId: string;
  readonly owner: { id: string; email: string; name: string | null };
  readonly lead: { id: string; firstName: string | null; lastName: string | null } | null;
  readonly contact: { id: string; firstName: string; lastName: string } | null;
  readonly opportunity: { id: string; name: string; stage: string } | null;
  /** A follow-up due on a lead (derived, not stored): see `follow-up-rows.ts`. */
  readonly followUp?: boolean;
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
  /** Opens the screen's create-task flow; the empty state offers it when given. */
  readonly onCreate?: () => void;
  /** A filter or search is on: the empty state says "try adjusting your filters". */
  readonly filtered?: boolean;
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

function getDueDateStatus(date: DateStringNull): 'overdue' | 'today' | 'normal' {
  if (!date) return 'normal';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dueDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (dueDay < today) return 'overdue';
  if (dueDay.getTime() === today.getTime()) return 'today';
  return 'normal';
}

function formatDueDate(date: DateStringNull, timezone: string = 'Europe/London'): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: timezone });
}

function getEntityInfo(
  task: Readonly<TaskListItem>
): { type: string; name: string; href: string } | null {
  if (task.lead)
    return {
      type: 'lead',
      name: `${task.lead.firstName ?? ''} ${task.lead.lastName ?? ''}`.trim() || 'Unknown Lead',
      href: `/leads/${task.lead.id}`,
    };
  if (task.contact)
    return {
      type: 'contact',
      name: `${task.contact.firstName} ${task.contact.lastName}`,
      href: `/contacts/${task.contact.id}`,
    };
  if (task.opportunity)
    return { type: 'deal', name: task.opportunity.name, href: `/deals/${task.opportunity.id}` };
  return null;
}

function createColumns(
  handlers: {
    onComplete: (id: string) => void;
    onEdit: (task: TaskListItem) => void;
    onDelete: (id: string) => void;
    onArchive: (id: string) => void;
    onOpenLead: (leadId: string) => void;
  },
  timezone: string = 'Europe/London'
): ColumnDef<TaskListItem>[] {
  return [
    {
      accessorKey: 'title',
      header: 'Task',
      size: 280,
      cell: ({ row }) => {
        const task = row.original;
        return (
          // Capped on desktop so a long lead name truncates instead of pushing Owner and
          // Actions off the right of the table.
          <div className="flex min-w-0 flex-col md:max-w-[22rem]">
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
          <span
            className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
          >
            {row.original.status.replaceAll('_', ' ')}
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
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              {p.icon}
            </span>
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
        const todayOrDefaultClass =
          status === 'today' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';
        const colorClass =
          status === 'overdue' ? 'text-red-600 dark:text-red-400' : todayOrDefaultClass;
        return (
          <span className={`text-sm ${colorClass}`} data-testid={`due-${status}`}>
            {formatDueDate(row.original.dueDate, timezone)}
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
            // Capped so a long company name truncates instead of pushing Owner and Actions off
            // the right of the table (owner 21/11, follow-up rows carry long lead names).
            className="inline-flex max-w-full items-center gap-1 text-sm text-primary hover:underline md:max-w-[14rem]"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              {ENTITY_ICONS[entity.type]}
            </span>
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
        if (row.original.followUp) return <span className="text-sm text-muted-foreground">—</span>;
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
        if (task.followUp && task.lead) {
          const leadId = task.lead.id;
          return (
            <TableRowActions
              quickActions={[
                {
                  icon: 'open_in_new',
                  label: 'Open lead',
                  onClick: () => handlers.onOpenLead(leadId),
                },
              ]}
              dropdownActions={[]}
            />
          );
        }
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
              ...(() => {
                if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
                  return [
                    {
                      icon: 'archive',
                      label: 'Archive',
                      onClick: () => handlers.onArchive(task.id),
                    },
                  ];
                }
                if (task.status !== 'ARCHIVED') {
                  return [
                    {
                      icon: 'delete',
                      label: 'Delete',
                      onClick: () => handlers.onDelete(task.id),
                      variant: 'destructive' as const,
                    },
                  ];
                }
                return [];
              })(),
            ]}
          />
        );
      },
    },
  ];
}

/** Follow-ups are not stored tasks: bulk complete, archive and delete never send their ids. */
function stored(rows: readonly TaskListItem[]): TaskListItem[] {
  return rows.filter((t) => !t.followUp);
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
  onCreate,
  filtered = true,
}: Readonly<TaskListProps>) {
  const { timezone } = useTimezoneContext();
  const router = useRouter();
  const columns = useMemo(
    () =>
      createColumns(
        {
          onComplete,
          onEdit,
          onDelete,
          onArchive,
          onOpenLead: (id) => router.push(`/leads/${id}`),
        },
        timezone
      ),
    [onComplete, onEdit, onDelete, onArchive, router, timezone]
  );

  const bulkActions: BulkAction<TaskListItem>[] = useMemo(
    () => [
      {
        label: 'Mark Complete',
        icon: 'check_circle',
        onExecute: (selected) => onBulkComplete(stored(selected).map((t) => t.id)),
      },
      {
        label: 'Archive',
        icon: 'archive',
        onExecute: (selected) =>
          onBulkArchive(
            stored(selected)
              .filter((t) => t.status === 'COMPLETED' || t.status === 'CANCELLED')
              .map((t) => t.id)
          ),
      },
      {
        label: 'Delete',
        icon: 'delete',
        variant: 'destructive' as const,
        onExecute: (selected) =>
          onBulkDelete(
            stored(selected)
              .filter(
                (t) =>
                  t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && t.status !== 'ARCHIVED'
              )
              .map((t) => t.id)
          ),
      },
    ],
    [onBulkComplete, onBulkDelete, onBulkArchive]
  );

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="task-list-skeleton">
        {TASK_LIST_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-12 w-full rounded" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div data-testid="task-list-empty">
        <EmptyState
          entity="tasks"
          variant={filtered ? 'filtered' : 'empty'}
          showCta={Boolean(onCreate)}
          onCtaClick={onCreate}
        />
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={tasks as TaskListItem[]}
      entity="tasks"
      // One page: the server pages the stored tasks, and the follow-ups after them must not be
      // pushed to client pages 2-4 behind Previous/Next.
      pageSize={Math.max(10, tasks.length)}
      onRowClick={(row) =>
        row.followUp && row.lead ? router.push(`/leads/${row.lead.id}`) : onRowClick(row.id)
      }
      enableRowSelection
      // Follow-ups are not stored tasks: nothing to complete, archive or delete in bulk.
      canSelectRow={(row) => !row.followUp}
      bulkActions={bulkActions}
    />
  );
}
