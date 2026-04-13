// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoist mock factory so it is available at vi.mock() call time ──────────────
const { mockRevalidateTag } = vi.hoisted(() => ({ mockRevalidateTag: vi.fn() }));

// ── Mock next/cache before importing the module under test ────────────────────
vi.mock('next/cache', () => ({ revalidateTag: mockRevalidateTag }));

// ── Mock cache-tags so tests don't depend on the constants' string values ─────
vi.mock('@/lib/cache-tags', () => ({
  NOTIFICATIONS_UNREAD: 'notifications:unread',
  ACTIVITY_FEED: 'activity:feed',
  userTag: (userId: string) => `user:${userId}`,
}));

// Import after mocks are established
import {
  revalidateNotifications,
  revalidateActivityFeed,
} from '../actions';

describe('revalidateNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls revalidateTag with NOTIFICATIONS_UNREAD tag', async () => {
    await revalidateNotifications('user-42');
    expect(mockRevalidateTag).toHaveBeenCalledWith('notifications:unread', 'max');
  });

  it('calls revalidateTag with per-user tag', async () => {
    await revalidateNotifications('user-42');
    expect(mockRevalidateTag).toHaveBeenCalledWith('user:user-42', 'max');
  });

  it('calls revalidateTag exactly twice', async () => {
    await revalidateNotifications('user-42');
    expect(mockRevalidateTag).toHaveBeenCalledTimes(2);
  });

  it('uses the provided userId in the user tag', async () => {
    await revalidateNotifications('alice-99');
    expect(mockRevalidateTag).toHaveBeenCalledWith('user:alice-99', 'max');
  });

  it('does NOT call revalidateTag with ACTIVITY_FEED', async () => {
    await revalidateNotifications('user-42');
    expect(mockRevalidateTag).not.toHaveBeenCalledWith('activity:feed', 'max');
  });
});

describe('revalidateActivityFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls revalidateTag with ACTIVITY_FEED tag', async () => {
    await revalidateActivityFeed('user-42');
    expect(mockRevalidateTag).toHaveBeenCalledWith('activity:feed', 'max');
  });

  it('calls revalidateTag with per-user tag', async () => {
    await revalidateActivityFeed('user-42');
    expect(mockRevalidateTag).toHaveBeenCalledWith('user:user-42', 'max');
  });

  it('calls revalidateTag exactly twice', async () => {
    await revalidateActivityFeed('user-42');
    expect(mockRevalidateTag).toHaveBeenCalledTimes(2);
  });

  it('uses the provided userId in the user tag', async () => {
    await revalidateActivityFeed('bob-77');
    expect(mockRevalidateTag).toHaveBeenCalledWith('user:bob-77', 'max');
  });

  it('does NOT call revalidateTag with NOTIFICATIONS_UNREAD', async () => {
    await revalidateActivityFeed('user-42');
    expect(mockRevalidateTag).not.toHaveBeenCalledWith('notifications:unread', 'max');
  });

  it('each function is isolated — notifications does not fire activity and vice versa', async () => {
    await revalidateNotifications('u1');
    const notifCalls = mockRevalidateTag.mock.calls.map((c) => c[0]);
    expect(notifCalls).toContain('notifications:unread');
    expect(notifCalls).not.toContain('activity:feed');

    vi.clearAllMocks();

    await revalidateActivityFeed('u1');
    const feedCalls = mockRevalidateTag.mock.calls.map((c) => c[0]);
    expect(feedCalls).toContain('activity:feed');
    expect(feedCalls).not.toContain('notifications:unread');
  });
});
