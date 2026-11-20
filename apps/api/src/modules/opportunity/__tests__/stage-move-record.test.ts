/**
 * #31 / #32: a stage move leaves an entry on the deal's activity feed (who, from, to), and a failure
 * to write it never undoes the move.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordStageMove, stageLabel } from '../stage-move-record';

const tenant = { tenantId: 't1', userId: 'u1' };
const deal = { id: { value: 'opp-1' }, name: 'Pilates Living', stage: 'NEEDS_ANALYSIS' };

function ctxWith(create: ReturnType<typeof vi.fn>) {
  return {
    prismaWithTenant: { activityEvent: { create } },
    prisma: { auditLog: { create: vi.fn().mockResolvedValue({}) } },
  } as never;
}

afterEach(() => vi.restoreAllMocks());

describe('stageLabel', () => {
  it('reads an enum as a name, and a missing stage as "No stage"', () => {
    expect(stageLabel('NEEDS_ANALYSIS')).toBe('Needs Analysis');
    expect(stageLabel('CLOSED_WON')).toBe('Closed Won');
    expect(stageLabel(undefined)).toBe('No stage');
  });
});

describe('recordStageMove', () => {
  it('writes a STAGE_CHANGE entry on the deal, tenant scoped, from and to', async () => {
    const create = vi.fn().mockResolvedValue({});
    await recordStageMove(ctxWith(create), deal, 'QUALIFICATION', 'NEEDS_ANALYSIS', tenant);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        type: 'STAGE_CHANGE',
        title: 'Stage changed: Qualification to Needs Analysis',
        description: '"Pilates Living" moved from Qualification to Needs Analysis.',
        stageFrom: 'QUALIFICATION',
        stageTo: 'NEEDS_ANALYSIS',
        opportunityId: 'opp-1',
        userId: 'u1',
        tenantId: 't1',
      },
    });
  });

  it('keeps a null stageFrom when the previous stage is not known', async () => {
    const create = vi.fn().mockResolvedValue({});
    await recordStageMove(ctxWith(create), deal, undefined, 'PROPOSAL', tenant);
    expect(create.mock.calls[0]![0].data).toMatchObject({
      stageFrom: null,
      title: 'Stage changed: No stage to Proposal',
    });
  });

  it('does not write a feed entry for a move to the same stage', async () => {
    const create = vi.fn().mockResolvedValue({});
    await recordStageMove(ctxWith(create), deal, 'PROPOSAL', 'PROPOSAL', tenant);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not throw when the entry cannot be written (the move already happened)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const create = vi.fn().mockRejectedValue(new Error('db down'));
    await expect(
      recordStageMove(ctxWith(create), deal, 'QUALIFICATION', 'PROPOSAL', tenant)
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(
      '[opportunity.router] Stage activity failed:',
      expect.any(Error)
    );
  });

  it('also tolerates a client whose create returns nothing', async () => {
    const create = vi.fn().mockReturnValue(undefined);
    await expect(
      recordStageMove(ctxWith(create), deal, 'PROSPECTING', 'QUALIFICATION', tenant)
    ).resolves.toBeUndefined();
  });
});
