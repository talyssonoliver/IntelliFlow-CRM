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
