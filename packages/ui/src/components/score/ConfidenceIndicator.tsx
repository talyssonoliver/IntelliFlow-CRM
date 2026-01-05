'use client';

/**
 * ConfidenceIndicator Component - IFC-023
 *
 * Visual indicator for AI model confidence level.
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { getConfidenceLevelConfig, formatConfidence } from './utils';
import type { ComponentSize } from './types';

const confidenceIndicatorVariants = cva('flex items-center gap-2', {
  variants: {
    size: {
      sm: 'text-xs',
      md: 'text-sm',
      lg: 'text-base',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export interface ConfidenceIndicatorProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof confidenceIndicatorVariants> {
  /** Confidence value (0-1) */
  confidence: number;
  /** Show confidence level label */
  showLabel?: boolean;
  /** Show confidence description */
  showDescription?: boolean;
  /** Component size */
  size?: ComponentSize;
}

/**
 * ConfidenceIndicator - Visual confidence level display
 */
function ConfidenceIndicator({
  confidence,
  showLabel = false,
  showDescription = false,
  size = 'md',
  className,
  ...props
}: ConfidenceIndicatorProps) {
  const config = getConfidenceLevelConfig(confidence);
  const percentage = Math.round(confidence * 100);

  // Progress bar height based on size
  const barHeight = {
    sm: 'h-1',
    md: 'h-1.5',
    lg: 'h-2',
  }[size];

  return (
    <div
      className={cn(confidenceIndicatorVariants({ size }), 'flex-col items-start', className)}
      {...props}
    >
      <div className="flex items-center gap-2 w-full">
        {/* Label and Percentage */}
        <div className="flex items-center gap-2 flex-1">
          {showLabel && (
            <span className={cn('font-medium', config.color)}>{config.label}</span>
          )}
          <span className="text-muted-foreground">{formatConfidence(confidence)}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div
        className={cn('w-full bg-muted rounded-full overflow-hidden mt-1', barHeight)}
        role="progressbar"
        aria-label={`AI confidence: ${percentage}%`}
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          data-level={config.level}
          className={cn('h-full rounded-full transition-all duration-300', config.bgColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Description */}
      {showDescription && (
        <p className="text-xs text-muted-foreground mt-1">{config.description}</p>
      )}
    </div>
  );
}

export { ConfidenceIndicator, confidenceIndicatorVariants };
