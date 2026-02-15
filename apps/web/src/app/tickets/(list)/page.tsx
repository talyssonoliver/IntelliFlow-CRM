'use client';

/**
 * Tickets List Page — tRPC integration wrapper (PG-137)
 *
 * Thin wrapper that fetches data via tRPC and delegates rendering
 * to the TicketList extracted component.
 *
 * @implements AC-1 (List page loads real data from api.ticket.list)
 * @implements AC-2 (Stats from api.ticket.stats)
 * @implements AC-3 (Filters from api.ticket.filterOptions)
 * @implements AC-6 (Bulk actions work end-to-end)
 */

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { TicketList } from '@/components/tickets';
import type { BulkActionType, TicketStats, TicketFilterOptions } from '@/components/tickets';
import { useTicketFilters } from '@/hooks/useTicketFilters';
import { api } from '@/lib/api';
import { mapTicketListItems } from '@/lib/tickets/ticket-detail-mapper';

const defaultStats: TicketStats = { open: 0, inProgress: 0, breached: 0, resolvedToday: 0 };
const defaultFilterOptions: TicketFilterOptions = {
  statuses: [],
  priorities: [],
  slaStatuses: [],
  assignees: [],
  categories: [],
};

export default function TicketsPage() {
  const router = useRouter();
  const {
    filters,
    queryParams,
    setSearch,
    setStatusFilter,
    setPriorityFilter,
    setSLAFilter,
    setSort,
    setPage,
  } = useTicketFilters();

  const utils = api.useUtils();

  // tRPC queries
  const { data, isLoading } = api.ticket.list.useQuery(queryParams as never, {
    placeholderData: ((prev: unknown) => prev) as never,
  });
  const { data: rawStats } = api.ticket.stats.useQuery({});
  const { data: filterOptions } = api.ticket.filterOptions.useQuery();
  const tickets = useMemo(
    () => mapTicketListItems((data as Record<string, unknown>)?.tickets),
    [data]
  );

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

  // Bulk mutation hooks
  const bulkAssignMutation = api.ticket.bulkAssign.useMutation({
    onSuccess: () => { utils.ticket.list.invalidate(); utils.ticket.stats.invalidate(); },
  });
  const bulkUpdateStatusMutation = api.ticket.bulkUpdateStatus.useMutation({
    onSuccess: () => { utils.ticket.list.invalidate(); utils.ticket.stats.invalidate(); },
  });
  const bulkResolveMutation = api.ticket.bulkResolve.useMutation({
    onSuccess: () => { utils.ticket.list.invalidate(); utils.ticket.stats.invalidate(); },
  });
  const bulkEscalateMutation = api.ticket.bulkEscalate.useMutation({
    onSuccess: () => { utils.ticket.list.invalidate(); utils.ticket.stats.invalidate(); },
  });
  const bulkCloseMutation = api.ticket.bulkClose.useMutation({
    onSuccess: () => { utils.ticket.list.invalidate(); utils.ticket.stats.invalidate(); },
  });

  const handleBulkAction = async (action: BulkActionType, ticketIds: string[], params?: Record<string, unknown>) => {
    try {
      let result: { updated: number };
      switch (action) {
        case 'assign':
          result = await bulkAssignMutation.mutateAsync({ ticketIds, assigneeId: params?.assigneeId as string });
          break;
        case 'updateStatus':
          result = await bulkUpdateStatusMutation.mutateAsync({ ticketIds, status: params?.status } as never);
          break;
        case 'resolve':
          result = await bulkResolveMutation.mutateAsync({ ticketIds });
          break;
        case 'escalate':
          result = await bulkEscalateMutation.mutateAsync({ ticketIds });
          break;
        case 'close':
          result = await bulkCloseMutation.mutateAsync({ ticketIds });
          break;
        default:
          return;
      }

      if (result.updated > 0) {
        toast({ title: `${action} completed`, description: `${result.updated} ticket(s) updated.` });
      }
      const failedCount = ticketIds.length - result.updated;
      if (failedCount > 0) {
        toast({ title: 'Some actions failed', description: `${failedCount} ticket(s) could not be updated.`, variant: 'destructive' });
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
      <TicketList
        tickets={tickets}
        total={((data as Record<string, unknown>)?.total as number) ?? 0}
        isLoading={isLoading}
        stats={stats}
        filterOptions={(filterOptions as unknown as TicketFilterOptions) ?? defaultFilterOptions}
        onRowClick={(t) => router.push(`/tickets/${t.id}`)}
        onBulkAction={handleBulkAction}
        pagination={{ page: filters.page, limit: filters.limit, onPageChange: setPage }}
        searchValue={filters.search}
        onSearchChange={setSearch}
        statusFilter={filters.status}
        onStatusChange={(v) => setStatusFilter(v as never)}
        priorityFilter={filters.priority}
        onPriorityChange={(v) => setPriorityFilter(v as never)}
        slaFilter={filters.slaStatus}
        onSLAChange={(v) => setSLAFilter(v as never)}
        sortValue={filters.sortBy}
        onSortChange={(v) => setSort(v)}
      />
    </>
  );
}
