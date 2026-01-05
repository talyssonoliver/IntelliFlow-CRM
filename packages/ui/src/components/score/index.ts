/**
 * Score Components - IFC-023
 *
 * AI Explainability UI components for lead scoring visualization.
 */

// Types
export type {
  ScoreFactor,
  LeadScoreData,
  ScoreTier,
  ConfidenceLevel,
  ScoreBadgeMode,
  ComponentSize,
  ScoreTierConfig,
  ConfidenceLevelConfig,
} from './types';

// Utilities
export {
  SCORE_THRESHOLDS,
  CONFIDENCE_THRESHOLDS,
  getScoreTier,
  getScoreTierConfig,
  getConfidenceLevel,
  getConfidenceLevelConfig,
  formatConfidence,
  formatImpact,
  getImpactDirection,
  sortFactorsByImpact,
  getTopFactors,
  getTotalPositiveImpact,
  getTotalNegativeImpact,
  getImpactBarWidth,
} from './utils';

// Components
export { ScoreBadge } from './ScoreBadge';
export type { ScoreBadgeProps } from './ScoreBadge';

export { ScoreFactor as ScoreFactorComponent } from './ScoreFactor';
export type { ScoreFactorProps } from './ScoreFactor';

export { ScoreFactorList } from './ScoreFactorList';
export type { ScoreFactorListProps } from './ScoreFactorList';

export { ConfidenceIndicator } from './ConfidenceIndicator';
export type { ConfidenceIndicatorProps } from './ConfidenceIndicator';

export { ModelInfo } from './ModelInfo';
export type { ModelInfoProps } from './ModelInfo';

export { ScoreCard } from './ScoreCard';
export type { ScoreCardProps } from './ScoreCard';

// Score Correction Modal (IFC-024: Human-in-the-Loop Feedback)
export { ScoreCorrectionModal } from './ScoreCorrectionModal';
export type { ScoreCorrectionModalProps, ScoreCorrectionData } from './ScoreCorrectionModal';
