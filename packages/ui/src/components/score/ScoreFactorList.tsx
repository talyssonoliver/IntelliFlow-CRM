'use client';

/**
 * ScoreFactorList Component - IFC-023
 *
 * Expandable list of scoring factors with optional sorting and impact summary.
 */

import * as React from 'react';
import { cn } from '../../lib/utils';
import { ScoreFactor as ScoreFactorComponent } from './ScoreFactor';
import {
  sortFactorsByImpact,
  getTotalPositiveImpact,
  getTotalNegativeImpact,
} from './utils';
import type { ScoreFactor } from './types';

export interface ScoreFactorListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** List of scoring factors */
  factors: ScoreFactor[];
  /** Start fully expanded */
  expanded?: boolean;
  /** Number of factors to show when collapsed */
  collapsedLimit?: number;
  /** Sort factors by absolute impact */
  sortByImpact?: boolean;
  /** Show impact bars on each factor */
  showImpactBars?: boolean;
  /** Show positive/negative impact summary */
  showSummary?: boolean;
}

/**
 * ScoreFactorList - Expandable list of scoring factors
 */
function ScoreFactorList({
  factors,
  expanded: initialExpanded = false,
  collapsedLimit = 3,
  sortByImpact = false,
  showImpactBars = false,
  showSummary = false,
  className,
  ...props
}: ScoreFactorListProps) {
  const [isExpanded, setIsExpanded] = React.useState(initialExpanded);

  // Sort factors if requested
  const sortedFactors = sortByImpact ? sortFactorsByImpact(factors) : factors;

  // Determine which factors to show
  const visibleFactors = isExpanded
    ? sortedFactors
    : sortedFactors.slice(0, collapsedLimit);

  const hasMore = factors.length > collapsedLimit;
  const remainingCount = factors.length - collapsedLimit;

  // Calculate impact summary
  const totalPositive = getTotalPositiveImpact(factors);
  const totalNegative = getTotalNegativeImpact(factors);

  if (factors.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)} {...props}>
        No factors available
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)} {...props}>
      {/* Impact Summary */}
      {showSummary && (
        <div className="flex items-center justify-between text-sm pb-2 border-b border-border">
          <span className="text-muted-foreground">Impact Summary</span>
          <div className="flex items-center gap-3">
            <span className="text-success font-medium">+{totalPositive}</span>
            <span className="text-destructive font-medium">{totalNegative}</span>
          </div>
        </div>
      )}

      {/* Factor List */}
      <ul role="list" className="space-y-2">
        {visibleFactors.map((factor, index) => (
          <li key={`${factor.name}-${index}`}>
            <ScoreFactorComponent
              factor={factor}
              showImpactBar={showImpactBars}
            />
          </li>
        ))}
      </ul>

      {/* Show More/Less Button */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'flex items-center gap-1 text-sm text-muted-foreground',
            'hover:text-foreground transition-colors'
          )}
          aria-expanded={isExpanded}
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            {isExpanded ? 'expand_less' : 'expand_more'}
          </span>
          {isExpanded ? 'Show less' : `Show ${remainingCount} more`}
        </button>
      )}
    </div>
  );
}

export { ScoreFactorList };
