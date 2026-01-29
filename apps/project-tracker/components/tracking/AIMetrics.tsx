'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/lib/icons';
import { RefreshButton, MetricCard, StaleIndicator } from './shared';

interface ModelMetrics {
  name: string;
  latency_p50: number;
  latency_p95: number;
  accuracy: number;
  cost_per_1k: number;
  requests_24h: number;
}

interface AIMetricsData {
  models: ModelMetrics[];
  drift: {
    detected: boolean;
    score: number;
    lastCheck: string;
    threshold: number;
  };
  costs: {
    current_month: number;
    budget: number;
    forecast: number;
    trend: 'up' | 'down' | 'stable';
  };
  hallucination: {
    rate: number;
    threshold: number;
    samples_checked: number;
  };
}

export default function AIMetrics() {
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

  const costUtilization = data?.costs
    ? Math.round((data.costs.current_month / data.costs.budget) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon name="smart_toy" className="text-purple-400" size="xl" />
          <div>
            <h3 className="text-lg font-semibold text-white">AI Metrics</h3>
            {lastUpdated && (
              <StaleIndicator
                lastUpdated={lastUpdated}
                thresholdMinutes={60}
                showTime
              />
            )}
          </div>
        </div>
        <RefreshButton
          onRefresh={handleRefresh}
          label="Refresh Metrics"
          disabled={loading}
        />
      </div>

      {/* Drift & Hallucination Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Drift Detection */}
        <div className={`rounded-lg p-4 border ${
          data?.drift.detected
            ? 'bg-red-500/10 border-red-500/30'
            : 'bg-green-500/10 border-green-500/30'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Icon
                name={data?.drift.detected ? 'warning' : 'check_circle'}
                className={data?.drift.detected ? 'text-red-400' : 'text-green-400'}
                size="lg"
              />
              <span className="font-medium text-white">Model Drift</span>
            </div>
            <span className={`text-sm ${data?.drift.detected ? 'text-red-400' : 'text-green-400'}`}>
              {data?.drift.detected ? 'DETECTED' : 'OK'}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-gray-400">Score: </span>
              <span className="text-white font-mono">
                {((data?.drift.score ?? 0) * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-gray-400">Threshold: </span>
              <span className="text-white font-mono">
                {((data?.drift.threshold ?? 0.05) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${data?.drift.detected ? 'bg-red-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min((data?.drift.score ?? 0) / (data?.drift.threshold ?? 0.05) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Hallucination Rate */}
        <div className={`rounded-lg p-4 border ${
          (data?.hallucination.rate ?? 0) > (data?.hallucination.threshold ?? 0.05)
            ? 'bg-red-500/10 border-red-500/30'
            : 'bg-green-500/10 border-green-500/30'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Icon
                name="psychology"
                className={(data?.hallucination.rate ?? 0) > (data?.hallucination.threshold ?? 0.05) ? 'text-red-400' : 'text-green-400'}
                size="lg"
              />
              <span className="font-medium text-white">Hallucination Rate</span>
            </div>
            <span className={`text-sm ${
              (data?.hallucination.rate ?? 0) > (data?.hallucination.threshold ?? 0.05)
                ? 'text-red-400'
                : 'text-green-400'
            }`}>
              {((data?.hallucination.rate ?? 0) * 100).toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-gray-400">Samples: </span>
              <span className="text-white font-mono">
                {data?.hallucination.samples_checked ?? 0}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Threshold: </span>
              <span className="text-white font-mono">
                {((data?.hallucination.threshold ?? 0.05) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Cost Tracking */}
      <div className="bg-gray-700/30 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Icon name="attach_money" size="base" />
            Cost Tracking (Current Month)
          </h4>
          <span className={`text-sm ${costUtilization > 90 ? 'text-red-400' : costUtilization > 70 ? 'text-yellow-400' : 'text-green-400'}`}>
            {costUtilization}% of budget
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <MetricCard
            title="Current"
            value={`$${data?.costs.current_month.toFixed(2) ?? '0.00'}`}
            icon="credit_card"
            variant="info"
          />
          <MetricCard
            title="Budget"
            value={`$${data?.costs.budget.toFixed(2) ?? '0.00'}`}
            icon="account_balance_wallet"
            variant="default"
          />
          <MetricCard
            title="Forecast"
            value={`$${data?.costs.forecast.toFixed(2) ?? '0.00'}`}
            icon="trending_up"
            trend={data?.costs.trend}
            variant={(data?.costs.forecast ?? 0) > (data?.costs.budget ?? 0) ? 'warning' : 'default'}
          />
        </div>
        <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              costUtilization > 90
                ? 'bg-red-500'
                : costUtilization > 70
                ? 'bg-yellow-500'
                : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(costUtilization, 100)}%` }}
          />
        </div>
      </div>

      {/* Model Performance Table */}
      <div className="bg-gray-700/30 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Icon name="memory" size="base" />
            Model Performance
          </h4>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left text-xs font-medium text-gray-400 p-3">Model</th>
              <th className="text-center text-xs font-medium text-gray-400 p-3">Latency (p50)</th>
              <th className="text-center text-xs font-medium text-gray-400 p-3">Latency (p95)</th>
              <th className="text-center text-xs font-medium text-gray-400 p-3">Accuracy</th>
              <th className="text-center text-xs font-medium text-gray-400 p-3">Cost/1K</th>
              <th className="text-center text-xs font-medium text-gray-400 p-3">Requests (24h)</th>
            </tr>
          </thead>
          <tbody>
            {(data?.models || []).map((model) => (
              <tr key={model.name} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                <td className="p-3 font-medium text-white">{model.name}</td>
                <td className="p-3 text-center">
                  <span className={`font-mono text-sm ${model.latency_p50 < 500 ? 'text-green-400' : model.latency_p50 < 1000 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {model.latency_p50}ms
                  </span>
                </td>
                <td className="p-3 text-center">
                  <span className={`font-mono text-sm ${model.latency_p95 < 1000 ? 'text-green-400' : model.latency_p95 < 2000 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {model.latency_p95}ms
                  </span>
                </td>
                <td className="p-3 text-center">
                  <span className={`font-mono text-sm ${model.accuracy >= 0.9 ? 'text-green-400' : model.accuracy >= 0.8 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {(model.accuracy * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="p-3 text-center font-mono text-sm text-gray-300">
                  ${model.cost_per_1k.toFixed(3)}
                </td>
                <td className="p-3 text-center font-mono text-sm text-gray-300">
                  {model.requests_24h.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
