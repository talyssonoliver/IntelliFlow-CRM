/**
 * Unit tests for settings/actions.ts
 *
 * Verifies that revalidateModuleAccess(), revalidateDashboard(), and
 * revalidateAllDashboardCaches() call revalidateTag() with the correct tags.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { revalidateTagMock } = vi.hoisted(() => ({ revalidateTagMock: vi.fn() }));
vi.mock('next/cache', () => ({ revalidateTag: revalidateTagMock }));

import {
  revalidateModuleAccess,
  revalidateDashboard,
  revalidateAllDashboardCaches,
} from '../actions';
import { MODULE_ACCESS, DASHBOARD, userTag } from '@/lib/cache-tags';

describe('settings/actions', () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
  });

  describe('revalidateModuleAccess', () => {
    it('calls revalidateTag with MODULE_ACCESS tag', async () => {
      await revalidateModuleAccess('user-abc');
      expect(revalidateTagMock).toHaveBeenCalledWith(MODULE_ACCESS, 'max');
    });

    it('calls revalidateTag with the per-user tag', async () => {
      await revalidateModuleAccess('user-abc');
      expect(revalidateTagMock).toHaveBeenCalledWith(userTag('user-abc'), 'max');
    });

    it('calls revalidateTag exactly twice', async () => {
      await revalidateModuleAccess('user-xyz');
      expect(revalidateTagMock).toHaveBeenCalledTimes(2);
    });

    it('uses the correct literal tag value for MODULE_ACCESS', async () => {
      await revalidateModuleAccess('any-user');
      expect(revalidateTagMock).toHaveBeenCalledWith('module:access', 'max');
    });
  });

  describe('revalidateDashboard', () => {
    it('calls revalidateTag with DASHBOARD tag', async () => {
      await revalidateDashboard('user-abc');
      expect(revalidateTagMock).toHaveBeenCalledWith(DASHBOARD, 'max');
    });

    it('calls revalidateTag with the per-user tag', async () => {
      await revalidateDashboard('user-abc');
      expect(revalidateTagMock).toHaveBeenCalledWith(userTag('user-abc'), 'max');
    });

    it('calls revalidateTag exactly twice', async () => {
      await revalidateDashboard('u1');
      expect(revalidateTagMock).toHaveBeenCalledTimes(2);
    });

    it('uses the correct literal tag value for DASHBOARD', async () => {
      await revalidateDashboard('any-user');
      expect(revalidateTagMock).toHaveBeenCalledWith('dashboard', 'max');
    });
  });

  describe('revalidateAllDashboardCaches', () => {
    it('calls revalidateTag with DASHBOARD tag', async () => {
      await revalidateAllDashboardCaches('user-abc');
      expect(revalidateTagMock).toHaveBeenCalledWith(DASHBOARD, 'max');
    });

    it('calls revalidateTag with MODULE_ACCESS tag', async () => {
      await revalidateAllDashboardCaches('user-abc');
      expect(revalidateTagMock).toHaveBeenCalledWith(MODULE_ACCESS, 'max');
    });

    it('calls revalidateTag with the per-user tag', async () => {
      await revalidateAllDashboardCaches('user-abc');
      expect(revalidateTagMock).toHaveBeenCalledWith(userTag('user-abc'), 'max');
    });

    it('calls revalidateTag exactly three times (DASHBOARD + MODULE_ACCESS + user tag)', async () => {
      await revalidateAllDashboardCaches('u1');
      expect(revalidateTagMock).toHaveBeenCalledTimes(3);
    });

    it('invalidates literal dashboard tag value', async () => {
      await revalidateAllDashboardCaches('any-user');
      expect(revalidateTagMock).toHaveBeenCalledWith('dashboard', 'max');
    });

    it('invalidates literal module:access tag value', async () => {
      await revalidateAllDashboardCaches('any-user');
      expect(revalidateTagMock).toHaveBeenCalledWith('module:access', 'max');
    });
  });
});
