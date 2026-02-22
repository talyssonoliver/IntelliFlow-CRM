/**
 * Feedback Survey Analytics Service - IFC-068
 *
 * Orchestrates repository calls and applies domain calculation functions
 * to produce dashboard-ready analytics data.
 */

import { calculateNPS, calculateCSAT, calculateCES, type SurveyType } from '@intelliflow/domain';
import type {
  FeedbackSurveyRepositoryPort,
  FeedbackAnalyticsQuery,
  NPSDistribution,
  FeedbackTrendPoint,
  SentimentBreakdown,
  ResponseRate,
} from '../ports/repositories/FeedbackSurveyRepositoryPort';

export interface FeedbackDashboardData {
  hasData: boolean;
  nps: { score: number; distribution: NPSDistribution } | null;
  csat: { score: number; totalResponses: number } | null;
  ces: { score: number; totalResponses: number } | null;
  sentiment: SentimentBreakdown | null;
  trends: FeedbackTrendPoint[];
  responseRates: ResponseRate[];
}

export class FeedbackSurveyAnalyticsService {
  constructor(private readonly repo: FeedbackSurveyRepositoryPort) {}

  async getDashboardSummary(tenantId: string, filters: FeedbackAnalyticsQuery): Promise<FeedbackDashboardData> {
    const summary = await this.repo.getDashboardSummary(tenantId, filters);

    if (!summary.hasData) {
      return {
        hasData: false,
        nps: null,
        csat: null,
        ces: null,
        sentiment: null,
        trends: [],
        responseRates: [],
      };
    }

    const now = new Date();
    const dateFrom = filters.dateFrom || new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const dateTo = filters.dateTo || now;

    // Calculate scores using domain pure functions — null scores already excluded by repo
    const npsScore = calculateNPS(summary.npsScores);
    const csatScore = calculateCSAT(summary.csatScores);
    const cesScore = calculateCES(summary.cesScores);

    // Fetch additional data in parallel
    const [npsDistribution, sentiment, trends, responseRates] = await Promise.all([
      this.repo.getNPSDistribution(tenantId, dateFrom, dateTo),
      this.repo.getSentimentBreakdown(tenantId, dateFrom, dateTo, filters.surveyType),
      this.repo.getTrendData(tenantId, dateFrom, dateTo, filters.granularity),
      this.repo.getResponseRateByType(tenantId, dateFrom, dateTo),
    ]);

    return {
      hasData: true,
      nps: { score: npsScore, distribution: npsDistribution },
      csat: summary.csatScores.length > 0 ? { score: csatScore, totalResponses: summary.csatScores.length } : null,
      ces: summary.cesScores.length > 0 ? { score: cesScore, totalResponses: summary.cesScores.length } : null,
      sentiment,
      trends,
      responseRates,
    };
  }
}
