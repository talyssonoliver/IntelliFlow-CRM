// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoist mock factory so it is available at vi.mock() call time ──────────────
const { mockRevalidateTag } = vi.hoisted(() => ({ mockRevalidateTag: vi.fn() }));

// ── Mock next/cache before importing the module under test ────────────────────
vi.mock('next/cache', () => ({ revalidateTag: mockRevalidateTag }));

// ── Mock cache-tags so tests don't depend on the constants' string values ─────
vi.mock('@/lib/cache-tags', () => ({
  DEALS_LIST: 'deals:list',
  DEALS_FORECAST: 'deals:forecast',
  userTag: (userId: string) => `user:${userId}`,
}));

// Import after mocks are established
import { revalidateDealCaches } from '../actions';

describe('revalidateDealCaches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls revalidateTag with DEALS_LIST tag', async () => {
    await revalidateDealCaches('user-42');
    expect(mockRevalidateTag).toHaveBeenCalledWith('deals:list', 'max');
  });

  it('calls revalidateTag with DEALS_FORECAST tag', async () => {
    await revalidateDealCaches('user-42');
    expect(mockRevalidateTag).toHaveBeenCalledWith('deals:forecast', 'max');
  });

  it('calls revalidateTag with per-user tag when userId is provided', async () => {
    await revalidateDealCaches('user-42');
    expect(mockRevalidateTag).toHaveBeenCalledWith('user:user-42', 'max');
  });

  it('calls revalidateTag exactly three times when userId is provided', async () => {
    await revalidateDealCaches('user-42');
    expect(mockRevalidateTag).toHaveBeenCalledTimes(3);
  });

  it('calls revalidateTag exactly twice when userId is null (no per-user tag)', async () => {
    await revalidateDealCaches(null);
    expect(mockRevalidateTag).toHaveBeenCalledTimes(2);
  });

  it('does NOT call revalidateTag with user tag when userId is null', async () => {
    await revalidateDealCaches(null);
    const calls = mockRevalidateTag.mock.calls.map((c: string[]) => c[0]);
    expect(calls).not.toContain('user:null');
    expect(calls.some((c: string) => c.startsWith('user:'))).toBe(false);
  });

  it('uses the provided userId in the user tag', async () => {
    await revalidateDealCaches('alice-99');
    expect(mockRevalidateTag).toHaveBeenCalledWith('user:alice-99', 'max');
  });

  it('always invalidates DEALS_LIST and DEALS_FORECAST regardless of userId', async () => {
    await revalidateDealCaches(null);
    expect(mockRevalidateTag).toHaveBeenCalledWith('deals:list', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('deals:forecast', 'max');
  });

  it('is isolated — each call clears state independently', async () => {
    await revalidateDealCaches('u1');
    expect(mockRevalidateTag).toHaveBeenCalledTimes(3);

    vi.clearAllMocks();

    await revalidateDealCaches(null);
    expect(mockRevalidateTag).toHaveBeenCalledTimes(2);
  });
});
