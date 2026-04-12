'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/lib/icons';
import { RefreshButton, MetricCard, StaleIndicator, TrendSparkline } from './shared';

interface QualityMetrics {
  debt: {
    total_items: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    trend: 'up' | 'down' | 'stable';
    healthScore: number;
    lastUpdated: string | null;
    history: Array<{ date: string; total: number; critical: number }>;
  };
  coverage: {
    lines: number;
    branches: number;
    functions: number;
    statements: number;
    lastUpdated: string | null;
  };
  sonarqube: {
    qualityGate: string;
    bugs: number;
    vulnerabilities: number;
    codeSmells: number;
    duplications: number;
    lastUpdated: string | null;
    history: Array<{ date: string; bugs: number; vulnerabilities: number; codeSmells: number }>;
  };
  phantomAudit: {
    phantomCount: number;
    validCount: number;
    lastUpdated: string | null;
  };
}

export function buildRefreshState(
  current: Record<string, boolean>,
  type: string
): Record<string, boolean> {
  return { ...current, [type]: true };
}

export function buildErrorState(
  current: Record<string, string | null>,
  type: string,
  msg: string
): Record<string, string | null> {
  return { ...current, [type]: msg };
}

export default function QualityDashboard() {
  const [data, setData] = useState<QualityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/tracking/quality');
      if (!response.ok) throw new Error('Failed to fetch quality metrics');
      const result = await response.json();
      setData(result.metrics);
      setErrors({});
    } catch (err) {
      setErrors((prev) =>
        buildErrorState(prev, 'global', err instanceof Error ? err.message : 'Unknown error')
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = async (type: 'all' | 'debt' | 'sonar' | 'phantom') => {
    setRefreshing((prev) => buildRefreshState(prev, type));
    try {
      const response = await fetch(`/api/tracking/quality?type=${type}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to refresh');
      await fetchData();
      setErrors((prev) => ({ ...prev, [type]: null }));
    } catch (err) {
      setErrors((prev) =>
        buildErrorState(prev, type, err instanceof Error ? err.message : 'Refresh failed')
      );
    } finally {
      setRefreshing((prev) => ({ ...prev, [type]: false }));
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

  if (errors.global && !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
        <div className="flex items-center gap-2">
          <Icon name="error" size="lg" />
          <span>Error: {errors.global}</span>
        </div>
        <button onClick={fetchData} className="mt-2 text-sm underline hover:no-underline">
          Try again
        </button>
      </div>
    );
  }

  const isAnyRefreshing = Object.values(refreshing).some(Boolean);

  const getQualityGateColor = (gate: string) => {
    switch (gate.toLowerCase()) {
      case 'passed':
      case 'ok':
        return 'text-green-600';
      case 'failed':
      case 'error':
        return 'text-red-600';
      default:
        return 'text-yellow-600';
    }
  };

  type CoverageVariant = 'success' | 'warning' | 'error';
  const getCoverageColor = (pct: number): CoverageVariant => {
    if (pct >= 90) return 'success';
    if (pct >= 70) return 'warning';
    return 'error';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon name="check_circle" className="text-green-600" size="xl" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Quality Metrics</h3>
            <p className="text-sm text-gray-500">Debt, coverage, and code analysis</p>
          </div>
        </div>
        <RefreshButton
          onRefresh={() => handleRefresh('all')}
          label="Refresh All"
          disabled={isAnyRefreshing}
        />
      </div>

      {/* Coverage Section */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Icon name="pie_chart" size="base" />
            Test Coverage
          </h4>
          <div className="flex items-center gap-2">
            {data?.coverage.lastUpdated && (
              <StaleIndicator lastUpdated={data.coverage.lastUpdated} thresholdMinutes={1440} />
            )}
            <span className="text-xs text-gray-400" title="Coverage is updated by running tests">
              Updated by test runs
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Lines"
            value={`${data?.coverage.lines.toFixed(1) ?? 0}%`}
            icon="code"
            variant={getCoverageColor(data?.coverage.lines ?? 0)}
          />
          <MetricCard
            title="Branches"
            value={`${data?.coverage.branches.toFixed(1) ?? 0}%`}
            icon="fork_right"
            variant={getCoverageColor(data?.coverage.branches ?? 0)}
          />
          <MetricCard
            title="Functions"
            value={`${data?.coverage.functions.toFixed(1) ?? 0}%`}
            icon="package_2"
            variant={getCoverageColor(data?.coverage.functions ?? 0)}
          />
          <MetricCard
            title="Statements"
            value={`${data?.coverage.statements.toFixed(1) ?? 0}%`}
            icon="description"
            variant={getCoverageColor(data?.coverage.statements ?? 0)}
          />
        </div>
      </div>

      {/* Technical Debt Section */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Icon name="trending_down" size="base" />
            Technical Debt
          </h4>
          <div className="flex items-center gap-2">
            {data?.debt.lastUpdated && (
              <StaleIndicator lastUpdated={data.debt.lastUpdated} thresholdMinutes={10080} />
            )}
            <RefreshButton
              onRefresh={() => handleRefresh('debt')}
              label="Analyze"
              size="sm"
              variant="ghost"
              disabled={refreshing['debt'] ?? false}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <MetricCard
            title="Total Items"
            value={data?.debt.total_items ?? 0}
            icon="view_list"
            trend={data?.debt.trend}
            variant="info"
          />
          <MetricCard
            title="Critical"
            value={data?.debt.critical ?? 0}
            icon="report"
            variant={(data?.debt.critical ?? 0) > 0 ? 'error' : 'default'}
          />
          <MetricCard
            title="High"
            value={data?.debt.high ?? 0}
            icon="warning"
            variant={(data?.debt.high ?? 0) > 0 ? 'warning' : 'default'}
          />
          <MetricCard title="Medium" value={data?.debt.medium ?? 0} icon="info" variant="default" />
          <MetricCard
            title="Low"
            value={data?.debt.low ?? 0}
            icon="remove_circle"
            variant="default"
          />
        </div>
        {data?.debt.history && data.debt.history.length >= 2 && (
          <div className="mt-4">
            <TrendSparkline
              data={data.debt.history.map((h) => ({ date: h.date, value: h.total }))}
              label="Debt trend"
            />
          </div>
        )}
        {errors['debt'] && <div className="mt-2 text-xs text-red-500">{errors['debt']}</div>}
      </div>

      {/* SonarQube Section */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Icon name="search" size="base" />
            SonarQube Analysis
          </h4>
          <div className="flex items-center gap-2">
            {data?.sonarqube.lastUpdated && (
              <StaleIndicator lastUpdated={data.sonarqube.lastUpdated} thresholdMinutes={10080} />
            )}
            <RefreshButton
              onRefresh={() => handleRefresh('sonar')}
              label="Scan"
              size="sm"
              variant="ghost"
              disabled={refreshing['sonar'] ?? false}
            />
          </div>
        </div>
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Quality Gate:</span>
            <span
              className={`font-semibold ${getQualityGateColor(data?.sonarqube.qualityGate ?? 'Unknown')}`}
            >
              {data?.sonarqube.qualityGate ?? 'Unknown'}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Bugs"
            value={data?.sonarqube.bugs ?? 0}
            icon="bug_report"
            variant={(data?.sonarqube.bugs ?? 0) > 0 ? 'error' : 'success'}
          />
          <MetricCard
            title="Vulnerabilities"
            value={data?.sonarqube.vulnerabilities ?? 0}
            icon="shield"
            variant={(data?.sonarqube.vulnerabilities ?? 0) > 0 ? 'error' : 'success'}
          />
          <MetricCard
            title="Code Smells"
            value={data?.sonarqube.codeSmells ?? 0}
            icon="air"
            variant={(data?.sonarqube.codeSmells ?? 0) > 10 ? 'warning' : 'default'}
          />
          <MetricCard
            title="Duplications"
            value={`${data?.sonarqube.duplications ?? 0}%`}
            icon="content_copy"
            variant={(data?.sonarqube.duplications ?? 0) > 5 ? 'warning' : 'default'}
          />
        </div>
        {data?.sonarqube.history && data.sonarqube.history.length >= 2 && (
          <div className="mt-4">
            <TrendSparkline
              data={data.sonarqube.history.map((h) => ({ date: h.date, value: h.bugs }))}
              color="#ef4444"
              label="Bugs trend"
            />
          </div>
        )}
        {errors['sonar'] && <div className="mt-2 text-xs text-red-500">{errors['sonar']}</div>}
      </div>

      {/* Phantom Audit Section */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Icon name="visibility_off" size="base" />
            Phantom Completion Audit
          </h4>
          <div className="flex items-center gap-2">
            {data?.phantomAudit.lastUpdated && (
              <StaleIndicator
                lastUpdated={data.phantomAudit.lastUpdated}
                thresholdMinutes={10080}
              />
            )}
            <RefreshButton
              onRefresh={() => handleRefresh('phantom')}
              label="Re-scan"
              size="sm"
              variant="ghost"
              disabled={refreshing['phantom'] ?? false}
            />
          </div>
        </div>
        {errors['phantom'] && <div className="mb-2 text-xs text-red-500">{errors['phantom']}</div>}
        <div className="grid grid-cols-2 gap-4">
          <MetricCard
            title="Phantom Tasks"
            value={data?.phantomAudit.phantomCount ?? 0}
            subtitle="Tasks marked done without evidence"
            icon="visibility_off"
            variant={(data?.phantomAudit.phantomCount ?? 0) > 0 ? 'error' : 'success'}
          />
          <MetricCard
            title="Valid Completions"
            value={data?.phantomAudit.validCount ?? 0}
            subtitle="Tasks with proper attestations"
            icon="check_circle"
            variant="success"
          />
        </div>
      </div>
    </div>
  );
}
