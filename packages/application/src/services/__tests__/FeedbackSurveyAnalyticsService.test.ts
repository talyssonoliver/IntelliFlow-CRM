import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeedbackSurveyAnalyticsService } from '../FeedbackSurveyAnalyticsService';
import type {
  FeedbackSurveyRepositoryPort,
  FeedbackAnalyticsQuery,
} from '../../ports/repositories/FeedbackSurveyRepositoryPort';

function createMockRepo(): Record<string, any> {
  return {
    getDashboardSummary: vi.fn(),
    getNPSDistribution: vi.fn(),
    getTrendData: vi.fn(),
    getSentimentBreakdown: vi.fn(),
    getResponseRateByType: vi.fn(),
  };
}

describe('FeedbackSurveyAnalyticsService', () => {
  let service: FeedbackSurveyAnalyticsService;
  let mockRepo: Record<string, any>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockRepo = createMockRepo();
    service = new FeedbackSurveyAnalyticsService(mockRepo as FeedbackSurveyRepositoryPort);
  });

  const defaultFilters: FeedbackAnalyticsQuery = { granularity: 'month' };

  it('returns { hasData: false } when repo returns empty results', async () => {
    mockRepo.getDashboardSummary.mockResolvedValue({
      totalResponses: 0,
      npsScores: [],
      csatScores: [],
      cesScores: [],
      hasData: false,
    });

    const result = await service.getDashboardSummary('tenant1', defaultFilters);

    expect(result.hasData).toBe(false);
    expect(result.nps).toBeNull();
    expect(result.csat).toBeNull();
    expect(result.ces).toBeNull();
    expect(result.sentiment).toBeNull();
    expect(result.trends).toEqual([]);
    expect(result.responseRates).toEqual([]);
  });

  it('returns correct NPS with valid responded data', async () => {
    mockRepo.getDashboardSummary.mockResolvedValue({
      totalResponses: 4,
      npsScores: [9, 10, 7, 3], // 2 promoters, 1 passive, 1 detractor => ((2-1)/4)*100 = 25
      csatScores: [],
      cesScores: [],
      hasData: true,
    });
    mockRepo.getNPSDistribution.mockResolvedValue({
      promoters: 2,
      passives: 1,
      detractors: 1,
      total: 4,
    });
    mockRepo.getSentimentBreakdown.mockResolvedValue({
      positive: 2,
      neutral: 1,
      negative: 1,
      total: 4,
    });
    mockRepo.getTrendData.mockResolvedValue([]);
    mockRepo.getResponseRateByType.mockResolvedValue([]);

    const result = await service.getDashboardSummary('tenant1', defaultFilters);

    expect(result.hasData).toBe(true);
    expect(result.nps).not.toBeNull();
    expect(result.nps!.score).toBe(25);
    expect(result.nps!.distribution.promoters).toBe(2);
  });

  it('excludes null-score records from NPS calculation (handled by repo)', async () => {
    // Repo should only return non-null scores
    mockRepo.getDashboardSummary.mockResolvedValue({
      totalResponses: 2,
      npsScores: [9, 10], // null scores excluded by repo
      csatScores: [],
      cesScores: [],
      hasData: true,
    });
    mockRepo.getNPSDistribution.mockResolvedValue({
      promoters: 2,
      passives: 0,
      detractors: 0,
      total: 2,
    });
    mockRepo.getSentimentBreakdown.mockResolvedValue({
      positive: 2,
      neutral: 0,
      negative: 0,
      total: 2,
    });
    mockRepo.getTrendData.mockResolvedValue([]);
    mockRepo.getResponseRateByType.mockResolvedValue([]);

    const result = await service.getDashboardSummary('tenant1', defaultFilters);

    expect(result.nps!.score).toBe(100);
  });

  it('returns CSAT data when type filter is CSAT', async () => {
    mockRepo.getDashboardSummary.mockResolvedValue({
      totalResponses: 3,
      npsScores: [],
      csatScores: [4, 5, 2], // 2 satisfied / 3 = 67%
      cesScores: [],
      hasData: true,
    });
    mockRepo.getNPSDistribution.mockResolvedValue({
      promoters: 0,
      passives: 0,
      detractors: 0,
      total: 0,
    });
    mockRepo.getSentimentBreakdown.mockResolvedValue({
      positive: 2,
      neutral: 0,
      negative: 1,
      total: 3,
    });
    mockRepo.getTrendData.mockResolvedValue([]);
    mockRepo.getResponseRateByType.mockResolvedValue([]);

    const result = await service.getDashboardSummary('tenant1', {
      ...defaultFilters,
      surveyType: 'CSAT',
    });

    expect(result.hasData).toBe(true);
    expect(result.csat).not.toBeNull();
    expect(result.csat!.score).toBe(67);
    expect(result.csat!.totalResponses).toBe(3);
  });

  it('returns CES data when type filter is CES', async () => {
    mockRepo.getDashboardSummary.mockResolvedValue({
      totalResponses: 3,
      npsScores: [],
      csatScores: [],
      cesScores: [3, 5, 7], // average = 5
      hasData: true,
    });
    mockRepo.getNPSDistribution.mockResolvedValue({
      promoters: 0,
      passives: 0,
      detractors: 0,
      total: 0,
    });
    mockRepo.getSentimentBreakdown.mockResolvedValue({
      positive: 1,
      neutral: 1,
      negative: 1,
      total: 3,
    });
    mockRepo.getTrendData.mockResolvedValue([]);
    mockRepo.getResponseRateByType.mockResolvedValue([]);

    const result = await service.getDashboardSummary('tenant1', {
      ...defaultFilters,
      surveyType: 'CES',
    });

    expect(result.hasData).toBe(true);
    expect(result.ces).not.toBeNull();
    expect(result.ces!.score).toBe(5);
  });

  it('handles CUSTOM type', async () => {
    mockRepo.getDashboardSummary.mockResolvedValue({
      totalResponses: 1,
      npsScores: [],
      csatScores: [],
      cesScores: [],
      hasData: true,
    });
    mockRepo.getNPSDistribution.mockResolvedValue({
      promoters: 0,
      passives: 0,
      detractors: 0,
      total: 0,
    });
    mockRepo.getSentimentBreakdown.mockResolvedValue({
      positive: 0,
      neutral: 1,
      negative: 0,
      total: 1,
    });
    mockRepo.getTrendData.mockResolvedValue([]);
    mockRepo.getResponseRateByType.mockResolvedValue([]);

    const result = await service.getDashboardSummary('tenant1', {
      ...defaultFilters,
      surveyType: 'CUSTOM',
    });

    expect(result.hasData).toBe(true);
  });

  it('calls repo with tenantId', async () => {
    mockRepo.getDashboardSummary.mockResolvedValue({
      totalResponses: 0,
      npsScores: [],
      csatScores: [],
      cesScores: [],
      hasData: false,
    });

    await service.getDashboardSummary('my-tenant', defaultFilters);

    expect(mockRepo.getDashboardSummary).toHaveBeenCalledWith('my-tenant', defaultFilters);
  });
});
