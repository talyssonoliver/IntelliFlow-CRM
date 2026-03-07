'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/lib/icons';
import { RefreshButton, MetricCard, StaleIndicator, TrendSparkline } from './shared';

// --- Shared types ---
export type SloComplianceStatus = 'compliant' | 'violation' | 'pending';

// --- Exported pure helper functions (for testing) ---

export function getCostUtilizationColor(pct: number): string {
  if (pct > 90) return 'text-red-600';
  if (pct > 70) return 'text-yellow-600';
  return 'text-green-600';
}

export function calculateCostUtilization(current: number, budget: number): number {
  if (budget === 0) return 0;
  return Math.round((current / budget) * 100);
}

export function getDriftBarWidth(score: number, threshold: number): number {
  if (threshold === 0) return 0;
  return Math.min((score / threshold) * 100, 100);
}

export function getLatencyColor(ms: number, thresholds: { green: number; yellow: number }): string {
  if (ms < thresholds.green) return 'text-green-600';
  if (ms < thresholds.yellow) return 'text-yellow-600';
  return 'text-red-600';
}

export function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 0.9) return 'text-green-600';
  if (accuracy >= 0.8) return 'text-yellow-600';
  return 'text-red-600';
}

export function getSloComplianceStatus(
  p95: boolean | null,
  p99: boolean | null
): SloComplianceStatus {
  if (p95 === null || p99 === null) return 'pending';
  if (p95 === false || p99 === false) return 'violation';
  return 'compliant';
}

export function getRoiVariant(roi: number | null, _target: number): string {
  if (roi === null) return 'default';
  if (roi >= 200) return 'success';
  if (roi >= 100) return 'warning';
  return 'error';
}

export function formatPercent(value: number, decimals: number = 0): string {
  return (value * 100).toFixed(decimals);
}

export function formatCost(value: number): string {
  return value.toFixed(2);
}

export function getHealthIconName(healthStatus: 'green' | 'yellow' | 'red' | 'pending'): string {
  if (healthStatus === 'green') return 'check_circle';
  if (healthStatus === 'red') return 'error';
  return 'info';
}

export function getSloVariant(compliant: boolean | null): 'success' | 'error' | 'default' {
  if (compliant === true) return 'success';
  if (compliant === false) return 'error';
  return 'default';
}

export function getSloBadge(sloStatus: 'compliant' | 'violation' | 'pending'): { cls: string; text: string } {
  if (sloStatus === 'compliant') return { cls: 'bg-green-100 text-green-700', text: 'Compliant' };
  if (sloStatus === 'violation') return { cls: 'bg-red-100 text-red-700', text: 'Violation' };
  return { cls: 'bg-gray-100 text-gray-500', text: 'Pending' };
}

export function getDriftStatusText(score: number | null, detected: boolean): string {
  if (score === null) return 'Pending';
  return detected ? 'DETECTED' : 'OK';
}

export function computeAIHealthStatus(
  data: {
    drift: { score: number | null; detected: boolean };
    hallucination: { rate: number | null; threshold: number };
    slo: { p95_actual_ms: number | null };
    roi: { current_percentage: number | null };
  } | null,
  sloStatus: SloComplianceStatus
): 'green' | 'yellow' | 'red' | 'pending' {
  if (!data) return 'pending';
  if (
    data.drift.score === null &&
    data.hallucination.rate === null &&
    data.slo.p95_actual_ms === null &&
    data.roi.current_percentage === null
  ) {
    return 'pending';
  }
  const hasDrift = data.drift.detected;
  const hasHallucinationIssue =
    data.hallucination.rate !== null && data.hallucination.rate > data.hallucination.threshold;
  const hasSloViolation = sloStatus === 'violation';
  const hasRoiIssue = data.roi.current_percentage !== null && data.roi.current_percentage < 100;
  if (hasDrift || hasHallucinationIssue || hasSloViolation || hasRoiIssue) return 'red';
  if (sloStatus === 'pending') return 'yellow';
  return 'green';
}

// --- Interfaces ---

interface ModelMetrics {
  name: string;
  latency_p50: number | null;
  latency_p95: number | null;
  accuracy: number | null;
  cost_per_1k: number;
  requests_24h: number;
  cost_total: number;
}

interface AIMetricsData {
  models: ModelMetrics[];
  drift: {
    detected: boolean;
    score: number | null;
    lastCheck: string | null;
    threshold: number;
    history: Array<{ date: string; score: number; detected: boolean }>;
    alerts: Array<{ timestamp: string; severity: string; message: string }>;
  };
  costs: {
    current_month: number;
    budget: number;
    forecast: number;
    trend: 'up' | 'down' | 'stable';
    history: Array<{ date: string; amount: number }>;
    by_model: Record<string, number>;
  };
  hallucination: {
    rate: number | null;
    threshold: number;
    samples_checked: number;
    history: Array<{ date: string; rate: number }>;
  };
  slo: {
    p95_target_ms: number;
    p99_target_ms: number;
    p95_actual_ms: number | null;
    p99_actual_ms: number | null;
    p95_compliant: boolean | null;
    p99_compliant: boolean | null;
    success_rate: number | null;
  };
  roi: {
    current_percentage: number | null;
    target_percentage: number;
    total_cost: number;
    total_value: number;
    trend: 'improving' | 'stable' | 'declining' | null;
  };
}

// --- Component ---

export default function AIMetrics() { // NOSONAR typescript:S3776
  const [data, setData] = useState<AIMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/tracking/ai');
      if (!response.ok) throw new Error('Failed to fetch AI metrics');
      const result = await response.json();
      setData(result.metrics);
      setLastUpdated(result.lastUpdated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/tracking/ai', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to refresh');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!loading && !document.hidden) {
        fetchData();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchData, loading]);

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

  const costUtilization = data?.costs
    ? calculateCostUtilization(data.costs.current_month, data.costs.budget)
    : 0;

  const sloStatus = data
    ? getSloComplianceStatus(data.slo.p95_compliant, data.slo.p99_compliant)
    : 'pending';
  const { cls: sloBadgeClass, text: sloBadgeText } = getSloBadge(sloStatus);
  const p95Variant = getSloVariant(data?.slo.p95_compliant ?? null);
  const p99Variant = getSloVariant(data?.slo.p99_compliant ?? null);
  const healthStatus = computeAIHealthStatus(data, sloStatus);
  const healthColors = {
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    pending: 'bg-gray-50 border-gray-200 text-gray-500',
  };
  const healthLabels = {
    green: 'Healthy',
    yellow: 'Partial Data',
    red: 'Issues Detected',
    pending: 'Pending',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon name="smart_toy" className="text-purple-600" size="xl" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">AI Metrics</h3>
            {lastUpdated && (
              <StaleIndicator lastUpdated={lastUpdated} thresholdMinutes={60} showTime />
            )}
          </div>
        </div>
        <RefreshButton onRefresh={handleRefresh} label="Refresh Metrics" disabled={loading} />
      </div>

      {/* Health Status Banner */}
      <div className={`rounded-lg p-3 border ${healthColors[healthStatus]}`}>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon name={getHealthIconName(healthStatus)} size="base" />
          AI System Health: {healthLabels[healthStatus]}
        </div>
      </div>

      {/* Drift & Hallucination Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Drift Detection */}
        <div
          className={`rounded-lg p-4 border ${
            data?.drift.detected ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Icon
                name={data?.drift.detected ? 'warning' : 'check_circle'}
                className={data?.drift.detected ? 'text-red-600' : 'text-green-600'}
                size="lg"
              />
              <span className="font-medium text-gray-900">Model Drift</span>
            </div>
            <span className={`text-sm ${data?.drift.detected ? 'text-red-600' : 'text-green-600'}`}>
              {getDriftStatusText(data?.drift.score ?? null, data?.drift.detected ?? false)}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-gray-500">Score: </span>
              <span className="text-gray-900 font-mono">
                {data && data.drift.score !== null
                  ? `${(data.drift.score * 100).toFixed(1)}%`
                  : '—'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Threshold: </span>
              <span className="text-gray-900 font-mono">
                {((data?.drift.threshold ?? 0.05) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${data?.drift.detected ? 'bg-red-500' : 'bg-green-500'}`}
              role="progressbar" // NOSONAR typescript:S6819 — inner fill bar inside container; <progress> cannot be positioned inside a parent container this way
              aria-valuenow={
                data && data.drift.score !== null
                  ? getDriftBarWidth(data.drift.score, data.drift.threshold)
                  : 0
              }
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                width: `${data && data.drift.score !== null ? getDriftBarWidth(data.drift.score, data.drift.threshold) : 0}%`,
              }}
            />
          </div>
          {/* Drift History Sparkline */}
          {data?.drift.history && data.drift.history.length >= 2 && (
            <div className="mt-3">
              <TrendSparkline
                data={data.drift.history.map((h) => ({ date: h.date, value: h.score }))}
                label="Drift score trend"
                color="#ef4444"
              />
            </div>
          )}
          {/* Drift Alerts */}
          {data?.drift.alerts && data.drift.alerts.length > 0 && (
            <div className="mt-3 space-y-1">
              {data.drift.alerts.map((alert, i) => (
                <div key={i} className="text-xs flex items-center gap-2"> {/* NOSONAR typescript:S6479 */}
                  <span
                    className={`font-medium ${alert.severity === 'critical' ? 'text-red-600' : 'text-yellow-600'}`}
                  >
                    [{alert.severity}]
                  </span>
                  <span className="text-gray-600">{alert.message}</span>
                  <span className="text-gray-400">{alert.timestamp}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hallucination Rate */}
        <div
          className={`rounded-lg p-4 border ${
            data &&
            data.hallucination.rate !== null &&
            data.hallucination.rate > data.hallucination.threshold
              ? 'bg-red-50 border-red-200'
              : 'bg-green-50 border-green-200'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Icon
                name="psychology"
                className={
                  data &&
                  data.hallucination.rate !== null &&
                  data.hallucination.rate > data.hallucination.threshold
                    ? 'text-red-600'
                    : 'text-green-600'
                }
                size="lg"
              />
              <span className="font-medium text-gray-900">Hallucination Rate</span>
            </div>
            <span
              className={`text-sm ${
                data &&
                data.hallucination.rate !== null &&
                data.hallucination.rate > data.hallucination.threshold
                  ? 'text-red-600'
                  : 'text-green-600'
              }`}
            >
              {data && data.hallucination.rate !== null
                ? `${(data.hallucination.rate * 100).toFixed(1)}%`
                : 'Pending'}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-gray-500">Samples: </span>
              <span className="text-gray-900 font-mono">
                {data?.hallucination.samples_checked ?? 0}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Threshold: </span>
              <span className="text-gray-900 font-mono">
                {((data?.hallucination.threshold ?? 0.05) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          {/* Hallucination History Sparkline */}
          {data?.hallucination.history && data.hallucination.history.length >= 2 && (
            <div className="mt-3">
              <TrendSparkline
                data={data.hallucination.history.map((h) => ({ date: h.date, value: h.rate }))}
                label="Hallucination rate trend"
                color="#f59e0b"
              />
            </div>
          )}
        </div>
      </div>

      {/* SLO Compliance */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-4">
          <Icon name="speed" size="base" />
          SLO Compliance
          <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${sloBadgeClass}`}>
            {sloBadgeText}
          </span>
        </h4>
        <div className="grid grid-cols-3 gap-4">
          <MetricCard
            title="P95 Latency"
            value={
              data && data.slo.p95_actual_ms !== null ? `${data.slo.p95_actual_ms}ms` : 'Pending'
            }
            subtitle={`Target: ${data?.slo.p95_target_ms ?? 2000}ms`}
            icon="timer"
            variant={p95Variant}
          />
          <MetricCard
            title="P99 Latency"
            value={
              data && data.slo.p99_actual_ms !== null ? `${data.slo.p99_actual_ms}ms` : 'Pending'
            }
            subtitle={`Target: ${data?.slo.p99_target_ms ?? 5000}ms`}
            icon="timer"
            variant={p99Variant}
          />
          <MetricCard
            title="Success Rate"
            value={
              data && data.slo.success_rate !== null
                ? `${(data.slo.success_rate * 100).toFixed(1)}%`
                : 'Pending'
            }
            icon="check_circle"
            variant={
              data && data.slo.success_rate !== null && data.slo.success_rate >= 0.99
                ? 'success'
                : 'default'
            }
          />
        </div>
      </div>

      {/* ROI Tracking */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-4">
          <Icon name="trending_up" size="base" />
          ROI Tracking
          {data?.roi.trend && <span className="text-xs text-gray-500">({data.roi.trend})</span>}
        </h4>
        <div className="grid grid-cols-3 gap-4">
          <MetricCard
            title="Current ROI"
            value={
              data && data.roi.current_percentage !== null
                ? `${data.roi.current_percentage}%`
                : 'Tracking — no data yet'
            }
            subtitle={`Target: ${data?.roi.target_percentage ?? 200}%`}
            icon="analytics"
            variant={
              getRoiVariant(
                data?.roi.current_percentage ?? null,
                data?.roi.target_percentage ?? 200
              ) as 'success' | 'warning' | 'error' | 'default'
            }
          />
          <MetricCard
            title="Total Cost"
            value={`$${formatCost(data?.roi.total_cost ?? 0)}`}
            icon="credit_card"
            variant="default"
          />
          <MetricCard
            title="Total Value"
            value={`$${formatCost(data?.roi.total_value ?? 0)}`}
            icon="attach_money"
            variant="default"
          />
        </div>
      </div>

      {/* Cost Tracking */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Icon name="attach_money" size="base" />
            Cost Tracking (Current Month)
          </h4>
          <span className={`text-sm ${getCostUtilizationColor(costUtilization)}`}>
            {costUtilization}% of budget
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <MetricCard
            title="Current"
            value={`$${formatCost(data?.costs.current_month ?? 0)}`}
            icon="credit_card"
            variant="info"
          />
          <MetricCard
            title="Budget"
            value={`$${formatCost(data?.costs.budget ?? 0)}`}
            icon="account_balance_wallet"
            variant="default"
          />
          <MetricCard
            title="Forecast"
            value={`$${formatCost(data?.costs.forecast ?? 0)}`}
            icon="trending_up"
            trend={data?.costs.trend}
            variant={
              (data?.costs.forecast ?? 0) > (data?.costs.budget ?? 0) ? 'warning' : 'default'
            }
          />
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          {(() => {
            const midCostBarColor = costUtilization > 70 ? 'bg-yellow-500' : 'bg-green-500';
            const costBarColor = costUtilization > 90 ? 'bg-red-500' : midCostBarColor;
            return (
              <div
                className={`h-full transition-all ${costBarColor}`}
                role="progressbar" // NOSONAR typescript:S6819 — inner fill bar inside container; <progress> cannot be positioned inside a parent container this way
                aria-valuenow={Math.min(costUtilization, 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{ width: `${Math.min(costUtilization, 100)}%` }}
              />
            );
          })()}
        </div>
        {/* Per-model cost breakdown */}
        {data?.costs.by_model && Object.keys(data.costs.by_model).length > 0 && (
          <div className="mt-4">
            <h5 className="text-xs font-medium text-gray-500 mb-2">Cost by Model</h5>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(data.costs.by_model).map(([model, cost]) => (
                <MetricCard
                  key={model}
                  title={model}
                  value={`$${formatCost(cost)}`}
                  icon="memory"
                  variant="default"
                />
              ))}
            </div>
          </div>
        )}
        {/* Cost History Sparkline */}
        {data?.costs.history && data.costs.history.length >= 2 && (
          <div className="mt-3">
            <TrendSparkline
              data={data.costs.history.map((h) => ({ date: h.date, value: h.amount }))}
              label="Cost trend"
              color="#3b82f6"
            />
          </div>
        )}
      </div>

      {/* Model Performance Table */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Icon name="memory" size="base" />
            Model Performance
          </h4>
        </div>
        {(data?.models || []).length === 0 ? (
          <div className="p-4 text-sm text-gray-500 text-center">
            No model data available — Pending
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left text-xs font-medium text-gray-500 p-3">Model</th>
                <th className="text-center text-xs font-medium text-gray-500 p-3">Latency (p50)</th>
                <th className="text-center text-xs font-medium text-gray-500 p-3">Latency (p95)</th>
                <th className="text-center text-xs font-medium text-gray-500 p-3">Accuracy</th>
                <th className="text-center text-xs font-medium text-gray-500 p-3">Cost/1K</th>
                <th className="text-center text-xs font-medium text-gray-500 p-3">Cost Total</th>
                <th className="text-center text-xs font-medium text-gray-500 p-3">
                  Requests (24h)
                </th>
              </tr>
            </thead>
            <tbody>
              {(data?.models || []).map((model) => (
                <tr key={model.name} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-3 font-medium text-gray-900">{model.name}</td>
                  <td className="p-3 text-center">
                    {model.latency_p50 === null ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <span
                        className={`font-mono text-sm ${getLatencyColor(model.latency_p50, { green: 500, yellow: 1000 })}`}
                      >
                        {model.latency_p50}ms
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    {model.latency_p95 === null ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <span
                        className={`font-mono text-sm ${getLatencyColor(model.latency_p95, { green: 1000, yellow: 2000 })}`}
                      >
                        {model.latency_p95}ms
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    {model.accuracy === null ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <span className={`font-mono text-sm ${getAccuracyColor(model.accuracy)}`}>
                        {(model.accuracy * 100).toFixed(0)}%
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center font-mono text-sm text-gray-700">
                    ${model.cost_per_1k.toFixed(3)}
                  </td>
                  <td className="p-3 text-center font-mono text-sm text-gray-700">
                    ${formatCost(model.cost_total)}
                  </td>
                  <td className="p-3 text-center font-mono text-sm text-gray-700">
                    {model.requests_24h.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
