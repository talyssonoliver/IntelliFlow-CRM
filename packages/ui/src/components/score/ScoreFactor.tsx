'use client';

/**
 * ScoreFactor Component - IFC-023
 *
 * Individual factor row showing impact direction, value, and expandable reasoning.
 */

import * as React from 'react';
import { cn } from '../../lib/utils';
import { formatImpact, getImpactDirection, getImpactBarWidth } from './utils';
import type { ScoreFactor as ScoreFactorType } from './types';

export interface ScoreFactorProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The scoring factor to display */
  factor: ScoreFactorType;
  /** Show visual impact bar */
  showImpactBar?: boolean;
  /** Start with reasoning expanded */
  defaultExpanded?: boolean;
}

/**
 * Impact bar visual component
 */
function ImpactBar({ impact, maxImpact = 50 }: { impact: number; maxImpact?: number }) {
  const direction = getImpactDirection(impact);
  const width = getImpactBarWidth(impact, maxImpact);

  return (
    <div
      className="h-1.5 w-full bg-muted rounded-full overflow-hidden"
      role="progressbar"
      aria-label={`Factor impact: ${formatImpact(impact)}`}
      aria-valuenow={Math.abs(impact)}
      aria-valuemin={0}
      aria-valuemax={maxImpact}
    >
      <div
        data-direction={direction}
        className={cn(
          'h-full rounded-full transition-all duration-300',
          direction === 'positive' && 'bg-success',
          direction === 'negative' && 'bg-destructive',
          direction === 'neutral' && 'bg-muted-foreground'
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

/**
 * ScoreFactor - Individual factor row with impact visualization
 */
function ScoreFactor({
  factor,
  showImpactBar = false,
  defaultExpanded = false,
  className,
  ...props
}: ScoreFactorProps) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  const direction = getImpactDirection(factor.impact);
  const hasReasoning = factor.reasoning && factor.reasoning.length > 0;

  return (
    <div className={cn('space-y-1.5', className)} {...props}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Factor name */}
          <span className="text-sm text-foreground truncate">{factor.name}</span>

          {/* Expand/collapse button */}
          {hasReasoning && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex-shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
              aria-label={isExpanded ? 'Collapse reasoning' : 'Expand reasoning'}
              aria-expanded={isExpanded}
            >
              <span
                className={cn(
                  'material-symbols-outlined text-muted-foreground text-sm transition-transform duration-200',
                  isExpanded && 'rotate-180'
                )}
                aria-hidden="true"
              >
                expand_more
              </span>
            </button>
          )}
        </div>

        {/* Impact value */}
        <span
          className={cn(
            'text-sm font-medium flex-shrink-0',
            direction === 'positive' && 'text-success',
            direction === 'negative' && 'text-destructive',
            direction === 'neutral' && 'text-muted-foreground'
          )}
        >
          {formatImpact(factor.impact)}
        </span>
      </div>

      {/* Impact bar */}
      {showImpactBar && <ImpactBar impact={factor.impact} />}

      {/* Reasoning (collapsible) */}
      {hasReasoning && (
        <div
          className={cn(
            'overflow-hidden transition-all duration-200',
            isExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
          )}
          aria-hidden={!isExpanded}
        >
          <p className="text-xs text-muted-foreground pl-0 pt-1 leading-relaxed">
            {factor.reasoning}
          </p>
        </div>
      )}
    </div>
  );
}

export { ScoreFactor, ImpactBar };
