'use client';

import { useMemo } from 'react';
import { api } from '@/lib/api';
import { DASHBOARD_REFETCH_INTERVAL_MS, computeTicketUrgent } from '@/lib/dashboard/kpi-calculator';
import { KpiCard } from '../KpiCard';
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
  const { data, isLoading, isError } = api.ticket.stats.useQuery(
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

  // No data yet (loading or disabled/error) — show pending, never a fake 0.
  const pending = !isError && (isLoading || !data);

  return (
    <KpiCard
      label="Open Tickets"
      icon="confirmation_number"
      iconClassName="bg-primary/10 text-primary"
      pending={pending}
      failed={isError}
      value={metrics.total}
      // Nothing urgent is not an alarm: the red pill shows only for 1 or more.
      badge={
        pending || metrics.urgent === 0 ? undefined : (
          <span className="px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap bg-destructive-muted text-destructive">
            {metrics.urgent} Urgent
          </span>
        )
      }
      footer={
        metrics.breached > 0 ? (
          <p className="text-xs text-destructive mt-2">
            {metrics.breached} SLA breach{metrics.breached === 1 ? '' : 'es'}
          </p>
        ) : undefined
      }
    />
  );
}
