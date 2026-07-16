/**
 * Task Settings Router Tests - PG-191
 *
 * Tests for /tasks/task-settings tRPC procedures:
 * - get (upsert-on-first-access)
 * - update (partial/full + negative-path validation)
 * - resetToDefaults
 * - Multi-tenant isolation + JSON-column normalization fallback
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { taskSettingsRouter } from '../task-settings.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;

const mockExistingSettings = {
  id: 'ts-1',
  tenantId,
  dueDateOffsetDays: 3,
  reminderDefaults: { enabled: true, minutesBefore: 60 },
  taskTemplates: [],
  createdAt: new Date('2026-07-14'),
  updatedAt: new Date('2026-07-14'),
};

describe('Task Settings Router (PG-191)', () => {
  let caller: ReturnType<typeof taskSettingsRouter.createCaller>;

  beforeEach(() => {
    const ctx = createTestContext();
    caller = taskSettingsRouter.createCaller(ctx);
  });

  // ─── get ──────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('upserts default row when none exists (first-tenant access)', async () => {
      (prismaMock.taskSettings.upsert as any).mockResolvedValueOnce(mockExistingSettings);

      const result = await caller.get();

      expect(prismaMock.taskSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          create: expect.objectContaining({
            tenantId,
            dueDateOffsetDays: 3,
          }),
          update: {},
        })
      );
      expect(result).toEqual(mockExistingSettings);
    });

    it('returns existing row when settings already exist', async () => {
      const existing = { ...mockExistingSettings, dueDateOffsetDays: 7 };
      (prismaMock.taskSettings.upsert as any).mockResolvedValueOnce(existing);

      const result = await caller.get();

      expect(result.dueDateOffsetDays).toBe(7);
    });

    it('normalizes a corrupt JSON column back to defaults', async () => {
      const corrupt = {
        ...mockExistingSettings,
        reminderDefaults: { garbage: true },
        taskTemplates: 'not-an-array',
      };
      (prismaMock.taskSettings.upsert as any).mockResolvedValueOnce(corrupt);

      const result = await caller.get();

      expect(result.reminderDefaults).toEqual({ enabled: true, minutesBefore: 60 });
      expect(result.taskTemplates).toEqual([]);
    });

    it('filters by tenantId (multi-tenant isolation)', async () => {
      (prismaMock.taskSettings.upsert as any).mockResolvedValueOnce(mockExistingSettings);

      await caller.get();

      expect(prismaMock.taskSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } })
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('persists dueDateOffsetDays change', async () => {
      const updated = { ...mockExistingSettings, dueDateOffsetDays: 10 };
      (prismaMock.taskSettings.upsert as any).mockResolvedValueOnce(updated);

      const result = await caller.update({ dueDateOffsetDays: 10 });

      expect(prismaMock.taskSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          update: expect.objectContaining({ dueDateOffsetDays: 10 }),
        })
      );
      expect(result.dueDateOffsetDays).toBe(10);
    });

    it('persists reminderDefaults change', async () => {
      const reminderDefaults = { enabled: true, minutesBefore: 120 };
      const updated = { ...mockExistingSettings, reminderDefaults };
      (prismaMock.taskSettings.upsert as any).mockResolvedValueOnce(updated);

      const result = await caller.update({ reminderDefaults });

      expect(result.reminderDefaults).toMatchObject({ enabled: true, minutesBefore: 120 });
    });

    it('persists taskTemplates change', async () => {
      const taskTemplates = [
        { id: 't1', name: 'Follow up', defaultPriority: 'HIGH' as const, defaultDueOffsetDays: 2 },
      ];
      const updated = { ...mockExistingSettings, taskTemplates };
      (prismaMock.taskSettings.upsert as any).mockResolvedValueOnce(updated);

      const result = await caller.update({ taskTemplates });

      expect(result.taskTemplates).toHaveLength(1);
      expect(result.taskTemplates[0]).toMatchObject({ name: 'Follow up' });
    });

    it('rejects out-of-range dueDateOffsetDays', async () => {
      await expect(caller.update({ dueDateOffsetDays: -1 })).rejects.toThrow();
      await expect(caller.update({ dueDateOffsetDays: 366 })).rejects.toThrow();
    });

    it('rejects an enabled reminder with zero lead time (superRefine at boundary)', async () => {
      await expect(
        caller.update({ reminderDefaults: { enabled: true, minutesBefore: 0 } })
      ).rejects.toThrow();
    });

    it('rejects duplicate template names (superRefine at boundary)', async () => {
      await expect(
        caller.update({
          taskTemplates: [
            { id: 'a', name: 'Alpha', defaultPriority: 'LOW', defaultDueOffsetDays: 1 },
            { id: 'b', name: 'alpha', defaultPriority: 'LOW', defaultDueOffsetDays: 1 },
          ],
        })
      ).rejects.toThrow();
    });

    it('accepts empty partial update (no-op)', async () => {
      (prismaMock.taskSettings.upsert as any).mockResolvedValueOnce(mockExistingSettings);
      const result = await caller.update({});
      expect(result).toEqual(mockExistingSettings);
    });

    it('filters by caller tenantId (cross-tenant negative)', async () => {
      (prismaMock.taskSettings.upsert as any).mockResolvedValueOnce(mockExistingSettings);

      await caller.update({ dueDateOffsetDays: 5 });

      expect(prismaMock.taskSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } })
      );
    });
  });

  // ─── resetToDefaults ──────────────────────────────────────────────────────

  describe('resetToDefaults', () => {
    it('restores factory defaults', async () => {
      (prismaMock.taskSettings.upsert as any).mockResolvedValueOnce(mockExistingSettings);

      const result = await caller.resetToDefaults();

      expect(prismaMock.taskSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ dueDateOffsetDays: 3 }),
        })
      );
      expect(result).toEqual(mockExistingSettings);
    });

    it('filters by tenantId (multi-tenant isolation)', async () => {
      (prismaMock.taskSettings.upsert as any).mockResolvedValueOnce(mockExistingSettings);

      await caller.resetToDefaults();

      expect(prismaMock.taskSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } })
      );
    });
  });
});
