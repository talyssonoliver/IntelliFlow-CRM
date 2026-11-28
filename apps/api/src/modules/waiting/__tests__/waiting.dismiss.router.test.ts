/**
 * MVP-012: waiting.dismiss ("handled without a reply") stores the current wait and refuses a
 * person nobody is waiting on.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const loadWaitingPage = vi.hoisted(() => vi.fn());
vi.mock('../waiting-sql', () => ({ loadWaitingPage }));

import { waitingRouter } from '../waiting.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

const mocks = prismaMock as any;
const SINCE = new Date('2026-11-17T10:00:00.000Z');
const LATEST = new Date('2026-11-24T09:00:00.000Z');

const item = (over = {}) => ({
  kind: 'lead',
  id: 'lead-1',
  name: 'Jane Example',
  email: 'jane@example.invalid',
  company: null,
  since: SINCE,
  subject: 'Quote?',
  unanswered: 2,
  latestAt: LATEST,
  ...over,
});

describe('waiting.dismiss', () => {
  beforeEach(() => {
    loadWaitingPage.mockReset().mockResolvedValue({ items: [item()] });
    mocks.waitingDismissal.upsert.mockReset().mockResolvedValue({});
  });

  const caller = () => waitingRouter.createCaller(createTestContext() as any);

  it("upserts a dismissal with the wait's since, newest mail and count for this tenant", async () => {
    await expect(caller().dismiss({ kind: 'lead', id: 'lead-1' })).resolves.toEqual({
      dismissed: true,
    });
    expect(mocks.waitingDismissal.upsert).toHaveBeenCalledTimes(1);
    const arg = mocks.waitingDismissal.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({
      tenantId_personKey: { tenantId: TEST_UUIDS.tenant, personKey: 'lead:lead-1' },
    });
    expect(arg.create).toMatchObject({
      tenantId: TEST_UUIDS.tenant,
      personKey: 'lead:lead-1',
      since: SINCE,
      unanswered: 2,
      latestAt: LATEST,
    });
    expect(arg.update).toMatchObject({ since: SINCE, unanswered: 2, latestAt: LATEST });
  });

  it('looks the person up in the same full-history SQL the list shows, with no page limit', async () => {
    await caller().dismiss({ kind: 'lead', id: 'lead-1' });
    expect(loadWaitingPage).toHaveBeenCalledTimes(1);
    expect(loadWaitingPage.mock.calls[0]).toHaveLength(2);
  });

  it('refuses a person nobody is waiting on, and writes nothing', async () => {
    await expect(caller().dismiss({ kind: 'contact', id: 'lead-1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(mocks.waitingDismissal.upsert).not.toHaveBeenCalled();
  });
});
