'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Icon } from '@/lib/icons';
import { RefreshButton } from './shared';

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

type TrendDirection = 'up' | 'down' | 'stable';
interface TrendData {
  direction: TrendDirection;
  value: number;
}

function getTrendIcon(direction: Readonly<TrendDirection>): { name: string; className: string } {
  if (direction === 'up') return { name: 'trending_up', className: 'text-green-600' };
  if (direction === 'down') return { name: 'trending_down', className: 'text-red-600' };
  return { name: 'remove', className: 'text-gray-500' };
}

function getTrendText(trend: Readonly<TrendData>): { content: string; className: string } {
  if (trend.direction === 'stable') return { content: 'No change', className: 'text-gray-700' };
  const label = trend.direction === 'up' ? 'completed' : 'regressed';
  const content = `${trend.value} task${trend.value === 1 ? '' : 's'} ${label}`;
  const className = trend.direction === 'up' ? 'text-green-600' : 'text-red-600';
  return { content, className };
}

function TrendSummary({ trend }: Readonly<{ trend: TrendData }>) {
  const icon = getTrendIcon(trend.direction);
  const text = getTrendText(trend);
  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <div className="flex items-center gap-3">
        <Icon name={icon.name} size="xl" className={icon.className} />
        <div>
          <p className="text-sm text-gray-500">Recent Trend</p>
          <p className={`text-lg font-semibold ${text.className}`}>{text.content}</p>
        </div>
      </div>
    </div>
  );
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

  const getDeltaColorClass = (label: string, isPositive: boolean): string => {
    if (label === 'completed') return isPositive ? 'text-green-600' : 'text-red-600';
    if (label === 'blocked') return isPositive ? 'text-red-600' : 'text-green-600';
    return 'text-gray-500';
  };

  const renderDelta = (value: number, label: string) => {
    if (value === 0) return null;
    const isPositive = value > 0;
    const colorClass = getDeltaColorClass(label, isPositive);

    return (
      <span className={`text-xs font-medium ${colorClass}`}>
        {isPositive ? '+' : ''}
        {value}
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
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
        <div className="flex items-center gap-2">
          <Icon name="error" size="lg" />
          <span>Error: {error}</span>
        </div>
        <button onClick={fetchHistory} className="mt-2 text-sm underline hover:no-underline">
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
              className="p-1 rounded hover:bg-gray-100 transition-colors"
              aria-label="Back to current view"
            >
              <Icon name="arrow_back" size="lg" className="text-gray-500" />
            </button>
          )}
          <Icon name="history" className="text-blue-600" size="xl" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Status History</h3>
            <p className="text-sm text-gray-500">
              {entries.length} snapshot{entries.length === 1 ? '' : 's'} recorded
            </p>
          </div>
        </div>
        <RefreshButton
          onRefresh={fetchHistory}
          label="Refresh History"
          variant="outline"
          size="sm"
        />
      </div>

      {/* Trend Summary */}
      {trend && <TrendSummary trend={trend} />}

      {/* History Timeline */}
      {entries.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center border border-gray-200">
          <Icon name="history" size="2xl" className="text-gray-500 mx-auto mb-3" />
          <p className="text-gray-500">No history available yet.</p>
          <p className="text-sm text-gray-500 mt-1">
            Click &ldquo;Regenerate&rdquo; in the current view to start tracking history.
          </p>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
            <h4 className="text-sm font-medium text-gray-700">Timeline</h4>
          </div>
          <div className="divide-y divide-gray-200">
            {entries.map((entry, index) => (
              <div key={entry.timestamp} className={`px-4 py-3 ${index === 0 ? 'bg-blue-50' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  {/* Timestamp */}
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <Icon
                      name={index === 0 ? 'schedule' : 'history'}
                      size="sm"
                      className={index === 0 ? 'text-blue-600' : 'text-gray-600'}
                    />
                    <span
                      className={`text-sm ${index === 0 ? 'text-blue-600 font-medium' : 'text-gray-500'}`}
                    >
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  </div>

                  {/* Summary */}
                  <div className="flex-1 flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Icon name="check_circle" size="sm" className="text-green-600" />
                      <span className="text-sm text-gray-900">{entry.summary.completed}</span>
                      {entry.delta && renderDelta(entry.delta.completed, 'completed')}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icon name="schedule" size="sm" className="text-yellow-600" />
                      <span className="text-sm text-gray-900">{entry.summary.in_progress}</span>
                      {entry.delta && renderDelta(entry.delta.in_progress, 'in_progress')}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icon name="cancel" size="sm" className="text-red-600" />
                      <span className="text-sm text-gray-900">{entry.summary.blocked}</span>
                      {entry.delta && renderDelta(entry.delta.blocked, 'blocked')}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icon name="inbox" size="sm" className="text-gray-500" />
                      <span className="text-sm text-gray-900">{entry.summary.backlog}</span>
                      {entry.delta && renderDelta(entry.delta.backlog, 'backlog')}
                    </div>
                  </div>

                  {/* Total */}
                  <div className="text-right">
                    <span className="text-xs text-gray-600">Total</span>
                    <p className="text-sm font-medium text-gray-900">{entry.summary.total}</p>
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
