/**
 * Unit tests for calendar/actions.ts
 *
 * Verifies that revalidateCalendar() calls revalidateTag() with the correct
 * tag values for both the CALENDAR_EVENTS shared tag and the per-user tag.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { revalidateTagMock } = vi.hoisted(() => ({ revalidateTagMock: vi.fn() }));
vi.mock('next/cache', () => ({ revalidateTag: revalidateTagMock }));

import { revalidateCalendar } from '../actions';
import { CALENDAR_EVENTS, userTag } from '@/lib/cache-tags';

describe('calendar/actions', () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
  });

  describe('revalidateCalendar', () => {
    it('calls revalidateTag with CALENDAR_EVENTS tag', async () => {
      await revalidateCalendar('user-abc');
      expect(revalidateTagMock).toHaveBeenCalledWith(CALENDAR_EVENTS, 'max');
    });

    it('calls revalidateTag with the per-user tag', async () => {
      await revalidateCalendar('user-abc');
      expect(revalidateTagMock).toHaveBeenCalledWith(userTag('user-abc'), 'max');
    });

    it('calls revalidateTag exactly twice', async () => {
      await revalidateCalendar('user-xyz');
      expect(revalidateTagMock).toHaveBeenCalledTimes(2);
    });

    it('uses the correct user id in the per-user tag', async () => {
      await revalidateCalendar('user-123');
      expect(revalidateTagMock).toHaveBeenCalledWith('user:user-123', 'max');
    });

    it('uses the correct literal tag value for CALENDAR_EVENTS', async () => {
      await revalidateCalendar('any-user');
      expect(revalidateTagMock).toHaveBeenCalledWith('calendar:events', 'max');
    });
  });
});
