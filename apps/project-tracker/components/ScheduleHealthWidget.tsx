'use client';

import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { Icon } from '@/lib/icons';

/**
 * Schedule Health Widget
 *
 * Displays PMBOK EVM metrics in a compact dashboard card:
 * - SPI (Schedule Performance Index) gauge
 * - Schedule Variance
 * - Critical path completion %
 * - Tasks at risk
 */

interface ScheduleHealthData {
  spi: number;
  svMinutes: number;
  status: 'ahead' | 'on_track' | 'behind' | 'critical';
  criticalPathCount: number;
  criticalPathCompletion: number;
  bottleneckTaskId?: string;
  atRiskCount: number;
}

interface ScheduleHealthWidgetProps {
  sprint?: number | 'all';
}

export default function ScheduleHealthWidget({ sprint = 0 }: ScheduleHealthWidgetProps) {
  const [data, setData] = useState<ScheduleHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sprintNum = sprint === 'all' ? 0 : sprint;
    setLoading(true);
    setError(null);

    fetch(`/api/schedule/calculate?sprint=${sprintNum}`)
      .then((res) => res.json())
      .then((result) => {
        if (result.error) {
          setError(result.error);
        } else {
          // Calculate at-risk tasks (critical path tasks not yet complete)
          const criticalTasks = Object.values(result.tasks || {}).filter(
            (t: any) => t.isCritical
          );
          const atRiskCount = criticalTasks.filter(
            (t: any) => t.percentComplete < 100 && t.totalFloat <= 0
          ).length;

          setData({
            spi: result.scheduleVariance.spi,
            svMinutes: result.scheduleVariance.svMinutes,
            status: result.scheduleVariance.status,
            criticalPathCount: result.criticalPath.taskIds.length,
            criticalPathCompletion: result.criticalPath.completionPercentage,
            bottleneckTaskId: result.criticalPath.bottleneckTaskId,
            atRiskCount,
          });
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [sprint]);

  const getSpiColor = (spi: number) => {
    if (spi >= 1.1) return 'text-green-600';
    if (spi >= 0.95) return 'text-blue-600';
    if (spi >= 0.8) return 'text-amber-600';
    return 'text-red-600';
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'ahead':
        return { label: 'Ahead', color: 'bg-green-100 text-green-800', iconColor: 'text-green-500' };
      case 'on_track':
        return { label: 'On Track', color: 'bg-blue-100 text-blue-800', iconColor: 'text-blue-500' };
      case 'behind':
        return { label: 'Behind', color: 'bg-amber-100 text-amber-800', iconColor: 'text-amber-500' };
      case 'critical':
        return { label: 'Critical', color: 'bg-red-100 text-red-800', iconColor: 'text-red-500' };
      default:
        return { label: status, color: 'bg-gray-100 text-gray-800', iconColor: 'text-gray-500' };
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <Icon name="speed" size="lg" className="text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900">Schedule Health</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <Icon name="speed" size="lg" className="text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900">Schedule Health</h3>
        </div>
        <div className="text-center py-4">
          <p className="text-gray-500 text-sm">
            {error || 'No schedule data available'}
          </p>
        </div>
      </div>
    );
  }

  const statusConfig = getStatusConfig(data.status);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Icon name="speed" size="lg" className={statusConfig.iconColor} />
          <h3 className="text-lg font-semibold text-gray-900">Schedule Health</h3>
        </div>
        <span className={clsx('px-3 py-1 text-sm font-medium rounded-full', statusConfig.color)}>
          {statusConfig.label}
        </span>
      </div>

      {/* Main metrics grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {/* SPI */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">SPI</div>
          <div className={clsx('text-2xl font-bold', getSpiColor(data.spi))}>
            {data.spi.toFixed(2)}
          </div>
          <div className="text-xs text-gray-400">
            {data.spi >= 1 ? 'Efficient' : 'Behind target'}
          </div>
        </div>

        {/* Schedule Variance */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Schedule Variance</div>
          <div
            className={clsx(
              'text-2xl font-bold',
              data.svMinutes >= 0 ? 'text-green-600' : 'text-red-600'
            )}
          >
            {data.svMinutes >= 0 ? '+' : ''}
            {Math.round(data.svMinutes / 60 * 10) / 10}h
          </div>
          <div className="text-xs text-gray-400">
            {data.svMinutes >= 0 ? 'Ahead' : 'Behind'} schedule
          </div>
        </div>

        {/* Critical Path */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Critical Path</div>
          <div className="text-2xl font-bold text-red-600">{data.criticalPathCount}</div>
          <div className="text-xs text-gray-400">
            {data.criticalPathCompletion}% complete
          </div>
        </div>

        {/* At Risk */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">At Risk</div>
          <div
            className={clsx(
              'text-2xl font-bold',
              data.atRiskCount > 0 ? 'text-amber-600' : 'text-green-600'
            )}
          >
            {data.atRiskCount}
          </div>
          <div className="text-xs text-gray-400">
            {data.atRiskCount === 0 ? 'No risks' : 'tasks need attention'}
          </div>
        </div>
      </div>

      {/* Critical path progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-gray-600">Critical Path Progress</span>
          <span className="font-medium text-gray-900">{data.criticalPathCompletion}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all',
              data.criticalPathCompletion >= 100
                ? 'bg-green-500'
                : data.criticalPathCompletion >= 50
                  ? 'bg-blue-500'
                  : 'bg-red-500'
            )}
            style={{ width: `${data.criticalPathCompletion}%` }}
          />
        </div>
      </div>

      {/* Bottleneck indicator */}
      {data.bottleneckTaskId && (
        <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg border border-red-200">
          <Icon name="block" size="sm" className="text-red-500" />
          <span className="text-sm text-red-700">
            Bottleneck: <span className="font-mono font-medium">{data.bottleneckTaskId}</span>
          </span>
        </div>
      )}
    </div>
  );
}
