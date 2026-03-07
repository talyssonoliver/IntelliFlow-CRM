'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/lib/icons';
import { RefreshButton, MetricCard, StaleIndicator } from './shared';

export interface BuildMetrics {
  turbo: {
    success: boolean;
    tasks_run: number;
    tasks_cached: number;
    duration_ms: number;
    errors: string[];
    lastRun: string | null;
  };
  tests: {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    coverage: number;
    lastRun: string | null;
  };
  typecheck: {
    success: boolean;
    errors: number;
    warnings: number;
    lastRun: string | null;
  };
  lint: {
    success: boolean;
    errors: number;
    warnings: number;
    lastRun: string | null;
  };
}

export function computeAllPassing(data: BuildMetrics | null): boolean {
  return (
    (data?.turbo.success ?? true) &&
    (data?.typecheck.success ?? true) &&
    (data?.lint.success ?? true) &&
    (data?.tests.failed ?? 0) === 0
  );
}

export function computeCacheHitRate(tasksRun: number, tasksCached: number): number {
  return tasksRun ? Math.round((tasksCached / tasksRun) * 100) : 0;
}

export function computeTestPassRate(passed: number, total: number): number {
  return total ? Math.round((passed / total) * 100) : 100;
}

type MetricVariant = 'success' | 'warning' | 'error' | 'info' | 'default';

function getCoverageVariant(coverage: number): MetricVariant {
  if (coverage >= 90) return 'success';
  if (coverage >= 70) return 'warning';
  return 'error';
}

function getPassRateBarColor(rate: number): string {
  if (rate >= 90) return 'bg-green-500';
  if (rate >= 70) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getPassRateTextColor(rate: number): string {
  if (rate >= 90) return 'text-green-600';
  if (rate >= 70) return 'text-yellow-600';
  return 'text-red-600';
}

interface CheckPanelProps {
  iconName: string;
  title: string;
  success: boolean | undefined;
  errors: number | undefined;
  warnings: number | undefined;
  lastRun: string | null | undefined;
  onRefresh: () => Promise<void>;
  refreshLabel: string;
  disabled: boolean;
}

function CheckPanel({ iconName, title, success, errors, warnings, lastRun, onRefresh, refreshLabel, disabled }: CheckPanelProps) {
  const isOk = success ?? true;
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Icon name={iconName} size="base" />
          {title}
        </h4>
        <div className="flex items-center gap-2">
          {lastRun && <StaleIndicator lastUpdated={lastRun} thresholdMinutes={60} />}
          <RefreshButton onRefresh={onRefresh} label={refreshLabel} size="sm" variant="ghost" disabled={disabled} />
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className={`flex items-center gap-2 ${isOk ? 'text-green-600' : 'text-red-600'}`}>
          <Icon name={isOk ? 'check_circle' : 'cancel'} size="lg" />
          <span className="font-medium">{isOk ? 'Passing' : 'Failing'}</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className={`${(errors ?? 0) > 0 ? 'text-red-600' : 'text-gray-500'}`}>{errors ?? 0} errors</span>
          <span className={`${(warnings ?? 0) > 0 ? 'text-yellow-600' : 'text-gray-500'}`}>{warnings ?? 0} warnings</span>
        </div>
      </div>
    </div>
  );
}

function HealthStatusBanner({ allPassing }: Readonly<{ allPassing: boolean }>) {
  return (
    <div className={`rounded-lg p-4 border ${allPassing ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center gap-3">
        <Icon name={allPassing ? 'check_circle' : 'cancel'} className={allPassing ? 'text-green-600' : 'text-red-600'} size="2xl" />
        <div>
          <div className={`text-lg font-semibold ${allPassing ? 'text-green-600' : 'text-red-600'}`}>
            {allPassing ? 'All Checks Passing' : 'Build Issues Detected'}
          </div>
          <div className="text-sm text-gray-500">
            {allPassing ? 'Typecheck, lint, and tests are all passing' : 'One or more checks have failed - review below'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BuildHealth() {
  const [data, setData] = useState<BuildMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/tracking/build');
      if (!response.ok) throw new Error('Failed to fetch build metrics');
      const result = await response.json();
      setData(result.metrics);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleValidation = async (type: 'all' | 'typecheck' | 'lint') => {
    setValidating(type);
    try {
      const response = await fetch(`/api/tracking/build?type=${type}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Validation failed');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setValidating(null);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="progress_activity" className="animate-spin text-blue-500" size="2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
        <div className="flex items-center gap-2">
          <Icon name="error" size="lg" />
          <span>Error: {error}</span>
        </div>
        <button onClick={fetchData} className="mt-2 text-sm underline hover:no-underline">
          Try again
        </button>
      </div>
    );
  }

  const allPassing = computeAllPassing(data);

  const cacheHitRate = computeCacheHitRate(
    data?.turbo.tasks_run ?? 0,
    data?.turbo.tasks_cached ?? 0
  );

  const testPassRate = computeTestPassRate(data?.tests.passed ?? 0, data?.tests.total ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon
            name="hardware"
            className={allPassing ? 'text-green-600' : 'text-red-600'}
            size="xl"
          />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Build Health</h3>
            {data?.turbo.lastRun && (
              <StaleIndicator lastUpdated={data.turbo.lastRun} thresholdMinutes={60} showTime />
            )}
          </div>
        </div>
        <RefreshButton
          onRefresh={() => handleValidation('all')}
          label={validating ? 'Validating...' : 'Run Validation'}
          disabled={validating !== null}
        />
      </div>

      {/* Overall Status */}
      <HealthStatusBanner allPassing={allPassing} />

      {/* Turbo Build Stats */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Icon name="bolt" size="base" />
            Turbo Build
          </h4>
          <span className={`text-sm ${data?.turbo.success ? 'text-green-600' : 'text-red-600'}`}>
            {data?.turbo.success ? 'SUCCESS' : 'FAILED'}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Tasks Run"
            value={data?.turbo.tasks_run ?? 0}
            icon="play_arrow"
            variant="info"
          />
          <MetricCard
            title="Cache Hit"
            value={`${cacheHitRate}%`}
            subtitle={`${data?.turbo.tasks_cached ?? 0} cached`}
            icon="storage"
            variant={cacheHitRate > 50 ? 'success' : 'warning'}
          />
          <MetricCard
            title="Duration"
            value={`${((data?.turbo.duration_ms ?? 0) / 1000).toFixed(1)}s`}
            icon="schedule"
            variant="default"
          />
          <MetricCard
            title="Errors"
            value={data?.turbo.errors?.length ?? 0}
            icon="cancel"
            variant={(data?.turbo.errors?.length ?? 0) > 0 ? 'error' : 'success'}
          />
        </div>
        {data?.turbo.errors && data.turbo.errors.length > 0 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-sm text-red-600 font-medium mb-2">Build Errors:</div>
            <ul className="text-sm text-gray-700 space-y-1">
              {data.turbo.errors.slice(0, 5).map((err, idx) => (
                <li key={idx} className="font-mono text-xs"> {/* NOSONAR typescript:S6479 */}
                  {err}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Typecheck */}
      <CheckPanel
        iconName="code"
        title="TypeScript Check"
        success={data?.typecheck.success}
        errors={data?.typecheck.errors}
        warnings={data?.typecheck.warnings}
        lastRun={data?.typecheck.lastRun}
        onRefresh={() => handleValidation('typecheck')}
        refreshLabel={validating === 'typecheck' ? 'Running...' : 'Run'}
        disabled={validating !== null}
      />

      {/* Lint */}
      <CheckPanel
        iconName="check_box"
        title="ESLint"
        success={data?.lint.success}
        errors={data?.lint.errors}
        warnings={data?.lint.warnings}
        lastRun={data?.lint.lastRun}
        onRefresh={() => handleValidation('lint')}
        refreshLabel={validating === 'lint' ? 'Running...' : 'Run'}
        disabled={validating !== null}
      />

      {/* Tests */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Icon name="science" size="base" />
            Test Results
          </h4>
          {data?.tests.lastRun && (
            <StaleIndicator lastUpdated={data.tests.lastRun} thresholdMinutes={1440} />
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
          <MetricCard title="Total" value={data?.tests.total ?? 0} icon="tag" variant="info" />
          <MetricCard
            title="Passed"
            value={data?.tests.passed ?? 0}
            icon="check_circle"
            variant="success"
          />
          <MetricCard
            title="Failed"
            value={data?.tests.failed ?? 0}
            icon="cancel"
            variant={(data?.tests.failed ?? 0) > 0 ? 'error' : 'success'}
          />
          <MetricCard
            title="Skipped"
            value={data?.tests.skipped ?? 0}
            icon="skip_next"
            variant={(data?.tests.skipped ?? 0) > 0 ? 'warning' : 'default'}
          />
          <MetricCard
            title="Coverage"
            value={`${data?.tests.coverage.toFixed(1) ?? 0}%`}
            icon="pie_chart"
            variant={getCoverageVariant(data?.tests.coverage ?? 0)}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Pass Rate:</span>
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${getPassRateBarColor(testPassRate)}`}
              style={{ width: `${testPassRate}%` }}
            />
          </div>
          <span className={`text-sm font-medium ${getPassRateTextColor(testPassRate)}`}>
            {testPassRate}%
          </span>
        </div>
      </div>
    </div>
  );
}
