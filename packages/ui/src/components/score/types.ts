/**
 * Score Component Types - IFC-023
 *
 * Type definitions for AI explainability UI components.
 * Derived from leadScoreSchema in @intelliflow/validators.
 */

/**
 * Scoring factor with impact and reasoning
 */
export interface ScoreFactor {
  /** Factor name (e.g., "Email Domain Quality", "Company Size") */
  name: string;
  /** Impact on score (-100 to +100, negative reduces score) */
  impact: number;
  /** AI explanation for this factor */
  reasoning: string;
}

/**
 * Complete lead score data from AI scoring pipeline
 */
export interface LeadScoreData {
  /** Score value (0-100) */
  score: number;
  /** AI confidence level (0-1) */
  confidence: number;
  /** List of scoring factors */
  factors: ScoreFactor[];
  /** AI model version used for scoring */
  modelVersion: string;
}

/**
 * Score tier classification for styling
 */
export type ScoreTier = 'hot' | 'warm' | 'cold';

/**
 * Confidence level classification for styling
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Score badge display modes
 */
export type ScoreBadgeMode = 'compact' | 'inline' | 'expanded';

/**
 * Component size variants
 */
export type ComponentSize = 'sm' | 'md' | 'lg';

/**
 * Score tier configuration with styling
 */
export interface ScoreTierConfig {
  tier: ScoreTier;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
}

/**
 * Confidence level configuration with styling
 */
export interface ConfidenceLevelConfig {
  level: ConfidenceLevel;
  label: string;
  description: string;
  color: string;
  bgColor: string;
}
