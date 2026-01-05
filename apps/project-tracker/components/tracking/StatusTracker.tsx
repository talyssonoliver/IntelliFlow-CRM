'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/lib/icons';
import { RefreshButton, MetricCard, StaleIndicator } from './shared';

interface StatusSnapshot {
  summary: {
    total: number;
    completed: number;
    in_progress: number;
    planned: number;
    backlog: number;
    blocked: number;
  };
  by_sprint: Record<string, { total: number; completed: number }>;
  by_section: Record<string, { total: number; completed: number }>;
  recent_completions: Array<{
    task_id: string;
    description: string;
    completed_at: string;
  }>;
  lastUpdated: string | null;
}

export default function StatusTracker() {
  const [data, setData] = useState<StatusSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/tracking/status');
      if (!response.ok) throw new Error('Failed to fetch status');
      const result = await response.json();
      setData({
        summary: result.snapshot?.summary || {
          total: 0,
          completed: 0,
          in_progress: 0,
          planned: 0,
          backlog: 0,
          blocked: 0,
        },
        by_sprint: result.snapshot?.by_sprint || {},
        by_section: result.snapshot?.by_section || {},
        recent_completions: result.snapshot?.recent_completions || [],
        lastUpdated: result.lastUpdated,
      });
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
      const response = await fetch('/api/tracking/status', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to refresh status');
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

  const summary = data?.summary || {
    total: 0,
    completed: 0,
    in_progress: 0,
    planned: 0,
    backlog: 0,
    blocked: 0,
  };
  const completionRate = summary.total > 0
    ? Math.round((summary.completed / summary.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon name="monitoring" className="text-blue-400" size="xl" />
          <div>
            <h3 className="text-lg font-semibold text-white">Status Snapshot</h3>
            {data?.lastUpdated && (
              <StaleIndicator
                lastUpdated={data.lastUpdated}
                thresholdMinutes={60}
                showTime
              />
            )}
          </div>
        </div>
        <RefreshButton
          onRefresh={handleRefresh}
          label="Regenerate"
          disabled={loading}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard
          title="Total Tasks"
          value={summary.total}
          icon="view_list"
          variant="info"
        />
        <MetricCard
          title="Completed"
          value={summary.completed}
          subtitle={`${completionRate}%`}
          icon="check_circle"
          variant="success"
        />
        <MetricCard
          title="In Progress"
          value={summary.in_progress}
          icon="schedule"
          variant="warning"
        />
        <MetricCard
          title="Planned"
          value={summary.planned}
          icon="calendar_today"
          variant="default"
        />
        <MetricCard
          title="Backlog"
          value={summary.backlog}
          icon="inbox"
          variant="default"
        />
        <MetricCard
          title="Blocked"
          value={summary.blocked}
          icon="cancel"
          variant={summary.blocked > 0 ? 'error' : 'default'}
        />
      </div>

      {/* Progress Bar */}
      <div className="bg-gray-700/30 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">Overall Progress</span>
          <span className="text-sm font-medium text-white">{completionRate}%</span>
        </div>
        <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
            style={{ width: `${completionRate}%` }}
          />
        </div>
      </div>

      {/* Sprint Breakdown */}
      {data?.by_sprint && Object.keys(data.by_sprint).length > 0 && (
        <div className="bg-gray-700/30 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-300 mb-3">By Sprint</h4>
          <div className="space-y-2">
            {Object.entries(data.by_sprint)
              .sort(([a], [b]) => parseInt(a) - parseInt(b))
              .slice(0, 6)
              .map(([sprint, stats]) => {
                const pct = stats.total > 0
                  ? Math.round((stats.completed / stats.total) * 100)
                  : 0;
                return (
                  <div key={sprint} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-16">Sprint {sprint}</span>
                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-12 text-right">
                      {stats.completed}/{stats.total}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Recent Completions */}
      {data?.recent_completions && data.recent_completions.length > 0 && (
        <div className="bg-gray-700/30 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-300 mb-3">Recent Completions</h4>
          <div className="space-y-2">
            {data.recent_completions.slice(0, 5).map((item) => (
              <div
                key={item.task_id}
                className="flex items-center gap-3 text-sm"
              >
                <Icon name="check_circle" className="text-green-400" size="base" />
                <span className="font-mono text-blue-400">{item.task_id}</span>
                <span className="text-gray-400 truncate flex-1">
                  {item.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
