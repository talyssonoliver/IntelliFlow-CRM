/**
 * Prisma Feedback Survey Repository - IFC-068
 *
 * Uses $queryRaw with date_trunc for time-series queries.
 * All queries include explicit tenantId predicate (RLS bypass defense).
 * Never uses include: { contact: true } — contactId has no FK.
 */

import type { PrismaClient, FeedbackStatus } from '@intelliflow/db';
import type {
  FeedbackSurveyRepositoryPort,
  FeedbackAnalyticsQuery,
  FeedbackDashboardSummary,
  NPSDistribution,
  FeedbackTrendPoint,
  SentimentBreakdown,
  ResponseRate,
} from '@intelliflow/application';
import type { SurveyType } from '@intelliflow/domain';

// Responded statuses for analytics queries
const RESPONDED_STATUSES: FeedbackStatus[] = ['RESPONDED', 'FOLLOWED_UP', 'CLOSED'];

// Allowlist for SQL granularity interpolation (injection prevention)
const VALID_GRANULARITY = new Set(['day', 'week', 'month']);

export class PrismaFeedbackSurveyRepository implements FeedbackSurveyRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async getDashboardSummary(
    tenantId: string,
    filters: FeedbackAnalyticsQuery
  ): Promise<FeedbackDashboardSummary> {
    const surveys = await this.prisma.feedbackSurvey.findMany({
      where: {
        tenantId,
        status: { in: RESPONDED_STATUSES },
        score: { not: null },
        ...(filters.dateFrom && { createdAt: { gte: filters.dateFrom } }),
        ...(filters.dateTo && { createdAt: { lte: filters.dateTo } }),
        ...(filters.surveyType && { type: filters.surveyType }),
      },
      select: {
        type: true,
        score: true,
      },
    });

    if (surveys.length === 0) {
      return { totalResponses: 0, npsScores: [], csatScores: [], cesScores: [], hasData: false };
    }

    const npsScores: number[] = [];
    const csatScores: number[] = [];
    const cesScores: number[] = [];

    for (const s of surveys) {
      if (s.score === null) continue;
      switch (s.type) {
        case 'NPS':
          npsScores.push(s.score);
          break;
        case 'CSAT':
          csatScores.push(s.score);
          break;
        case 'CES':
          cesScores.push(s.score);
          break;
      }
    }

    return {
      totalResponses: surveys.length,
      npsScores,
      csatScores,
      cesScores,
      hasData: true,
    };
  }

  async getNPSDistribution(tenantId: string, from: Date, to: Date): Promise<NPSDistribution> {
    const result = await this.prisma.$queryRaw<Array<{ category: string; count: bigint }>>`
      SELECT
        CASE
          WHEN score >= 9 THEN 'promoter'
          WHEN score >= 7 THEN 'passive'
          ELSE 'detractor'
        END AS category,
        COUNT(*) AS count
      FROM "feedback_surveys"
      WHERE "tenantId" = ${tenantId}
        AND type = 'NPS'
        AND status IN ('RESPONDED', 'FOLLOWED_UP', 'CLOSED')
        AND score IS NOT NULL
        AND "createdAt" >= ${from}
        AND "createdAt" <= ${to}
      GROUP BY category
    `;

    let promoters = 0;
    let passives = 0;
    let detractors = 0;

    for (const row of result) {
      const count = Number(row.count);
      switch (row.category) {
        case 'promoter':
          promoters = count;
          break;
        case 'passive':
          passives = count;
          break;
        case 'detractor':
          detractors = count;
          break;
      }
    }

    return { promoters, passives, detractors, total: promoters + passives + detractors };
  }

  async getTrendData(
    tenantId: string,
    from: Date,
    to: Date,
    granularity: 'day' | 'week' | 'month'
  ): Promise<FeedbackTrendPoint[]> {
    if (!VALID_GRANULARITY.has(granularity)) {
      throw new Error(`Invalid granularity: ${granularity}`);
    }

    // Use Prisma.sql for safe interpolation of granularity
    const result = await this.prisma.$queryRawUnsafe<
      Array<{
        period: string;
        avg_nps: number | null;
        avg_csat: number | null;
        avg_ces: number | null;
        response_count: bigint;
      }>
    >(
      `SELECT
        date_trunc('${granularity}', "createdAt")::text AS period,
        AVG(CASE WHEN type = 'NPS' THEN score END) AS avg_nps,
        AVG(CASE WHEN type = 'CSAT' THEN score END) AS avg_csat,
        AVG(CASE WHEN type = 'CES' THEN score END) AS avg_ces,
        COUNT(*) AS response_count
      FROM "feedback_surveys"
      WHERE "tenantId" = $1
        AND status IN ('RESPONDED', 'FOLLOWED_UP', 'CLOSED')
        AND score IS NOT NULL
        AND "createdAt" >= $2
        AND "createdAt" <= $3
      GROUP BY date_trunc('${granularity}', "createdAt")
      ORDER BY period`,
      tenantId,
      from,
      to
    );

    return result.map((row) => ({
      period: row.period,
      nps: row.avg_nps === null ? null : Math.round(row.avg_nps),
      csat: row.avg_csat === null ? null : Math.round(row.avg_csat),
      ces: row.avg_ces === null ? null : Number(row.avg_ces.toFixed(2)),
      responseCount: Number(row.response_count),
    }));
  }

  async getSentimentBreakdown(
    tenantId: string,
    from: Date,
    to: Date,
    type?: SurveyType
  ): Promise<SentimentBreakdown> {
    const typeFilter = type ? `AND type = '${type}'` : '';

    const result = await this.prisma.$queryRawUnsafe<
      Array<{ sentiment: string | null; count: bigint }>
    >(
      `SELECT sentiment, COUNT(*) AS count
      FROM "feedback_surveys"
      WHERE "tenantId" = $1
        AND status IN ('RESPONDED', 'FOLLOWED_UP', 'CLOSED')
        AND "createdAt" >= $2
        AND "createdAt" <= $3
        ${typeFilter}
      GROUP BY sentiment`,
      tenantId,
      from,
      to
    );

    let positive = 0;
    let neutral = 0;
    let negative = 0;

    for (const row of result) {
      const count = Number(row.count);
      switch (row.sentiment) {
        case 'positive':
          positive = count;
          break;
        case 'negative':
          negative = count;
          break;
        default:
          neutral += count;
          break;
      }
    }

    return { positive, neutral, negative, total: positive + neutral + negative };
  }

  async getResponseRateByType(tenantId: string, from: Date, to: Date): Promise<ResponseRate[]> {
    const result = await this.prisma.$queryRaw<
      Array<{ type: string; total_sent: bigint; total_responded: bigint }>
    >`
      SELECT
        type,
        COUNT(*) AS total_sent,
        COUNT(*) FILTER (WHERE status IN ('RESPONDED', 'FOLLOWED_UP', 'CLOSED')) AS total_responded
      FROM "feedback_surveys"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${from}
        AND "createdAt" <= ${to}
      GROUP BY type
    `;

    return result.map((row) => {
      const sent = Number(row.total_sent);
      const responded = Number(row.total_responded);
      return {
        type: row.type as SurveyType,
        sent,
        responded,
        rate: sent > 0 ? Math.round((responded / sent) * 100) : 0,
      };
    });
  }
}
