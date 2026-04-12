'use client';

/**
 * CaseList Component (PG-138)
 *
 * Uses shared SearchFilterBar, DataTable, and TableRowActions
 * to match the same patterns as ContactList & TicketList.
 */

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, TableRowActions, type BulkAction, Skeleton, cn, toast } from '@intelliflow/ui';
import { CASE_STATUSES, CASE_PRIORITIES } from '@intelliflow/domain';
import { SearchFilterBar } from '@/components/shared';
import {
  getStatusConfig,
  getPriorityConfig,
  formatDeadline,
  getInitials,
  timeAgo,
} from '@/lib/cases/case-utils';
import type { CaseListItem, CaseStats, CaseFilterOptions } from './types';

// =============================================================================
// Props
// =============================================================================

export interface CaseListProps {
  cases: CaseListItem[];
  total: number;
  isLoading: boolean;
  stats: CaseStats;
  filterOptions: CaseFilterOptions;
  onRowClick: (caseItem: CaseListItem) => void;
  pagination: {
    page: number;
    limit: number;
    onPageChange: (page: number) => void;
  };
  searchValue: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  priorityFilter: string;
  onPriorityChange: (value: string) => void;
  sortValue: string;
  onSortChange: (value: string) => void;
  onEdit?: (caseItem: CaseListItem) => void;
  onDelete?: (caseItem: CaseListItem) => void;
  onAssign?: (caseItem: CaseListItem) => void;
  onBulkAssign?: (ids: string[]) => void;
  onBulkClose?: (ids: string[]) => void;
  onBulkDelete?: (ids: string[]) => void;
}

// =============================================================================
// Constants
// =============================================================================

const SORT_OPTIONS = [
  { value: 'updatedAt', label: 'Last Updated' },
  { value: 'createdAt', label: 'Date Created' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'priority', label: 'Priority' },
];

// =============================================================================
// Stats Cards
// =============================================================================

function TrendIndicator({ value, label }: Readonly<{ value?: number; label: string }>) {
  if (value === undefined || value === null) return null;
  const isPositive = value >= 0;
  return (
    <p
      className={cn(
        'text-sm font-medium flex items-center gap-1',
        isPositive ? 'text-green-600' : 'text-red-600'
      )}
    >
      <span className="material-symbols-outlined text-[16px]">
        {isPositive ? 'trending_up' : 'trending_down'}
      </span>
      {isPositive ? '+' : ''}
      {value}%<span className="text-muted-foreground font-normal">{label}</span>
    </p>
  );
}

function StatsBar({ stats, isLoading }: Readonly<{ stats: CaseStats; isLoading: boolean }>) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl p-6 bg-card border border-border shadow-sm">
            <Skeleton className="h-4 w-16 mb-3" />
            <Skeleton className="h-8 w-20 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Open */}
      <div className="flex flex-col gap-2 rounded-xl p-6 bg-card border border-border shadow-sm">
        <div className="flex justify-between items-start">
          <p className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
            Open
          </p>
          <span className="material-symbols-outlined text-primary">folder_open</span>
        </div>
        <p className="text-foreground text-3xl font-bold leading-tight">{stats.open}</p>
        <TrendIndicator value={stats.openTrend} label="from last month" />
      </div>

      {/* In Progress */}
      <div className="flex flex-col gap-2 rounded-xl p-6 bg-card border border-border shadow-sm">
        <div className="flex justify-between items-start">
          <p className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
            In Progress
          </p>
          <span className="material-symbols-outlined text-blue-500">pending</span>
        </div>
        <p className="text-foreground text-3xl font-bold leading-tight">{stats.inProgress}</p>
        <TrendIndicator value={stats.inProgressTrend} label="from last month" />
      </div>

      {/* Overdue — red accent */}
      <div className="flex flex-col gap-2 rounded-xl p-6 bg-card border-2 border-red-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-16 h-16 bg-red-50 -mr-8 -mt-8 rounded-full" />
        <div className="flex justify-between items-start relative">
          <p className="text-red-600 text-sm font-semibold uppercase tracking-wider">Overdue</p>
          <span className="material-symbols-outlined text-red-500">error</span>
        </div>
        <p className="text-red-700 text-3xl font-bold leading-tight relative">{stats.overdue}</p>
        {stats.overdue > 0 && (
          <p className="text-red-600 text-sm font-medium flex items-center gap-1 relative">
            <span className="material-symbols-outlined text-[16px]">warning</span> Action required
          </p>
        )}
      </div>

      {/* Closed */}
      <div className="flex flex-col gap-2 rounded-xl p-6 bg-card border border-border shadow-sm">
        <div className="flex justify-between items-start">
          <p className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
            Closed
          </p>
          <span className="material-symbols-outlined text-green-600">check_circle</span>
        </div>
        <p className="text-foreground text-3xl font-bold leading-tight">{stats.closedThisMonth}</p>
        <TrendIndicator value={stats.closedTrend} label="from last month" />
      </div>
    </div>
  );
}

// =============================================================================
// Column sub-components (module-level — fixes S6478)
// =============================================================================

function CaseCaseNumberCell({ row }: Readonly<{ row: CaseListItem }>) {
  return (
    <span className="text-sm font-bold text-primary">{row.caseNumber || row.id.slice(0, 12)}</span>
  );
}

function CaseTitleCell({ row }: Readonly<{ row: CaseListItem }>) {
  const isClosed = row.status === 'CLOSED' || row.status === 'CANCELLED';
  const subtitle =
    row.lastActivityText || (row.updatedAt ? `Updated ${timeAgo(row.updatedAt)}` : '');
  return (
    <div className={cn('flex flex-col', isClosed && 'opacity-70')}>
      <span className="text-sm font-semibold text-foreground">{row.title}</span>
      {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
    </div>
  );
}

function CaseClientCell({ row }: Readonly<{ row: CaseListItem }>) {
  return <span className="text-sm text-foreground">{row.client.name}</span>;
}

function CaseStatusCell({ row }: Readonly<{ row: CaseListItem }>) {
  const statusCfg = getStatusConfig(row.status);
  const isClosed = row.status === 'CLOSED' || row.status === 'CANCELLED';
  const isOverdue = row.isOverdue && !isClosed;
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        isOverdue ? 'bg-red-100 text-red-700' : statusCfg.bgColor,
        !isOverdue && statusCfg.color
      )}
    >
      {isOverdue ? 'Overdue' : statusCfg.label}
    </span>
  );
}

function CasePriorityCell({ row }: Readonly<{ row: CaseListItem }>) {
  const priorityCfg = getPriorityConfig(row.priority);
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs font-medium', priorityCfg.textColor)}
    >
      <span className={cn('size-2 rounded-full', priorityCfg.dotColor)} />
      {priorityCfg.label}
    </span>
  );
}

function CaseAssigneeCell({ row }: Readonly<{ row: CaseListItem }>) {
  const { assignee } = row;
  const shortName = assignee.name
    .split(' ')
    .map((p: string, i: number) => (i === 0 ? p : `${p[0]}.`))
    .join(' ');
  return (
    <div className="flex items-center gap-2">
      {assignee.avatarUrl ? (
        <div
          className="size-7 rounded-full bg-muted bg-cover bg-center shrink-0"
          style={{ backgroundImage: `url(${assignee.avatarUrl})` }}
          aria-label={assignee.name}
        />
      ) : (
        <div className="size-7 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold shrink-0">
          {getInitials(assignee.name)}
        </div>
      )}
      <span className="text-sm text-foreground">{shortName}</span>
    </div>
  );
}

function CaseDeadlineCell({ row }: Readonly<{ row: CaseListItem }>) {
  const isClosed = row.status === 'CLOSED' || row.status === 'CANCELLED';
  const isOverdue = row.isOverdue && !isClosed;
  let deadlineCls: string;
  if (isOverdue) {
    deadlineCls = 'text-red-600 font-semibold';
  } else if (isClosed) {
    deadlineCls = 'text-muted-foreground';
  } else {
    deadlineCls = 'text-foreground';
  }
  return (
    <span className={cn('text-sm', deadlineCls)}>
      {isClosed ? 'Completed' : formatDeadline(row.deadline)}
    </span>
  );
}

function CaseActionsHeader() {
  return <span className="block text-right">Actions</span>;
}

interface CaseActionsCallbacks {
  onRowClick: (c: CaseListItem) => void;
  onEdit?: (c: CaseListItem) => void;
  onDelete?: (c: CaseListItem) => void;
  onAssign?: (c: CaseListItem) => void;
}

function CaseActionsCell({
  row,
  onRowClick,
  onEdit,
  onDelete,
  onAssign,
}: Readonly<{ row: CaseListItem } & CaseActionsCallbacks>) {
  return (
    <TableRowActions
      quickActions={[
        { icon: 'visibility', label: 'View', onClick: () => onRowClick(row) },
        { icon: 'edit', label: 'Edit', onClick: () => onEdit?.(row) },
      ]}
      dropdownActions={[
        { icon: 'person_add', label: 'Reassign', onClick: () => onAssign?.(row) },
        {
          icon: 'content_copy',
          label: 'Duplicate',
          onClick: () =>
            toast({ title: 'Coming soon', description: 'Duplicate case is under development' }),
        },
        { icon: 'history', label: 'View History', onClick: () => onRowClick(row) },
        { id: 'sep-1', icon: '', label: '', onClick: () => undefined, separator: true },
        { icon: 'delete', label: 'Delete', variant: 'danger', onClick: () => onDelete?.(row) },
      ]}
    />
  );
}

/** Column factory — defined at module level (not inside the component) to satisfy S6478. */
function buildCaseColumns(callbacks: CaseActionsCallbacks): ColumnDef<CaseListItem, unknown>[] {
  const { onRowClick, onEdit, onDelete, onAssign } = callbacks;
  return [
    {
      accessorKey: 'caseNumber',
      header: 'Case Number',
      size: 130,
      cell: ({ row }) => <CaseCaseNumberCell row={row.original} />,
    },
    {
      accessorKey: 'title',
      header: 'Title',
      size: 280,
      cell: ({ row }) => <CaseTitleCell row={row.original} />,
    },
    {
      accessorKey: 'client',
      header: 'Client',
      size: 150,
      cell: ({ row }) => <CaseClientCell row={row.original} />,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 120,
      cell: ({ row }) => <CaseStatusCell row={row.original} />,
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      size: 100,
      cell: ({ row }) => <CasePriorityCell row={row.original} />,
    },
    {
      accessorKey: 'assignee',
      header: 'Assignee',
      size: 150,
      cell: ({ row }) => <CaseAssigneeCell row={row.original} />,
    },
    {
      accessorKey: 'deadline',
      header: 'Next Deadline',
      size: 130,
      cell: ({ row }) => <CaseDeadlineCell row={row.original} />,
    },
    {
      id: 'actions',
      header: () => <CaseActionsHeader />,
      size: 120,
      cell: ({ row }) => (
        <CaseActionsCell
          row={row.original}
          onRowClick={onRowClick}
          onEdit={onEdit}
          onDelete={onDelete}
          onAssign={onAssign}
        />
      ),
    },
  ];
}

// =============================================================================
// Main Component
// =============================================================================

export function CaseList({
  cases,
  total,
  isLoading,
  stats,
  filterOptions,
  onRowClick,
  pagination,
  searchValue,
  onSearchChange,
  statusFilter,
  onStatusChange,
  priorityFilter,
  onPriorityChange,
  sortValue,
  onSortChange,
  onEdit,
  onDelete,
  onAssign,
  onBulkAssign,
  onBulkClose,
  onBulkDelete,
}: Readonly<CaseListProps>) {
  // ── Filter options for SearchFilterBar ───────────────────────────────────
  const statusOptions = useMemo(
    () => [
      { value: '', label: 'All Statuses' },
      ...CASE_STATUSES.map((s) => ({
        value: s,
        label: getStatusConfig(s).label,
      })),
    ],
    []
  );

  const priorityOptions = useMemo(
    () => [
      { value: '', label: 'All Priorities' },
      ...CASE_PRIORITIES.map((p) => ({
        value: p,
        label: getPriorityConfig(p).label,
      })),
    ],
    []
  );

  const assigneeOptions = useMemo(
    () => [
      { value: '', label: 'All Assignees' },
      ...(filterOptions.assignees ?? []).map((a) => ({
        value: a.id,
        label: a.name,
      })),
    ],
    [filterOptions.assignees]
  );

  // ── Table columns ───────────────────────────────────────────────────────
  // Columns are built by a module-level factory to avoid S6478 (JSX-returning
  // functions defined inside a React component). useMemo caches the result.
  const columns = useMemo(
    () => buildCaseColumns({ onRowClick, onEdit, onDelete, onAssign }),
    [onRowClick, onEdit, onDelete, onAssign]
  );

  // ── Bulk actions ────────────────────────────────────────────────────────
  const bulkActions: BulkAction<CaseListItem>[] = useMemo(
    () => [
      ...(onBulkAssign
        ? [
            {
              icon: 'person_add',
              label: 'Assign',
              onClick: (selected: CaseListItem[]) => onBulkAssign(selected.map((c) => c.id)),
            },
          ]
        : []),
      ...(onBulkClose
        ? [
            {
              icon: 'check_circle',
              label: 'Close',
              onClick: (selected: CaseListItem[]) => onBulkClose(selected.map((c) => c.id)),
            },
          ]
        : []),
      ...(onBulkDelete
        ? [
            {
              icon: 'delete',
              label: 'Delete',
              variant: 'danger' as const,
              onClick: (selected: CaseListItem[]) => onBulkDelete(selected.map((c) => c.id)),
            },
          ]
        : []),
    ],
    [onBulkAssign, onBulkClose, onBulkDelete]
  );

  const totalPages = Math.max(1, Math.ceil(total / pagination.limit));
  const currentPage = Math.min(Math.max(1, pagination.page), totalPages);
  const startItem = total > 0 ? (currentPage - 1) * pagination.limit + 1 : 0;
  const endItem = total > 0 ? Math.min(currentPage * pagination.limit, total) : 0;

  return (
    <div>
      <StatsBar stats={stats} isLoading={isLoading} />

      {/* Search and Filters — shared component */}
      <SearchFilterBar
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search cases by ID, title, or client..."
        searchAriaLabel="Search cases"
        filters={[
          {
            id: 'status',
            label: 'Status',
            icon: 'label',
            options: statusOptions,
            value: statusFilter,
            onChange: onStatusChange,
          },
          {
            id: 'priority',
            label: 'Priority',
            icon: 'flag',
            options: priorityOptions,
            value: priorityFilter,
            onChange: onPriorityChange,
          },
          ...(assigneeOptions.length > 1
            ? [
                {
                  id: 'assignee',
                  label: 'Assignee',
                  icon: 'person',
                  options: assigneeOptions,
                  value: '',
                  onChange: () => {}, // Defensive fallback: assignee filter wired via onAssign prop
                  hideOnMobile: true,
                },
              ]
            : []),
        ]}
        sort={{
          options: SORT_OPTIONS,
          value: sortValue,
          onChange: onSortChange,
        }}
        className="mb-4"
      />

      {isLoading ? (
        <div className="space-y-3" data-testid="case-list-loading">
          {[...new Array(6)].map((_, idx) => (
            <div
              key={`case-row-skeleton-${idx}`} // NOSONAR typescript:S6479
              className="flex items-center gap-4 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Data Table — shared component */}
          <DataTable
            columns={columns}
            data={cases}
            entity="cases"
            emptyMessage="No cases match your search criteria"
            emptyIcon="gavel"
            onRowClick={onRowClick}
            enableRowSelection
            bulkActions={bulkActions}
            pageSize={pagination.limit}
            hidePagination
          />

          {total > 0 && (
            <output
              aria-live="polite"
              className="mt-3 flex items-center justify-between text-sm text-muted-foreground"
            >
              <span>
                Showing {startItem} to {endItem} of {total} cases
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => pagination.onPageChange(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                  className="px-3 py-1.5 border border-border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
                >
                  Previous
                </button>
                <span className="px-3 py-1.5">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => pagination.onPageChange(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-1.5 border border-border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
                >
                  Next
                </button>
              </div>
            </output>
          )}
        </>
      )}
    </div>
  );
}
