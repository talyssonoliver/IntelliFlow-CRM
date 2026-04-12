/**
 * Feedback Survey Repository Port - IFC-068
 *
 * Defines the contract for feedback survey data access.
 * Implemented by PrismaFeedbackSurveyRepository in adapters.
 */

import type { SurveyType } from '@intelliflow/domain';

export interface FeedbackAnalyticsQuery {
  dateFrom?: Date;
  dateTo?: Date;
  surveyType?: SurveyType;
  granularity: 'day' | 'week' | 'month';
}

export interface FeedbackDashboardSummary {
  totalResponses: number;
  npsScores: number[];
  csatScores: number[];
  cesScores: number[];
  hasData: boolean;
}

export interface NPSDistribution {
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
}

export interface FeedbackTrendPoint {
  period: string;
  nps: number | null;
  csat: number | null;
  ces: number | null;
  responseCount: number;
}

export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
  total: number;
}

export interface ResponseRate {
  type: SurveyType;
  sent: number;
  responded: number;
  rate: number;
}

export interface FeedbackSurveyRepositoryPort {
  getDashboardSummary(
    tenantId: string,
    filters: FeedbackAnalyticsQuery
  ): Promise<FeedbackDashboardSummary>;
  getNPSDistribution(tenantId: string, from: Date, to: Date): Promise<NPSDistribution>;
  getTrendData(
    tenantId: string,
    from: Date,
    to: Date,
    granularity: 'day' | 'week' | 'month'
  ): Promise<FeedbackTrendPoint[]>;
  getSentimentBreakdown(
    tenantId: string,
    from: Date,
    to: Date,
    type?: SurveyType
  ): Promise<SentimentBreakdown>;
  getResponseRateByType(tenantId: string, from: Date, to: Date): Promise<ResponseRate[]>;
}
