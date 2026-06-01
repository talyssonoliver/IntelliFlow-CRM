/**
 * Insight Generation Job Tests
 *
 * Tests:
 * 1. Happy path: chain resolves → AIInsight rows created with correct fields
 * 2. Chain falls back to heuristic → rows still created with confidence: 40
 * 3. Prisma create throws → job fails cleanly for BullMQ retry
 * 4. Missing tenantId → validation error thrown immediately
 * 5. expiresAt is set to 24h from now on every created row
 * 6. dispatchScheduledInsights: batched user lookups (NP-005/006)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateInsightsWithMeta = vi.hoisted(() => vi.fn());
const mockGenerateFallbackInsights = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockNotificationCreate = vi.hoisted(() => vi.fn());
const mockTaskCreate = vi.hoisted(() => vi.fn());
const mockLeadAIInsightUpsert = vi.hoisted(() => vi.fn());
const mockContactAIInsightUpsert = vi.hoisted(() => vi.fn());
const mockUserFindMany = vi.hoisted(() => vi.fn());
const mockLeadGroupBy = vi.hoisted(() => vi.fn());
const mockOpportunityFindMany = vi.hoisted(() => vi.fn());
const mockLeadFindMany = vi.hoisted(() => vi.fn());
const mockTaskCount = vi.hoisted(() => vi.fn());
const mockContactFindMany = vi.hoisted(() => vi.fn());
const mockQueueAdd = vi.hoisted(() => vi.fn());
const mockQueueClose = vi.hoisted(() => vi.fn());

vi.mock('../..//chains/insight-generation.chain', () => {
  class InsightGenerationChain {
    generateInsightsWithMeta = mockGenerateInsightsWithMeta;
    generateFallbackInsights = mockGenerateFallbackInsights;
  }
  return {
    getInsightGenerationChain: () => new InsightGenerationChain(),
    InsightGenerationChain,
  };
});

vi.mock('bullmq', () => {
  // Must use a real constructor function (not an arrow fn) so `new Queue()` works.
  function MockQueue(this: any) {
    this.add = (...args: any[]) => mockQueueAdd(...args);
    this.close = (...args: any[]) => mockQueueClose(...args);
  }
  return { Queue: MockQueue };
});

vi.mock('@intelliflow/db', () => ({
  prisma: {
    aIInsight: {
      create: (...args: any[]) => mockCreate(...args),
      findFirst: () => Promise.resolve(null),
    },
    notification: {
      create: (...args: any[]) => mockNotificationCreate(...args),
      findFirst: () => Promise.resolve(null),
    },
    task: {
      create: (...args: any[]) => mockTaskCreate(...args),
      count: (...args: any[]) => mockTaskCount(...args),
    },
    leadAIInsight: {
      upsert: (...args: any[]) => mockLeadAIInsightUpsert(...args),
    },
    contactAIInsight: {
      upsert: (...args: any[]) => mockContactAIInsightUpsert(...args),
    },
    user: {
      findMany: (...args: any[]) => mockUserFindMany(...args),
    },
    lead: {
      groupBy: (...args: any[]) => mockLeadGroupBy(...args),
      findMany: (...args: any[]) => mockLeadFindMany(...args),
    },
    opportunity: {
      findMany: (...args: any[]) => mockOpportunityFindMany(...args),
    },
    contact: {
      findMany: (...args: any[]) => mockContactFindMany(...args),
    },
  },
}));

import {
  processInsightJob,
  InsightJobDataSchema,
  type InsightJobData,
} from '../insight-generation.job';
import type { GeneratedInsight } from '../../chains/insight-generation.chain';

function createInsight(overrides: Partial<GeneratedInsight> = {}): GeneratedInsight {
  return {
    entityId: 'deal-1',
    entityType: 'opportunity',
    type: 'warning',
    title: 'Deal at Risk',
    description: 'Follow up with the buyer.',
    suggestedActions: ['Schedule a call'],
    confidence: 0.85,
    priority: 'medium',
    reasoning: 'Recent inactivity detected.',
    ...overrides,
  };
}

function createMockJob(data: Partial<InsightJobData> = {}) {
  const fullData: InsightJobData = {
    tenantId: '00000000-0000-4000-a000-000000000001',
    userId: 'user-001',
    dealsAtRisk: [],
    hotLeads: [],
    overdueTasksCount: 0,
    staleContacts: [],
    ...data,
  };

  return {
    id: 'job-123',
    data: fullData,
    updateProgress: vi.fn(),
    extendLock: vi.fn().mockResolvedValue(undefined),
    token: 'mock-lock-token',
    queueName: 'ai-insights',
  } as any;
}

describe('processInsightJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGenerateInsightsWithMeta.mockResolvedValue({
      insights: [createInsight()],
      source: 'llm',
      executionTimeMs: 25,
    });
    mockGenerateFallbackInsights.mockImplementation((input: InsightJobData) => {
      if (input.dealsAtRisk.length > 0) {
        return [
          createInsight({
            entityId: input.dealsAtRisk[0].id,
            entityType: 'opportunity',
            title: `Deal at Risk: ${input.dealsAtRisk[0].name}`,
            confidence: 0.4,
            priority: 'high',
          }),
        ];
      }

      if (input.overdueTasksCount > 0) {
        return [
          createInsight({
            entityId: null,
            entityType: 'task',
            type: 'reminder',
            title: `${input.overdueTasksCount} Overdue Tasks`,
            confidence: 0.4,
            priority: 'medium',
          }),
        ];
      }

      return [
        createInsight({
          entityId: null,
          entityType: null,
          type: 'achievement',
          priority: 'low',
          confidence: 0.4,
        }),
      ];
    });

    mockCreate.mockResolvedValue({ id: 'insight-1' });
    mockNotificationCreate.mockResolvedValue({ id: 'notification-1' });
    mockTaskCreate.mockResolvedValue({ id: 'task-1' });
    mockLeadAIInsightUpsert.mockResolvedValue({ id: 'lead-insight-1' });
    mockContactAIInsightUpsert.mockResolvedValue({ id: 'contact-insight-1' });
  });

  it('should create AIInsight rows with correct fields on happy path', async () => {
    const job = createMockJob({
      dealsAtRisk: [{ id: 'deal-1', name: 'Enterprise Deal', daysSinceUpdate: 20 }],
      hotLeads: [{ id: 'lead-1', name: 'Jane Smith', score: 90, company: 'Acme' }],
    });

    const result = await processInsightJob(job);

    expect(result.insightsCreated).toBeGreaterThan(0);
    expect(result.processedAt).toBeDefined();
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);

    // Verify Prisma create was called with correct structure
    expect(mockCreate).toHaveBeenCalled();
    const firstCall = mockCreate.mock.calls[0][0];
    expect(firstCall.data.tenantId).toBe('00000000-0000-4000-a000-000000000001');
    expect(firstCall.data.status).toBe('NEW');
    expect(firstCall.data.expiresAt).toBeInstanceOf(Date);
    expect(firstCall.data.metadata).toHaveProperty('userId', 'user-001');
  });

  it('should create rows with confidence 40 when chain falls back to heuristics', async () => {
    mockGenerateInsightsWithMeta.mockRejectedValue(new Error('LLM down'));

    const job = createMockJob({
      dealsAtRisk: [{ id: 'deal-1', name: 'Test Deal', daysSinceUpdate: 15 }],
    });

    const result = await processInsightJob(job);

    expect(result.insightsCreated).toBeGreaterThan(0);

    // Fallback heuristics use confidence 0.4 -> rounded to 40 in DB
    const createCalls = mockCreate.mock.calls;
    createCalls.forEach((call: any[]) => {
      const data = call[0].data;
      expect(data.confidence).toBe(40);
    });
  });

  it('should fail cleanly when Prisma create throws', async () => {
    mockCreate.mockRejectedValue(new Error('Database connection failed'));

    const job = createMockJob({
      dealsAtRisk: [{ id: 'deal-1', name: 'Failing Deal', daysSinceUpdate: 18 }],
    });

    await expect(processInsightJob(job)).rejects.toThrow('Database connection failed');
  });

  it('should throw validation error when tenantId is missing', async () => {
    const job = {
      id: 'job-bad',
      data: {
        userId: 'user-001',
        dealsAtRisk: [],
        hotLeads: [],
        overdueTasksCount: 0,
        staleContacts: [],
      },
      updateProgress: vi.fn(),
      extendLock: vi.fn().mockResolvedValue(undefined),
      token: 'mock-lock-token',
    } as any;

    await expect(processInsightJob(job)).rejects.toThrow();
  });

  it('should set expiresAt to 24h from now on created rows', async () => {
    const beforeTime = Date.now();

    mockGenerateInsightsWithMeta.mockResolvedValue({
      insights: [
        createInsight({
          entityId: null,
          entityType: 'task',
          type: 'reminder',
          priority: 'medium',
        }),
      ],
      source: 'llm',
      executionTimeMs: 25,
    });

    const job = createMockJob({
      overdueTasksCount: 5,
    });

    await processInsightJob(job);

    const afterTime = Date.now();

    // Verify expiresAt is approximately 24h from now
    const createCalls = mockCreate.mock.calls;
    expect(createCalls.length).toBeGreaterThan(0);

    createCalls.forEach((call: any[]) => {
      const expiresAt = call[0].data.expiresAt as Date;
      const expiresAtMs = expiresAt.getTime();
      const expectedMin = beforeTime + 24 * 60 * 60 * 1000 - 1000; // 1s tolerance
      const expectedMax = afterTime + 24 * 60 * 60 * 1000 + 1000;
      expect(expiresAtMs).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresAtMs).toBeLessThanOrEqual(expectedMax);
    });
  });
});

describe('InsightJobDataSchema', () => {
  it('should validate valid job data', () => {
    const result = InsightJobDataSchema.safeParse({
      tenantId: '00000000-0000-4000-a000-000000000001',
      userId: 'user-1',
      dealsAtRisk: [],
      hotLeads: [],
      overdueTasksCount: 0,
      staleContacts: [],
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const result = InsightJobDataSchema.safeParse({
      userId: 'user-1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-UUID tenantId', () => {
    const result = InsightJobDataSchema.safeParse({
      tenantId: 'not-a-valid-uuid',
      userId: 'user-1',
      dealsAtRisk: [],
      hotLeads: [],
      overdueTasksCount: 0,
      staleContacts: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('processInsightJob — feature flag ai.insights.enabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return early with skipped result when flag is disabled', async () => {
    vi.stubEnv('ENABLE_AI_INSIGHTS_JOB', 'false');
    const job = createMockJob({});
    const result = (await processInsightJob(job)) as any;
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('feature-flag-disabled');
  });

  it('should NOT call the insight chain when flag is disabled', async () => {
    vi.stubEnv('ENABLE_AI_INSIGHTS_JOB', 'false');
    const job = createMockJob({
      dealsAtRisk: [{ id: 'deal-1', name: 'Enterprise Deal', daysSinceUpdate: 10 }],
    });
    await processInsightJob(job);
    expect(mockGenerateInsightsWithMeta).not.toHaveBeenCalled();
  });

  it('should process normally when flag is enabled', async () => {
    vi.stubEnv('ENABLE_AI_INSIGHTS_JOB', 'true');
    mockGenerateInsightsWithMeta.mockResolvedValue({
      insights: [],
      source: 'llm',
      executionTimeMs: 10,
    });
    const job = createMockJob({});
    const result = (await processInsightJob(job)) as any;
    expect(result.skipped).toBeUndefined();
  });

  it('should process normally when env var is absent (default-on)', async () => {
    delete process.env['ENABLE_AI_INSIGHTS_JOB'];
    mockGenerateInsightsWithMeta.mockResolvedValue({
      insights: [],
      source: 'llm',
      executionTimeMs: 10,
    });
    const job = createMockJob({});
    const result = (await processInsightJob(job)) as any;
    expect(result.skipped).toBeUndefined();
  });
});

// ============================================================================
// NP-005/006 regression: dispatchScheduledInsights must batch user lookups
// ============================================================================
describe('dispatchScheduledInsights — batched user fetch (NP-005/006)', () => {
  const TENANT_A = '00000000-0000-4000-a000-000000000011';
  const TENANT_B = '00000000-0000-4000-a000-000000000022';
  const TENANT_C = '00000000-0000-4000-a000-000000000033';

  function createScheduledJob() {
    return {
      id: 'scheduled-job-1',
      data: {
        tenantId: '__scheduled__',
        userId: 'system',
        dealsAtRisk: [],
        hotLeads: [],
        overdueTasksCount: 0,
        staleContacts: [],
      },
      updateProgress: vi.fn(),
      extendLock: vi.fn().mockResolvedValue(undefined),
      token: 'mock-lock-token',
      queueName: 'ai-insights',
    } as any;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueueAdd.mockResolvedValue(undefined);
    mockQueueClose.mockResolvedValue(undefined);

    // gatherTenantHeuristicData stubs
    mockOpportunityFindMany.mockResolvedValue([]);
    mockLeadFindMany.mockResolvedValue([]);
    mockTaskCount.mockResolvedValue(0);
    mockContactFindMany.mockResolvedValue([]);
  });

  it('fetches admins in ONE findMany call regardless of tenant count', async () => {
    mockLeadGroupBy.mockResolvedValue([
      { tenantId: TENANT_A, _count: 5 },
      { tenantId: TENANT_B, _count: 3 },
      { tenantId: TENANT_C, _count: 1 },
    ]);

    // All three tenants have an ADMIN — no fallback needed
    mockUserFindMany
      .mockResolvedValueOnce([
        { id: 'user-admin-a', tenantId: TENANT_A },
        { id: 'user-admin-b', tenantId: TENANT_B },
        { id: 'user-admin-c', tenantId: TENANT_C },
      ])
      .mockResolvedValue([]); // fallback query (should not be reached)

    const job = createScheduledJob();
    const result = await processInsightJob(job);

    // The dispatcher returns insightsCreated = enqueued count
    expect((result as any).insightsCreated).toBe(3);

    // CRITICAL: user.findMany called exactly ONCE for admins (no per-tenant findFirst)
    expect(mockUserFindMany).toHaveBeenCalledTimes(1);
    const adminCall = mockUserFindMany.mock.calls[0][0];
    expect(adminCall.where.role).toBe('ADMIN');
    expect(adminCall.where.tenantId.in).toEqual(
      expect.arrayContaining([TENANT_A, TENANT_B, TENANT_C])
    );
    expect(adminCall.where.tenantId.in).toHaveLength(3);
    expect(adminCall.distinct).toContain('tenantId');
  });

  it('issues a second findMany (fallback) only for tenants without an ADMIN', async () => {
    mockLeadGroupBy.mockResolvedValue([
      { tenantId: TENANT_A, _count: 5 },
      { tenantId: TENANT_B, _count: 3 },
    ]);

    // Only TENANT_A has an admin; TENANT_B has none
    mockUserFindMany
      .mockResolvedValueOnce([{ id: 'user-admin-a', tenantId: TENANT_A }]) // admin query
      .mockResolvedValueOnce([{ id: 'user-any-b', tenantId: TENANT_B }]); // fallback query

    const job = createScheduledJob();
    await processInsightJob(job);

    // Exactly TWO findMany calls total — NOT four (2 per tenant)
    expect(mockUserFindMany).toHaveBeenCalledTimes(2);

    const fallbackCall = mockUserFindMany.mock.calls[1][0];
    // Fallback must only request the tenants that lacked an admin
    expect(fallbackCall.where.tenantId.in).toEqual([TENANT_B]);
    // Fallback must NOT filter by role
    expect(fallbackCall.where.role).toBeUndefined();
    expect(fallbackCall.distinct).toContain('tenantId');
  });

  it('uses the resolved admin userId in enqueued payloads', async () => {
    mockLeadGroupBy.mockResolvedValue([{ tenantId: TENANT_A, _count: 2 }]);
    mockUserFindMany.mockResolvedValueOnce([{ id: 'the-admin-id', tenantId: TENANT_A }]);

    const job = createScheduledJob();
    await processInsightJob(job);

    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    const enqueuedPayload = mockQueueAdd.mock.calls[0][1];
    expect(enqueuedPayload.userId).toBe('the-admin-id');
    expect(enqueuedPayload.tenantId).toBe(TENANT_A);
  });

  it('falls back to "system" userId when no users exist for tenant', async () => {
    mockLeadGroupBy.mockResolvedValue([{ tenantId: TENANT_A, _count: 1 }]);
    // No admin and no any-user
    mockUserFindMany
      .mockResolvedValueOnce([]) // admin query — empty
      .mockResolvedValueOnce([]); // fallback query — also empty

    const job = createScheduledJob();
    await processInsightJob(job);

    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    expect(mockQueueAdd.mock.calls[0][1].userId).toBe('system');
  });

  it('skips all DB work when no active tenants are found', async () => {
    mockLeadGroupBy.mockResolvedValue([]);

    const job = createScheduledJob();
    const result = await processInsightJob(job);

    expect(mockUserFindMany).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect((result as any).insightsCreated).toBe(0);
  });

  it('number of user.findMany calls is constant (at most 2) regardless of tenant count', async () => {
    // Simulate 5 tenants — should still only trigger at most 2 findMany calls
    const tenants = Array.from({ length: 5 }, (_, i) => ({
      tenantId: `00000000-0000-4000-a000-0000000000${String(i + 1).padStart(2, '0')}`,
      _count: 1,
    }));
    mockLeadGroupBy.mockResolvedValue(tenants);

    // All have admins — only 1 findMany needed
    mockUserFindMany.mockResolvedValueOnce(
      tenants.map((t, i) => ({ id: `admin-${i}`, tenantId: t.tenantId }))
    );

    const job = createScheduledJob();
    await processInsightJob(job);

    // CONSTANT: 1 admin findMany, 0 fallback findMany (all tenants had admins)
    expect(mockUserFindMany).toHaveBeenCalledTimes(1);
    // All 5 tenants enqueued
    expect(mockQueueAdd).toHaveBeenCalledTimes(5);
  });
});
