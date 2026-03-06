/**
 * Intelligence Router - Lead Scoring Dashboard Tests (PG-148)
 *
 * Tests the getLeadScoringDashboard tRPC procedure.
 * Uses the createCaller pattern with the shared test setup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { intelligenceRouter } from '../intelligence.router';
import { prismaMock, createTestContext } from '../../../test/setup';

function createMockAIScore(overrides: Record<string, any> = {}) {
  return {
    id: 'score-1',
    tenantId: 'test-tenant-id',
    leadId: 'lead-001',
    score: 85,
    confidence: 0.92,
    factors: [
      { name: 'Activity Level', impact: 15, reasoning: 'High engagement' },
      { name: 'Email Domain', impact: 10, reasoning: 'Corporate domain' },
    ],
    modelVersion: 'openai:gpt-3.5-turbo:v2',
    scoredById: 'user-1',
    createdAt: new Date('2026-02-15T10:00:00Z'),
    updatedAt: new Date('2026-02-15T10:00:00Z'),
    lead: {
      id: 'lead-001',
      firstName: 'John',
      lastName: 'Doe',
      company: 'Acme Corp',
    },
    ...overrides,
  };
}

describe('intelligenceRouter.getLeadScoringDashboard', () => {
  let caller: ReturnType<typeof intelligenceRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    const ctx = createTestContext();
    caller = intelligenceRouter.createCaller(ctx);
  });

  it('TC-B1: returns dashboard data with valid filters', async () => {
    const scores = [
      createMockAIScore({ id: 'score-1', score: 85, confidence: 0.92 }),
      createMockAIScore({
        id: 'score-2',
        score: 60,
        confidence: 0.88,
        leadId: 'lead-002',
        lead: { id: 'lead-002', firstName: 'Jane', lastName: 'Smith', company: null },
      }),
    ];
    (prismaMock.aIScore.findMany as any).mockResolvedValue(scores);

    const result = await caller.getLeadScoringDashboard({ dateRange: '30d', page: 1, limit: 20 });

    expect(result).toBeDefined();
    expect(result.stats).toBeDefined();
    expect(result.scoredLeads).toBeDefined();
    expect(result.trends).toBeDefined();
    expect(result.distribution).toBeDefined();
  });

  it('TC-B2: aggregates stats correctly (hot>=80, warm 50-79, cold<50)', async () => {
    const scores = [
      createMockAIScore({ id: 's1', score: 92 }),
      createMockAIScore({ id: 's2', score: 65 }),
      createMockAIScore({ id: 's3', score: 35 }),
      createMockAIScore({ id: 's4', score: 80 }), // exactly 80 = hot
    ];
    (prismaMock.aIScore.findMany as any).mockResolvedValue(scores);

    const result = await caller.getLeadScoringDashboard({ dateRange: '30d' });

    expect(result.stats.total).toBe(4);
    expect(result.stats.hot).toBe(2); // 92, 80
    expect(result.stats.warm).toBe(1); // 65
    expect(result.stats.cold).toBe(1); // 35
  });

  it('TC-B3: calculates avg score as rounded integer', async () => {
    const scores = [
      createMockAIScore({ id: 's1', score: 90 }),
      createMockAIScore({ id: 's2', score: 70 }),
      createMockAIScore({ id: 's3', score: 50 }),
    ];
    (prismaMock.aIScore.findMany as any).mockResolvedValue(scores);

    const result = await caller.getLeadScoringDashboard({ dateRange: '30d' });

    // (90 + 70 + 50) / 3 = 70
    expect(result.stats.avgScore).toBe(70);
    expect(Number.isInteger(result.stats.avgScore)).toBe(true);
  });

  it('TC-B4: calculates avg confidence (0-1 float)', async () => {
    const scores = [
      createMockAIScore({ id: 's1', confidence: 0.9 }),
      createMockAIScore({ id: 's2', confidence: 0.8 }),
    ];
    (prismaMock.aIScore.findMany as any).mockResolvedValue(scores);

    const result = await caller.getLeadScoringDashboard({ dateRange: '30d' });

    expect(result.stats.avgConfidence).toBeCloseTo(0.85, 2);
  });

  it('TC-B5: filters by date range', async () => {
    (prismaMock.aIScore.findMany as any).mockResolvedValue([]);

    await caller.getLeadScoringDashboard({ dateRange: '7d' });

    expect(prismaMock.aIScore.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
          }),
        }),
      })
    );
  });

  it('TC-B6: paginates results (page, limit)', async () => {
    const manyScores = Array.from({ length: 30 }, (_, i) =>
      createMockAIScore({ id: `s-${i}`, score: 90 - i })
    );
    (prismaMock.aIScore.findMany as any).mockResolvedValue(manyScores);

    const page1 = await caller.getLeadScoringDashboard({ dateRange: '30d', page: 1, limit: 10 });
    expect(page1.scoredLeads.length).toBe(10);

    const page2 = await caller.getLeadScoringDashboard({ dateRange: '30d', page: 2, limit: 10 });
    expect(page2.scoredLeads.length).toBe(10);

    // Different leads on different pages
    expect(page1.scoredLeads[0].id).not.toBe(page2.scoredLeads[0].id);
  });

  it('TC-B7: sorts scored leads by score DESC', async () => {
    const scores = [
      createMockAIScore({ id: 's1', score: 50 }),
      createMockAIScore({ id: 's2', score: 90 }),
      createMockAIScore({ id: 's3', score: 70 }),
    ];
    (prismaMock.aIScore.findMany as any).mockResolvedValue(scores);

    // The query uses orderBy: { score: 'desc' } so Prisma returns sorted
    // We verify the orderBy parameter was passed
    await caller.getLeadScoringDashboard({ dateRange: '30d' });

    expect(prismaMock.aIScore.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { score: 'desc' },
      })
    );
  });

  it('TC-B8: includes lead details via relation', async () => {
    const scores = [
      createMockAIScore({
        lead: { id: 'lead-001', firstName: 'John', lastName: 'Doe', company: 'Acme Corp' },
      }),
    ];
    (prismaMock.aIScore.findMany as any).mockResolvedValue(scores);

    const result = await caller.getLeadScoringDashboard({ dateRange: '30d' });

    expect(result.scoredLeads[0].leadName).toBe('John Doe');
    expect(result.scoredLeads[0].company).toBe('Acme Corp');
  });

  it('TC-B9: handles empty results', async () => {
    (prismaMock.aIScore.findMany as any).mockResolvedValue([]);

    const result = await caller.getLeadScoringDashboard({ dateRange: '30d' });

    expect(result.stats.total).toBe(0);
    expect(result.stats.hot).toBe(0);
    expect(result.stats.warm).toBe(0);
    expect(result.stats.cold).toBe(0);
    expect(result.stats.avgScore).toBe(0);
    expect(result.stats.avgConfidence).toBe(0);
    expect(result.scoredLeads).toEqual([]);
    expect(result.trends).toEqual([]);
  });

  it('TC-B10: enforces tenant isolation (filters by tenantId)', async () => {
    (prismaMock.aIScore.findMany as any).mockResolvedValue([]);

    await caller.getLeadScoringDashboard({ dateRange: '30d' });

    expect(prismaMock.aIScore.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'test-tenant-id',
        }),
      })
    );
  });

  it('TC-B11: returns trend data grouped by date', async () => {
    const scores = [
      createMockAIScore({ id: 's1', score: 90, createdAt: new Date('2026-02-15T10:00:00Z') }),
      createMockAIScore({ id: 's2', score: 60, createdAt: new Date('2026-02-15T14:00:00Z') }),
      createMockAIScore({ id: 's3', score: 40, createdAt: new Date('2026-02-14T10:00:00Z') }),
    ];
    (prismaMock.aIScore.findMany as any).mockResolvedValue(scores);

    const result = await caller.getLeadScoringDashboard({ dateRange: '30d' });

    // Two dates: 2026-02-14 and 2026-02-15
    expect(result.trends.length).toBe(2);
    expect(result.trends[0].date).toBe('2026-02-14');
    expect(result.trends[1].date).toBe('2026-02-15');
    // 2026-02-15: avgScore = (90+60)/2 = 75, hot=1, warm=1
    expect(result.trends[1].avgScore).toBe(75);
    expect(result.trends[1].hot).toBe(1);
    expect(result.trends[1].warm).toBe(1);
    expect(result.trends[1].count).toBe(2);
  });

  it('TC-B12: computes requiresReview flag (confidence < 0.85)', async () => {
    const scores = [
      createMockAIScore({ id: 's1', confidence: 0.92 }), // no review
      createMockAIScore({ id: 's2', confidence: 0.78 }), // needs review
      createMockAIScore({ id: 's3', confidence: 0.85 }), // no review (exactly threshold)
    ];
    (prismaMock.aIScore.findMany as any).mockResolvedValue(scores);

    const result = await caller.getLeadScoringDashboard({ dateRange: '30d' });

    expect(result.scoredLeads[0].requiresReview).toBe(false); // 0.92
    expect(result.scoredLeads[1].requiresReview).toBe(true); // 0.78
    expect(result.scoredLeads[2].requiresReview).toBe(false); // 0.85
  });
});
