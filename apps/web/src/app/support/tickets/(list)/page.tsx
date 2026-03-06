'use client';

/**
 * Support Tickets List Page (PG-046)
 *
 * Support-agent-focused ticket listing at /support/tickets/.
 * Default sort: slaResolutionDue ASC (SLA urgency first).
 * Excludes ARCHIVED tickets. Limited bulk actions (no Escalate/Close).
 *
 * @implements AC-001 (List page loads data from api.ticket.list)
 * @implements AC-002 (Default sort slaResolutionDue ASC, excludes ARCHIVED)
 * @implements AC-003 (Search filter with 400ms debounce)
 * @implements AC-004 (Status, Priority, SLA Status dropdown filters)
 * @implements AC-006 (Row click navigates to /support/tickets/{id})
 * @implements AC-010 (Loading skeletons while data loads)
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useEffect } from 'react';
import { toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { SupportTicketList } from '@/components/tickets/ticket-list';
import type { TicketStats, TicketFilterOptions } from '@/components/tickets';
import type { SupportBulkActionType } from '@/components/tickets/ticket-list';
import { useTicketFilters } from '@/hooks/useTicketFilters';
import { api } from '@/lib/api';
import { mapTicketListItems } from '@/lib/tickets/ticket-detail-mapper';

const defaultStats: TicketStats = { open: 0, inProgress: 0, breached: 0, resolvedToday: 0 };
const defaultFilterOptions: TicketFilterOptions = {
  statuses: [],
  priorities: [],
  slaStatuses: [],
};

export default function SupportTicketsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get('view');

  const {
    filters,
    queryParams,
    setSearch,
    setStatusFilter,
    setPriorityFilter,
    setSLAFilter,
    setSort,
    setPage,
  } = useTicketFilters({ sortBy: 'slaResolutionDue', sortOrder: 'asc' });

  const utils = api.useUtils();

  // Sidebar view param wiring
  useEffect(() => {
    if (!view) return;
    switch (view) {
      case 'breached':
        setSLAFilter('BREACHED');
        break;
      case 'at-risk':
        setSLAFilter('AT_RISK');
        break;
      // 'my' and 'unassigned' views will be wired when
      // assignee filtering is added to useTicketFilters
    }
  }, [view, setSLAFilter]);

  // tRPC queries
  const { data, isLoading } = api.ticket.list.useQuery(queryParams as never, {
    placeholderData: ((prev: unknown) => prev) as never,
  });
  const { data: rawStats } = api.ticket.stats.useQuery({});
  const { data: filterOptions } = api.ticket.filterOptions.useQuery();

  // Map and filter tickets — exclude ARCHIVED (AC-002)
  const tickets = useMemo(() => {
    const mapped = mapTicketListItems((data as Record<string, unknown>)?.tickets);
    // Client-side ARCHIVED exclusion for support agent operational queue.
    // Backend filtering could be added for performance if needed.
    return mapped.filter((t: { status: string }) => t.status !== 'ARCHIVED');
  }, [data]);

  // Map API stats shape to UI TicketStats shape
  const stats: TicketStats = useMemo(() => {
    if (!rawStats) return defaultStats;
    const s = rawStats as Record<string, unknown>;
    const byStatus = (s.byStatus as Record<string, number>) ?? {};
    return {
      open: byStatus['OPEN'] ?? 0,
      inProgress: byStatus['IN_PROGRESS'] ?? 0,
      breached: (s.slaBreached as number) ?? 0,
      resolvedToday: (s.resolvedToday as number) ?? 0,
      slaBreakdown: (s.bySLAStatus as Record<string, number>) ?? undefined,
    };
  }, [rawStats]);

  // Bulk mutation hooks — only 3 for support context (AC-007)
  const bulkAssignMutation = api.ticket.bulkAssign.useMutation({
    onSuccess: () => {
      utils.ticket.list.invalidate();
      utils.ticket.stats.invalidate();
    },
  });
  const bulkUpdateStatusMutation = api.ticket.bulkUpdateStatus.useMutation({
    onSuccess: () => {
      utils.ticket.list.invalidate();
      utils.ticket.stats.invalidate();
    },
  });
  const bulkResolveMutation = api.ticket.bulkResolve.useMutation({
    onSuccess: () => {
      utils.ticket.list.invalidate();
      utils.ticket.stats.invalidate();
    },
  });

  const handleBulkAction = async (
    action: SupportBulkActionType,
    ticketIds: string[],
    params?: Record<string, unknown>
  ) => {
    try {
      let result: { updated: number };
      switch (action) {
        case 'assign':
          result = await bulkAssignMutation.mutateAsync({
            ticketIds,
            assigneeId: params?.assigneeId as string,
          });
          break;
        case 'updateStatus':
          result = await bulkUpdateStatusMutation.mutateAsync({
            ticketIds,
            status: params?.status,
          } as never);
          break;
        case 'resolve':
          result = await bulkResolveMutation.mutateAsync({ ticketIds });
          break;
        default:
          return;
      }

      if (result.updated > 0) {
        toast({
          title: `${action} completed`,
          description: `${result.updated} ticket(s) updated.`,
        });
      }
      const failedCount = ticketIds.length - result.updated;
      if (failedCount > 0) {
        toast({
          title: 'Some actions failed',
          description: `${failedCount} ticket(s) could not be updated.`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Action Failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Support', href: '/support' }, { label: 'Tickets' }]}
        title="Support Tickets"
        description="Monitor real-time SLA compliance and prioritize urgent customer issues"
        actions={[
          {
            label: 'New Ticket',
            icon: 'add',
            variant: 'primary',
            href: '/support/tickets/new',
          },
        ]}
      />
      <SupportTicketList
        tickets={tickets}
        total={((data as Record<string, unknown>)?.total as number) ?? 0}
        isLoading={isLoading}
        stats={stats}
        filterOptions={filterOptions ?? defaultFilterOptions}
        onRowClick={(t: { id: string }) => router.push(`/support/tickets/${t.id}`)}
        onBulkAction={handleBulkAction}
        pagination={{ page: filters.page, limit: filters.limit, onPageChange: setPage }}
        searchValue={filters.search}
        onSearchChange={setSearch}
        statusFilter={filters.status}
        onStatusChange={(v: string) => setStatusFilter(v as never)}
        priorityFilter={filters.priority}
        onPriorityChange={(v: string) => setPriorityFilter(v as never)}
        slaFilter={filters.slaStatus}
        onSLAChange={(v: string) => setSLAFilter(v as never)}
        sortValue={filters.sortBy}
        onSortChange={(v: string) => setSort(v)}
      />
    </>
  );
}
