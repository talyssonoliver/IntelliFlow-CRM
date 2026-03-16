/**
 * Calendar Router Tests
 *
 * Tests for custom calendar CRUD operations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { calendarRouter } from '../calendar.router';
import { createTRPCRouter } from '../../../trpc';
import { createTestContext, createAdminContext, prismaMock, TEST_UUIDS } from '../../../test/setup';

const testRouter = createTRPCRouter({ calendar: calendarRouter });

function createCaller(ctx: ReturnType<typeof createTestContext>) {
  return testRouter.createCaller(ctx);
}

const CAL_ID = '11111111-0000-4000-8000-000000000001';
const CAL_ID_2 = '11111111-0000-4000-8000-000000000002';
const NONEXISTENT_ID = '99999999-0000-4000-8000-000000000099';

const mockCalendar = {
  id: CAL_ID,
  name: 'Work Calendar',
  color: '#3b82f6',
  tenantId: TEST_UUIDS.tenant,
  ownerId: '', // set in beforeEach
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('calendar router', () => {
  let ctx: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    ctx = createTestContext();
    mockCalendar.ownerId = ctx.user!.userId;
  });

  describe('list', () => {
    it('returns all calendars for the tenant', async () => {
      const calendars = [
        {
          id: CAL_ID,
          name: 'Work',
          color: '#3b82f6',
          ownerId: ctx.user!.userId,
          createdAt: new Date(),
        },
        {
          id: CAL_ID_2,
          name: 'Personal',
          color: '#22c55e',
          ownerId: ctx.user!.userId,
          createdAt: new Date(),
        },
      ];
      (prismaMock.calendar.findMany as any).mockResolvedValue(calendars);

      const caller = createCaller(ctx);
      const result = await caller.calendar.list();

      expect(result).toEqual(calendars);
      expect(prismaMock.calendar.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: ctx.user!.tenantId },
        })
      );
    });

    it('returns empty array when no calendars exist', async () => {
      (prismaMock.calendar.findMany as any).mockResolvedValue([]);

      const caller = createCaller(ctx);
      const result = await caller.calendar.list();

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('creates a new calendar', async () => {
      const created = {
        id: CAL_ID_2,
        name: 'New Calendar',
        color: '#f59e0b',
        ownerId: ctx.user!.userId,
        createdAt: new Date(),
      };
      (prismaMock.calendar.create as any).mockResolvedValue(created);

      const caller = createCaller(ctx);
      const result = await caller.calendar.create({
        name: 'New Calendar',
        color: '#f59e0b',
      });

      expect(result).toEqual(created);
      expect(prismaMock.calendar.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'New Calendar',
            color: '#f59e0b',
            tenantId: ctx.user!.tenantId,
            ownerId: ctx.user!.userId,
          }),
        })
      );
    });

    it('rejects invalid color format', async () => {
      const caller = createCaller(ctx);
      await expect(caller.calendar.create({ name: 'Bad Color', color: 'red' })).rejects.toThrow();
    });

    it('rejects empty name', async () => {
      const caller = createCaller(ctx);
      await expect(caller.calendar.create({ name: '', color: '#3b82f6' })).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('updates calendar name', async () => {
      (prismaMock.calendar.findFirst as any).mockResolvedValue(mockCalendar);
      const updated = { ...mockCalendar, name: 'Updated Name' };
      (prismaMock.calendar.update as any).mockResolvedValue({
        id: updated.id,
        name: updated.name,
        color: updated.color,
        ownerId: updated.ownerId,
        createdAt: updated.createdAt,
      });

      const caller = createCaller(ctx);
      const result = await caller.calendar.update({
        id: CAL_ID,
        name: 'Updated Name',
      });

      expect(result.name).toBe('Updated Name');
    });

    it('rejects update by non-owner non-admin', async () => {
      const otherCalendar = { ...mockCalendar, ownerId: 'other-user-id' };
      (prismaMock.calendar.findFirst as any).mockResolvedValue(otherCalendar);

      const caller = createCaller(ctx);
      await expect(caller.calendar.update({ id: CAL_ID, name: 'Hijack' })).rejects.toThrow(
        'Only the calendar owner or an admin can update this calendar'
      );
    });

    it('allows admin to update any calendar', async () => {
      const adminCtx = createAdminContext();
      const otherCalendar = { ...mockCalendar, ownerId: 'other-user-id' };
      (prismaMock.calendar.findFirst as any).mockResolvedValue(otherCalendar);
      (prismaMock.calendar.update as any).mockResolvedValue({
        id: otherCalendar.id,
        name: 'Admin Update',
        color: otherCalendar.color,
        ownerId: otherCalendar.ownerId,
        createdAt: otherCalendar.createdAt,
      });

      const caller = createCaller(adminCtx);
      const result = await caller.calendar.update({
        id: CAL_ID,
        name: 'Admin Update',
      });

      expect(result.name).toBe('Admin Update');
    });

    it('throws NOT_FOUND for missing calendar', async () => {
      (prismaMock.calendar.findFirst as any).mockResolvedValue(null);

      const caller = createCaller(ctx);
      await expect(caller.calendar.update({ id: NONEXISTENT_ID, name: 'Nope' })).rejects.toThrow(
        'Calendar not found'
      );
    });
  });

  describe('delete', () => {
    it('deletes calendar and resets linked items', async () => {
      (prismaMock.calendar.findFirst as any).mockResolvedValue(mockCalendar);
      (prismaMock.$transaction as any).mockResolvedValue([
        { count: 2 },
        { count: 1 },
        mockCalendar,
      ]);

      const caller = createCaller(ctx);
      const result = await caller.calendar.delete({ id: CAL_ID });

      expect(result).toEqual({ success: true });
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('rejects delete by non-owner non-admin', async () => {
      const otherCalendar = { ...mockCalendar, ownerId: 'other-user-id' };
      (prismaMock.calendar.findFirst as any).mockResolvedValue(otherCalendar);

      const caller = createCaller(ctx);
      await expect(caller.calendar.delete({ id: CAL_ID })).rejects.toThrow(
        'Only the calendar owner or an admin can delete this calendar'
      );
    });

    it('throws NOT_FOUND for missing calendar', async () => {
      (prismaMock.calendar.findFirst as any).mockResolvedValue(null);

      const caller = createCaller(ctx);
      await expect(caller.calendar.delete({ id: NONEXISTENT_ID })).rejects.toThrow(
        'Calendar not found'
      );
    });

    it('allows admin to delete any calendar', async () => {
      const adminCtx = createAdminContext();
      const otherCalendar = { ...mockCalendar, ownerId: 'other-user-id' };
      (prismaMock.calendar.findFirst as any).mockResolvedValue(otherCalendar);
      (prismaMock.$transaction as any).mockResolvedValue([
        { count: 0 },
        { count: 0 },
        otherCalendar,
      ]);

      const caller = createCaller(adminCtx);
      const result = await caller.calendar.delete({ id: CAL_ID });

      expect(result).toEqual({ success: true });
    });
  });
});
