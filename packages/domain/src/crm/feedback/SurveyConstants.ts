/**
 * Survey Feedback Constants - IFC-068: Feedback Analytics Dashboard
 *
 * CRITICAL: Use SurveyType, NOT FeedbackType (collision with AI layer at AIConstants.ts:191)
 * Not to be confused with AI FeedbackType in ai/AIConstants.ts (THUMBS_UP/THUMBS_DOWN/SCORE_CORRECTION)
 *
 * @module @intelliflow/domain/crm/feedback/SurveyConstants
 */

// Survey types — matches Prisma FeedbackType enum values
export const SURVEY_TYPES = ['NPS', 'CSAT', 'CES', 'CUSTOM'] as const;
export type SurveyType = (typeof SURVEY_TYPES)[number];

// Survey statuses — matches Prisma FeedbackStatus enum values
export const SURVEY_STATUSES = ['PENDING', 'SENT', 'RESPONDED', 'FOLLOWED_UP', 'CLOSED'] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

// Score ranges per survey type
export const SURVEY_SCORE_RANGES = {
  NPS: { min: 0, max: 10 },
  CSAT: { min: 1, max: 5 },
  CES: { min: 1, max: 7 },
  CUSTOM: { min: 0, max: 10 }, // Default; override at runtime
} as const satisfies Record<SurveyType, { min: number; max: number }>;

// Valid state transitions for survey lifecycle
export const VALID_SURVEY_TRANSITIONS: Record<SurveyStatus, readonly SurveyStatus[]> = {
  PENDING: ['SENT'],
  SENT: ['RESPONDED', 'CLOSED'],
  RESPONDED: ['FOLLOWED_UP', 'CLOSED'],
  FOLLOWED_UP: ['CLOSED'],
  CLOSED: [],
} as const;

/**
 * Guard function for survey status transitions
 */
export function canTransitionSurveyTo(from: SurveyStatus, to: SurveyStatus): boolean {
  return (VALID_SURVEY_TRANSITIONS[from] as readonly string[]).includes(to);
}

/**
 * Calculate Net Promoter Score from an array of scores (0-10).
 * Promoters: 9-10, Passives: 7-8, Detractors: 0-6
 * Returns 0 for empty arrays (not NaN).
 */
export function calculateNPS(scores: number[]): number {
  if (scores.length === 0) return 0;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

/**
 * Calculate Customer Satisfaction Score from an array of scores (1-5).
 * Satisfied: score >= 4
 * Returns 0 for empty arrays.
 */
export function calculateCSAT(scores: number[]): number {
  if (scores.length === 0) return 0;
  const satisfied = scores.filter((s) => s >= 4).length;
  return Math.round((satisfied / scores.length) * 100);
}

/**
 * Calculate Customer Effort Score from an array of scores (1-7).
 * Returns the average.
 * Returns 0 for empty arrays.
 */
export function calculateCES(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2));
}
