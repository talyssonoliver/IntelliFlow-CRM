/**
 * MVP-012 #31: moving a deal to another stage writes a STAGE_CHANGE row
 * (from, to, who, when) to the deal's activity feed (ActivityEvent).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TEST_UUIDS, createTestContext, prismaMock } from '../../../test/setup';

vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: vi.fn(),
}));

import { opportunityRouter } from '../opportunity.router';
import { recordStageChangeActivity } from '../move-stage';
import { getAuditLogger } from '../../../security/audit-logger';

const domainOpportunity = (stage: string) => ({
  id: { value: TEST_UUIDS.opportunity1 },
  name: 'Feed Deal',
  value: { amount: 50000, currency: 'GBP' },
  probability: { value: 60 },
  stage,
  expectedCloseDate: new Date('2025-06-30'),
  accountId: TEST_UUIDS.account1,
  contactId: TEST_UUIDS.contact1,
  ownerId: TEST_UUIDS.user1,
  tenantId: TEST_UUIDS.tenant,
  weightedValue: { amount: 30000, currency: 'GBP' },
  isClosed: false,
  isWon: false,
  isLost: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  getDomainEvents: () => [],
  clearDomainEvents: () => {},
});

describe('opportunity.moveStage writes the deal activity feed (#31)', () => {
  const ctx = createTestContext();
  let create: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (prismaMock.$extends as ReturnType<typeof vi.fn>).mockReturnValue(prismaMock);
    vi.mocked(getAuditLogger).mockReturnValue({
      logAction: vi.fn().mockResolvedValue('audit-id'),
    } as any);
    create = vi.fn().mockResolvedValue({});
    (prismaMock as any).activityEvent = { create };
    prismaMock.notification.create.mockResolvedValue({} as any);
  });

  it('logs from, to, who and when on the deal', async () => {
    prismaMock.opportunity.findUnique.mockResolvedValue({ stage: 'PROPOSAL' } as any);
    ctx.services!.opportunity!.changeStage = vi.fn().mockResolvedValue({
      isSuccess: true,
      isFailure: false,
      value: domainOpportunity('NEGOTIATION'),
    });

    await opportunityRouter
      .createCaller(ctx)
      .moveStage({ id: TEST_UUIDS.opportunity1, targetStage: 'NEGOTIATION' });

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      type: 'STAGE_CHANGE',
      stageFrom: 'PROPOSAL',
      stageTo: 'NEGOTIATION',
      opportunityId: TEST_UUIDS.opportunity1,
      userId: TEST_UUIDS.user1,
      tenantId: TEST_UUIDS.tenant,
    });
    expect(data.timestamp).toBeInstanceOf(Date);
  });

  it('does not write when the move fails', async () => {
    prismaMock.opportunity.findUnique.mockResolvedValue({ stage: 'PROPOSAL' } as any);
    ctx.services!.opportunity!.changeStage = vi.fn().mockResolvedValue({
      isSuccess: false,
      isFailure: true,
      error: { code: 'INVALID_TRANSITION', message: 'nope' },
    });

    await expect(
      opportunityRouter
        .createCaller(ctx)
        .moveStage({ id: TEST_UUIDS.opportunity1, targetStage: 'NEGOTIATION' })
    ).rejects.toBeDefined();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('recordStageChangeActivity', () => {
  const base = { opportunityId: 'o', tenantId: 't', userId: 'u', toStage: 'WON' };

  it('skips a move to the same stage', async () => {
    const create = vi.fn();
    await recordStageChangeActivity({ activityEvent: { create } } as never, {
      ...base,
      fromStage: 'WON',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('swallows a feed write failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const create = vi.fn().mockRejectedValue(new Error('db down'));
    await expect(
      recordStageChangeActivity({ activityEvent: { create } } as never, {
        ...base,
        fromStage: 'NEW',
      })
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
