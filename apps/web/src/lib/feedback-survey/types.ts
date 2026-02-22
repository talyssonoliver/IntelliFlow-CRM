/**
 * Feedback Survey Analytics Types - IFC-068
 *
 * Types for the feedback analytics dashboard components.
 * Derived from tRPC router output types.
 */

export interface NPSDistribution {
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
}

export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
  total: number;
}

export interface FeedbackTrendPoint {
  period: string;
  nps: number | null;
  csat: number | null;
  ces: number | null;
  responseCount: number;
}

export interface ResponseRate {
  type: string;
  sent: number;
  responded: number;
  rate: number;
}

export interface FeedbackDashboardData {
  hasData: boolean;
  nps: { score: number; distribution: NPSDistribution } | null;
  csat: { score: number; totalResponses: number } | null;
  ces: { score: number; totalResponses: number } | null;
  sentiment: SentimentBreakdown | null;
  trends: FeedbackTrendPoint[];
  responseRates: ResponseRate[];
}

export interface FeedbackDashboardFilters {
  dateFrom?: Date;
  dateTo?: Date;
  surveyType?: 'NPS' | 'CSAT' | 'CES' | 'CUSTOM';
  granularity: 'day' | 'week' | 'month';
}

export interface NpsGaugeProps {
  score: number;
  distribution: NPSDistribution;
}

export interface NpsTrendChartProps {
  trends: FeedbackTrendPoint[];
  granularity: 'day' | 'week' | 'month';
}

export interface SentimentDistributionChartProps {
  sentiment: SentimentBreakdown;
}

export interface NpsBreakdownBarProps {
  distribution: NPSDistribution;
}
