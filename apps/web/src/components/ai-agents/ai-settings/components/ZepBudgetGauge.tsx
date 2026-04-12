'use client';

/**
 * Zep Budget Gauge Component
 *
 * PG-128: AI Chain Versioning Admin UI
 *
 * Circular progress gauge showing Zep memory episode budget.
 * Color transitions at thresholds:
 * - Green (0-79%): Normal
 * - Yellow (80-94%): Warning
 * - Red (95-100%): Critical
 */

import {
  Card,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@intelliflow/ui';
import { useZepBudget } from '../hooks';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

interface ZepBudgetGaugeProps {
  className?: string;
}

export function ZepBudgetGauge({ className }: Readonly<ZepBudgetGaugeProps>) {
  const { timezone } = useTimezoneContext();
  const { budget, isLoading, percentUsed, budgetStatus } = useZepBudget();

  if (isLoading) {
    return (
      <Card className={`p-6 ${className}`}>
        <div className="flex items-center justify-center">
          <Skeleton className="h-32 w-32 rounded-full" />
        </div>
      </Card>
    );
  }

  if (!budget) {
    return (
      <Card className={`p-6 ${className}`}>
        <p className="text-muted-foreground text-center">Budget data unavailable</p>
      </Card>
    );
  }

  // Color based on status
  const getStatusColor = () => {
    switch (budgetStatus) {
      case 'critical':
        return 'text-red-500';
      case 'warning':
        return 'text-yellow-500';
      default:
        return 'text-green-500';
    }
  };

  const getProgressColor = () => {
    switch (budgetStatus) {
      case 'critical':
        return 'stroke-red-500';
      case 'warning':
        return 'stroke-yellow-500';
      default:
        return 'stroke-green-500';
    }
  };

  const getBackgroundColor = () => {
    switch (budgetStatus) {
      case 'critical':
        return 'bg-red-100 dark:bg-red-900/20';
      case 'warning':
        return 'bg-yellow-100 dark:bg-yellow-900/20';
      default:
        return 'bg-green-100 dark:bg-green-900/20';
    }
  };

  // SVG circle calculations
  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentUsed / 100) * circumference;

  return (
    <Card className={`p-6 ${className}`}>
      <div className="text-center">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">Zep Memory Budget</h3>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`relative inline-flex items-center justify-center rounded-full p-2 ${getBackgroundColor()}`}
              >
                {/* Background circle */}
                <svg width={size} height={size} className="transform -rotate-90">
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    className="text-muted/20"
                  />
                  {/* Progress circle */}
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    className={getProgressColor()}
                    style={{
                      strokeDasharray: circumference,
                      strokeDashoffset,
                      transition: 'stroke-dashoffset 0.5s ease-in-out',
                    }}
                  />
                </svg>

                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-2xl font-bold ${getStatusColor()}`}>{percentUsed}%</span>
                  <span className="text-xs text-muted-foreground">used</span>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm">
                <p>Used: {budget.used.toLocaleString('en-US')} episodes</p>
                <p>Remaining: {budget.remaining.toLocaleString('en-US')} episodes</p>
                <p>Total: {budget.total.toLocaleString('en-US')} episodes</p>
                {budget.lastSyncedAt && (
                  <p className="text-muted-foreground mt-1">
                    Last synced:{' '}
                    {new Date(budget.lastSyncedAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: timezone,
                    })}
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Status text */}
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">
            {budget.used.toLocaleString('en-US')} / {budget.total.toLocaleString('en-US')} episodes
          </p>
          {budgetStatus === 'warning' && (
            <p className="text-xs text-yellow-600 mt-1">Approaching limit - consider upgrading</p>
          )}
          {budgetStatus === 'critical' && (
            <p className="text-xs text-red-600 mt-1">
              Near limit - fallback to in-memory may occur
            </p>
          )}
        </div>

        {/* Budget tier indicator */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span
              className={`w-2 h-2 rounded-full ${budget.isPersisted ? 'bg-green-500' : 'bg-gray-400'}`}
            />
            <span>{budget.isPersisted ? 'Persisted Storage' : 'Free Tier'}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
