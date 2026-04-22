/**
 * IFC-312 — Account router AI procedure integration tests.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { accountRouter } from '../account.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

const queueAddMock = vi.fn().mockResolvedValue({
  id: 'job-1',
  waitUntilFinished: vi.fn().mockResolvedValue({ suggestions: [] }),
});
const queueCloseMock = vi.fn().mockResolvedValue(undefined);
const queueEventsCloseMock = vi.fn().mockResolvedValue(undefined);

class MockQueue {
  add = queueAddMock;
  close = queueCloseMock;
}
class MockQueueEvents {
  close = queueEventsCloseMock;
}

vi.mock('../../../lib/load-bullmq', () => ({
  loadBullMQ: vi.fn(async () => ({
    Queue: MockQueue,
    QueueEvents: MockQueueEvents,
  })),
}));

describe('Account Router AI Procedures (IFC-312)', () => {
  let caller: ReturnType<typeof accountRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    caller = accountRouter.createCaller(createTestContext() as any);
  });

  describe('suggestTags', () => {
    it('returns [] when aiTagSuggestions is off', async () => {
      prismaMock.accountAutomationSetting.findUnique.mockResolvedValue({
        aiTagSuggestions: false,
      } as any);
      const out = await caller.suggestTags({ accountId: TEST_UUIDS.account1 });
      expect(out).toEqual([]);
      expect(queueAddMock).not.toHaveBeenCalled();
    });

    it('enqueues AI_TAG_SUGGESTION job when toggle on', async () => {
      prismaMock.accountAutomationSetting.findUnique.mockResolvedValue({
        aiTagSuggestions: true,
      } as any);
      prismaMock.account.findUnique.mockResolvedValue({
        id: TEST_UUIDS.account1,
        name: 'Acme',
        description: 'Cloud product',
        industry: 'saas',
        website: 'https://acme.io',
      } as any);
      await caller.suggestTags({ accountId: TEST_UUIDS.account1 });
      expect(queueAddMock).toHaveBeenCalledTimes(1);
      const [, jobData] = queueAddMock.mock.calls[0]!;
      expect(jobData.entityType).toBe('account');
      expect(jobData.entityId).toBe(TEST_UUIDS.account1);
      expect(jobData.tenantId).toBe(TEST_UUIDS.tenant);
    });
  });

  describe('generateInsight', () => {
    it('returns {enqueued: false} when toggle off', async () => {
      prismaMock.accountAutomationSetting.findUnique.mockResolvedValue({
        aiInsightGeneration: false,
      } as any);
      const out = await caller.generateInsight({ accountId: TEST_UUIDS.account1 });
      expect(out).toEqual({ enqueued: false });
    });

    it('enqueues AI_ENTITY_INSIGHT when toggle on', async () => {
      prismaMock.accountAutomationSetting.findUnique.mockResolvedValue({
        aiInsightGeneration: true,
      } as any);
      const out = await caller.generateInsight({ accountId: TEST_UUIDS.account1 });
      expect(out).toEqual({ enqueued: true });
      expect(queueAddMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('scoreAccount', () => {
    it('throws FORBIDDEN when aiAccountScoring is off', async () => {
      prismaMock.accountAutomationSetting.findUnique.mockResolvedValue({
        aiAccountScoring: false,
      } as any);
      await expect(caller.scoreAccount({ accountId: TEST_UUIDS.account1 })).rejects.toThrow(
        TRPCError
      );
    });

    it('enqueues AI_ACCOUNT_SCORING when toggle on', async () => {
      prismaMock.accountAutomationSetting.findUnique.mockResolvedValue({
        aiAccountScoring: true,
      } as any);
      const out = await caller.scoreAccount({ accountId: TEST_UUIDS.account1 });
      expect(out.enqueued).toBe(true);
      expect(queueAddMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAiInsight', () => {
    it('returns {insight: null} when no AccountAIInsight row exists', async () => {
      prismaMock.accountAIInsight.findUnique.mockResolvedValue(null);
      const out = await caller.getAiInsight({ accountId: TEST_UUIDS.account1 });
      expect(out.insight).toBeNull();
    });

    it('returns the mapped insight when present', async () => {
      prismaMock.accountAIInsight.findUnique.mockResolvedValue({
        id: 'insight-1',
        accountId: TEST_UUIDS.account1,
        tenantId: TEST_UUIDS.tenant,
        healthSummary: 'Good',
        nextBestAction: 'Call',
        keySignals: null,
        churnRisk: 'LOW',
        engagementScore: 80,
        sentimentTrend: 'improving',
        recommendations: null,
        modelVersion: 'v1',
        generatedAt: new Date('2026-04-20'),
        source: 'llm',
      } as any);
      const out = await caller.getAiInsight({ accountId: TEST_UUIDS.account1 });
      expect(out.insight).not.toBeNull();
      expect(out.insight!.churnRisk).toBe('LOW');
    });
  });
});
