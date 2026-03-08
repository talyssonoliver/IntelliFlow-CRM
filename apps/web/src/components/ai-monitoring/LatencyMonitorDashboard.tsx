'use client';

/**
 * LatencyMonitorDashboard — AI latency monitoring dashboard (PG-153)
 *
 * Displays SLO compliance, latency percentiles, phase breakdown,
 * historical trends, and alert thresholds.
 *
 * Singleton process isolation: in multi-process deployments the API process
 * gets a separate LatencyMonitor singleton from the ai-worker. Data will be
 * empty unless both run in the same process or Redis backing is added.
 *
 * Pattern: apps/web/src/components/ai-monitoring/DriftDashboard.tsx
 */

import { useState, Suspense, lazy } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Button, Skeleton, cn } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { useLatencyDashboard } from '@/lib/ai-monitoring/hooks';
import type { LatencyFilters, LatencyPhase, LatencyPercentiles } from '@/lib/ai-monitoring/types';
import {
  formatLatencyMs,
  getSLOBadgeClass,
  getSLOStatusLabel,
  formatPhaseLabel,
  getP95ComplianceColor,
  isStaleLatencyData,
} from '@/lib/ai-monitoring/latency-utils';
import { LatencyAlerts } from './LatencyAlerts';


const LatencyTrendChart = lazy(() => import('./LatencyTrendChart'));

const BREADCRUMBS = [
  { label: 'AI & Agents', href: '/agent-approvals' },
  { label: 'Latency Monitor' },
];

const TIME_RANGES = ['1h', '6h', '24h'] as const;

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

export function LatencyMonitorDashboard() {
  const [timeRange, setTimeRange] = useState<LatencyFilters['timeRange']>('1h');
  const [modelFilter, setModelFilter] = useState<string | undefined>(undefined);
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());

  const filters: LatencyFilters = { timeRange, model: modelFilter };
  const {
    sampleCount,
    successRate: _successRate,
    percentiles,
    sloCompliance,
    byModel,
    byOperation: _byOperation,
    byPhase,
    alerts,
    trend,
    isLoading,
    error,
    refetch,
    available,
  } = useLatencyDashboard(filters);

  const toggleModelExpand = (model: string) => {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  };

  const modelNames = Object.keys(byModel).sort((a, b) => a.localeCompare(b));

  // Error state
  if (error && !isLoading) {
    return (
      <div>
        <PageHeader title="Latency Monitor" breadcrumbs={BREADCRUMBS} />
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

  // Empty state — distinguish between "no data" and "process isolated"
  if (!isLoading && sampleCount === 0) {
    return (
      <div>
        <PageHeader title="Latency Monitor" breadcrumbs={BREADCRUMBS} />
  
        {!available ? (
          <div
            className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800"
            data-testid="unavailable-banner"
          >
            <p className="text-sm text-blue-700 dark:text-blue-400 flex items-center gap-2">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                info
              </span>
              Monitoring data unavailable — AI worker runs in a separate process. Data will appear
              when both services are colocated or Redis-backed persistence is enabled.
            </p>
          </div>
        ) : (
          <Card className="mt-6">
            <CardContent className="p-6 text-center" data-testid="empty-state">
              <span
                className="material-symbols-outlined text-4xl text-muted-foreground mb-2"
                aria-hidden="true"
              >
                speed
              </span>
              <p className="text-lg font-medium text-muted-foreground">No latency data yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Start using AI features to populate monitoring data.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const latestTimestamp = alerts.length > 0 ? alerts[0].timestamp : null;

  return (
    <div>
      <PageHeader title="Latency Monitor" breadcrumbs={BREADCRUMBS} />


      {/* Stale data warning */}
      {isStaleLatencyData(latestTimestamp) && (
        <div
          className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"
          data-testid="stale-warning"
        >
          <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              schedule
            </span>{' '}
            Latency data may be stale. Last update was over 1 hour ago.
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        <StatCard
          label="Sample Count"
          value={sampleCount.toLocaleString()}
          icon="analytics"
          colorClass="bg-blue-100 dark:bg-blue-900/30"
          isLoading={isLoading}
        />
        <StatCard
          label="P95 Latency"
          value={formatLatencyMs(percentiles.p95)}
          icon="timer"
          colorClass="bg-amber-100 dark:bg-amber-900/30"
          isLoading={isLoading}
        />
        <StatCard
          label="P99 Latency"
          value={formatLatencyMs(percentiles.p99)}
          icon="speed"
          colorClass="bg-red-100 dark:bg-red-900/30"
          isLoading={isLoading}
        />
        <StatCard
          label="SLO Status"
          value={getSLOStatusLabel(sloCompliance.overallCompliant)}
          icon={sloCompliance.overallCompliant ? 'verified' : 'cancel'}
          colorClass={
            sloCompliance.overallCompliant
              ? 'bg-green-100 dark:bg-green-900/30'
              : 'bg-red-100 dark:bg-red-900/30'
          }
          isLoading={isLoading}
        />
      </div>

      {/* Time range filter + model select */}
      <div className="flex flex-wrap items-center gap-2 mt-6">
        <div
          className="flex flex-wrap gap-1.5"
          role="group" // NOSONAR typescript:S6819 — ARIA group for time-range filter chips; <fieldset> would require <legend> and changes layout
          aria-label="Filter by time range"
        >
          {TIME_RANGES.map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                timeRange === range
                  ? 'bg-primary text-primary-foreground ring-2 ring-offset-1 ring-primary/40'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
              aria-pressed={timeRange === range}
              data-testid={`filter-${range}`}
            >
              {range.toUpperCase()}
            </button>
          ))}
        </div>
        {modelNames.length > 0 && (
          <select
            value={modelFilter ?? ''}
            onChange={(e) => setModelFilter(e.target.value || undefined)}
            className="ml-auto text-xs border rounded-md px-2 py-1 bg-background"
            aria-label="Filter by model"
            data-testid="model-select"
          >
            <option value="">All Models</option>
            {modelNames.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* SLO Compliance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <Card data-testid="p95-slo-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">P95 SLO Compliance</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p
                  className={cn(
                    'text-2xl font-bold',
                    getP95ComplianceColor(sloCompliance.p95Actual, sloCompliance.p95Target)
                  )}
                >
                  {formatLatencyMs(sloCompliance.p95Actual)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Target: {formatLatencyMs(sloCompliance.p95Target)}
                </p>
              </div>
              <span
                className={cn(
                  'inline-flex items-center px-2 py-1 rounded text-xs font-bold',
                  getSLOBadgeClass(sloCompliance.p95Compliant)
                )}
                aria-label={`P95 SLO: ${getSLOStatusLabel(sloCompliance.p95Compliant)}`}
              >
                {getSLOStatusLabel(sloCompliance.p95Compliant)}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="p99-slo-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">P99 SLO Compliance</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p
                  className={cn(
                    'text-2xl font-bold',
                    getP95ComplianceColor(sloCompliance.p99Actual, sloCompliance.p99Target)
                  )}
                >
                  {formatLatencyMs(sloCompliance.p99Actual)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Target: {formatLatencyMs(sloCompliance.p99Target)}
                </p>
              </div>
              <span
                className={cn(
                  'inline-flex items-center px-2 py-1 rounded text-xs font-bold',
                  getSLOBadgeClass(sloCompliance.p99Compliant)
                )}
                aria-label={`P99 SLO: ${getSLOStatusLabel(sloCompliance.p99Compliant)}`}
              >
                {getSLOStatusLabel(sloCompliance.p99Compliant)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart (lazy-loaded) */}
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-[280px] rounded-lg" />}>
          <LatencyTrendChart
            trend={trend}
            p95Target={sloCompliance.p95Target}
            p99Target={sloCompliance.p99Target}
          />
        </Suspense>
      </div>

      {/* Alerts */}
      <div className="mt-6">
        <LatencyAlerts alerts={alerts} />
      </div>

      {/* Model Breakdown */}
      {modelNames.length > 0 && (
        <div className="mt-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Model Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="space-y-2">
                {modelNames.map((model) => {
                  const modelPerf = byModel[model];
                  const isExpanded = expandedModels.has(model);
                  return (
                    <div
                      key={model}
                      className="p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                      data-testid="model-row"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{model}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            P95: {formatLatencyMs(modelPerf.p95)}
                          </span>
                          <button
                            onClick={() => toggleModelExpand(model)}
                            className="text-xs text-primary hover:underline"
                            data-testid="expand-button"
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? 'Collapse' : 'Expand'}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="mt-2 pt-2 border-t grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                          <span>P50: {formatLatencyMs(modelPerf.p50)}</span>
                          <span>P75: {formatLatencyMs(modelPerf.p75)}</span>
                          <span>P90: {formatLatencyMs(modelPerf.p90)}</span>
                          <span>P95: {formatLatencyMs(modelPerf.p95)}</span>
                          <span>P99: {formatLatencyMs(modelPerf.p99)}</span>
                          <span>Mean: {formatLatencyMs(modelPerf.mean)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Phase Breakdown */}
      <div className="mt-6">
        <Card data-testid="phase-breakdown">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Phase Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {Object.keys(byPhase).length === 0 ? (
              <p
                className="text-sm text-muted-foreground text-center py-4"
                data-testid="no-phase-data"
              >
                No phase data available
              </p>
            ) : (
              <div className="space-y-2">
                {(Object.entries(byPhase) as [LatencyPhase, LatencyPercentiles][]).map(
                  ([phase, perf]) => (
                    <div
                      key={phase}
                      className="flex items-center justify-between p-2 rounded border"
                      data-testid="phase-row"
                    >
                      <span className="text-sm font-medium">{formatPhaseLabel(phase)}</span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>P50: {formatLatencyMs(perf.p50)}</span>
                        <span>P75: {formatLatencyMs(perf.p75)}</span>
                        <span>P90: {formatLatencyMs(perf.p90)}</span>
                        <span>P95: {formatLatencyMs(perf.p95)}</span>
                        <span>P99: {formatLatencyMs(perf.p99)}</span>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
