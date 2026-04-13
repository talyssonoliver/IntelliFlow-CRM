/**
 * Unit tests for analytics/actions.ts
 *
 * Verifies that revalidateAnalytics() and refreshAnalyticsCache() call
 * revalidateTag() with the correct tag values.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { revalidateTagMock } = vi.hoisted(() => ({ revalidateTagMock: vi.fn() }));
vi.mock('next/cache', () => ({ revalidateTag: revalidateTagMock }));

import { revalidateAnalytics, refreshAnalyticsCache } from '../actions';
import { ANALYTICS_OVERVIEW, userTag } from '@/lib/cache-tags';

describe('analytics/actions', () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
  });

  describe('revalidateAnalytics', () => {
    it('calls revalidateTag with ANALYTICS_OVERVIEW tag', async () => {
      await revalidateAnalytics('user-abc');
      expect(revalidateTagMock).toHaveBeenCalledWith(ANALYTICS_OVERVIEW, 'max');
    });

    it('calls revalidateTag with the per-user tag', async () => {
      await revalidateAnalytics('user-abc');
      expect(revalidateTagMock).toHaveBeenCalledWith(userTag('user-abc'), 'max');
    });

    it('calls revalidateTag exactly twice', async () => {
      await revalidateAnalytics('user-xyz');
      expect(revalidateTagMock).toHaveBeenCalledTimes(2);
    });

    it('uses the correct literal tag value for ANALYTICS_OVERVIEW', async () => {
      await revalidateAnalytics('any-user');
      expect(revalidateTagMock).toHaveBeenCalledWith('analytics:overview', 'max');
    });

    it('uses the correct user id in the per-user tag', async () => {
      await revalidateAnalytics('user-999');
      expect(revalidateTagMock).toHaveBeenCalledWith('user:user-999', 'max');
    });
  });

  describe('refreshAnalyticsCache', () => {
    it('delegates to revalidateAnalytics — calls revalidateTag with ANALYTICS_OVERVIEW', async () => {
      await refreshAnalyticsCache('user-abc');
      expect(revalidateTagMock).toHaveBeenCalledWith(ANALYTICS_OVERVIEW, 'max');
    });

    it('delegates to revalidateAnalytics — calls revalidateTag with per-user tag', async () => {
      await refreshAnalyticsCache('user-abc');
      expect(revalidateTagMock).toHaveBeenCalledWith(userTag('user-abc'), 'max');
    });

    it('calls revalidateTag exactly twice (one per tag)', async () => {
      await refreshAnalyticsCache('u1');
      expect(revalidateTagMock).toHaveBeenCalledTimes(2);
    });
  });
});
