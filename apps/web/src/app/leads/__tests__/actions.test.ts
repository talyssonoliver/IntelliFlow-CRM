/**
 * Unit tests for leads/actions.ts
 *
 * Verifies that revalidateLeadCaches() and revalidateLeadConversionCaches()
 * call revalidateTag() with the correct tag values and the 'default' store arg.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { revalidateTagMock } = vi.hoisted(() => ({ revalidateTagMock: vi.fn() }));
vi.mock('next/cache', () => ({ revalidateTag: revalidateTagMock }));

import { revalidateLeadCaches, revalidateLeadConversionCaches } from '../actions';
import {
  LEADS_LIST,
  LEADS_STATS,
  HOME_AI_INSIGHTS,
  DASHBOARD,
  userTag,
} from '@/lib/cache-tags';

describe('leads/actions', () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
  });

  describe('revalidateLeadCaches', () => {
    it('calls revalidateTag with LEADS_LIST', async () => {
      await revalidateLeadCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(LEADS_LIST, 'max');
    });

    it('calls revalidateTag with LEADS_STATS', async () => {
      await revalidateLeadCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(LEADS_STATS, 'max');
    });

    it('calls revalidateTag with HOME_AI_INSIGHTS', async () => {
      await revalidateLeadCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(HOME_AI_INSIGHTS, 'max');
    });

    it('calls revalidateTag with DASHBOARD', async () => {
      await revalidateLeadCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(DASHBOARD, 'max');
    });

    it('calls revalidateTag with the per-user tag', async () => {
      await revalidateLeadCaches('user-42');
      expect(revalidateTagMock).toHaveBeenCalledWith(userTag('user-42'), 'max');
    });

    it('calls revalidateTag exactly 5 times', async () => {
      await revalidateLeadCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledTimes(5);
    });

    it('uses correct literal tag value for LEADS_LIST', async () => {
      await revalidateLeadCaches('u');
      expect(revalidateTagMock).toHaveBeenCalledWith('leads:list', 'max');
    });

    it('uses correct literal tag value for HOME_AI_INSIGHTS', async () => {
      await revalidateLeadCaches('u');
      expect(revalidateTagMock).toHaveBeenCalledWith('home:ai-insights', 'max');
    });

    it('uses the correct userId in the per-user tag', async () => {
      await revalidateLeadCaches('user-999');
      expect(revalidateTagMock).toHaveBeenCalledWith('user:user-999', 'max');
    });
  });

  describe('revalidateLeadConversionCaches', () => {
    it('calls revalidateTag with LEADS_LIST', async () => {
      await revalidateLeadConversionCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(LEADS_LIST, 'max');
    });

    it('calls revalidateTag with LEADS_STATS', async () => {
      await revalidateLeadConversionCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(LEADS_STATS, 'max');
    });

    it('calls revalidateTag with HOME_AI_INSIGHTS', async () => {
      await revalidateLeadConversionCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(HOME_AI_INSIGHTS, 'max');
    });

    it('includes CONTACTS_LIST for cross-entity invalidation', async () => {
      await revalidateLeadConversionCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith('contacts:list', 'max');
    });

    it('includes CONTACTS_STATS for cross-entity invalidation', async () => {
      await revalidateLeadConversionCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith('contacts:stats', 'max');
    });

    it('calls revalidateTag exactly 7 times', async () => {
      await revalidateLeadConversionCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledTimes(7);
    });

    it('uses the correct userId in the per-user tag', async () => {
      await revalidateLeadConversionCaches('user-abc');
      expect(revalidateTagMock).toHaveBeenCalledWith('user:user-abc', 'max');
    });
  });
});
