'use client';

/**
 * TicketList Component (PG-137)
 *
 * Extracted from the ticket list page to separate data fetching from presentation.
 * Receives data via props and manages UI state internally.
 *
 * Features:
 * - Stats cards (Open, In Progress, SLA Breached, Resolved Today)
 * - SearchFilterBar with status/priority/SLA filters
 * - DataTable with SLA indicators and row actions
 * - Bulk actions (Assign, Update Status, Resolve, Escalate, Close)
 * - Loading skeletons
 * - Empty state
 */

import { useState, useMemo, useCallback, useRef } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import {
  Card,
  DataTable,
  TableRowActions,
  type BulkAction,
  ConfirmationDialog,
  StatusSelectDialog,
  type StatusOption,
  Skeleton,
  cn,
} from '@intelliflow/ui';
import { TICKET_STATUSES } from '@intelliflow/domain';
import type { TicketPriority } from '@intelliflow/domain';
import { SearchFilterBar } from '@/components/shared';
import { AppAvatar } from '@/components/shared/app-avatar';
import { SLAIndicator } from './SLAIndicator';
import {
  ticketStatusOptions,
  ticketPriorityOptions,
  slaStatusChips,
} from '@/lib/shared/filter-utils';
import { getPriorityConfig } from '@/lib/tickets/ticket-utils';
import type { TicketListItem, TicketStats, TicketFilterOptions, BulkActionType } from './types';

// =============================================================================
// Props Interface
// =============================================================================

export interface TicketListProps {
  tickets: TicketListItem[];
  total: number;
  isLoading: boolean;
  stats: TicketStats;
  filterOptions: TicketFilterOptions;
  onRowClick: (ticket: TicketListItem) => void;
  onBulkAction: (
    action: BulkActionType,
    ticketIds: string[],
    params?: Record<string, unknown>
  ) => Promise<void>;
  pagination: {
    page: number;
    limit: number;
    onPageChange: (page: number) => void;
  };
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  statusFilter?: string;
  onStatusChange?: (value: string) => void;
  priorityFilter?: string;
  onPriorityChange?: (value: string) => void;
  slaFilter?: string;
  onSLAChange?: (value: string) => void;
  sortValue?: string;
  onSortChange?: (value: string) => void;
}

// =============================================================================
// Sort Options
// =============================================================================

const SORT_OPTIONS = [
  { value: 'updatedAt', label: 'Recently Updated' },
  { value: 'createdAt', label: 'Newest First' },
  { value: 'priority', label: 'Priority' },
  { value: 'slaResolutionDue', label: 'SLA Deadline' },
];

// =============================================================================
// Status Options for Dialogs
// =============================================================================

const TICKET_STATUS_OPTIONS: StatusOption[] = TICKET_STATUSES.map((status) => {
  const configs: Record<string, { color: string; icon: string; description: string }> = {
    OPEN: { color: 'blue', icon: 'inbox', description: 'Ticket awaiting action' },
    IN_PROGRESS: { color: 'amber', icon: 'pending', description: 'Actively being worked on' },
    WAITING_ON_CUSTOMER: {
      color: 'purple',
      icon: 'person',
      description: 'Awaiting customer response',
    },
    WAITING_ON_THIRD_PARTY: {
      color: 'indigo',
      icon: 'business',
      description: 'Awaiting third party',
    },
    RESOLVED: { color: 'green', icon: 'check_circle', description: 'Issue has been resolved' },
    CLOSED: { color: 'slate', icon: 'cancel', description: 'Ticket is closed' },
  };

  const config = configs[status] || { color: 'slate', icon: 'help', description: '' };
  return {
    value: status,
    label: status
      .toLowerCase()
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
    color: config.color,
    icon: config.icon,
    description: config.description,
  };
});

// Team members for assignment dialog
const ASSIGNEE_OPTIONS: StatusOption[] = [
  {
    value: 'sarah-jenkins',
    label: 'Sarah Jenkins',
    color: 'blue',
    icon: 'person',
    description: 'Support Lead',
  },
  {
    value: 'mike-ross',
    label: 'Mike Ross',
    color: 'green',
    icon: 'person',
    description: 'Senior Support Agent',
  },
  {
    value: 'alex-morgan',
    label: 'Alex Morgan',
    color: 'purple',
    icon: 'person',
    description: 'Technical Support',
  },
  {
    value: 'david-kim',
    label: 'David Kim',
    color: 'amber',
    icon: 'person',
    description: 'Support Agent',
  },
  {
    value: 'unassigned',
    label: 'Unassigned',
    color: 'slate',
    icon: 'person_off',
    description: 'Remove assignment',
  },
];

// =============================================================================
// Priority Badge Component
// =============================================================================

function PriorityBadge({ priority }: { priority: string }) {
  const config = getPriorityConfig(priority as TicketPriority);

  return (
    <div className={`flex items-center gap-1.5 font-semibold text-xs uppercase ${config.text}`}>
      <span
        className="material-symbols-outlined text-[16px]"
        style={{ fontVariationSettings: priority === 'CRITICAL' ? "'FILL' 1" : undefined }}
      >
        {config.icon}
      </span>
      {config.label}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function TicketList({
  tickets,
  total: _total,
  isLoading,
  stats,
  filterOptions: _filterOptions,
  onRowClick,
  onBulkAction,
  pagination,
  searchValue = '',
  onSearchChange,
  statusFilter = '',
  onStatusChange,
  priorityFilter = '',
  onPriorityChange,
  slaFilter = 'all',
  onSLAChange,
  sortValue = 'updated',
  onSortChange,
}: TicketListProps) {
  // Dialog state for bulk actions
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [showEscalateDialog, setShowEscalateDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  // Track selected tickets for bulk actions
  const selectedTicketsRef = useRef<TicketListItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // =============================================================================
  // Column Definitions
  // =============================================================================

  const columns: ColumnDef<TicketListItem>[] = useMemo(
    () => [
      {
        accessorKey: 'ticketNumber',
        header: 'Ticket',
        cell: ({ row }) => {
          const ticket = row.original;
          return (
            <div>
              <span className="font-bold text-primary text-sm">#{ticket.ticketNumber}</span>
              <p className="text-sm font-medium text-slate-900 dark:text-white mt-0.5">
                {ticket.subject}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {ticket.contactName}
              </p>
            </div>
          );
        },
      },
      {
        id: 'slaTimer',
        header: 'SLA Timer',
        cell: ({ row }) => (
          <SLAIndicator
            slaStatus={row.original.slaStatus}
            slaTimeRemaining={row.original.slaTimeRemaining}
            ticketStatus={row.original.status}
            size="md"
          />
        ),
      },
      {
        accessorKey: 'slaStatus',
        header: 'SLA Status',
        cell: ({ row }) => (
          <SLAIndicator
            slaStatus={row.original.slaStatus}
            slaTimeRemaining={row.original.slaTimeRemaining}
            ticketStatus={row.original.status}
            size="sm"
            showTimer={false}
          />
        ),
      },
      {
        accessorKey: 'priority',
        header: 'Priority',
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        accessorKey: 'assignee',
        header: 'Assignee',
        cell: ({ row }) => {
          const ticket = row.original;
          if (!ticket.assignee) {
            return (
              <span className="text-sm text-slate-500 dark:text-slate-400 italic">Unassigned</span>
            );
          }

          const avatarValue = ticket.assigneeAvatar?.trim() ?? null;

          return (
            <div className="flex items-center gap-2">
              <AppAvatar
                name={ticket.assignee}
                src={avatarValue}
                className="w-7 h-7"
                fallbackClassName="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700"
              />
              <span className="text-sm text-slate-900 dark:text-white">{ticket.assignee}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'updatedAt',
        header: 'Updated',
        cell: ({ row }) => (
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {row.original.updatedAt}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const ticket = row.original;
          return (
            <TableRowActions
              quickActions={[
                {
                  icon: 'check_circle',
                  label: 'Resolve',
                  variant: 'success',
                  onClick: () => handleSingleResolve(ticket),
                },
                {
                  icon: 'publish',
                  label: 'Escalate',
                  variant: 'danger',
                  onClick: () => handleSingleEscalate(ticket),
                },
              ]}
              dropdownActions={[
                {
                  icon: 'person_add',
                  label: 'Assign to...',
                  onClick: () => handleSingleAssign(ticket),
                },
                {
                  icon: 'flag',
                  label: 'Change Priority',
                  onClick: () => handleSingleChangePriority(ticket),
                },
                {
                  icon: 'history',
                  label: 'View History',
                  onClick: () => handleViewHistory(ticket),
                },
                { id: 'sep-1', icon: '', label: '', onClick: () => {}, separator: true },
                {
                  icon: 'delete',
                  label: 'Delete',
                  variant: 'danger',
                  onClick: () => handleSingleDelete(ticket),
                },
              ]}
            />
          );
        },
      },
    ],
    []
  );

  // =============================================================================
  // Single Action Handlers
  // =============================================================================

  const handleSingleResolve = useCallback((ticket: TicketListItem) => {
    selectedTicketsRef.current = [ticket];
    setShowResolveDialog(true);
  }, []);

  const handleSingleEscalate = useCallback((ticket: TicketListItem) => {
    selectedTicketsRef.current = [ticket];
    setShowEscalateDialog(true);
  }, []);

  const handleSingleAssign = useCallback((ticket: TicketListItem) => {
    selectedTicketsRef.current = [ticket];
    setShowAssignDialog(true);
  }, []);

  const handleSingleChangePriority = useCallback((ticket: TicketListItem) => {
    console.log('Change priority:', ticket.id);
  }, []);

  const handleViewHistory = useCallback((ticket: TicketListItem) => {
    console.log('View history:', ticket.id);
  }, []);

  const handleSingleDelete = useCallback((ticket: TicketListItem) => {
    console.log('Delete ticket:', ticket.id);
  }, []);

  // =============================================================================
  // Bulk Action Handlers
  // =============================================================================

  const handleBulkAssign = useCallback(
    async (assigneeId: string) => {
      const tickets = selectedTicketsRef.current;
      if (tickets.length === 0) return;

      setIsSubmitting(true);
      try {
        await onBulkAction(
          'assign',
          tickets.map((t) => t.id),
          { assigneeId }
        );
      } finally {
        setIsSubmitting(false);
        setShowAssignDialog(false);
      }
    },
    [onBulkAction]
  );

  const handleBulkStatusUpdate = useCallback(
    async (newStatus: string) => {
      const tickets = selectedTicketsRef.current;
      if (tickets.length === 0) return;

      setIsSubmitting(true);
      try {
        await onBulkAction(
          'updateStatus',
          tickets.map((t) => t.id),
          { status: newStatus }
        );
      } finally {
        setIsSubmitting(false);
        setShowStatusDialog(false);
      }
    },
    [onBulkAction]
  );

  const handleBulkResolve = useCallback(async () => {
    const tickets = selectedTicketsRef.current;
    if (tickets.length === 0) return;

    setIsSubmitting(true);
    try {
      await onBulkAction(
        'resolve',
        tickets.map((t) => t.id)
      );
    } finally {
      setIsSubmitting(false);
      setShowResolveDialog(false);
    }
  }, [onBulkAction]);

  const handleBulkEscalate = useCallback(async () => {
    const tickets = selectedTicketsRef.current;
    if (tickets.length === 0) return;

    setIsSubmitting(true);
    try {
      await onBulkAction(
        'escalate',
        tickets.map((t) => t.id)
      );
    } finally {
      setIsSubmitting(false);
      setShowEscalateDialog(false);
    }
  }, [onBulkAction]);

  const handleBulkClose = useCallback(async () => {
    const tickets = selectedTicketsRef.current;
    if (tickets.length === 0) return;

    setIsSubmitting(true);
    try {
      await onBulkAction(
        'close',
        tickets.map((t) => t.id)
      );
    } finally {
      setIsSubmitting(false);
      setShowCloseDialog(false);
    }
  }, [onBulkAction]);

  // Bulk actions configuration
  const bulkActions: BulkAction<TicketListItem>[] = useMemo(
    () => [
      {
        icon: 'person_add',
        label: 'Assign',
        onClick: (selected) => {
          selectedTicketsRef.current = selected;
          setShowAssignDialog(true);
        },
      },
      {
        icon: 'edit',
        label: 'Update Status',
        onClick: (selected) => {
          selectedTicketsRef.current = selected;
          setShowStatusDialog(true);
        },
      },
      {
        icon: 'check_circle',
        label: 'Resolve',
        onClick: (selected) => {
          selectedTicketsRef.current = selected;
          setShowResolveDialog(true);
        },
      },
      {
        icon: 'publish',
        label: 'Escalate',
        onClick: (selected) => {
          selectedTicketsRef.current = selected;
          setShowEscalateDialog(true);
        },
      },
      {
        icon: 'cancel',
        label: 'Close',
        variant: 'danger',
        onClick: (selected) => {
          selectedTicketsRef.current = selected;
          setShowCloseDialog(true);
        },
      },
    ],
    []
  );

  // =============================================================================
  // Loading State
  // =============================================================================

  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Stats Cards Skeleton */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-8 w-12" />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Filters Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20" />
            ))}
          </div>
        </div>

        {/* Table Skeleton */}
        <Card className="p-6">
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <>
      {/* Stats Cards — clickable to filter */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card
          className={cn(
            'p-4 border-border cursor-pointer transition-all duration-200 hover:shadow-md',
            statusFilter === 'OPEN'
              ? 'bg-primary/5 border-primary ring-1 ring-primary/30'
              : 'bg-card hover:bg-accent/50'
          )}
          onClick={() => onStatusChange?.(statusFilter === 'OPEN' ? '' : 'OPEN')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onStatusChange?.(statusFilter === 'OPEN' ? '' : 'OPEN');
            }
          }}
          aria-pressed={statusFilter === 'OPEN'}
          aria-label={`Filter by Open tickets: ${stats.open}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl text-primary">
                confirmation_number
              </span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Open</p>
              <p className="text-2xl font-bold text-foreground">{stats.open}</p>
            </div>
          </div>
        </Card>
        <Card
          className={cn(
            'p-4 border-border cursor-pointer transition-all duration-200 hover:shadow-md',
            statusFilter === 'IN_PROGRESS'
              ? 'bg-amber-500/5 border-amber-500 ring-1 ring-amber-500/30'
              : 'bg-card hover:bg-accent/50'
          )}
          onClick={() => onStatusChange?.(statusFilter === 'IN_PROGRESS' ? '' : 'IN_PROGRESS')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onStatusChange?.(statusFilter === 'IN_PROGRESS' ? '' : 'IN_PROGRESS');
            }
          }}
          aria-pressed={statusFilter === 'IN_PROGRESS'}
          aria-label={`Filter by In Progress tickets: ${stats.inProgress}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl text-amber-500">pending</span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">In Progress</p>
              <p className="text-2xl font-bold text-foreground">{stats.inProgress}</p>
            </div>
          </div>
        </Card>
        <Card
          className={cn(
            'p-4 border-border cursor-pointer transition-all duration-200 hover:shadow-md',
            slaFilter === 'BREACHED'
              ? 'bg-red-500/5 border-red-500 ring-1 ring-red-500/30'
              : 'bg-card hover:bg-accent/50'
          )}
          onClick={() => onSLAChange?.(slaFilter === 'BREACHED' ? 'all' : 'BREACHED')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSLAChange?.(slaFilter === 'BREACHED' ? 'all' : 'BREACHED');
            }
          }}
          aria-pressed={slaFilter === 'BREACHED'}
          aria-label={`Filter by SLA Breached tickets: ${stats.breached}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl text-red-500">timer_off</span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">SLA Breached</p>
              <p className="text-2xl font-bold text-destructive">{stats.breached}</p>
            </div>
          </div>
        </Card>
        <Card
          className={cn(
            'p-4 border-border cursor-pointer transition-all duration-200 hover:shadow-md',
            statusFilter === 'RESOLVED'
              ? 'bg-green-500/5 border-green-500 ring-1 ring-green-500/30'
              : 'bg-card hover:bg-accent/50'
          )}
          onClick={() => onStatusChange?.(statusFilter === 'RESOLVED' ? '' : 'RESOLVED')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onStatusChange?.(statusFilter === 'RESOLVED' ? '' : 'RESOLVED');
            }
          }}
          aria-pressed={statusFilter === 'RESOLVED'}
          aria-label={`Filter by Resolved tickets: ${stats.resolvedToday}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl text-green-500">check_circle</span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Resolved Today</p>
              <p className="text-2xl font-bold text-foreground">{stats.resolvedToday}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search and Filters */}
      <SearchFilterBar
        searchValue={searchValue}
        onSearchChange={onSearchChange ?? (() => {})} // Defensive fallback: prop is optional
        searchPlaceholder="Search by subject, ID, contact, or assignee..."
        searchAriaLabel="Search tickets"
        filters={[
          {
            id: 'status',
            label: 'Status',
            icon: 'label',
            options: ticketStatusOptions(),
            value: statusFilter,
            onChange: onStatusChange ?? (() => {}), // Defensive fallback: prop is optional
          },
          {
            id: 'priority',
            label: 'Priority',
            icon: 'flag',
            options: ticketPriorityOptions(),
            value: priorityFilter,
            onChange: onPriorityChange ?? (() => {}), // Defensive fallback: prop is optional
          },
        ]}
        filterChips={{
          options: slaStatusChips(),
          value: slaFilter,
          onChange: onSLAChange ?? (() => {}), // Defensive fallback: prop is optional
        }}
        sort={{
          options: SORT_OPTIONS,
          value: sortValue,
          onChange: onSortChange ?? (() => {}), // Defensive fallback: prop is optional
        }}
      />

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={tickets}
        emptyMessage="No tickets match your filters"
        emptyIcon="confirmation_number"
        onRowClick={onRowClick}
        enableRowSelection
        bulkActions={bulkActions}
        pageSize={pagination.limit}
      />

      {/* Bulk Assign Dialog */}
      <StatusSelectDialog
        open={showAssignDialog}
        onOpenChange={setShowAssignDialog}
        title="Assign Tickets"
        description={`Select a team member to assign ${selectedTicketsRef.current.length} selected ticket(s).`}
        options={ASSIGNEE_OPTIONS}
        onConfirm={handleBulkAssign}
        isLoading={isSubmitting}
      />

      {/* Bulk Status Update Dialog */}
      <StatusSelectDialog
        open={showStatusDialog}
        onOpenChange={setShowStatusDialog}
        title="Update Ticket Status"
        description={`Select a new status for ${selectedTicketsRef.current.length} selected ticket(s).`}
        options={TICKET_STATUS_OPTIONS}
        onConfirm={handleBulkStatusUpdate}
        isLoading={isSubmitting}
      />

      {/* Bulk Resolve Confirmation Dialog */}
      <ConfirmationDialog
        open={showResolveDialog}
        onOpenChange={setShowResolveDialog}
        title="Resolve Tickets"
        description={`Are you sure you want to mark ${selectedTicketsRef.current.length} selected ticket(s) as resolved?`}
        confirmLabel="Resolve"
        onConfirm={handleBulkResolve}
        isLoading={isSubmitting}
        icon="check_circle"
      />

      {/* Bulk Escalate Confirmation Dialog */}
      <ConfirmationDialog
        open={showEscalateDialog}
        onOpenChange={setShowEscalateDialog}
        title="Escalate Tickets"
        description={`Are you sure you want to escalate ${selectedTicketsRef.current.length} selected ticket(s) to CRITICAL priority? This will notify management.`}
        confirmLabel="Escalate"
        onConfirm={handleBulkEscalate}
        variant="destructive"
        isLoading={isSubmitting}
        icon="publish"
      />

      {/* Bulk Close Confirmation Dialog */}
      <ConfirmationDialog
        open={showCloseDialog}
        onOpenChange={setShowCloseDialog}
        title="Close Tickets"
        description={`Are you sure you want to close ${selectedTicketsRef.current.length} selected ticket(s)? Closed tickets cannot be reopened.`}
        confirmLabel="Close"
        onConfirm={handleBulkClose}
        variant="destructive"
        isLoading={isSubmitting}
        icon="cancel"
      />
    </>
  );
}
