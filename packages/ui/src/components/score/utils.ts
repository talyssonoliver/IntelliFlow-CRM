/**
 * Score Component Utilities - IFC-023
 *
 * Helper functions for AI explainability UI components.
 */

import type {
  ScoreTier,
  ScoreTierConfig,
  ConfidenceLevel,
  ConfidenceLevelConfig,
  ScoreFactor,
} from './types';

/**
 * Score tier thresholds
 */
export const SCORE_THRESHOLDS = {
  hot: 80,
  warm: 50,
} as const;

/**
 * Confidence level thresholds
 */
export const CONFIDENCE_THRESHOLDS = {
  high: 0.8,
  medium: 0.5,
} as const;

/**
 * Get score tier based on score value
 */
export function getScoreTier(score: number): ScoreTier {
  if (score >= SCORE_THRESHOLDS.hot) return 'hot';
  if (score >= SCORE_THRESHOLDS.warm) return 'warm';
  return 'cold';
}

/**
 * Get score tier configuration for styling
 */
export function getScoreTierConfig(score: number): ScoreTierConfig {
  const tier = getScoreTier(score);

  const configs: Record<ScoreTier, ScoreTierConfig> = {
    hot: {
      tier: 'hot',
      label: 'Hot',
      color: 'text-success',
      bgColor: 'bg-success/10',
      borderColor: 'border-success/30',
      icon: 'local_fire_department',
    },
    warm: {
      tier: 'warm',
      label: 'Warm',
      color: 'text-warning',
      bgColor: 'bg-warning/10',
      borderColor: 'border-warning/30',
      icon: 'thermostat',
    },
    cold: {
      tier: 'cold',
      label: 'Cold',
      color: 'text-muted-foreground',
      bgColor: 'bg-muted/50',
      borderColor: 'border-muted',
      icon: 'ac_unit',
    },
  };

  return configs[tier];
}

/**
 * Get confidence level based on confidence value
 */
export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (confidence >= CONFIDENCE_THRESHOLDS.medium) return 'medium';
  return 'low';
}

/**
 * Get confidence level configuration for styling
 */
export function getConfidenceLevelConfig(confidence: number): ConfidenceLevelConfig {
  const level = getConfidenceLevel(confidence);

  const configs: Record<ConfidenceLevel, ConfidenceLevelConfig> = {
    high: {
      level: 'high',
      label: 'High Confidence',
      description: 'The AI model is very confident in this score',
      color: 'text-success',
      bgColor: 'bg-success',
    },
    medium: {
      level: 'medium',
      label: 'Medium Confidence',
      description: 'The AI model has moderate confidence in this score',
      color: 'text-warning',
      bgColor: 'bg-warning',
    },
    low: {
      level: 'low',
      label: 'Low Confidence',
      description: 'The AI model has low confidence - human review recommended',
      color: 'text-destructive',
      bgColor: 'bg-destructive',
    },
  };

  return configs[level];
}

/**
 * Format confidence as percentage
 */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Format impact value with sign
 */
export function formatImpact(impact: number): string {
  const sign = impact >= 0 ? '+' : '';
  return `${sign}${impact}`;
}

/**
 * Get impact direction for styling
 */
export function getImpactDirection(impact: number): 'positive' | 'negative' | 'neutral' {
  if (impact > 0) return 'positive';
  if (impact < 0) return 'negative';
  return 'neutral';
}

/**
 * Sort factors by absolute impact (highest first)
 */
export function sortFactorsByImpact(factors: ScoreFactor[]): ScoreFactor[] {
  return [...factors].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}

/**
 * Get top N factors by impact
 */
export function getTopFactors(factors: ScoreFactor[], limit: number): ScoreFactor[] {
  return sortFactorsByImpact(factors).slice(0, limit);
}

/**
 * Calculate total positive impact
 */
export function getTotalPositiveImpact(factors: ScoreFactor[]): number {
  return factors.filter((f) => f.impact > 0).reduce((sum, f) => sum + f.impact, 0);
}

/**
 * Calculate total negative impact
 */
export function getTotalNegativeImpact(factors: ScoreFactor[]): number {
  return factors.filter((f) => f.impact < 0).reduce((sum, f) => sum + f.impact, 0);
}

/**
 * Get impact bar width as percentage (0-100)
 * Scales impact relative to max possible impact
 */
export function getImpactBarWidth(impact: number, maxImpact: number = 50): number {
  const absImpact = Math.abs(impact);
  const percentage = Math.min((absImpact / maxImpact) * 100, 100);
  return Math.round(percentage);
}
