'use client';

/**
 * ScoreCard Component - IFC-023 / IFC-024
 *
 * Full score explanation panel combining all score components.
 * Extended with Human-in-the-Loop feedback and score correction support.
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { getScoreTierConfig } from './utils';
import { ScoreFactorList } from './ScoreFactorList';
import { ConfidenceIndicator } from './ConfidenceIndicator';
import { ModelInfo } from './ModelInfo';
import { ScoreCorrectionModal, type ScoreCorrectionData } from './ScoreCorrectionModal';
import type { LeadScoreData, ComponentSize } from './types';

const scoreCardVariants = cva(
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

export interface ScoreCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof scoreCardVariants> {
  data: LeadScoreData;
  title?: string;
  showConfidence?: boolean;
  showModelInfo?: boolean;
  showImpactBars?: boolean;
  scoredAt?: string;
  onFeedback?: (type: 'positive' | 'negative') => void;
  size?: ComponentSize;
  /** Enable score correction capability (IFC-024) */
  allowCorrection?: boolean;
  /** Callback when a score correction is submitted */
  onScoreCorrection?: (data: ScoreCorrectionData) => void;
  /** Whether correction submission is in progress */
  isCorrectionSubmitting?: boolean;
}

function ScoreCard({
  data,
  title,
  showConfidence = false,
  showModelInfo = false,
  showImpactBars = false,
  scoredAt,
  onFeedback,
  size = 'md',
  allowCorrection = false,
  onScoreCorrection,
  isCorrectionSubmitting = false,
  className,
  ...props
}: ScoreCardProps) {
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = React.useState(false);
  const tierConfig = getScoreTierConfig(data.score);
  const scoreSize = { sm: 'text-2xl', md: 'text-3xl', lg: 'text-4xl' }[size];
  const componentSize = size as 'sm' | 'md' | 'lg';

  const handleCorrectionSubmit = (correctionData: ScoreCorrectionData) => {
    if (onScoreCorrection) {
      onScoreCorrection(correctionData);
    }
    setIsCorrectionModalOpen(false);
  };

  return (
    <>
      <div className={cn(scoreCardVariants({ size }), className)} {...props}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            {title && <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>}
            <div className="flex items-center gap-3">
              <span className={cn('font-bold', scoreSize, tierConfig.color)}>{data.score}</span>
              <div className={cn('px-2 py-0.5 rounded-full text-xs font-medium', tierConfig.bgColor, tierConfig.color)}>
                {tierConfig.label}
              </div>
            </div>
          </div>
          <div className={cn('flex items-center justify-center w-10 h-10 rounded-full', tierConfig.bgColor)}>
            <span className={cn('material-symbols-outlined', tierConfig.color)} aria-hidden="true">{tierConfig.icon}</span>
          </div>
        </div>

        {showConfidence && (
          <div className="mt-4 pt-4 border-t border-border">
            <ConfidenceIndicator confidence={data.confidence} showLabel size={componentSize} />
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-border">
          <h4 className="text-sm font-medium text-foreground mb-3">Scoring Factors</h4>
          <ScoreFactorList factors={data.factors} sortByImpact showImpactBars={showImpactBars} showSummary collapsedLimit={4} />
        </div>

        {showModelInfo && (
          <div className="mt-4 pt-4 border-t border-border">
            <ModelInfo modelVersion={data.modelVersion} scoredAt={scoredAt} showIcon showTimestamp={!!scoredAt} size={componentSize} />
          </div>
        )}

        {(onFeedback || allowCorrection) && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">Was this score helpful?</p>
            <div className="flex flex-wrap items-center gap-2">
              {onFeedback && (
                <>
                  <button
                    type="button"
                    onClick={() => onFeedback('positive')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm border border-border hover:bg-muted transition-colors"
                    aria-label="This score was helpful"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">thumb_up</span>
                    Helpful
                  </button>
                  <button
                    type="button"
                    onClick={() => onFeedback('negative')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm border border-border hover:bg-muted transition-colors"
                    aria-label="This score was not helpful"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">thumb_down</span>
                    Not helpful
                  </button>
                </>
              )}
              {allowCorrection && onScoreCorrection && (
                <button
                  type="button"
                  onClick={() => setIsCorrectionModalOpen(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm border border-primary text-primary hover:bg-primary/10 transition-colors"
                  aria-label="Suggest a different score"
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">edit</span>
                  Suggest Correction
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {allowCorrection && onScoreCorrection && (
        <ScoreCorrectionModal
          isOpen={isCorrectionModalOpen}
          onClose={() => setIsCorrectionModalOpen(false)}
          originalScore={data.score}
          onSubmit={handleCorrectionSubmit}
          isSubmitting={isCorrectionSubmitting}
        />
      )}
    </>
  );
}

export { ScoreCard, scoreCardVariants };
