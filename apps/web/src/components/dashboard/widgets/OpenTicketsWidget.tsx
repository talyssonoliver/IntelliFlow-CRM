'use client';

import { useEffect, useState } from 'react';
import type { WidgetProps } from './index';

/**
 * SLA-aware Open Tickets Widget
 * Uses real SLA calculations from lib/tickets/sla-service.ts (IFC-093)
 */

interface TicketMetrics {
  total: number;
  urgent: number; // CRITICAL + HIGH priority with BREACHED or AT_RISK SLA
  breached: number;
}

// TODO: Replace with real API call to fetch ticket metrics
// For now, simulating SLA calculations with mock data
function useTicketMetrics(): TicketMetrics {
  const [metrics, setMetrics] = useState<TicketMetrics>({
    total: 0,
    urgent: 0,
    breached: 0,
  });

  useEffect(() => {
    // Simulated metrics - in production, this would call the API:
    // const data = await fetch('/api/tickets/metrics').then(r => r.json());
    // The API would use slaTrackingService to calculate real-time SLA status

    setMetrics({
      total: 42, // Open + In Progress tickets
      urgent: 3, // Critical/High priority with SLA at risk or breached
      breached: 1, // Tickets with breached SLA
    });
  }, []);

  return metrics;
}

export function OpenTicketsWidget(_props: Readonly<WidgetProps>) {
  const metrics = useTicketMetrics();

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-start justify-between">
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-2xl text-primary">confirmation_number</span>
        </div>
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-destructive-muted text-destructive">
          {metrics.urgent} Urgent
        </span>
      </div>
      <p className="text-sm text-muted-foreground mt-4">Open Tickets</p>
      <p className="text-3xl font-bold text-foreground mt-1">{metrics.total}</p>
      {metrics.breached > 0 && (
        <p className="text-xs text-destructive mt-2">
          {metrics.breached} SLA breach{metrics.breached !== 1 ? 'es' : ''}
        </p>
      )}
    </div>
  );
}
