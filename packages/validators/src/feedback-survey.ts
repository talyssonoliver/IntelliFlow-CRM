/**
 * Feedback Survey Validators - IFC-068: Feedback Analytics Dashboard
 *
 * Zod schemas for customer survey feedback analytics queries.
 * Separate from feedback.ts which handles IFC-024 AI score feedback.
 */

import { SURVEY_TYPES, SURVEY_STATUSES } from '@intelliflow/domain';
import { z } from 'zod';

export const surveyTypeSchema = z.enum(SURVEY_TYPES);
export const surveyStatusSchema = z.enum(SURVEY_STATUSES);

export const feedbackSurveyAnalyticsQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  surveyType: surveyTypeSchema.optional(),
  granularity: z.enum(['day', 'week', 'month']).default('month'),
});

export type FeedbackSurveyAnalyticsQuery = z.infer<typeof feedbackSurveyAnalyticsQuerySchema>;

// MVP-012: sending and answering surveys

export const sendableSurveyTypeSchema = z.enum(['NPS', 'CSAT']);

export const sendFeedbackSurveySchema = z
  .object({
    contactId: z.string().min(1).max(64),
    surveyType: sendableSurveyTypeSchema,
  })
  .strict();

export type SendFeedbackSurveyInput = z.infer<typeof sendFeedbackSurveySchema>;

export const feedbackSurveySettingsSchema = z
  .object({
    autoSendOnDealWon: z.boolean(),
    autoSendOnTicketResolved: z.boolean(),
  })
  .strict();

export type FeedbackSurveySettingsInput = z.infer<typeof feedbackSurveySettingsSchema>;

/** 32 random bytes in base64url. Strict: a visitor can never name a tenant, contact or survey id. */
export const surveyTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const publicSurveyLookupSchema = z.object({ token: surveyTokenSchema }).strict();

export const publicSurveySubmitSchema = z
  .object({
    token: surveyTokenSchema,
    score: z.number().int().min(0).max(10),
    comment: z.string().max(2000).optional(),
  })
  .strict();

export type PublicSurveySubmitInput = z.infer<typeof publicSurveySubmitSchema>;
