'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Icon } from '@/lib/icons';

interface HistorySummary {
  total: number;
  completed: number;
  in_progress: number;
  blocked: number;
  backlog: number;
}

interface HistoryDelta {
  completed: number;
  in_progress: number;
  blocked: number;
  backlog: number;
}

interface HistoryEntry {
  timestamp: string;
  summary: HistorySummary;
  delta?: HistoryDelta;
}

interface StatusHistoryProps {
  onBack?: () => void;
}

export default function StatusHistory({ onBack }: Readonly<StatusHistoryProps>) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/tracking/status?history=true');
      if (!response.ok) throw new Error('Failed to fetch history');
      const data = await response.json();
      setEntries(data.entries || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const trend = useMemo(() => {
    if (entries.length < 2) return null;

    const totalCompleted = entries
      .slice(0, Math.min(5, entries.length))
      .reduce((sum, e) => sum + (e.delta?.completed || 0), 0);

    if (totalCompleted > 0) return { direction: 'up' as const, value: totalCompleted };
    if (totalCompleted < 0) return { direction: 'down' as const, value: Math.abs(totalCompleted) };
    return { direction: 'stable' as const, value: 0 };
  }, [entries]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderDelta = (value: number, label: string) => {
    if (value === 0) return null;
    const isPositive = value > 0;
    const colorClass = label === 'completed'
      ? (isPositive ? 'text-green-400' : 'text-red-400')
      : label === 'blocked'
        ? (isPositive ? 'text-red-400' : 'text-green-400')
        : 'text-gray-400';

    return (
      <span className={`text-xs font-medium ${colorClass}`}>
        {isPositive ? '+' : ''}{value}
      </span>
    );
  };

  if (loading) {
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
          onClick={fetchHistory}
          className="mt-2 text-sm underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1 rounded hover:bg-gray-700/50 transition-colors"
              aria-label="Back to current view"
            >
              <Icon name="arrow_back" size="lg" className="text-gray-400" />
            </button>
          )}
          <Icon name="history" className="text-blue-400" size="xl" />
          <div>
            <h3 className="text-lg font-semibold text-white">Status History</h3>
            <p className="text-sm text-gray-400">
              {entries.length} snapshot{entries.length !== 1 ? 's' : ''} recorded
            </p>
          </div>
        </div>
        <button
          onClick={fetchHistory}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
        >
          <Icon name="refresh" size="sm" />
          Refresh
        </button>
      </div>

      {/* Trend Summary */}
      {trend && (
        <div className="bg-gray-700/30 rounded-lg p-4 border border-gray-600">
          <div className="flex items-center gap-3">
            <Icon
              name={trend.direction === 'up' ? 'trending_up' : trend.direction === 'down' ? 'trending_down' : 'remove'}
              size="xl"
              className={trend.direction === 'up' ? 'text-green-400' : trend.direction === 'down' ? 'text-red-400' : 'text-gray-400'}
            />
            <div>
              <p className="text-sm text-gray-400">Recent Trend</p>
              <p className={`text-lg font-semibold ${trend.direction === 'up' ? 'text-green-400' : trend.direction === 'down' ? 'text-red-400' : 'text-gray-300'}`}>
                {trend.direction === 'stable'
                  ? 'No change'
                  : `${trend.value} task${trend.value !== 1 ? 's' : ''} ${trend.direction === 'up' ? 'completed' : 'regressed'}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* History Timeline */}
      {entries.length === 0 ? (
        <div className="bg-gray-700/30 rounded-lg p-8 text-center border border-gray-600">
          <Icon name="history" size="2xl" className="text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400">No history available yet.</p>
          <p className="text-sm text-gray-500 mt-1">
            Click &ldquo;Regenerate&rdquo; in the current view to start tracking history.
          </p>
        </div>
      ) : (
        <div className="bg-gray-700/30 rounded-lg border border-gray-600 overflow-hidden">
          <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-600">
            <h4 className="text-sm font-medium text-gray-300">Timeline</h4>
          </div>
          <div className="divide-y divide-gray-600">
            {entries.map((entry, index) => (
              <div
                key={entry.timestamp}
                className={`px-4 py-3 ${index === 0 ? 'bg-blue-500/5' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Timestamp */}
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <Icon
                      name={index === 0 ? 'schedule' : 'history'}
                      size="sm"
                      className={index === 0 ? 'text-blue-400' : 'text-gray-500'}
                    />
                    <span className={`text-sm ${index === 0 ? 'text-blue-400 font-medium' : 'text-gray-400'}`}>
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  </div>

                  {/* Summary */}
                  <div className="flex-1 flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Icon name="check_circle" size="sm" className="text-green-400" />
                      <span className="text-sm text-white">{entry.summary.completed}</span>
                      {entry.delta && renderDelta(entry.delta.completed, 'completed')}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icon name="schedule" size="sm" className="text-yellow-400" />
                      <span className="text-sm text-white">{entry.summary.in_progress}</span>
                      {entry.delta && renderDelta(entry.delta.in_progress, 'in_progress')}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icon name="cancel" size="sm" className="text-red-400" />
                      <span className="text-sm text-white">{entry.summary.blocked}</span>
                      {entry.delta && renderDelta(entry.delta.blocked, 'blocked')}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icon name="inbox" size="sm" className="text-gray-400" />
                      <span className="text-sm text-white">{entry.summary.backlog}</span>
                      {entry.delta && renderDelta(entry.delta.backlog, 'backlog')}
                    </div>
                  </div>

                  {/* Total */}
                  <div className="text-right">
                    <span className="text-xs text-gray-500">Total</span>
                    <p className="text-sm font-medium text-white">{entry.summary.total}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
