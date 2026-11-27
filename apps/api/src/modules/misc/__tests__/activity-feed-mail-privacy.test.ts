import { describe, it, expect, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { createTestContext, prismaMock } from '../../../test/setup';
import { activityFeedRouter } from '../activity-feed.router';

type Mocked = { mockResolvedValue: (v: unknown) => void; mock: { calls: any[][] } };
const db = prismaMock as unknown as {
  emailRecord: { findMany: Mocked };
  activityReaction: { findUnique: Mocked; create: Mocked; findMany: Mocked };
  activityComment: { create: Mocked; findMany: Mocked };
};

// Register #64: a reaction or comment on a mail feed item is only for someone who may read that mail.
describe('activityFeedRouter: mail items follow the mail visibility policy', () => {
  beforeEach(() => {
    db.emailRecord.findMany.mockResolvedValue([]);
    db.activityReaction.findUnique.mockResolvedValue(null);
    db.activityReaction.create.mockResolvedValue({});
    db.activityReaction.findMany.mockResolvedValue([]);
    db.activityComment.create.mockResolvedValue({ id: 'c1' });
    db.activityComment.findMany.mockResolvedValue([]);
  });

  const caller = () => activityFeedRouter.createCaller(createTestContext());

  it('refuses a reaction on mail the caller cannot read', async () => {
    await expect(
      caller().toggleReaction({ activityId: 'email_e1', activitySource: 'EMAIL', emoji: 'x' })
    ).rejects.toBeInstanceOf(TRPCError);
    expect(db.activityReaction.create.mock.calls).toHaveLength(0);
  });

  it('allows a reaction on mail the caller can read', async () => {
    db.emailRecord.findMany.mockResolvedValue([{ id: 'e1' }]);
    const result = await caller().toggleReaction({
      activityId: 'email_e1',
      activitySource: 'EMAIL',
      emoji: 'x',
    });
    expect(result.activityId).toBe('email_e1');
    expect(db.activityReaction.create.mock.calls).toHaveLength(1);
  });

  it('does not look up mail for other activity types', async () => {
    await caller().toggleReaction({
      activityId: 'lead_1',
      activitySource: 'LEAD_ACTIVITY',
      emoji: 'x',
    });
    expect(db.emailRecord.findMany.mock.calls).toHaveLength(0);
  });

  it('refuses a comment on mail the caller cannot read', async () => {
    await expect(
      caller().addComment({ activityId: 'email_e1', activitySource: 'EMAIL', text: 'hi' })
    ).rejects.toBeInstanceOf(TRPCError);
    expect(db.activityComment.create.mock.calls).toHaveLength(0);
  });

  it('allows a comment on readable mail', async () => {
    db.emailRecord.findMany.mockResolvedValue([{ id: 'e1' }]);
    await caller().addComment({ activityId: 'email_e1', activitySource: 'EMAIL', text: 'hi' });
    expect(db.activityComment.create.mock.calls).toHaveLength(1);
  });

  it('leaves unreadable mail out of the batch reads', async () => {
    db.emailRecord.findMany.mockResolvedValue([{ id: 'e1' }]);
    const ids = ['email_e1', 'email_e2', 'lead_1'];
    await caller().getReactions({ activityIds: ids });
    await caller().getComments({ activityIds: ids });
    expect(db.activityReaction.findMany.mock.calls[0][0].where.activityId.in).toEqual([
      'email_e1',
      'lead_1',
    ]);
    expect(db.activityComment.findMany.mock.calls[0][0].where.activityId.in).toEqual([
      'email_e1',
      'lead_1',
    ]);
  });
});
