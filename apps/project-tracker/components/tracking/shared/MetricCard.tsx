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
    default: 'bg-gray-700/30 border-gray-600',
    success: 'bg-green-500/10 border-green-500/30',
    warning: 'bg-yellow-500/10 border-yellow-500/30',
    error: 'bg-red-500/10 border-red-500/30',
    info: 'bg-blue-500/10 border-blue-500/30',
  };

  const iconColors = {
    default: 'text-gray-400',
    success: 'text-green-400',
    warning: 'text-yellow-400',
    error: 'text-red-400',
    info: 'text-blue-400',
  };

  const trendIcons = {
    up: 'trending_up',
    down: 'trending_down',
    stable: 'remove',
  } as const;

  const trendColors = {
    up: 'text-green-400',
    down: 'text-red-400',
    stable: 'text-gray-400',
  };

  const parsedLastUpdated = lastUpdated
    ? typeof lastUpdated === 'string'
      ? new Date(lastUpdated)
      : lastUpdated
    : null;

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {icon && (
            <Icon
              name={icon}
              size="lg"
              className={iconColors[variant]}
            />
          )}
          <h3 className="text-sm font-medium text-gray-300">{title}</h3>
        </div>
        {onRefresh && (
          <RefreshButton
            onRefresh={onRefresh}
            size="sm"
            variant="ghost"
            showLabel={false}
          />
        )}
      </div>

      <div className="mt-2">
        <p className="text-2xl font-bold text-white">{value}</p>
        {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
      </div>

      {trend && (
        <div className="mt-3 flex items-center gap-1.5">
          <Icon
            name={trendIcons[trend]}
            size="sm"
            className={trendColors[trend]}
          />
          {trendValue && (
            <span className={`text-sm font-medium ${trendColors[trend]}`}>
              {trendValue}
            </span>
          )}
          {trendLabel && (
            <span className="text-xs text-gray-400">{trendLabel}</span>
          )}
        </div>
      )}

      {parsedLastUpdated && (
        <div className="mt-3 border-t border-gray-600 pt-2">
          <StaleIndicator
            lastUpdated={parsedLastUpdated}
            thresholdMinutes={staleThresholdMinutes}
          />
        </div>
      )}
    </div>
  );
}
