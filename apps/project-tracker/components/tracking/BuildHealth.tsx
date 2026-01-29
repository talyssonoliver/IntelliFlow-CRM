'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/lib/icons';
import { RefreshButton, MetricCard, StaleIndicator } from './shared';

interface BuildMetrics {
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
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
        <div className="flex items-center gap-2">
          <Icon name="error" size="lg" />
          <span>Error: {error}</span>
        </div>
        <button
          onClick={fetchData}
          className="mt-2 text-sm underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const allPassing = (data?.turbo.success ?? true) &&
    (data?.typecheck.success ?? true) &&
    (data?.lint.success ?? true) &&
    ((data?.tests.failed ?? 0) === 0);

  const cacheHitRate = data?.turbo.tasks_run
    ? Math.round((data.turbo.tasks_cached / data.turbo.tasks_run) * 100)
    : 0;

  const testPassRate = data?.tests.total
    ? Math.round((data.tests.passed / data.tests.total) * 100)
    : 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon name="hardware" className={allPassing ? 'text-green-400' : 'text-red-400'} size="xl" />
          <div>
            <h3 className="text-lg font-semibold text-white">Build Health</h3>
            {data?.turbo.lastRun && (
              <StaleIndicator
                lastUpdated={data.turbo.lastRun}
                thresholdMinutes={60}
                showTime
              />
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
      <div className={`rounded-lg p-4 border ${
        allPassing
          ? 'bg-green-500/10 border-green-500/30'
          : 'bg-red-500/10 border-red-500/30'
      }`}>
        <div className="flex items-center gap-3">
          <Icon
            name={allPassing ? 'check_circle' : 'cancel'}
            className={allPassing ? 'text-green-400' : 'text-red-400'}
            size="2xl"
          />
          <div>
            <div className={`text-lg font-semibold ${allPassing ? 'text-green-400' : 'text-red-400'}`}>
              {allPassing ? 'All Checks Passing' : 'Build Issues Detected'}
            </div>
            <div className="text-sm text-gray-400">
              {allPassing
                ? 'Typecheck, lint, and tests are all passing'
                : 'One or more checks have failed - review below'}
            </div>
          </div>
        </div>
      </div>

      {/* Turbo Build Stats */}
      <div className="bg-gray-700/30 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Icon name="bolt" size="base" />
            Turbo Build
          </h4>
          <span className={`text-sm ${data?.turbo.success ? 'text-green-400' : 'text-red-400'}`}>
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
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="text-sm text-red-400 font-medium mb-2">Build Errors:</div>
            <ul className="text-sm text-gray-300 space-y-1">
              {data.turbo.errors.slice(0, 5).map((err, idx) => (
                <li key={idx} className="font-mono text-xs">{err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Typecheck */}
      <div className="bg-gray-700/30 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Icon name="code" size="base" />
            TypeScript Check
          </h4>
          <div className="flex items-center gap-2">
            {data?.typecheck.lastRun && (
              <StaleIndicator
                lastUpdated={data.typecheck.lastRun}
                thresholdMinutes={60}
              />
            )}
            <button
              onClick={() => handleValidation('typecheck')}
              disabled={validating !== null}
              className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white disabled:opacity-50"
            >
              {validating === 'typecheck' ? 'Running...' : 'Run'}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className={`flex items-center gap-2 ${data?.typecheck.success ? 'text-green-400' : 'text-red-400'}`}>
            <Icon name={data?.typecheck.success ? 'check_circle' : 'cancel'} size="lg" />
            <span className="font-medium">{data?.typecheck.success ? 'Passing' : 'Failing'}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className={`${(data?.typecheck.errors ?? 0) > 0 ? 'text-red-400' : 'text-gray-400'}`}>
              {data?.typecheck.errors ?? 0} errors
            </span>
            <span className={`${(data?.typecheck.warnings ?? 0) > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
              {data?.typecheck.warnings ?? 0} warnings
            </span>
          </div>
        </div>
      </div>

      {/* Lint */}
      <div className="bg-gray-700/30 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Icon name="check_box" size="base" />
            ESLint
          </h4>
          <div className="flex items-center gap-2">
            {data?.lint.lastRun && (
              <StaleIndicator
                lastUpdated={data.lint.lastRun}
                thresholdMinutes={60}
              />
            )}
            <button
              onClick={() => handleValidation('lint')}
              disabled={validating !== null}
              className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white disabled:opacity-50"
            >
              {validating === 'lint' ? 'Running...' : 'Run'}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className={`flex items-center gap-2 ${data?.lint.success ? 'text-green-400' : 'text-red-400'}`}>
            <Icon name={data?.lint.success ? 'check_circle' : 'cancel'} size="lg" />
            <span className="font-medium">{data?.lint.success ? 'Passing' : 'Failing'}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className={`${(data?.lint.errors ?? 0) > 0 ? 'text-red-400' : 'text-gray-400'}`}>
              {data?.lint.errors ?? 0} errors
            </span>
            <span className={`${(data?.lint.warnings ?? 0) > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
              {data?.lint.warnings ?? 0} warnings
            </span>
          </div>
        </div>
      </div>

      {/* Tests */}
      <div className="bg-gray-700/30 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Icon name="science" size="base" />
            Test Results
          </h4>
          {data?.tests.lastRun && (
            <StaleIndicator
              lastUpdated={data.tests.lastRun}
              thresholdMinutes={1440}
            />
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
          <MetricCard
            title="Total"
            value={data?.tests.total ?? 0}
            icon="tag"
            variant="info"
          />
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
            variant={(data?.tests.coverage ?? 0) >= 80 ? 'success' : (data?.tests.coverage ?? 0) >= 60 ? 'warning' : 'error'}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Pass Rate:</span>
          <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${testPassRate >= 90 ? 'bg-green-500' : testPassRate >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${testPassRate}%` }}
            />
          </div>
          <span className={`text-sm font-medium ${testPassRate >= 90 ? 'text-green-400' : testPassRate >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
            {testPassRate}%
          </span>
        </div>
      </div>
    </div>
  );
}
