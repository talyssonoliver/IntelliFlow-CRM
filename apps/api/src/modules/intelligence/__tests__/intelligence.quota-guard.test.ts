/**
 * Per-tenant metering: intelligence.triggerPrediction must respect the
 * `aiSpendCentsPerMonth` budget. The guard only asserts; spend is recorded elsewhere.
 */

import { describe, it, expect, vi } from 'vitest';
import { intelligenceRouter } from '../intelligence.router';
import { createTestContext, mockServices, prismaMock, TEST_UUIDS } from '../../../test/setup';
import { overQuota, quotaRejection, underQuota } from '../../../test/quota';

const mockQueueAdd = vi.hoisted(() => vi.fn());

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    add = mockQueueAdd;
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

const input = {
  entityType: 'lead' as const,
  entityId: TEST_UUIDS.lead1,
  predictionType: 'CHURN_RISK' as const,
};

describe('intelligence.triggerPrediction quota guard', () => {
  it('rejects before enqueueing when the AI budget is exhausted', async () => {
    mockQueueAdd.mockReset();
    const ctx = createTestContext({
      services: { ...mockServices, quota: overQuota('aiSpendCentsPerMonth', 2000, 2000) as never },
    });

    await expect(
      intelligenceRouter.createCaller(ctx).triggerPrediction(input)
    ).rejects.toMatchObject(quotaRejection('aiSpendCentsPerMonth', 2000, 2000));
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(prismaMock.lead.findUnique).not.toHaveBeenCalled();
  });

  it('enqueues the prediction when the budget has headroom', async () => {
    mockQueueAdd.mockReset();
    mockQueueAdd.mockResolvedValue({ id: 'job-123' });
    prismaMock.lead.findUnique.mockResolvedValue({ id: TEST_UUIDS.lead1 } as never);
    const quota = underQuota();
    const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });

    const result = await intelligenceRouter.createCaller(ctx).triggerPrediction(input);

    expect(result.status).toBe('QUEUED');
    expect(quota.assertWithinQuota).toHaveBeenCalledWith(
      TEST_UUIDS.tenant,
      'aiSpendCentsPerMonth',
      1
    );
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
  });
});
