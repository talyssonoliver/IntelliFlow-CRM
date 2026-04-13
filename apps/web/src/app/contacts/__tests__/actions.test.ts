/**
 * Unit tests for contacts/actions.ts
 *
 * Verifies that revalidateContactCaches() and revalidateContactAccountLinkCaches()
 * call revalidateTag() with the correct tag values and the 'default' store arg.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { revalidateTagMock } = vi.hoisted(() => ({ revalidateTagMock: vi.fn() }));
vi.mock('next/cache', () => ({ revalidateTag: revalidateTagMock }));

import { revalidateContactCaches, revalidateContactAccountLinkCaches } from '../actions';
import {
  CONTACTS_LIST,
  CONTACTS_STATS,
  ACCOUNTS_STATS,
  HOME_AI_INSIGHTS,
  DASHBOARD,
  userTag,
} from '@/lib/cache-tags';

describe('contacts/actions', () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
  });

  describe('revalidateContactCaches', () => {
    it('calls revalidateTag with CONTACTS_LIST', async () => {
      await revalidateContactCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(CONTACTS_LIST, 'max');
    });

    it('calls revalidateTag with CONTACTS_STATS', async () => {
      await revalidateContactCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(CONTACTS_STATS, 'max');
    });

    it('calls revalidateTag with HOME_AI_INSIGHTS', async () => {
      await revalidateContactCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(HOME_AI_INSIGHTS, 'max');
    });

    it('calls revalidateTag with DASHBOARD', async () => {
      await revalidateContactCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(DASHBOARD, 'max');
    });

    it('calls revalidateTag with the per-user tag', async () => {
      await revalidateContactCaches('user-42');
      expect(revalidateTagMock).toHaveBeenCalledWith(userTag('user-42'), 'max');
    });

    it('calls revalidateTag exactly 5 times', async () => {
      await revalidateContactCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledTimes(5);
    });

    it('uses correct literal tag value for CONTACTS_LIST', async () => {
      await revalidateContactCaches('u');
      expect(revalidateTagMock).toHaveBeenCalledWith('contacts:list', 'max');
    });

    it('uses correct literal tag value for HOME_AI_INSIGHTS', async () => {
      await revalidateContactCaches('u');
      expect(revalidateTagMock).toHaveBeenCalledWith('home:ai-insights', 'max');
    });

    it('uses the correct userId in the per-user tag', async () => {
      await revalidateContactCaches('user-999');
      expect(revalidateTagMock).toHaveBeenCalledWith('user:user-999', 'max');
    });
  });

  describe('revalidateContactAccountLinkCaches', () => {
    it('calls revalidateTag with CONTACTS_LIST', async () => {
      await revalidateContactAccountLinkCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(CONTACTS_LIST, 'max');
    });

    it('calls revalidateTag with CONTACTS_STATS', async () => {
      await revalidateContactAccountLinkCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(CONTACTS_STATS, 'max');
    });

    it('calls revalidateTag with ACCOUNTS_STATS for cross-entity invalidation', async () => {
      await revalidateContactAccountLinkCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(ACCOUNTS_STATS, 'max');
    });

    it('calls revalidateTag with HOME_AI_INSIGHTS', async () => {
      await revalidateContactAccountLinkCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(HOME_AI_INSIGHTS, 'max');
    });

    it('calls revalidateTag exactly 6 times', async () => {
      await revalidateContactAccountLinkCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledTimes(6);
    });

    it('uses the correct userId in the per-user tag', async () => {
      await revalidateContactAccountLinkCaches('user-abc');
      expect(revalidateTagMock).toHaveBeenCalledWith('user:user-abc', 'max');
    });

    it('uses correct literal tag for ACCOUNTS_STATS', async () => {
      await revalidateContactAccountLinkCaches('u');
      expect(revalidateTagMock).toHaveBeenCalledWith('accounts:stats', 'max');
    });
  });
});
