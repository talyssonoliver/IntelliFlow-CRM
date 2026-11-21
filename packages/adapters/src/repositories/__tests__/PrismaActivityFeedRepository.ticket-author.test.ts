import { describe, it, expect, vi } from 'vitest';
import { PrismaActivityFeedRepository } from '../PrismaActivityFeedRepository';

// MVP-012 (register row 20): ticket entries carry the author's id so "My activity" can match them.

function ticketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ta-1',
    type: 'AGENT_REPLY',
    content: 'We are on it',
    timestamp: new Date('2026-01-15T10:00:00Z'),
    isInternal: false,
    authorName: 'Jane Agent',
    authorId: 'user-7',
    systemEventData: null,
    ticket: { id: 'tk-1', subject: 'Printer', ticketNumber: 'TKT-1' },
    ...overrides,
  };
}

function repoWith(rows: unknown[]) {
  const none = () => ({ findMany: vi.fn().mockResolvedValue([]) });
  const prisma = {
    leadActivity: none(),
    contactActivity: none(),
    activityEvent: none(),
    ticketActivity: { findMany: vi.fn().mockResolvedValue(rows) },
    emailRecord: none(),
    callRecord: none(),
    chatMessage: none(),
  } as any;
  return new PrismaActivityFeedRepository(prisma);
}

describe('ticket activity actor id', () => {
  it('returns the stored author id as the actor id in the feed', async () => {
    const items = await repoWith([ticketRow()]).getUnifiedFeed('t1', 10, null, {});

    expect(items[0]!.actor).toEqual({ id: 'user-7', name: 'Jane Agent' });
  });

  it('returns a null actor id for entries with no author id (customer, system, older entries)', async () => {
    const items = await repoWith([ticketRow({ authorId: null })]).getUnifiedFeed(
      't1',
      10,
      null,
      {}
    );

    expect(items[0]!.actor).toEqual({ id: null, name: 'Jane Agent' });
  });

  it('returns the stored author id in search results too', async () => {
    const items = await repoWith([ticketRow()]).searchFeed('t1', 'printer', 10, null, {});

    expect(items[0]!.actor?.id).toBe('user-7');
  });
});
