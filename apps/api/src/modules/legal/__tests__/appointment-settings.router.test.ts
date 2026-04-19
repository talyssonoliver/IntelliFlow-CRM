import { describe, it, expect, beforeEach } from 'vitest';
import { appointmentSettingsRouter } from '../appointment-settings.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;

const mockSettings = {
  id: 'appt-settings-1',
  tenantId,
  defaultDurationMinutes: 30,
  minDurationMinutes: 5,
  maxDurationMinutes: 480,
  defaultBufferBeforeMinutes: 0,
  defaultBufferAfterMinutes: 0,
  defaultReminderMinutes: 15,
  primaryCalendarId: null,
  syncExternalCalendars: false,
  defaultTimezone: 'UTC',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('Appointment Settings Router', () => {
  let caller: ReturnType<typeof appointmentSettingsRouter.createCaller>;

  beforeEach(() => {
    const ctx = createTestContext();
    caller = appointmentSettingsRouter.createCaller(ctx);
  });

  // ── get ─────────────────────────────────────────────────

  describe('get', () => {
    it('returns existing settings for the tenant', async () => {
      (prismaMock.appointmentSettings.findUnique as any).mockResolvedValue(mockSettings);

      const result = await caller.get();

      expect(result.defaultDurationMinutes).toBe(30);
      expect(result.defaultTimezone).toBe('UTC');
      expect(prismaMock.appointmentSettings.create).not.toHaveBeenCalled();
    });

    it('creates and returns defaults when no settings exist', async () => {
      (prismaMock.appointmentSettings.findUnique as any).mockResolvedValue(null);
      (prismaMock.appointmentSettings.create as any).mockResolvedValue(mockSettings);

      const result = await caller.get();

      expect(prismaMock.appointmentSettings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId,
            defaultDurationMinutes: 30,
            defaultTimezone: 'UTC',
          }),
        })
      );
      expect(result.tenantId).toBe(tenantId);
    });

    it('filters by tenantId', async () => {
      (prismaMock.appointmentSettings.findUnique as any).mockResolvedValue(mockSettings);

      await caller.get();

      expect(prismaMock.appointmentSettings.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } })
      );
    });
  });

  // ── update ───────────────────────────────────────────────

  describe('update', () => {
    it('upserts settings for the tenant', async () => {
      const updated = { ...mockSettings, defaultDurationMinutes: 60 };
      (prismaMock.appointmentSettings.upsert as any).mockResolvedValue(updated);

      const result = await caller.update({ defaultDurationMinutes: 60 });

      expect(prismaMock.appointmentSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          create: expect.objectContaining({ tenantId, defaultDurationMinutes: 60 }),
          update: expect.objectContaining({ defaultDurationMinutes: 60 }),
        })
      );
      expect(result.defaultDurationMinutes).toBe(60);
    });

    it('accepts partial updates', async () => {
      const updated = { ...mockSettings, syncExternalCalendars: true };
      (prismaMock.appointmentSettings.upsert as any).mockResolvedValue(updated);

      const result = await caller.update({ syncExternalCalendars: true });

      expect(result.syncExternalCalendars).toBe(true);
    });

    it('accepts null primaryCalendarId', async () => {
      const updated = { ...mockSettings, primaryCalendarId: null };
      (prismaMock.appointmentSettings.upsert as any).mockResolvedValue(updated);

      const result = await caller.update({ primaryCalendarId: null });

      expect(result.primaryCalendarId).toBeNull();
    });

    it('rejects bufferBefore > 240', async () => {
      await expect(caller.update({ defaultBufferBeforeMinutes: 241 })).rejects.toThrow();
    });

    it('rejects defaultDurationMinutes < 5', async () => {
      await expect(caller.update({ defaultDurationMinutes: 4 })).rejects.toThrow();
    });
  });

  // ── resetToDefaults ──────────────────────────────────────

  describe('resetToDefaults', () => {
    it('upserts settings back to system defaults', async () => {
      (prismaMock.appointmentSettings.upsert as any).mockResolvedValue(mockSettings);

      const result = await caller.resetToDefaults();

      expect(prismaMock.appointmentSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          create: expect.objectContaining({ tenantId, defaultDurationMinutes: 30 }),
          update: expect.objectContaining({
            defaultDurationMinutes: 30,
            minDurationMinutes: 5,
            maxDurationMinutes: 480,
            defaultBufferBeforeMinutes: 0,
            defaultBufferAfterMinutes: 0,
            defaultReminderMinutes: 15,
            syncExternalCalendars: false,
            defaultTimezone: 'UTC',
          }),
        })
      );
      expect(result.defaultDurationMinutes).toBe(30);
    });
  });
});
