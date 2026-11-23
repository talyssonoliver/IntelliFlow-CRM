/**
 * AI allowance, counted in AI actions (aiActionsPerMonth): every place a user starts AI work
 * on a contact or an account refuses, with a clear reason and before anything is queued, once
 * the plan's allowance is used up. A tenant with headroom proceeds as before.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contactRouter } from '../contact.router';
import { accountRouter } from '../../account/account.router';
import { prismaMock, createTestContext, mockServices, TEST_UUIDS } from '../../../test/setup';
import { overQuota, quotaRejection, underQuota } from '../../../test/quota';

const queueAddMock = vi.fn().mockResolvedValue({
  id: 'job-1',
  waitUntilFinished: vi.fn().mockResolvedValue({ suggestions: [], draftId: 'draft-1' }),
});

vi.mock('../../../lib/load-bullmq', () => ({
  loadBullMQ: vi.fn(async () => ({
    Queue: class MockQueue {
      on() {
        return this;
      }
      add = queueAddMock;
      close = vi.fn().mockResolvedValue(undefined);
    },
    QueueEvents: class MockQueueEvents {
      on() {
        return this;
      }
      close = vi.fn().mockResolvedValue(undefined);
    },
  })),
}));

const thread = [
  {
    from: 'sender@example.com',
    to: 'recipient@example.com',
    subject: 'Re: Quick question',
    body: 'Hi, I wanted to follow up on the proposal we discussed last week.',
    at: '2026-04-24T10:00:00.000Z',
  },
];

function enableAllAiToggles() {
  prismaMock.contactAutomationSetting.findUnique.mockResolvedValue({
    aiTagSuggestions: true,
    aiInsightGeneration: true,
    aiAutoReplyDrafting: true,
  } as never);
  prismaMock.accountAutomationSetting.findUnique.mockResolvedValue({
    aiTagSuggestions: true,
    aiInsightGeneration: true,
    aiAccountScoring: true,
  } as never);
  prismaMock.contact.findUnique.mockResolvedValue({
    id: TEST_UUIDS.contact1,
    email: 'x@y.com',
    firstName: 'A',
    lastName: 'B',
  } as never);
  prismaMock.account.findUnique.mockResolvedValue({
    id: TEST_UUIDS.account1,
    name: 'Acme',
  } as never);
}

const exhausted = () =>
  createTestContext({
    services: { ...mockServices, quota: overQuota('aiActionsPerMonth', 1000, 1000) as never },
  });

describe('AI actions allowance guards on contact and account AI procedures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enableAllAiToggles();
  });

  const refused = quotaRejection('aiActionsPerMonth', 1000, 1000);

  it.each([
    [
      'contact.suggestTags',
      (c: ReturnType<typeof contactRouter.createCaller>) =>
        c.suggestTags({ contactId: TEST_UUIDS.contact1 }),
    ],
    [
      'contact.generateInsight',
      (c: ReturnType<typeof contactRouter.createCaller>) =>
        c.generateInsight({ contactId: TEST_UUIDS.contact1 }),
    ],
    [
      'contact.draftReply',
      (c: ReturnType<typeof contactRouter.createCaller>) =>
        c.draftReply({ contactId: TEST_UUIDS.contact1, emailThread: thread as never }),
    ],
    [
      'contact.scoreWithAI',
      (c: ReturnType<typeof contactRouter.createCaller>) =>
        c.scoreWithAI({ contactId: TEST_UUIDS.contact1 }),
    ],
  ])('%s is refused with the plan limit and queues nothing', async (_name, call) => {
    const caller = contactRouter.createCaller(exhausted() as never);
    await expect(call(caller)).rejects.toMatchObject({
      ...refused,
      message: expect.stringContaining('1,000 of 1,000 AI actions'),
    });
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      'account.suggestTags',
      (c: ReturnType<typeof accountRouter.createCaller>) =>
        c.suggestTags({ accountId: TEST_UUIDS.account1 }),
    ],
    [
      'account.generateInsight',
      (c: ReturnType<typeof accountRouter.createCaller>) =>
        c.generateInsight({ accountId: TEST_UUIDS.account1 }),
    ],
    [
      'account.scoreAccount',
      (c: ReturnType<typeof accountRouter.createCaller>) =>
        c.scoreAccount({ accountId: TEST_UUIDS.account1 }),
    ],
  ])('%s is refused with the plan limit and queues nothing', async (_name, call) => {
    const caller = accountRouter.createCaller(exhausted() as never);
    await expect(call(caller)).rejects.toMatchObject(refused);
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it('asks the quota service for exactly one aiActionsPerMonth action when there is headroom', async () => {
    const quota = underQuota();
    const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });
    await contactRouter
      .createCaller(ctx as never)
      .suggestTags({ contactId: TEST_UUIDS.contact1 })
      .catch(() => undefined);
    expect(quota.assertWithinQuota).toHaveBeenCalledWith(TEST_UUIDS.tenant, 'aiActionsPerMonth', 1);
    expect(queueAddMock).toHaveBeenCalledTimes(1);
  });
});
