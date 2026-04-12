'use client';

/**
 * NextBestActionCard Component (IFC-095)
 *
 * Displays AI-recommended next best action for leads and contacts.
 * Shows action type, priority, deadline, and rationale.
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

export type NBAActionType =
  | 'CALL'
  | 'EMAIL'
  | 'MEETING'
  | 'SEND_PROPOSAL'
  | 'OFFER_DISCOUNT'
  | 'SCHEDULE_DEMO'
  | 'SEND_CASE_STUDY'
  | 'ESCALATE'
  | 'UPSELL'
  | 'CROSS_SELL'
  | 'TRAINING'
  | 'WAIT';

export type NBAPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface NextBestActionData {
  /** Type of recommended action */
  actionType: NBAActionType;
  /** Display title for the action */
  title: string;
  /** Priority level */
  priority: NBAPriority;
  /** Reasoning behind the recommendation */
  rationale?: string;
  /** Deadline for the action */
  deadline?: string;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Estimated success probability */
  successProbability?: number;
}

export interface NextBestActionCardProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof nbaCardVariants> {
  /** Next best action data */
  data: NextBestActionData;
  /** Card title */
  title?: string;
  /** Show rationale */
  showRationale?: boolean;
  /** Show confidence */
  showConfidence?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Callback when action is taken */
  onActionTaken?: () => void;
  /** Callback when action is dismissed */
  onDismiss?: () => void;
}

// ============================================
// Variants
// ============================================

const nbaCardVariants = cva(
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

function getActionConfig(actionType: Readonly<NBAActionType>) {
  const configs: Record<NBAActionType, { icon: string; label: string; color: string }> = {
    CALL: { icon: 'call', label: 'Make a Call', color: 'text-green-600 dark:text-green-400' },
    EMAIL: { icon: 'mail', label: 'Send Email', color: 'text-blue-600 dark:text-blue-400' },
    MEETING: {
      icon: 'event',
      label: 'Schedule Meeting',
      color: 'text-purple-600 dark:text-purple-400',
    },
    SEND_PROPOSAL: {
      icon: 'description',
      label: 'Send Proposal',
      color: 'text-indigo-600 dark:text-indigo-400',
    },
    OFFER_DISCOUNT: {
      icon: 'sell',
      label: 'Offer Discount',
      color: 'text-orange-600 dark:text-orange-400',
    },
    SCHEDULE_DEMO: {
      icon: 'play_circle',
      label: 'Schedule Demo',
      color: 'text-cyan-600 dark:text-cyan-400',
    },
    SEND_CASE_STUDY: {
      icon: 'article',
      label: 'Send Case Study',
      color: 'text-teal-600 dark:text-teal-400',
    },
    ESCALATE: { icon: 'priority_high', label: 'Escalate', color: 'text-red-600 dark:text-red-400' },
    UPSELL: {
      icon: 'trending_up',
      label: 'Upsell Opportunity',
      color: 'text-emerald-600 dark:text-emerald-400',
    },
    CROSS_SELL: {
      icon: 'swap_horiz',
      label: 'Cross-Sell',
      color: 'text-violet-600 dark:text-violet-400',
    },
    TRAINING: {
      icon: 'school',
      label: 'Offer Training',
      color: 'text-amber-600 dark:text-amber-400',
    },
    WAIT: { icon: 'hourglass_empty', label: 'Wait', color: 'text-gray-600 dark:text-gray-400' },
  };
  return configs[actionType] || configs.WAIT;
}

function getPriorityConfig(priority: Readonly<NBAPriority>) {
  switch (priority) {
    case 'CRITICAL':
      return {
        label: 'Critical',
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-100 dark:bg-red-900/30',
        borderColor: 'border-red-200 dark:border-red-800',
      };
    case 'HIGH':
      return {
        label: 'High',
        color: 'text-orange-600 dark:text-orange-400',
        bgColor: 'bg-orange-100 dark:bg-orange-900/30',
        borderColor: 'border-orange-200 dark:border-orange-800',
      };
    case 'MEDIUM':
      return {
        label: 'Medium',
        color: 'text-yellow-600 dark:text-yellow-400',
        bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
        borderColor: 'border-yellow-200 dark:border-yellow-800',
      };
    case 'LOW':
      return {
        label: 'Low',
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-100 dark:bg-blue-900/30',
        borderColor: 'border-blue-200 dark:border-blue-800',
      };
  }
}

function formatDeadline(deadline: string): { text: string; isUrgent: boolean } {
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const diffMs = deadlineDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  if (diffMs < 0) {
    return { text: 'Overdue', isUrgent: true };
  }
  if (diffHours < 24) {
    return { text: `${Math.ceil(diffHours)}h remaining`, isUrgent: true };
  }
  if (diffDays < 7) {
    return { text: `${Math.ceil(diffDays)} days remaining`, isUrgent: diffDays < 2 };
  }
  return {
    text: deadlineDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    isUrgent: false,
  };
}

// ============================================
// Skeleton Component
// ============================================

function NextBestActionCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div>
            <Skeleton className="h-4 w-32 mb-1" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

// ============================================
// NextBestActionCard Component
// ============================================

function NextBestActionCard({
  data,
  title = 'Next Best Action',
  showRationale = true,
  showConfidence = true,
  isLoading = false,
  onActionTaken,
  onDismiss,
  size = 'md',
  className,
  ...props
}: Readonly<NextBestActionCardProps>) {
  if (isLoading) {
    return (
      <div className={cn(nbaCardVariants({ size }), className)} {...props}>
        <NextBestActionCardSkeleton />
      </div>
    );
  }

  const actionConfig = getActionConfig(data.actionType);
  const priorityConfig = getPriorityConfig(data.priority);
  const deadlineInfo = data.deadline ? formatDeadline(data.deadline) : null;

  return (
    <div className={cn(nbaCardVariants({ size }), className)} {...props}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <div
          className={cn(
            'px-2 py-0.5 rounded-full text-xs font-medium',
            priorityConfig.bgColor,
            priorityConfig.color
          )}
        >
          {priorityConfig.label}
        </div>
      </div>

      {/* Action */}
      <div className="flex items-start gap-3 mt-3">
        <div className={cn('flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10')}>
          <span
            className={cn('material-symbols-outlined text-xl', actionConfig.color)}
            aria-hidden="true"
          >
            {actionConfig.icon}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-foreground">{data.title}</h4>
          <p className="text-sm text-muted-foreground">{actionConfig.label}</p>
        </div>
      </div>

      {/* Deadline */}
      {deadlineInfo && (
        <div
          className={cn(
            'mt-3 flex items-center gap-2 text-sm',
            deadlineInfo.isUrgent ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
          )}
        >
          <span className="material-symbols-outlined text-sm">schedule</span>
          <span>{deadlineInfo.text}</span>
        </div>
      )}

      {/* Rationale */}
      {showRationale && data.rationale && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Why: </span>
            {data.rationale}
          </p>
        </div>
      )}

      {/* Confidence & Success Probability */}
      {showConfidence &&
        (data.confidence !== undefined || data.successProbability !== undefined) && (
          <div className="mt-3 flex items-center gap-4 text-sm">
            {data.confidence !== undefined && (
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-muted-foreground">
                  psychology
                </span>
                <span className="text-muted-foreground">Confidence:</span>
                <span className="font-medium">{Math.round(data.confidence * 100)}%</span>
              </div>
            )}
            {data.successProbability !== undefined && (
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-muted-foreground">
                  target
                </span>
                <span className="text-muted-foreground">Success:</span>
                <span className="font-medium">{Math.round(data.successProbability * 100)}%</span>
              </div>
            )}
          </div>
        )}

      {/* Actions */}
      {(onActionTaken || onDismiss) && (
        <div className="mt-4 pt-4 border-t border-border flex items-center gap-2">
          {onActionTaken && (
            <button
              type="button"
              onClick={onActionTaken}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">check</span> Mark Done
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
            >
              <span className="material-symbols-outlined text-sm">close</span> Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Exports
// ============================================

export {
  NextBestActionCard,
  NextBestActionCardSkeleton,
  nbaCardVariants,
  getActionConfig,
  getPriorityConfig,
};
