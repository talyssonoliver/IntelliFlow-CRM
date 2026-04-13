/**
 * Unit tests for accounts/actions.ts
 *
 * Verifies that revalidateAccountCaches() calls revalidateTag()
 * with the correct tag values and the 'default' store arg.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { revalidateTagMock } = vi.hoisted(() => ({ revalidateTagMock: vi.fn() }));
vi.mock('next/cache', () => ({ revalidateTag: revalidateTagMock }));

import { revalidateAccountCaches } from '../actions';
import {
  ACCOUNTS_LIST,
  ACCOUNTS_STATS,
  HOME_AI_INSIGHTS,
  DASHBOARD,
  userTag,
} from '@/lib/cache-tags';

describe('accounts/actions', () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
  });

  describe('revalidateAccountCaches', () => {
    it('calls revalidateTag with ACCOUNTS_LIST', async () => {
      await revalidateAccountCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(ACCOUNTS_LIST, 'max');
    });

    it('calls revalidateTag with ACCOUNTS_STATS', async () => {
      await revalidateAccountCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(ACCOUNTS_STATS, 'max');
    });

    it('calls revalidateTag with HOME_AI_INSIGHTS', async () => {
      await revalidateAccountCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(HOME_AI_INSIGHTS, 'max');
    });

    it('calls revalidateTag with DASHBOARD', async () => {
      await revalidateAccountCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledWith(DASHBOARD, 'max');
    });

    it('calls revalidateTag with the per-user tag', async () => {
      await revalidateAccountCaches('user-42');
      expect(revalidateTagMock).toHaveBeenCalledWith(userTag('user-42'), 'max');
    });

    it('calls revalidateTag exactly 5 times', async () => {
      await revalidateAccountCaches('user-1');
      expect(revalidateTagMock).toHaveBeenCalledTimes(5);
    });

    it('uses correct literal tag value for ACCOUNTS_LIST', async () => {
      await revalidateAccountCaches('u');
      expect(revalidateTagMock).toHaveBeenCalledWith('accounts:list', 'max');
    });

    it('uses correct literal tag value for HOME_AI_INSIGHTS', async () => {
      await revalidateAccountCaches('u');
      expect(revalidateTagMock).toHaveBeenCalledWith('home:ai-insights', 'max');
    });

    it('uses the correct userId in the per-user tag', async () => {
      await revalidateAccountCaches('user-999');
      expect(revalidateTagMock).toHaveBeenCalledWith('user:user-999', 'max');
    });

    it('uses correct literal tag value for ACCOUNTS_STATS', async () => {
      await revalidateAccountCaches('u');
      expect(revalidateTagMock).toHaveBeenCalledWith('accounts:stats', 'max');
    });
  });
});
