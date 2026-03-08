'use client';

/**
 * ChurnRiskCard Component (IFC-095)
 *
 * Displays churn risk assessment for leads and contacts.
 * Shows risk level, score, confidence, and top risk factors.
 *
 * @see Sprint 8 - IFC-095: Churn Risk & Next Best Action
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { Skeleton } from '../skeleton';

// ============================================
// Types
// ============================================

export type ChurnRiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL';

export interface RiskFactor {
  factor: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  value?: string | number;
}

export interface ChurnRiskData {
  /** Churn risk score (0-100) */
  score: number;
  /** Risk level classification */
  level: ChurnRiskLevel;
  /** Model confidence (0-1) */
  confidence?: number;
  /** Top contributing factors */
  factors?: RiskFactor[];
  /** SLA response hours based on risk level */
  slaHours?: number;
  /** Trend direction */
  trend?: 'IMPROVING' | 'STABLE' | 'DECLINING';
  /** Last assessment timestamp */
  assessedAt?: string;
}

export interface ChurnRiskCardProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof churnRiskCardVariants> {
  /** Churn risk data to display */
  data: ChurnRiskData;
  /** Card title */
  title?: string;
  /** Show risk factors list */
  showFactors?: boolean;
  /** Show confidence indicator */
  showConfidence?: boolean;
  /** Show SLA information */
  showSLA?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Callback when user requests refresh */
  onRefresh?: () => void;
}

// ============================================
// Variants
// ============================================

const churnRiskCardVariants = cva(
  'rounded-lg border border-border bg-card text-card-foreground shadow-sm',
  {
    variants: {
      size: {
        sm: 'p-3',
        md: 'p-4',
        lg: 'p-6',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

// ============================================
// Helper Functions
// ============================================

function getRiskLevelConfig(level: Readonly<ChurnRiskLevel>) {
  switch (level) {
    case 'CRITICAL':
      return {
        label: 'Critical Risk',
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-100 dark:bg-red-900/30',
        icon: 'warning',
        description: 'Immediate action required',
      };
    case 'HIGH':
      return {
        label: 'High Risk',
        color: 'text-orange-600 dark:text-orange-400',
        bgColor: 'bg-orange-100 dark:bg-orange-900/30',
        icon: 'priority_high',
        description: 'Proactive engagement needed',
      };
    case 'MEDIUM':
      return {
        label: 'Medium Risk',
        color: 'text-yellow-600 dark:text-yellow-400',
        bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
        icon: 'schedule',
        description: 'Monitor closely',
      };
    case 'LOW':
      return {
        label: 'Low Risk',
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-100 dark:bg-blue-900/30',
        icon: 'check_circle',
        description: 'Healthy engagement',
      };
    case 'MINIMAL':
      return {
        label: 'Minimal Risk',
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-100 dark:bg-green-900/30',
        icon: 'verified',
        description: 'Strong relationship',
      };
  }
}

function getImpactColor(impact: RiskFactor['impact']) {
  switch (impact) {
    case 'HIGH':
      return 'text-red-600 dark:text-red-400';
    case 'MEDIUM':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'LOW':
      return 'text-blue-600 dark:text-blue-400';
  }
}

function getTrendIcon(trend: ChurnRiskData['trend']) {
  switch (trend) {
    case 'IMPROVING':
      return { icon: 'trending_down', color: 'text-green-600 dark:text-green-400' };
    case 'DECLINING':
      return { icon: 'trending_up', color: 'text-red-600 dark:text-red-400' };
    case 'STABLE':
    default:
      return { icon: 'trending_flat', color: 'text-muted-foreground' };
  }
}

function formatSLAHours(hours: number): string {
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// ============================================
// Skeleton Component
// ============================================

function ChurnRiskCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div>
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
      <Skeleton className="h-2 w-full rounded-full mb-4" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

// ============================================
// ChurnRiskCard Component
// ============================================

function ChurnRiskCard({
  data,
  title = 'Churn Risk',
  showFactors = true,
  showConfidence = true,
  showSLA = true,
  isLoading = false,
  onRefresh,
  size = 'md',
  className,
  ...props
}: Readonly<ChurnRiskCardProps>) {
  if (isLoading) {
    return (
      <div className={cn(churnRiskCardVariants({ size }), className)} {...props}>
        <ChurnRiskCardSkeleton />
      </div>
    );
  }

  const config = getRiskLevelConfig(data.level);
  const trendConfig = data.trend ? getTrendIcon(data.trend) : null;

  return (
    <div className={cn(churnRiskCardVariants({ size }), className)} {...props}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Refresh churn risk"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={cn('text-3xl font-bold', config.color)}>{data.score}</span>
            <div
              className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                config.bgColor,
                config.color
              )}
            >
              {config.label}
            </div>
            {trendConfig && (
              <span
                className={cn('material-symbols-outlined text-lg', trendConfig.color)}
                aria-label={`Trend: ${data.trend}`}
              >
                {trendConfig.icon}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </div>
        <div
          className={cn('flex items-center justify-center w-12 h-12 rounded-full', config.bgColor)}
        >
          <span
            className={cn('material-symbols-outlined text-2xl', config.color)}
            aria-hidden="true"
          >
            {config.icon}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-4">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              config.bgColor.replaceAll('/30', '')
            )}
            style={{ width: `${data.score}%` }}
          />
        </div>
      </div>

      {/* Confidence & SLA Row */}
      {(showConfidence || showSLA) && (
        <div className="mt-4 flex items-center gap-4 text-sm">
          {showConfidence && data.confidence !== undefined && (
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-muted-foreground">
                psychology
              </span>
              <span className="text-muted-foreground">Confidence:</span>
              <span className="font-medium">{Math.round(data.confidence * 100)}%</span>
            </div>
          )}
          {showSLA && data.slaHours !== undefined && (
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-muted-foreground">
                schedule
              </span>
              <span className="text-muted-foreground">SLA:</span>
              <span className="font-medium">{formatSLAHours(data.slaHours)}</span>
            </div>
          )}
        </div>
      )}

      {/* Risk Factors */}
      {showFactors && data.factors && data.factors.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <h4 className="text-sm font-medium text-foreground mb-2">Top Risk Factors</h4>
          <ul className="space-y-2">
            {data.factors.slice(0, 3).map((factor, index) => (
              <li key={index} className="flex items-center justify-between text-sm"> {/* NOSONAR typescript:S6479 */}
                <span className="text-foreground">{factor.factor}</span>
                <div className="flex items-center gap-2">
                  {factor.value !== undefined && (
                    <span className="text-muted-foreground">{factor.value}</span>
                  )}
                  <span className={cn('text-xs font-medium', getImpactColor(factor.impact))}>
                    {factor.impact}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Last Assessed */}
      {data.assessedAt && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Last assessed:{' '}
            {new Date(data.assessedAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================
// Exports
// ============================================

export { ChurnRiskCard, ChurnRiskCardSkeleton, churnRiskCardVariants, getRiskLevelConfig };
