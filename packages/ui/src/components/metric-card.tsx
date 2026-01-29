'use client';

import * as React from 'react';
import { cn } from '../lib/utils';
import { Skeleton } from './skeleton';

// ============================================
// Types
// ============================================

export type MetricFormat = 'number' | 'currency' | 'percentage' | 'compact';
export type ChangeDirection = 'up' | 'down' | 'neutral';

export interface MetricChange {
  /** The change value (e.g., 12 for +12%) */
  value: number;
  /** Direction of change */
  direction: ChangeDirection;
  /** Optional label (e.g., "vs last month") */
  label?: string;
}

export interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Card title */
  title: string;
  /** Main metric value */
  value: string | number;
  /** Format for displaying the value */
  format?: MetricFormat;
  /** Currency code for currency format (default: 'USD') */
  currency?: string;
  /** Change indicator */
  change?: MetricChange;
  /** Material Symbols icon name */
  icon?: string;
  /** Icon background class (overrides default) */
  iconBgClass?: string;
  /** Icon color class (overrides default) */
  iconColorClass?: string;
  /** Loading state */
  isLoading?: boolean;
  /** Description text below value */
  description?: string;
}

// ============================================
// Helper Functions
// ============================================

function formatValue(
  value: string | number,
  format: MetricFormat = 'number',
  currency: string = 'USD'
): string {
  if (typeof value === 'string') return value;

  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);

    case 'percentage':
      return `${value}%`;

    case 'compact':
      return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value);

    case 'number':
    default:
      return value.toLocaleString('en-US');
  }
}

function getChangeIcon(direction: ChangeDirection): string {
  switch (direction) {
    case 'up':
      return 'trending_up';
    case 'down':
      return 'trending_down';
    case 'neutral':
    default:
      return 'trending_flat';
  }
}

function getChangeColorClass(direction: ChangeDirection): string {
  switch (direction) {
    case 'up':
      return 'text-green-600 dark:text-green-400';
    case 'down':
      return 'text-red-600 dark:text-red-400';
    case 'neutral':
    default:
      return 'text-muted-foreground';
  }
}

// ============================================
// Skeleton Component
// ============================================

function MetricCardSkeleton() {
  return (
    <div className="p-5 h-full flex flex-col animate-pulse">
      <div className="flex items-start justify-between">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <Skeleton className="h-5 w-16 rounded" />
      </div>
      <Skeleton className="h-4 w-24 rounded mt-4" />
      <Skeleton className="h-8 w-32 rounded mt-1" />
    </div>
  );
}

// ============================================
// MetricCard Component
// ============================================

const MetricCard = React.forwardRef<HTMLDivElement, MetricCardProps>(
  (
    {
      title,
      value,
      format = 'number',
      currency = 'USD',
      change,
      icon,
      iconBgClass = 'bg-primary/10',
      iconColorClass = 'text-primary',
      isLoading = false,
      description,
      className,
      ...props
    },
    ref
  ) => {
    if (isLoading) {
      return (
        <div
          ref={ref}
          className={cn('rounded-lg border border-border bg-card', className)}
          {...props}
        >
          <MetricCardSkeleton />
        </div>
      );
    }

    const formattedValue = formatValue(value, format, currency);

    return (
      <div
        ref={ref}
        className={cn('rounded-lg border border-border bg-card', className)}
        {...props}
      >
        <div className="p-5 h-full flex flex-col">
          {/* Header Row: Icon and Change */}
          <div className="flex items-start justify-between">
            {/* Icon Badge */}
            {icon && (
              <div
                className={cn(
                  'h-10 w-10 rounded-lg flex items-center justify-center',
                  iconBgClass
                )}
              >
                <span
                  className={cn('material-symbols-outlined text-xl', iconColorClass)}
                  aria-hidden="true"
                >
                  {icon}
                </span>
              </div>
            )}

            {/* Change Indicator */}
            {change && (
              <div
                className={cn(
                  'inline-flex items-center gap-1 text-sm font-medium',
                  getChangeColorClass(change.direction)
                )}
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  {getChangeIcon(change.direction)}
                </span>
                <span>
                  {change.direction === 'up' ? '+' : change.direction === 'down' ? '-' : ''}
                  {Math.abs(change.value)}%
                </span>
              </div>
            )}
          </div>

          {/* Title */}
          <p className="text-sm text-muted-foreground mt-4">{title}</p>

          {/* Value */}
          <p className="text-2xl font-bold text-foreground mt-1">{formattedValue}</p>

          {/* Description or Change Label */}
          {(description || change?.label) && (
            <p className="text-xs text-muted-foreground mt-1">
              {description || change?.label}
            </p>
          )}
        </div>
      </div>
    );
  }
);

MetricCard.displayName = 'MetricCard';

// ============================================
// Exports
// ============================================

export { MetricCard, MetricCardSkeleton, formatValue };
