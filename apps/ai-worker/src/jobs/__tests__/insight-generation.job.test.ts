/**
 * Insight Generation Job Tests
 *
 * Tests:
 * 1. Happy path: chain resolves → AIInsight rows created with correct fields
 * 2. Chain falls back to heuristic → rows still created with confidence: 40
 * 3. Prisma create throws → job fails cleanly for BullMQ retry
 * 4. Missing tenantId → validation error thrown immediately
 * 5. expiresAt is set to 24h from now on every created row
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateInsightsWithMeta = vi.hoisted(() => vi.fn());
const mockGenerateFallbackInsights = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockNotificationCreate = vi.hoisted(() => vi.fn());
const mockTaskCreate = vi.hoisted(() => vi.fn());
const mockLeadAIInsightUpsert = vi.hoisted(() => vi.fn());
const mockContactAIInsightUpsert = vi.hoisted(() => vi.fn());

vi.mock('../..//chains/insight-generation.chain', () => ({
  getInsightGenerationChain: () => ({
    generateInsightsWithMeta: mockGenerateInsightsWithMeta,
    generateFallbackInsights: mockGenerateFallbackInsights,
  }),
}));

vi.mock('@intelliflow/db', () => ({
  prisma: {
    aIInsight: {
      create: (...args: any[]) => mockCreate(...args),
    },
    notification: {
      create: (...args: any[]) => mockNotificationCreate(...args),
    },
    task: {
      create: (...args: any[]) => mockTaskCreate(...args),
    },
    leadAIInsight: {
      upsert: (...args: any[]) => mockLeadAIInsightUpsert(...args),
    },
    contactAIInsight: {
      upsert: (...args: any[]) => mockContactAIInsightUpsert(...args),
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

      return [createInsight({ entityId: null, entityType: null, type: 'achievement', priority: 'low', confidence: 0.4 })];
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
