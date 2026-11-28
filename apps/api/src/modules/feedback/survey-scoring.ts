/**
 * Score rules for the surveys the CRM can send (MVP-012): which scores are valid per type and the
 * sentiment a score stands for. The analytics repository reads the stored sentiment.
 */
import { SURVEY_SCORE_RANGES, type SurveyType } from '@intelliflow/domain';

/** The types a person can be sent today. CES and CUSTOM are analysed but not sent. */
export const SENDABLE_SURVEY_TYPES = ['NPS', 'CSAT'] as const;
export type SendableSurveyType = (typeof SENDABLE_SURVEY_TYPES)[number];

export type SurveySentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

export function isValidSurveyScore(type: SurveyType, score: number): boolean {
  const range = SURVEY_SCORE_RANGES[type];
  return Number.isInteger(score) && score >= range.min && score <= range.max;
}

/** Lowest score that counts as positive, and lowest that counts as neutral, per type. */
const SENTIMENT_THRESHOLDS: Record<SurveyType, { positive: number; neutral: number }> = {
  NPS: { positive: 9, neutral: 7 }, // 9-10 promoters, 7-8 passives, 0-6 detractors
  CSAT: { positive: 4, neutral: 3 }, // 4-5 satisfied, 3 neutral, 1-2 not
  CES: { positive: 5, neutral: 4 }, // 5-7 easy
  CUSTOM: { positive: 7, neutral: 4 }, // 0-10 scale: 70% and 40%
};

export function sentimentForScore(type: SurveyType, score: number): SurveySentiment {
  const { positive, neutral } = SENTIMENT_THRESHOLDS[type];
  if (score >= positive) return 'POSITIVE';
  return score >= neutral ? 'NEUTRAL' : 'NEGATIVE';
}
