'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import {
  Card,
  DataTable,
  TableRowActions,
  type BulkAction,
  ConfirmationDialog,
  StatusSelectDialog,
  type StatusOption,
  toast,
} from '@intelliflow/ui';
import { type TicketStatus, type TicketPriority, type SLAStatus } from '@intelliflow/domain';
import { PageHeader, SearchFilterBar } from '@/components/shared';
import { ticketStatusOptions, ticketPriorityOptions, slaStatusChips } from '@/lib/shared/filter-utils';
import { SLAStatusBadge as SLAStatusBadgeModule } from '../../../../lib/tickets/sla-badge';
import { api } from '@/lib/api';

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  slaStatus: SLAStatus;
  slaTimeRemaining: number; // minutes (negative = breached)
  contactName: string;
  contactEmail: string;
  assignee: string | null;
  assigneeAvatar: string | null;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Sample Data with SLA
// =============================================================================

const SAMPLE_TICKETS: Ticket[] = [
  {
    id: 'T-10924',
    subject: 'System Outage: West Region',
    description: 'Multiple customers reporting connectivity issues',
    status: 'OPEN',
    priority: 'CRITICAL',
    slaStatus: 'BREACHED',
    slaTimeRemaining: -134,
    contactName: 'Robert Chen',
    contactEmail: 'r.chen@acmecorp.com',
    assignee: 'Sarah Jenkins',
    assigneeAvatar: 'SJ',
    createdAt: '2 hours ago',
    updatedAt: '10 mins ago',
  },
  {
    id: 'T-10921',
    subject: 'Login Failure for Enterprise Account',
    description: 'SSO authentication failing for GlobalTech',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    slaStatus: 'AT_RISK',
    slaTimeRemaining: 45,
    contactName: 'David Kim',
    contactEmail: 'd.kim@globaltech.com',
    assignee: 'Mike Ross',
    assigneeAvatar: 'MR',
    createdAt: '3 hours ago',
    updatedAt: '1h ago',
  },
  {
    id: 'T-10899',
    subject: 'Feature Request: Dark Mode',
    description: 'Customer requesting dark mode for dashboard',
    status: 'OPEN',
    priority: 'LOW',
    slaStatus: 'ON_TRACK',
    slaTimeRemaining: 1330,
    contactName: 'Amanda Wilson',
    contactEmail: 'a.wilson@startup.io',
    assignee: null,
    assigneeAvatar: null,
    createdAt: '5 hours ago',
    updatedAt: '3h ago',
  },
  {
    id: 'T-10887',
    subject: 'Billing Inquiry - Nov Invoice',
    description: 'Question about charges on November invoice',
    status: 'OPEN',
    priority: 'MEDIUM',
    slaStatus: 'ON_TRACK',
    slaTimeRemaining: 262,
    contactName: 'Elena Rodriguez',
    contactEmail: 'elena@fintech.io',
    assignee: 'David Kim',
    assigneeAvatar: 'DK',
    createdAt: 'Yesterday',
    updatedAt: 'Yesterday',
  },
  {
    id: 'T-10755',
    subject: 'Integration API 500 Error',
    description: 'REST API returning 500 errors on POST requests',
    status: 'IN_PROGRESS',
    priority: 'CRITICAL',
    slaStatus: 'BREACHED',
    slaTimeRemaining: -725,
    contactName: 'James Wilson',
    contactEmail: 'j.wilson@techstart.com',
    assignee: 'Alex Morgan',
    assigneeAvatar: 'AM',
    createdAt: '2 days ago',
    updatedAt: '2 days ago',
  },
  {
    id: 'T-10742',
    subject: 'Dashboard Performance Issues',
    description: 'Slow loading times during peak hours',
    status: 'OPEN',
    priority: 'HIGH',
    slaStatus: 'AT_RISK',
    slaTimeRemaining: 28,
    contactName: 'Michael Brown',
    contactEmail: 'm.brown@enterprise.com',
    assignee: 'Sarah Jenkins',
    assigneeAvatar: 'SJ',
    createdAt: '1 day ago',
    updatedAt: '6h ago',
  },
  {
    id: 'T-10698',
    subject: 'Awaiting Customer Response',
    description: 'Requested additional logs from customer',
    status: 'WAITING_ON_CUSTOMER',
    priority: 'MEDIUM',
    slaStatus: 'ON_TRACK',
    slaTimeRemaining: 480,
    contactName: 'Lisa Park',
    contactEmail: 'l.park@techstart.com',
    assignee: 'Mike Ross',
    assigneeAvatar: 'MR',
    createdAt: '3 days ago',
    updatedAt: '1 day ago',
  },
  {
    id: 'T-10654',
    subject: 'Account Upgrade Request',
    description: 'Customer requested upgrade to enterprise plan',
    status: 'PENDING',
    priority: 'LOW',
    slaStatus: 'ON_TRACK',
    slaTimeRemaining: 1200,
    contactName: 'Tom Richards',
    contactEmail: 't.richards@startup.io',
    assignee: 'David Kim',
    assigneeAvatar: 'DK',
    createdAt: '4 days ago',
    updatedAt: '2 days ago',
  },
];

// =============================================================================
// Utility Functions
// =============================================================================

function formatSLATime(minutes: number): string {
  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;
  const sign = minutes < 0 ? '-' : '';
  return `${sign}${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`;
}

function getSLAConfig(status: SLAStatus) {
  switch (status) {
    case 'BREACHED':
      return {
        bgColor: 'bg-red-50 dark:bg-red-900/20',
        textColor: 'text-red-600 dark:text-red-400',
        icon: 'timer_off',
      };
    case 'AT_RISK':
      return {
        bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
        textColor: 'text-yellow-700 dark:text-yellow-400',
        icon: 'timelapse',
      };
    case 'ON_TRACK':
      return {
        bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
        textColor: 'text-emerald-600 dark:text-emerald-400',
        icon: 'schedule',
      };
    case 'MET':
      return {
        bgColor: 'bg-green-50 dark:bg-green-900/20',
        textColor: 'text-green-600 dark:text-green-400',
        icon: 'check_circle',
      };
    case 'PAUSED':
      return {
        bgColor: 'bg-slate-50 dark:bg-slate-900/20',
        textColor: 'text-slate-600 dark:text-slate-400',
        icon: 'pause_circle',
      };
  }
}

function getPriorityConfig(priority: TicketPriority) {
  switch (priority) {
    case 'CRITICAL':
      return { color: 'text-red-600 dark:text-red-400', icon: 'priority_high', label: 'Critical' };
    case 'HIGH':
      return { color: 'text-orange-600 dark:text-orange-400', icon: 'arrow_upward', label: 'High' };
    case 'MEDIUM':
      return { color: 'text-slate-600 dark:text-slate-400', icon: 'remove', label: 'Medium' };
    case 'LOW':
      return { color: 'text-slate-500 dark:text-slate-400', icon: 'arrow_downward', label: 'Low' };
  }
}

// =============================================================================
// SLA Timer Component
// =============================================================================

function SLATimer({ slaStatus, timeRemaining }: { slaStatus: SLAStatus; timeRemaining: number }) {
  const config = getSLAConfig(slaStatus);

  return (
    <div
      className={`flex items-center gap-1.5 font-mono font-bold text-sm ${config.bgColor} ${config.textColor} px-2 py-1 rounded w-fit`}
    >
      <span className="material-symbols-outlined text-[16px]">{config.icon}</span>
      {formatSLATime(timeRemaining)}
    </div>
  );
}

// =============================================================================
// SLA Status Badge Component
// =============================================================================

function SLAStatusBadge({ slaStatus }: { slaStatus: SLAStatus }) {
  return <SLAStatusBadgeModule status={slaStatus} size="md" />;
}

// =============================================================================
// Priority Badge Component
// =============================================================================

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const config = getPriorityConfig(priority);

  return (
    <div className={`flex items-center gap-1.5 font-semibold text-xs uppercase ${config.color}`}>
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
// Sort Options (not domain-driven)
// =============================================================================

const SORT_OPTIONS = [
  { value: 'updated', label: 'Recently Updated' },
  { value: 'created', label: 'Newest First' },
  { value: 'sla', label: 'SLA Priority' },
];

// =============================================================================
// Column Definitions
// =============================================================================

const columns: ColumnDef<Ticket>[] = [
  {
    accessorKey: 'id',
    header: 'Ticket',
    cell: ({ row }) => {
      const ticket = row.original;
      return (
        <div>
          <span className="font-bold text-primary text-sm">#{ticket.id}</span>
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
      <SLATimer slaStatus={row.original.slaStatus} timeRemaining={row.original.slaTimeRemaining} />
    ),
  },
  {
    accessorKey: 'slaStatus',
    header: 'SLA Status',
    cell: ({ row }) => <SLAStatusBadge slaStatus={row.original.slaStatus} />,
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
        return <span className="text-sm text-slate-500 dark:text-slate-400 italic">Unassigned</span>;
      }
      return (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
            {ticket.assigneeAvatar}
          </div>
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
              onClick: () => console.log('Resolve ticket:', ticket.id),
            },
            {
              icon: 'publish',
              label: 'Escalate',
              variant: 'danger',
              onClick: () => console.log('Escalate ticket:', ticket.id),
            },
          ]}
          dropdownActions={[
            {
              icon: 'person_add',
              label: 'Assign to...',
              onClick: () => console.log('Assign ticket:', ticket.id),
            },
            {
              icon: 'flag',
              label: 'Change Priority',
              onClick: () => console.log('Change priority:', ticket.id),
            },
            {
              icon: 'history',
              label: 'View History',
              onClick: () => console.log('View history:', ticket.id),
            },
            { id: 'sep-1', icon: '', label: '', onClick: () => {}, separator: true },
            {
              icon: 'delete',
              label: 'Delete',
              variant: 'danger',
              onClick: () => console.log('Delete ticket:', ticket.id),
            },
          ]}
        />
      );
    },
  },
];

// =============================================================================
// Ticket Status Options for Dialog
// =============================================================================

const TICKET_STATUS_OPTIONS: StatusOption[] = [
  { value: 'OPEN', label: 'Open', color: 'blue', icon: 'inbox', description: 'Ticket awaiting action' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'amber', icon: 'pending', description: 'Actively being worked on' },
  { value: 'PENDING', label: 'Pending', color: 'slate', icon: 'schedule', description: 'On hold, waiting for internal action' },
  { value: 'WAITING_ON_CUSTOMER', label: 'Waiting on Customer', color: 'purple', icon: 'person', description: 'Awaiting customer response' },
  { value: 'RESOLVED', label: 'Resolved', color: 'green', icon: 'check_circle', description: 'Issue has been resolved' },
  { value: 'CLOSED', label: 'Closed', color: 'slate', icon: 'cancel', description: 'Ticket is closed' },
];

// Team members for assignment dialog
const ASSIGNEE_OPTIONS: StatusOption[] = [
  { value: 'sarah-jenkins', label: 'Sarah Jenkins', color: 'blue', icon: 'person', description: 'Support Lead' },
  { value: 'mike-ross', label: 'Mike Ross', color: 'green', icon: 'person', description: 'Senior Support Agent' },
  { value: 'alex-morgan', label: 'Alex Morgan', color: 'purple', icon: 'person', description: 'Technical Support' },
  { value: 'david-kim', label: 'David Kim', color: 'amber', icon: 'person', description: 'Support Agent' },
  { value: 'unassigned', label: 'Unassigned', color: 'slate', icon: 'person_off', description: 'Remove assignment' },
];

// =============================================================================
// Main Tickets Page Component
// =============================================================================

export default function TicketsPage() {
  const router = useRouter();
  const [activeSLAFilter, setActiveSLAFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('updated');

  // Dialog state for bulk actions
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [showEscalateDialog, setShowEscalateDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  // Track selected tickets for bulk actions
  const selectedTicketsRef = useRef<Ticket[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // tRPC mutations (for bulk actions)
  const bulkAssignMutation = api.ticket.bulkAssign.useMutation();
  const bulkUpdateStatusMutation = api.ticket.bulkUpdateStatus.useMutation();
  const bulkResolveMutation = api.ticket.bulkResolve.useMutation();
  const bulkEscalateMutation = api.ticket.bulkEscalate.useMutation();
  const bulkCloseMutation = api.ticket.bulkClose.useMutation();

  // Calculate stats
  const stats = useMemo(() => {
    return {
      open: SAMPLE_TICKETS.filter((t) => t.status === 'OPEN').length,
      inProgress: SAMPLE_TICKETS.filter((t) => t.status === 'IN_PROGRESS').length,
      breached: SAMPLE_TICKETS.filter((t) => t.slaStatus === 'BREACHED').length,
      resolvedToday: 7,
    };
  }, []);

  // Filter tickets using domain-derived filter values
  const filteredTickets = useMemo(() => {
    return SAMPLE_TICKETS.filter((ticket) => {
      const matchesSearch =
        searchQuery === '' ||
        ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.contactName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === '' || ticket.status === statusFilter;
      const matchesPriority = priorityFilter === '' || ticket.priority === priorityFilter;

      // SLA filter uses domain values: ON_TRACK, AT_RISK, BREACHED, MET, PAUSED
      let matchesSLA = true;
      if (activeSLAFilter !== 'all') {
        matchesSLA = ticket.slaStatus === activeSLAFilter;
      }

      return matchesSearch && matchesStatus && matchesPriority && matchesSLA;
    });
  }, [searchQuery, statusFilter, priorityFilter, activeSLAFilter]);

  // =============================================================================
  // Bulk Action Handlers
  // =============================================================================

  const handleBulkStatusUpdate = useCallback(
    async (newStatus: string) => {
      const tickets = selectedTicketsRef.current;
      if (tickets.length === 0) return;

      setIsSubmitting(true);
      try {
        const result = await bulkUpdateStatusMutation.mutateAsync({
          ids: tickets.map((t) => t.id),
          status: newStatus as TicketStatus,
        });

        if (result.successful.length > 0) {
          toast({
            title: 'Status Updated',
            description: `Successfully updated ${result.successful.length} ticket(s) to "${newStatus}".`,
          });
        }

        if (result.failed.length > 0) {
          toast({
            title: 'Some updates failed',
            description: `${result.failed.length} ticket(s) could not be updated.`,
            variant: 'destructive',
          });
        }
      } catch (error) {
        toast({
          title: 'Status Update Failed',
          description: error instanceof Error ? error.message : 'An unexpected error occurred',
          variant: 'destructive',
        });
      } finally {
        setIsSubmitting(false);
        setShowStatusDialog(false);
      }
    },
    [bulkUpdateStatusMutation]
  );

  const handleBulkResolve = useCallback(async () => {
    const tickets = selectedTicketsRef.current;
    if (tickets.length === 0) return;

    setIsSubmitting(true);
    try {
      const result = await bulkResolveMutation.mutateAsync({
        ids: tickets.map((t) => t.id),
      });

      if (result.successful.length > 0) {
        toast({
          title: 'Tickets Resolved',
          description: `Successfully resolved ${result.successful.length} ticket(s).`,
        });
      }

      if (result.failed.length > 0) {
        const firstFailed = result.failed[0] as { id: string; error?: string } | undefined;
        toast({
          title: 'Some tickets could not be resolved',
          description: `${result.failed.length} ticket(s) failed: ${firstFailed?.error ?? 'Unknown error'}`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Resolve Failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setShowResolveDialog(false);
    }
  }, [bulkResolveMutation]);

  const handleBulkEscalate = useCallback(async () => {
    const tickets = selectedTicketsRef.current;
    if (tickets.length === 0) return;

    setIsSubmitting(true);
    try {
      const result = await bulkEscalateMutation.mutateAsync({
        ids: tickets.map((t) => t.id),
      });

      if (result.successful.length > 0) {
        toast({
          title: 'Tickets Escalated',
          description: `Successfully escalated ${result.successful.length} ticket(s) to CRITICAL priority.`,
        });
      }

      if (result.failed.length > 0) {
        const firstFailed = result.failed[0] as { id: string; error?: string } | undefined;
        toast({
          title: 'Some tickets could not be escalated',
          description: `${result.failed.length} ticket(s) failed: ${firstFailed?.error ?? 'Unknown error'}`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Escalate Failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setShowEscalateDialog(false);
    }
  }, [bulkEscalateMutation]);

  const handleBulkClose = useCallback(async () => {
    const tickets = selectedTicketsRef.current;
    if (tickets.length === 0) return;

    setIsSubmitting(true);
    try {
      const result = await bulkCloseMutation.mutateAsync({
        ids: tickets.map((t) => t.id),
      });

      if (result.successful.length > 0) {
        toast({
          title: 'Tickets Closed',
          description: `Successfully closed ${result.successful.length} ticket(s).`,
        });
      }

      if (result.failed.length > 0) {
        const firstFailed = result.failed[0] as { id: string; error?: string } | undefined;
        toast({
          title: 'Some tickets could not be closed',
          description: `${result.failed.length} ticket(s) failed: ${firstFailed?.error ?? 'Unknown error'}`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Close Failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setShowCloseDialog(false);
    }
  }, [bulkCloseMutation]);

  const handleBulkAssign = useCallback(
    async (assigneeId: string) => {
      const tickets = selectedTicketsRef.current;
      if (tickets.length === 0) return;

      setIsSubmitting(true);
      try {
        const result = await bulkAssignMutation.mutateAsync({
          ids: tickets.map((t) => t.id),
          assigneeId,
        });

        if (result.successful.length > 0) {
          toast({
            title: 'Tickets Assigned',
            description: `Successfully assigned ${result.successful.length} ticket(s).`,
          });
        }

        if (result.failed.length > 0) {
          const firstFailed = result.failed[0] as { id: string; error?: string } | undefined;
          toast({
            title: 'Some tickets could not be assigned',
            description: `${result.failed.length} ticket(s) failed: ${firstFailed?.error ?? 'Unknown error'}`,
            variant: 'destructive',
          });
        }
      } catch (error) {
        toast({
          title: 'Assign Failed',
          description: error instanceof Error ? error.message : 'An unexpected error occurred',
          variant: 'destructive',
        });
      } finally {
        setIsSubmitting(false);
        setShowAssignDialog(false);
      }
    },
    [bulkAssignMutation]
  );

  // Bulk actions for selected tickets
  const bulkActions: BulkAction<Ticket>[] = useMemo(
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

  return (
    <>
      {/* Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Tickets' },
        ]}
        title="Support Tickets"
        description="Monitor real-time SLA compliance and prioritize urgent customer issues"
        actions={[
          {
            label: 'Analytics',
            icon: 'analytics',
            variant: 'secondary',
            href: '/tickets/analytics',
            hideOnMobile: true,
          },
          {
            label: 'New Ticket',
            icon: 'add',
            variant: 'primary',
            href: '/tickets/new',
          },
        ]}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl text-primary">confirmation_number</span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Open</p>
              <p className="text-2xl font-bold text-foreground">{stats.open}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-card border-border">
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
        <Card className="p-4 bg-card border-border">
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
        <Card className="p-4 bg-card border-border">
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

      {/* Search and Filters - Using unified SearchFilterBar with schema-derived options */}
      <SearchFilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search tickets by subject, ID, or contact..."
        searchAriaLabel="Search tickets"
        filters={[
          {
            id: 'status',
            label: 'Status',
            icon: 'label',
            options: ticketStatusOptions(),
            value: statusFilter,
            onChange: setStatusFilter,
          },
          {
            id: 'priority',
            label: 'Priority',
            icon: 'flag',
            options: ticketPriorityOptions(),
            value: priorityFilter,
            onChange: setPriorityFilter,
          },
        ]}
        filterChips={{
          options: slaStatusChips(),
          value: activeSLAFilter,
          onChange: setActiveSLAFilter,
        }}
        sort={{
          options: SORT_OPTIONS,
          value: sortOrder,
          onChange: setSortOrder,
        }}
      />

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filteredTickets}
        emptyMessage="No tickets match your filters"
        emptyIcon="confirmation_number"
        onRowClick={handleRowClick}
        enableRowSelection
        bulkActions={bulkActions}
        pageSize={10}
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

  // Handle row click - navigate to ticket detail
  function handleRowClick(ticket: Ticket) {
    router.push(`/tickets/${ticket.id}`);
  }
}
