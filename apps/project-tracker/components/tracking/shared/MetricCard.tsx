'use client';

import { Icon } from '@/lib/icons';
import RefreshButton from './RefreshButton';
import StaleIndicator from './StaleIndicator';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  trendLabel?: string;
  lastUpdated?: Date | string | null;
  staleThresholdMinutes?: number;
  onRefresh?: () => Promise<void>;
  icon?: string;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
}

export default function MetricCard({
  title,
  value,
  subtitle,
  trend,
  trendValue,
  trendLabel,
  lastUpdated,
  staleThresholdMinutes = 60,
  onRefresh,
  icon,
  variant = 'default',
}: Readonly<MetricCardProps>) {
  const variantStyles = {
    default: 'bg-gray-50 border-gray-200',
    success: 'bg-green-50 border-green-200',
    warning: 'bg-yellow-50 border-yellow-200',
    error: 'bg-red-50 border-red-200',
    info: 'bg-blue-50 border-blue-200',
  };

  const iconColors = {
    default: 'text-gray-500',
    success: 'text-green-600',
    warning: 'text-yellow-600',
    error: 'text-red-500',
    info: 'text-blue-600',
  };

  const trendIcons = {
    up: 'trending_up',
    down: 'trending_down',
    stable: 'remove',
  } as const;

  const trendColors = {
    up: 'text-green-600',
    down: 'text-red-600',
    stable: 'text-gray-500',
  };

  let parsedLastUpdated: Date | null;
  if (!lastUpdated) {
    parsedLastUpdated = null;
  } else if (typeof lastUpdated === 'string') {
    parsedLastUpdated = new Date(lastUpdated);
  } else {
    parsedLastUpdated = lastUpdated;
  }

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {icon && <Icon name={icon} size="lg" className={iconColors[variant]} />}
          <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        </div>
        {onRefresh && (
          <RefreshButton onRefresh={onRefresh} size="sm" variant="ghost" showLabel={false} />
        )}
      </div>

      <div className="mt-2">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
      </div>

      {trend && (
        <div className="mt-3 flex items-center gap-1.5">
          <Icon name={trendIcons[trend]} size="sm" className={trendColors[trend]} />
          {trendValue && (
            <span className={`text-sm font-medium ${trendColors[trend]}`}>{trendValue}</span>
          )}
          {trendLabel && <span className="text-xs text-gray-500">{trendLabel}</span>}
        </div>
      )}

      {parsedLastUpdated && (
        <div className="mt-3 border-t border-gray-200 pt-2">
          <StaleIndicator
            lastUpdated={parsedLastUpdated}
            thresholdMinutes={staleThresholdMinutes}
          />
        </div>
      )}
    </div>
  );
}
