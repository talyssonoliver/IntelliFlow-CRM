import { describe, it, expect, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { homeRouter } from '../home.router';
import {
  prismaMock,
  createTestContext,
  createPublicContext,
  TEST_UUIDS,
} from '../../../test/setup';

describe('home insight wiring', () => {
  const caller = homeRouter.createCaller(createTestContext());
  const publicCaller = homeRouter.createCaller(createPublicContext());

  beforeEach(() => {
    (prismaMock.aIInsight as any).findFirst.mockReset();
    (prismaMock.contact as any).findFirst.mockReset();
    (prismaMock.aIOutputReview as any).findFirst.mockReset();
    (prismaMock.aIOutputReview as any).create.mockReset();
  });

  it('getInsightById returns persisted AI insight with requiresApproval flag', async () => {
    (prismaMock.aIInsight as any).findFirst.mockResolvedValue({
      id: 'insight-1',
      type: 'recommendation',
      title: 'Next step for contact',
      description: 'The model suggests a follow-up.',
      suggestedActions: ['Schedule a follow-up'],
      entityType: 'contact',
      entityId: TEST_UUIDS.contact1,
      priority: 'high',
      confidence: 91,
      metadata: { userId: TEST_UUIDS.user1, requiresApproval: true },
      createdAt: new Date('2026-03-07T10:00:00Z'),
    });

    const result = await caller.getInsightById({ insightId: 'insight-1' });

    expect(result.insight.id).toBe('insight-1');
    expect(result.insight.suggestedAction).toBe('Schedule a follow-up');
    expect((result.insight as any).requiresApproval).toBe(true);
    expect(result.insight.entityId).toBe(TEST_UUIDS.contact1);
  });

  it('getInsightById resolves stale-contact heuristic IDs', async () => {
    (prismaMock.aIInsight as any).findFirst.mockResolvedValue(null);
    (prismaMock.contact as any).findFirst.mockResolvedValue({
      id: TEST_UUIDS.contact1,
      firstName: 'Sarah',
      lastName: 'Miller',
      lastContactedAt: null,
    });

    const result = await caller.getInsightById({
      insightId: `stale-contact-${TEST_UUIDS.contact1}`,
    });

    expect(result.insight.title).toBe('Stale Contact: Sarah Miller');
    expect(result.insight.suggestedAction).toBe('Schedule a follow-up');
    expect(result.insight.entityType).toBe('contact');
    expect(result.insight.entityId).toBe(TEST_UUIDS.contact1);
  });

  it('ensureInsightReview returns no-op when insight does not require approval', async () => {
    (prismaMock.aIInsight as any).findFirst.mockResolvedValue({
      id: 'insight-2',
      type: 'recommendation',
      title: 'Routine follow-up',
      description: 'No approval required',
      suggestedActions: ['Send an email'],
      entityType: 'contact',
      entityId: TEST_UUIDS.contact1,
      priority: 'medium',
      confidence: 82,
      metadata: { userId: TEST_UUIDS.user1, requiresApproval: false },
      createdAt: new Date(),
    });

    const result = await caller.ensureInsightReview({ insightId: 'insight-2' });

    expect(result).toEqual({
      created: false,
      reviewId: null,
      requiresApproval: false,
    });
    expect((prismaMock.aIOutputReview as any).create).not.toHaveBeenCalled();
  });

  it('ensureInsightReview creates a review row when insight requires approval', async () => {
    (prismaMock.aIInsight as any).findFirst.mockResolvedValue({
      id: 'insight-3',
      type: 'recommendation',
      title: 'Escalate outreach',
      description: 'High impact recommendation',
      suggestedActions: ['Schedule executive follow-up'],
      entityType: 'contact',
      entityId: TEST_UUIDS.contact1,
      priority: 'high',
      confidence: 95,
      metadata: { userId: TEST_UUIDS.user1, requiresApproval: true },
      createdAt: new Date(),
    });
    (prismaMock.aIOutputReview as any).findFirst.mockResolvedValue(null);
    (prismaMock.aIOutputReview as any).create.mockResolvedValue({ id: 'review-1' });

    const result = await caller.ensureInsightReview({ insightId: 'insight-3' });

    expect(result).toEqual({
      created: true,
      reviewId: 'review-1',
      requiresApproval: true,
    });
    expect((prismaMock.aIOutputReview as any).create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outputType: 'NEXT_BEST_ACTION',
          outputPayload: expect.objectContaining({
            insightId: 'insight-3',
            suggestedAction: 'Schedule executive follow-up',
          }),
        }),
      })
    );
  });

  it('ensureInsightReview is idempotent when a review already exists', async () => {
    (prismaMock.aIInsight as any).findFirst.mockResolvedValue({
      id: 'insight-4',
      type: 'recommendation',
      title: 'Needs approval',
      description: 'Already queued',
      suggestedActions: ['Follow-up task'],
      entityType: 'contact',
      entityId: TEST_UUIDS.contact1,
      priority: 'high',
      confidence: 88,
      metadata: { userId: TEST_UUIDS.user1, requiresApproval: true },
      createdAt: new Date(),
    });
    (prismaMock.aIOutputReview as any).findFirst.mockResolvedValue({ id: 'review-existing' });

    const result = await caller.ensureInsightReview({ insightId: 'insight-4' });

    expect(result).toEqual({
      created: false,
      reviewId: 'review-existing',
      requiresApproval: true,
    });
    expect((prismaMock.aIOutputReview as any).create).not.toHaveBeenCalled();
  });

  it('requires authentication for getInsightById and ensureInsightReview', async () => {
    await expect(publicCaller.getInsightById({ insightId: 'insight-1' })).rejects.toThrow(
      TRPCError
    );
    await expect(publicCaller.ensureInsightReview({ insightId: 'insight-1' })).rejects.toThrow(
      TRPCError
    );
  });
});
