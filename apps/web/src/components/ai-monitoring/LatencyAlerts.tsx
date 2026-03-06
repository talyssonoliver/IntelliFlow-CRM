'use client';

/**
 * LatencyAlerts — Latency threshold alert cards (PG-153)
 * Pattern: apps/web/src/components/ai-monitoring/DriftAlerts.tsx
 */

import { Card, CardContent, CardHeader, CardTitle, Badge, cn } from '@intelliflow/ui';
import type { LatencyAlert } from '@/lib/ai-monitoring/types';
import {
  getLatencyAlertBadgeClass,
  getLatencyAlertIcon,
  formatLatencyMs,
} from '@/lib/ai-monitoring/latency-utils';

interface LatencyAlertsProps {
  alerts: LatencyAlert[];
}

export function LatencyAlerts({ alerts }: LatencyAlertsProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-amber-500" aria-hidden="true">
            notifications_active
          </span>
          Latency Alerts
          {alerts.length > 0 && (
            <Badge variant="destructive" className="ml-1" data-testid="alert-count">
              {alerts.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        {alerts.length === 0 ? (
          <p
            className="text-sm text-muted-foreground text-center py-4"
            data-testid="no-latency-alerts"
          >
            No latency alerts
          </p>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert, idx) => (
              <div
                key={`${alert.model}-${alert.operationType}-${idx}`}
                className={cn(
                  'p-3 rounded-lg border',
                  alert.severity === 'critical'
                    ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                    : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
                )}
                data-testid="latency-alert"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      {getLatencyAlertIcon(alert.severity)}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
                        getLatencyAlertBadgeClass(alert.severity)
                      )}
                      aria-label={`Alert severity: ${alert.severity}`}
                    >
                      {alert.severity.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span data-testid="alert-model">{alert.model}</span>
                    <span>·</span>
                    <span data-testid="alert-operation">{alert.operationType}</span>
                  </div>
                </div>
                <p className="text-sm" data-testid="alert-message">
                  {alert.message}
                </p>
                <p className="text-xs text-muted-foreground mt-1" data-testid="alert-p95-detail">
                  P95: {formatLatencyMs(alert.currentP95)} / target{' '}
                  {formatLatencyMs(alert.targetP95)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
