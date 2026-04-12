/**
 * AI Constants - Single Source of Truth
 *
 * Canonical enum values for AI agent outputs and configurations.
 * All validator schemas derive their types from these constants.
 *
 * Task: IFC-159 - AI Output Schema Consistency
 */

// =============================================================================
// Priority Levels (AI-specific, includes all levels)
// =============================================================================

/**
 * Priority levels used across AI outputs
 * Note: Aligned with TASK_PRIORITIES but kept separate for AI-specific use
 */
export const AI_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export type AIPriority = (typeof AI_PRIORITIES)[number];

// =============================================================================
// Qualification Levels
// =============================================================================

/**
 * Lead qualification levels from AI analysis
 */
export const QUALIFICATION_LEVELS = ['HIGH', 'MEDIUM', 'LOW', 'UNQUALIFIED'] as const;

export type QualificationLevel = (typeof QUALIFICATION_LEVELS)[number];

// =============================================================================
// Follow-up Urgency
// =============================================================================

/**
 * Urgency levels for follow-up recommendations
 */
export const FOLLOWUP_URGENCIES = ['IMMEDIATE', 'HIGH', 'MEDIUM', 'LOW', 'DEFER'] as const;

export type FollowupUrgency = (typeof FOLLOWUP_URGENCIES)[number];

// =============================================================================
// Recommended Actions
// =============================================================================

/**
 * Actions recommended by AI for lead follow-up
 */
export const RECOMMENDED_ACTIONS = [
  'SEND_EMAIL',
  'PHONE_CALL',
  'SCHEDULE_MEETING',
  'SEND_PROPOSAL',
  'WAIT',
  'NURTURE_CAMPAIGN',
  'CLOSE_AS_LOST',
  'ESCALATE_TO_MANAGER',
] as const;

export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

// =============================================================================
// Scheduling Constants
// =============================================================================

/**
 * Optimal days for outreach (business days)
 */
export const OPTIMAL_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;

export type OptimalDay = (typeof OPTIMAL_DAYS)[number];

/**
 * Optimal time slots for outreach
 */
export const OPTIMAL_TIME_SLOTS = [
  'MORNING',
  'LATE_MORNING',
  'AFTERNOON',
  'LATE_AFTERNOON',
] as const;

export type OptimalTimeSlot = (typeof OPTIMAL_TIME_SLOTS)[number];

// =============================================================================
// Communication Constants
// =============================================================================

/**
 * Communication tone options
 */
export const COMMUNICATION_TONES = ['FORMAL', 'PROFESSIONAL', 'FRIENDLY', 'CASUAL'] as const;

export type CommunicationTone = (typeof COMMUNICATION_TONES)[number];

/**
 * Email purpose/intent
 */
export const EMAIL_PURPOSES = [
  'INTRODUCTION',
  'FOLLOW_UP',
  'MEETING_REQUEST',
  'PROPOSAL',
  'CHECK_IN',
  'RE_ENGAGEMENT',
  'THANK_YOU',
] as const;

export type EmailPurpose = (typeof EMAIL_PURPOSES)[number];

/**
 * Email purposes for the email writer agent (slightly different set)
 */
export const EMAIL_WRITER_PURPOSES = [
  'INITIAL_OUTREACH',
  'FOLLOW_UP',
  'MEETING_REQUEST',
  'PROPOSAL',
  'THANK_YOU',
  'RE_ENGAGEMENT',
] as const;

export type EmailWriterPurpose = (typeof EMAIL_WRITER_PURPOSES)[number];

// =============================================================================
// Agent Urgency (for email writer)
// =============================================================================

/**
 * Simple urgency levels for agent inputs
 */
export const AGENT_URGENCIES = ['HIGH', 'MEDIUM', 'LOW'] as const;

export type AgentUrgency = (typeof AGENT_URGENCIES)[number];

// =============================================================================
// Email Length
// =============================================================================

/**
 * Email length preferences
 */
export const EMAIL_LENGTHS = ['SHORT', 'MEDIUM', 'LONG'] as const;

export type EmailLength = (typeof EMAIL_LENGTHS)[number];

// =============================================================================
// Follow-up Tracking
// =============================================================================

/**
 * Lead follow-up statuses (more detailed than LEAD_STATUSES for follow-up tracking)
 */
export const LEAD_FOLLOWUP_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const;

export type LeadFollowupStatus = (typeof LEAD_FOLLOWUP_STATUSES)[number];

/**
 * Types of interactions in lead history
 */
export const INTERACTION_TYPES = [
  'EMAIL_SENT',
  'EMAIL_OPENED',
  'EMAIL_CLICKED',
  'CALL',
  'MEETING',
  'FORM_SUBMISSION',
] as const;

export type InteractionType = (typeof INTERACTION_TYPES)[number];

// =============================================================================
// Human-in-the-Loop Feedback (IFC-024)
// =============================================================================

/**
 * Types of feedback users can provide on AI scores
 */
export const FEEDBACK_TYPES = ['THUMBS_UP', 'THUMBS_DOWN', 'SCORE_CORRECTION'] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

/**
 * Categories for score corrections (why was the score incorrect?)
 */
export const FEEDBACK_CATEGORIES = [
  'SCORE_TOO_HIGH',
  'SCORE_TOO_LOW',
  'WRONG_FACTORS',
  'MISSING_CONTEXT',
  'DATA_QUALITY',
  'OTHER',
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/**
 * Thresholds for determining when model retraining is recommended
 */
export const RETRAINING_THRESHOLDS = {
  /** Minimum feedback samples before recommending retraining */
  MIN_FEEDBACK_COUNT: 100,
  /** Maximum negative feedback ratio (30%) before alerting */
  MAX_NEGATIVE_RATIO: 0.3,
  /** Maximum average correction magnitude (20 points) */
  MAX_AVG_CORRECTION: 20,
  /** Rolling window in days for analysis */
  WINDOW_DAYS: 7,
} as const;

/**
 * Correction magnitude buckets for analytics
 */
export const CORRECTION_MAGNITUDE_BUCKETS = {
  /** Minor corrections: 1-10 points */
  MINOR_MAX: 10,
  /** Moderate corrections: 11-25 points */
  MODERATE_MAX: 25,
  /** Major corrections: 26-50 points */
  MAJOR_MAX: 50,
  /** Severe corrections: 50+ points */
} as const;

// =============================================================================
// A/B Testing Framework (IFC-025)
// =============================================================================

/**
 * Experiment statuses for A/B tests
 */
export const EXPERIMENT_STATUSES = ['DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const;

export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

/**
 * Types of experiments supported
 */
export const EXPERIMENT_TYPES = ['AI_VS_MANUAL', 'MODEL_COMPARISON', 'THRESHOLD_TEST'] as const;

export type ExperimentType = (typeof EXPERIMENT_TYPES)[number];

/**
 * Experiment variant types
 */
export const EXPERIMENT_VARIANTS = ['control', 'treatment'] as const;

export type ExperimentVariant = (typeof EXPERIMENT_VARIANTS)[number];

/**
 * Statistical significance levels
 */
export const SIGNIFICANCE_LEVELS = {
  /** Low confidence (90%) */
  LOW: 0.1,
  /** Medium confidence (95%) - standard */
  MEDIUM: 0.05,
  /** High confidence (99%) */
  HIGH: 0.01,
} as const;

/**
 * Experiment configuration defaults
 */
export const EXPERIMENT_DEFAULTS = {
  /** Minimum sample size per variant for statistical validity */
  MIN_SAMPLE_SIZE: 30,
  /** Default traffic percentage to treatment group */
  DEFAULT_TRAFFIC_PERCENT: 50,
  /** Default significance level (α = 0.05) */
  DEFAULT_SIGNIFICANCE_LEVEL: 0.05,
  /** Minimum effect size (Cohen's d) to detect */
  MIN_EFFECT_SIZE: 0.2,
  /** Default statistical power (1 - β) */
  DEFAULT_POWER: 0.8,
} as const;

/**
 * Effect size interpretation thresholds (Cohen's d)
 */
export const EFFECT_SIZE_THRESHOLDS = {
  /** Small effect */
  SMALL: 0.2,
  /** Medium effect */
  MEDIUM: 0.5,
  /** Large effect */
  LARGE: 0.8,
} as const;

// =============================================================================
// Sentiment Analysis (IFC-039)
// =============================================================================

/**
 * Sentiment classification labels
 */
export const SENTIMENT_LABELS = [
  'VERY_POSITIVE',
  'POSITIVE',
  'NEUTRAL',
  'NEGATIVE',
  'VERY_NEGATIVE',
] as const;

export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];

/**
 * Emotion detection labels (Plutchik's wheel of emotions)
 */
export const EMOTION_LABELS = [
  'JOY',
  'TRUST',
  'ANTICIPATION',
  'SURPRISE',
  'SADNESS',
  'FEAR',
  'ANGER',
  'DISGUST',
  'NEUTRAL',
] as const;

export type EmotionLabel = (typeof EMOTION_LABELS)[number];

/**
 * Urgency levels for customer communications
 */
export const URGENCY_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;

export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

// =============================================================================
// Churn Risk (IFC-095)
// =============================================================================

/**
 * Churn risk levels with severity classification
 * Used for risk categorization in churn prediction outputs
 */
export const CHURN_RISK_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MINIMAL'] as const;

export type ChurnRiskLevel = (typeof CHURN_RISK_LEVELS)[number];

/**
 * SLA hours mapping per risk level
 */
export const CHURN_RISK_SLA_HOURS: Record<ChurnRiskLevel, number> = {
  CRITICAL: 24,
  HIGH: 48,
  MEDIUM: 168,
  LOW: 336,
  MINIMAL: 720,
} as const;

/**
 * Risk factor impact levels
 */
export const RISK_FACTOR_IMPACTS = ['HIGH', 'MEDIUM', 'LOW'] as const;

export type RiskFactorImpact = (typeof RISK_FACTOR_IMPACTS)[number];

/**
 * Data quality levels for churn prediction inputs
 */
export const DATA_QUALITY_LEVELS = ['COMPLETE', 'PARTIAL', 'MINIMAL'] as const;

export type DataQualityLevel = (typeof DATA_QUALITY_LEVELS)[number];

// =============================================================================
// Next Best Action (IFC-039)
// =============================================================================

/**
 * Action types for NBA recommendations
 */
export const NBA_ACTION_TYPES = [
  'CALL',
  'EMAIL',
  'SCHEDULE_MEETING',
  'SEND_PROPOSAL',
  'FOLLOW_UP',
  'ESCALATE',
  'NURTURE',
  'CLOSE_DEAL',
  'RE_ENGAGE',
  'PROVIDE_DEMO',
  'SEND_CONTENT',
  'RESEARCH',
  'WAIT',
] as const;

export type NBAActionType = (typeof NBA_ACTION_TYPES)[number];

/**
 * Priority levels for NBA actions
 */
export const NBA_ACTION_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

export type NBAActionPriority = (typeof NBA_ACTION_PRIORITIES)[number];

// =============================================================================
// Chain Versioning (IFC-086)
// =============================================================================

// Re-export chain version constants for centralized access
export * from './ChainVersionConstants';

// =============================================================================
// AI Output Review Confidence Thresholds (IFC-128)
// =============================================================================

/**
 * AI chain types for confidence threshold configuration
 */
export const AI_CHAIN_TYPES = [
  'LEAD_SCORING',
  'SENTIMENT_ANALYSIS',
  'AUTO_RESPONSE',
  'CHURN_PREDICTION',
  'EMAIL_GENERATION',
  'NEXT_BEST_ACTION',
] as const;

export type AIChainType = (typeof AI_CHAIN_TYPES)[number];

/**
 * Default confidence threshold for AI outputs
 * Outputs below this threshold require human review
 */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.85;

/**
 * Chain-specific confidence thresholds
 * Higher thresholds for customer-facing outputs, lower for internal analysis
 */
export const CHAIN_CONFIDENCE_THRESHOLDS: Record<AIChainType, number> = {
  LEAD_SCORING: 0.85,
  SENTIMENT_ANALYSIS: 0.8, // Lower threshold acceptable for internal use
  AUTO_RESPONSE: 0.9, // Higher for customer-facing
  CHURN_PREDICTION: 0.85,
  EMAIL_GENERATION: 0.9, // Higher for customer-facing
  NEXT_BEST_ACTION: 0.85,
} as const;

/**
 * Get the confidence threshold for a specific chain type
 * Falls back to default threshold if chain type not found
 */
export function getConfidenceThreshold(chainType: AIChainType): number {
  return CHAIN_CONFIDENCE_THRESHOLDS[chainType] ?? DEFAULT_CONFIDENCE_THRESHOLD;
}

/**
 * Check if a confidence score requires human review for a given chain type
 */
export function requiresHumanReview(confidence: number, chainType: AIChainType): boolean {
  return confidence < getConfidenceThreshold(chainType);
}
