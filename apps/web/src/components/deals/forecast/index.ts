/**
 * Deal Forecast Components (PG-131)
 *
 * Barrel export for all forecast components and types.
 */

export { ForecastHeader, type ForecastHeaderProps } from './ForecastHeader';
export { ProbabilityGauge, type ProbabilityGaugeProps } from './ProbabilityGauge';
export { RiskFactorsCard, type RiskFactorsCardProps } from './RiskFactorsCard';
export { RecommendedActions, type RecommendedActionsProps } from './RecommendedActions';
export { ForecastHistory, type ForecastHistoryProps } from './ForecastHistory';
export { ConfidenceIndicator, type ConfidenceIndicatorProps } from './ConfidenceIndicator';
export type {
  RiskFactor,
  Recommendation,
  HistoryPoint,
  ForecastMode,
  DealForecastResponse,
} from './types';
