'use client';

/**
 * DriftDashboard — AI model drift detection dashboard (PG-146)
 * Pattern: apps/web/src/components/ai-intelligence/ChurnDashboard.tsx
 */

import { useState, Suspense, lazy } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Button, EmptyState, Skeleton, cn } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { useDriftDashboard, useFailedJobs } from '@/lib/ai-monitoring/hooks';
import type { DriftFilters } from '@/lib/ai-monitoring/types';
import {
  getSeverityBadgeClass,
  formatDriftScore,
  formatPValue,
  formatRelativeTime,
  isStaleData,
} from '@/lib/ai-monitoring/drift-utils';
import { DriftAlerts } from './DriftAlerts';
import { ErrorRateGauge } from './ErrorRateGauge';
import { CostTracker } from './CostTracker';

const ModelPerformanceChart = lazy(() => import('./ModelPerformanceChart'));

const BREADCRUMBS = [
  { label: 'AI & Agents', href: '/agent-approvals' },
  { label: 'Drift Detection' },
];

const SEVERITY_FILTERS = ['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const SEVERITY_CHIP_COLORS: Record<string, string> = {
  ALL: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  LOW: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  CRITICAL: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function StatCard({
  label,
  value,
  icon,
  colorClass,
  isLoading,
}: Readonly<{
  label: string;
  value: string | number;
  icon: string;
  colorClass: string;
  isLoading: boolean;
}>) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', colorClass)}>
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              {icon}
            </span>
          </div>
          <div>
            {isLoading ? (
              <Skeleton className="h-6 w-10" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{value}</p>
            )}
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DriftDashboard() {
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<DriftFilters['sortBy']>('newest');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const filters: DriftFilters = { severity: severityFilter, sortBy };
  const { status, history, roi, isLoading, error, refetch, available } = useDriftDashboard(filters);
  const failedJobs = useFailedJobs({ limit: 1 });

  const errorRateItem = history.find((h) => h.metric === 'error_rate') ?? null;

  const toggleExpand = (key: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Error state
  if (error && !isLoading) {
    return (
      <div>
        <PageHeader title="Drift Detection" breadcrumbs={BREADCRUMBS} />
        <Card className="mt-6">
          <CardContent className="p-6 text-center">
            <span
              className="material-symbols-outlined text-4xl text-destructive mb-2"
              aria-hidden="true"
            >
              cloud_off
            </span>
            <p className="text-lg font-medium text-destructive" data-testid="error-message">
              AI monitoring service unavailable
            </p>
            <p className="text-sm text-muted-foreground mt-1">Please try again later.</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => refetch()}
              data-testid="retry-button"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Drift Detection" breadcrumbs={BREADCRUMBS} />


      {/* Process isolation banner */}
      {!isLoading && !available && (
        <div
          className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800"
          data-testid="unavailable-banner"
        >
          <p className="text-sm text-blue-700 dark:text-blue-400 flex items-center gap-2">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              info
            </span>{' '}
            Monitoring data unavailable — AI worker runs in a separate process. Data will appear when
            both services are colocated or Redis-backed persistence is enabled.
          </p>
        </div>
      )}

      {/* Stale data warning */}
      {isStaleData(status.lastCheck) && (
        <div
          className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"
          data-testid="stale-warning"
        >
          <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              schedule
            </span>{' '}
            Monitoring data may be stale. Last check was over 1 hour ago.
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-6">
        <StatCard
          label="Tracked Metrics"
          value={status.trackedMetrics}
          icon="insights"
          colorClass="bg-slate-100 dark:bg-slate-800"
          isLoading={isLoading}
        />
        <StatCard
          label="Drift Detected"
          value={status.driftDetected ? 'YES' : 'NO'}
          icon="trending_down"
          colorClass={
            status.driftDetected
              ? 'bg-red-100 dark:bg-red-900/30'
              : 'bg-green-100 dark:bg-green-900/30'
          }
          isLoading={isLoading}
        />
        <StatCard
          label="High Severity"
          value={status.highSeverityCount}
          icon="error"
          colorClass="bg-orange-100 dark:bg-orange-900/30"
          isLoading={isLoading}
        />
        <StatCard
          label="Total Samples"
          value={status.totalSamples}
          icon="analytics"
          colorClass="bg-blue-100 dark:bg-blue-900/30"
          isLoading={isLoading}
        />
        <StatCard
          label="Failed Jobs"
          value={failedJobs.error ? '—' : failedJobs.total}
          icon="report_problem"
          colorClass={(() => {
            if (failedJobs.error) return 'bg-slate-100 dark:bg-slate-800';
            if (failedJobs.total > 0) return 'bg-red-100 dark:bg-red-900/30';
            return 'bg-green-100 dark:bg-green-900/30';
          })()}
          isLoading={failedJobs.isLoading}
        />
        <StatCard
          label="Last Check"
          value={status.lastCheck ? formatRelativeTime(status.lastCheck) : 'Never'}
          icon="schedule"
          colorClass="bg-slate-100 dark:bg-slate-800"
          isLoading={isLoading}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mt-6">
        <fieldset className="contents flex flex-wrap gap-1.5">
          <legend className="sr-only">Filter by severity</legend>
          {SEVERITY_FILTERS.map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                severityFilter === sev
                  ? cn(SEVERITY_CHIP_COLORS[sev], 'ring-2 ring-offset-1 ring-primary/40')
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
              aria-pressed={severityFilter === sev}
              data-testid={`filter-${sev.toLowerCase()}`}
            >
              {sev}
            </button>
          ))}
        </fieldset>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as DriftFilters['sortBy'])}
          className="ml-auto text-xs border rounded-md px-2 py-1 bg-background"
          aria-label="Sort order"
          data-testid="sort-select"
        >
          <option value="newest">Newest First</option>
          <option value="score">By Score</option>
          <option value="severity">By Severity</option>
        </select>
      </div>

      {/* 2-column grid: ErrorRateGauge + ModelPerformanceChart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <ErrorRateGauge driftResult={errorRateItem} isLoading={isLoading} />
        <Suspense fallback={<Skeleton className="h-[280px] rounded-lg" />}>
          <ModelPerformanceChart history={history} />
        </Suspense>
      </div>

      {/* Drift Alerts */}
      <div className="mt-6">
        <DriftAlerts alerts={history} />
      </div>

      {/* Cost Tracker */}
      <div className="mt-6">
        <CostTracker roi={roi} isLoading={isLoading} />
      </div>

      {/* Drift History */}
      <div className="mt-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Drift History</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {(() => {
              if (!isLoading && history.length === 0) return (
              <div data-testid="empty-state">
                <EmptyState entity="insights" phase="passive" />
              </div>
              );
              if (isLoading) return (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" /> // NOSONAR typescript:S6479 — static skeleton placeholder, no data identity
                ))}
              </div>
              );
              return (
              <div className="space-y-2">
                {history.map((item, idx) => {
                  const key = `${item.metric}-${idx}`;
                  const isExpanded = expandedCards.has(key);
                  return (
                    <div
                      key={key}
                      className="p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                      data-testid="drift-history-card"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{item.metric}</span>
                          <span
                            className={cn(
                              'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
                              getSeverityBadgeClass(item.severity)
                            )}
                            aria-label={`Severity: ${item.severity}`}
                          >
                            {item.severity.toUpperCase()}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-xs text-muted-foreground">
                          Score:{' '}
                          <span className="font-mono" data-testid="drift-score">
                            {formatDriftScore(item.driftScore)}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          p-value: <span className="font-mono">{formatPValue(item.pValue)}</span>
                        </span>
                      </div>
                      <button
                        onClick={() => toggleExpand(key)}
                        className="text-xs text-primary hover:underline mt-1"
                        data-testid="expand-button"
                      >
                        {isExpanded ? 'Hide Details' : 'View Details'}
                      </button>
                      {isExpanded && (
                        <div className="mt-2 pt-2 border-t" data-testid="expanded-details">
                          {item.recommendations.length > 0 && (
                            <div className="mb-2">
                              <p className="text-xs font-medium mb-1">Recommendations:</p>
                              <ul className="text-xs space-y-0.5 text-muted-foreground">
                                {item.recommendations.map((rec) => (
                                  <li key={rec}>• {rec}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
