'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/lib/icons';
import { StaleIndicator } from './shared';

interface CadenceTask {
  task_id: string;
  description: string;
  cadence: string;
  threshold_days: number;
  status: 'fresh' | 'stale' | 'missing';
  artifacts: Array<{
    path: string;
    last_modified: string | null;
    age_days: number | null;
    threshold_days: number;
    status: 'fresh' | 'stale' | 'missing';
  }>;
}

interface CadenceFreshnessData {
  total: number;
  fresh: number;
  stale: number;
  missing: number;
  freshnessScore: string;
  lastUpdated: string | null;
  tasks?: CadenceTask[];
}

export default function ContinuousTaskHealth() {
  const [data, setData] = useState<CadenceFreshnessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/tracking/quality');
      const json = await res.json();
      if (json.status === 'ok' && json.metrics?.cadenceFreshness) {
        setData(json.metrics.cadenceFreshness);
      }
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-48 rounded bg-gray-200" />
          <div className="h-8 w-24 rounded bg-gray-200" />
          <div className="h-3 w-64 rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-medium text-gray-600">Continuous Task Health</h3>
        <p className="mt-2 text-xs text-gray-400">No cadence data available</p>
      </div>
    );
  }

  const { total, fresh, stale, missing, freshnessScore, lastUpdated } = data;

  const variant = stale === 0 && missing === 0 ? 'success' : stale > 0 ? 'warning' : 'error';

  const variantStyles = {
    success: 'border-green-200 bg-green-50',
    warning: 'border-amber-200 bg-amber-50',
    error: 'border-red-200 bg-red-50',
  };

  const badgeStyles = {
    success: 'bg-green-100 text-green-800',
    warning: 'bg-amber-100 text-amber-800',
    error: 'bg-red-100 text-red-800',
  };

  const statusIcon = {
    fresh: { name: 'check_circle', color: 'text-green-500' },
    stale: { name: 'warning', color: 'text-amber-500' },
    missing: { name: 'error', color: 'text-red-500' },
  } as const;

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Icon name="autorenew" size="lg" className="text-gray-600" />
          <h3 className="text-sm font-medium text-gray-600">Continuous Task Health</h3>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeStyles[variant]}`}>
          {fresh}/{total} fresh
        </span>
      </div>

      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-900">{freshnessScore}</p>
        <p className="text-xs text-gray-500">Freshness score</p>
      </div>

      {(stale > 0 || missing > 0) && (
        <div className="mt-3 space-y-1.5">
          {stale > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <Icon name="warning" size="xs" className="text-amber-500" />
              <span className="text-amber-700">
                {stale} task{stale > 1 ? 's' : ''} stale
              </span>
            </div>
          )}
          {missing > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <Icon name="error" size="xs" className="text-red-500" />
              <span className="text-red-700">
                {missing} task{missing > 1 ? 's' : ''} missing artifacts
              </span>
            </div>
          )}
        </div>
      )}

      {data.tasks && data.tasks.length > 0 && (
        <div className="mt-3 border-t border-gray-200 pt-2">
          <ul className="space-y-1">
            {data.tasks.map((task) => {
              const si = statusIcon[task.status];
              return (
                <li key={task.task_id} className="flex items-center gap-1.5 text-xs">
                  <Icon name={si.name} size="xs" className={si.color} />
                  <span className="font-mono text-gray-700">{task.task_id}</span>
                  <span className="text-gray-400">{task.cadence}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {lastUpdated && (
        <div className="mt-3 border-t border-gray-200 pt-2">
          <StaleIndicator lastUpdated={lastUpdated} thresholdMinutes={1440} />
        </div>
      )}
    </div>
  );
}
