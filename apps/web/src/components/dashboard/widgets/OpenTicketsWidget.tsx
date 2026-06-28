'use client';

import { useMemo } from 'react';
import { api } from '@/lib/api';
import { DASHBOARD_REFETCH_INTERVAL_MS, computeTicketUrgent } from '@/lib/dashboard/kpi-calculator';
import type { WidgetProps } from './index';

/**
 * SLA-aware Open Tickets Widget
 * Uses real SLA calculations from lib/tickets/sla-service.ts (IFC-093)
 */

interface TicketMetrics {
  total: number;
  urgent: number;
  breached: number;
}

export function OpenTicketsWidget(_props: Readonly<WidgetProps>) {
  const { data, isLoading } = api.ticket.stats.useQuery(
    { timeWindow: 'all' },
    { refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS }
  );

  const metrics = useMemo<TicketMetrics>(
    () => ({
      total: data?.total ?? 0,
      urgent: computeTicketUrgent(data?.bySLAStatus),
      breached: data?.slaBreached ?? 0,
    }),
    [data]
  );

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-start justify-between">
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-2xl text-primary" aria-hidden="true">
            confirmation_number
          </span>
        </div>
        {!isLoading && data && (
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-destructive-muted text-destructive">
            {metrics.urgent} Urgent
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground mt-4">Open Tickets</p>
      <p className="text-3xl font-bold text-foreground mt-1 tabular-nums">
        {isLoading ? '...' : metrics.total}
      </p>
      {metrics.breached > 0 && (
        <p className="text-xs text-destructive mt-2">
          {metrics.breached} SLA breach{metrics.breached === 1 ? '' : 'es'}
        </p>
      )}
    </div>
  );
}
