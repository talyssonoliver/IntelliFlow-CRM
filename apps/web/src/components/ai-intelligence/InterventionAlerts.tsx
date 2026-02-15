'use client';

/**
 * InterventionAlerts — Urgent SLA alerts for at-risk customers (PG-143)
 */

import { Card, CardContent, CardHeader, CardTitle, Badge, Button, cn } from '@intelliflow/ui';
import type { AtRiskCustomer } from '@/lib/churn-risk/types';
import { getRiskBadgeClass, formatSlaCountdown } from '@/lib/churn-risk/churn-utils';

interface InterventionAlertsProps {
  customers: AtRiskCustomer[];
}

export function InterventionAlerts({ customers }: InterventionAlertsProps) {
  // Show customers whose SLA deadline is within 24h or already overdue
  const urgentCustomers = customers.filter((c) => {
    const deadline = new Date(c.slaDeadline).getTime();
    const diff = deadline - Date.now();
    return diff <= 24 * 3600000; // within 24h or overdue
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-amber-500" aria-hidden="true">
            notifications_active
          </span>
          Urgent Interventions
          {urgentCustomers.length > 0 && (
            <Badge variant="destructive" className="ml-1">
              {urgentCustomers.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        {urgentCustomers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4" data-testid="no-alerts">
            No urgent interventions needed
          </p>
        ) : (
          <div className="space-y-2">
            {urgentCustomers.map((customer) => {
              const sla = formatSlaCountdown(customer.slaDeadline);
              return (
                <div
                  key={customer.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border',
                    sla.isOverdue
                      ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                      : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20',
                  )}
                  data-testid="intervention-alert"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{customer.entityName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={cn(
                            'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
                            getRiskBadgeClass(customer.riskLevel),
                          )}
                        >
                          {customer.riskLevel}
                        </span>
                        <span
                          className={cn(
                            'text-xs font-medium',
                            sla.isOverdue ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400',
                          )}
                          data-testid="sla-countdown"
                        >
                          {sla.text}
                        </span>
                      </div>
                    </div>
                  </div>
                  {customer.nextBestAction && (
                    <Button variant="outline" size="sm" className="ml-3 shrink-0 text-xs">
                      {customer.nextBestAction}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
