'use client';

/**
 * DriftAlerts — High/critical severity drift alert cards (PG-146)
 * Pattern: apps/web/src/components/ai-intelligence/InterventionAlerts.tsx
 */

import { Card, CardContent, CardHeader, CardTitle, Badge, cn } from '@intelliflow/ui';
import type { DriftHistoryItem } from '@/lib/ai-monitoring/types';
import {
  getSeverityBadgeClass,
  formatDriftScore,
  formatRelativeTime,
} from '@/lib/ai-monitoring/drift-utils';

interface DriftAlertsProps {
  alerts: DriftHistoryItem[];
}

export function DriftAlerts({ alerts }: Readonly<DriftAlertsProps>) {
  const urgentAlerts = alerts.filter((a) => a.severity === 'high' || a.severity === 'critical');

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-amber-500" aria-hidden="true">
            notifications_active
          </span>
          {' '}Drift Alerts
          {urgentAlerts.length > 0 && (
            <Badge variant="destructive" className="ml-1">
              {urgentAlerts.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        {urgentAlerts.length === 0 ? (
          <p
            className="text-sm text-muted-foreground text-center py-4"
            data-testid="no-drift-alerts"
          >
            No urgent drift alerts
          </p>
        ) : (
          <div className="space-y-2">
            {urgentAlerts.map((alert, idx) => (
              <div
                key={`${alert.metric}-${idx}`}
                className={cn(
                  'p-3 rounded-lg border',
                  alert.severity === 'critical'
                    ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                    : 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20'
                )}
                data-testid="drift-alert"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{alert.metric}</span>
                    <span
                      className={cn(
                        'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
                        getSeverityBadgeClass(alert.severity)
                      )}
                      aria-label={`Severity: ${alert.severity}`}
                    >
                      {alert.severity.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(alert.timestamp)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Drift Score:{' '}
                  <span className="font-mono">{formatDriftScore(alert.driftScore)}</span>
                </p>
                {alert.recommendations.length > 0 && (
                  <ul className="text-xs space-y-1" data-testid="alert-recommendations">
                    {alert.recommendations.map((rec, ridx) => (
                      <li key={ridx} className="flex items-start gap-1.5"> {/* NOSONAR typescript:S6479 */}
                        <span
                          className="material-symbols-outlined text-xs mt-0.5"
                          aria-hidden="true"
                        >
                          arrow_right
                        </span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
