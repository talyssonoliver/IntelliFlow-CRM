'use client';

/**
 * ScoreBadge Component - IFC-023
 *
 * Compact score display with tier coloring and optional popover for factor breakdown.
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import {
  getScoreTierConfig,
  formatConfidence,
} from './utils';
import type { ScoreFactor, ScoreBadgeMode, ComponentSize } from './types';

const scoreBadgeVariants = cva(
  'inline-flex items-center justify-center rounded-full font-semibold transition-colors',
  {
    variants: {
      tier: {
        hot: 'text-success bg-success/10 border-success/30',
        warm: 'text-warning bg-warning/10 border-warning/30',
        cold: 'text-muted-foreground bg-muted/50 border-muted',
      },
      size: {
        sm: 'h-5 px-2 text-xs gap-1',
        md: 'h-6 px-2.5 text-sm gap-1.5',
        lg: 'h-8 px-3 text-base gap-2',
      },
      mode: {
        compact: 'border',
        inline: 'border',
        expanded: 'border cursor-pointer hover:opacity-80',
      },
    },
    defaultVariants: {
      tier: 'cold',
      size: 'md',
      mode: 'compact',
    },
  }
);

export interface ScoreBadgeProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'>,
    VariantProps<typeof scoreBadgeVariants> {
  /** Score value (0-100) */
  score: number;
  /** AI confidence level (0-1) */
  confidence?: number;
  /** Scoring factors for popover */
  factors?: ScoreFactor[];
  /** Display mode */
  mode?: ScoreBadgeMode;
  /** Component size */
  size?: ComponentSize;
  /** Show tier icon */
  showIcon?: boolean;
  /** Show confidence percentage */
  showConfidence?: boolean;
  /** Click handler (for expanded mode) */
  onClick?: () => void;
}

/**
 * Material Symbols icon component
 */
function MaterialIcon({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn('material-symbols-outlined', className)}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

/**
 * ScoreBadge - Compact score display with tier-based styling
 */
function ScoreBadge({
  score,
  confidence,
  factors,
  mode = 'compact',
  size = 'md',
  showIcon = false,
  showConfidence = false,
  className,
  onClick,
  ...props
}: ScoreBadgeProps) {
  const tierConfig = getScoreTierConfig(score);

  const badgeContent = (
    <>
      {showIcon && (
        <MaterialIcon
          name={tierConfig.icon}
          className={cn(
            size === 'sm' && 'text-xs',
            size === 'md' && 'text-sm',
            size === 'lg' && 'text-base'
          )}
        />
      )}
      <span>{score}</span>
      {mode === 'inline' && (
        <>
          <span className="text-muted-foreground font-normal">Score</span>
          {showConfidence && confidence !== undefined && (
            <span className="text-muted-foreground font-normal">
              ({formatConfidence(confidence)})
            </span>
          )}
        </>
      )}
    </>
  );

  const ariaLabel = `Lead score: ${score} out of 100, ${tierConfig.label} tier${
    confidence !== undefined ? `, ${formatConfidence(confidence)} confidence` : ''
  }`;

  // Expanded mode with factors shows popover
  if (mode === 'expanded' && factors && factors.length > 0) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              scoreBadgeVariants({ tier: tierConfig.tier, size, mode }),
              className
            )}
            aria-label={ariaLabel}
            onClick={onClick}
            {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
          >
            {badgeContent}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Score Breakdown</span>
              <span className={cn('text-lg font-bold', tierConfig.color)}>
                {score}
              </span>
            </div>
            {confidence !== undefined && (
              <div className="text-xs text-muted-foreground">
                Confidence: {formatConfidence(confidence)}
              </div>
            )}
            <div className="space-y-2">
              {factors.slice(0, 5).map((factor, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground truncate max-w-[180px]">
                    {factor.name}
                  </span>
                  <span
                    className={cn(
                      'font-medium',
                      factor.impact > 0 ? 'text-success' : 'text-destructive'
                    )}
                  >
                    {factor.impact > 0 ? '+' : ''}
                    {factor.impact}
                  </span>
                </div>
              ))}
              {factors.length > 5 && (
                <div className="text-xs text-muted-foreground">
                  +{factors.length - 5} more factors
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // Compact and inline modes
  return (
    <div
      className={cn(
        scoreBadgeVariants({ tier: tierConfig.tier, size, mode }),
        className
      )}
      aria-label={ariaLabel}
      {...props}
    >
      {badgeContent}
    </div>
  );
}

export { ScoreBadge, scoreBadgeVariants };
