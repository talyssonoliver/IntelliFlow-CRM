/**
 * Report Settings Router Tests - PG-187
 *
 * Tests for /analytics/report-settings tRPC procedures:
 * - get (upsert-on-first-access)
 * - update (partial/full)
 * - resetToDefaults
 * - Multi-tenant isolation + negative-path validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { reportSettingsRouter } from '../report-settings.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;

const mockExistingSettings = {
  id: 'rs-1',
  tenantId,
  defaultRange: '30d',
  currency: 'USD',
  scheduledDelivery: {
    enabled: false,
    frequency: 'weekly',
    dayOfWeek: 1,
    time: '09:00',
    recipients: [],
    format: 'pdf',
  },
  createdAt: new Date('2026-04-19'),
  updatedAt: new Date('2026-04-19'),
};

describe('Report Settings Router (PG-187)', () => {
  let caller: ReturnType<typeof reportSettingsRouter.createCaller>;

  beforeEach(() => {
    const ctx = createTestContext();
    caller = reportSettingsRouter.createCaller(ctx);
  });

  // ─── get ──────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('upserts default row when none exists (first-tenant access)', async () => {
      (prismaMock.reportSettings.upsert as any).mockResolvedValueOnce(mockExistingSettings);

      const result = await caller.get();

      expect(prismaMock.reportSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          create: expect.objectContaining({
            tenantId,
            defaultRange: '30d',
            currency: 'USD',
          }),
          update: {},
        })
      );
      expect(result).toEqual(mockExistingSettings);
    });

    it('returns existing row when settings already exist', async () => {
      const existing = { ...mockExistingSettings, defaultRange: '90d', currency: 'EUR' };
      (prismaMock.reportSettings.upsert as any).mockResolvedValueOnce(existing);

      const result = await caller.get();

      expect(result.defaultRange).toBe('90d');
      expect(result.currency).toBe('EUR');
    });

    it('filters by tenantId (multi-tenant isolation)', async () => {
      (prismaMock.reportSettings.upsert as any).mockResolvedValueOnce(mockExistingSettings);

      await caller.get();

      expect(prismaMock.reportSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
        })
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('persists defaultRange change', async () => {
      const updated = { ...mockExistingSettings, defaultRange: '90d' };
      (prismaMock.reportSettings.upsert as any).mockResolvedValueOnce(updated);

      const result = await caller.update({ defaultRange: '90d' });

      expect(prismaMock.reportSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          update: expect.objectContaining({ defaultRange: '90d' }),
        })
      );
      expect(result.defaultRange).toBe('90d');
    });

    it('persists currency change', async () => {
      const updated = { ...mockExistingSettings, currency: 'EUR' };
      (prismaMock.reportSettings.upsert as any).mockResolvedValueOnce(updated);

      const result = await caller.update({ currency: 'EUR' });

      expect(prismaMock.reportSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ currency: 'EUR' }),
        })
      );
      expect(result.currency).toBe('EUR');
    });

    it('persists scheduledDelivery change', async () => {
      const scheduledDelivery = {
        enabled: true,
        frequency: 'daily' as const,
        time: '08:30',
        recipients: ['admin@test.com'],
        format: 'csv' as const,
      };
      const updated = { ...mockExistingSettings, scheduledDelivery };
      (prismaMock.reportSettings.upsert as any).mockResolvedValueOnce(updated);

      const result = await caller.update({ scheduledDelivery });

      expect(result.scheduledDelivery).toMatchObject({
        enabled: true,
        frequency: 'daily',
        recipients: ['admin@test.com'],
      });
    });

    it('rejects invalid currency code (non-ISO-4217)', async () => {
      await expect(caller.update({ currency: 'XX' as any })).rejects.toThrow();
      await expect(caller.update({ currency: '1234' as any })).rejects.toThrow();
      await expect(caller.update({ currency: '' as any })).rejects.toThrow();
    });

    it('rejects invalid defaultRange', async () => {
      await expect(caller.update({ defaultRange: '365d' as any })).rejects.toThrow();
      await expect(caller.update({ defaultRange: '' as any })).rejects.toThrow();
    });

    it('rejects scheduledDelivery with invalid email in recipients', async () => {
      await expect(
        caller.update({
          scheduledDelivery: {
            enabled: true,
            frequency: 'weekly',
            time: '09:00',
            recipients: ['not-an-email'],
            format: 'pdf',
          },
        })
      ).rejects.toThrow();
    });

    it('rejects scheduledDelivery with invalid time format', async () => {
      await expect(
        caller.update({
          scheduledDelivery: {
            enabled: true,
            frequency: 'weekly',
            time: '25:99',
            recipients: [],
            format: 'pdf',
          },
        })
      ).rejects.toThrow();
    });

    it('accepts empty partial update (no-op)', async () => {
      (prismaMock.reportSettings.upsert as any).mockResolvedValueOnce(mockExistingSettings);
      const result = await caller.update({});
      expect(result).toEqual(mockExistingSettings);
    });
  });

  // ─── resetToDefaults ──────────────────────────────────────────────────────

  describe('resetToDefaults', () => {
    it('restores factory defaults (30d/USD/scheduledDelivery disabled)', async () => {
      (prismaMock.reportSettings.upsert as any).mockResolvedValueOnce(mockExistingSettings);

      const result = await caller.resetToDefaults();

      expect(prismaMock.reportSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            defaultRange: '30d',
            currency: 'USD',
            scheduledDelivery: expect.objectContaining({
              enabled: false,
              frequency: 'weekly',
            }),
          }),
        })
      );
      expect(result).toEqual(mockExistingSettings);
    });

    it('filters by tenantId (multi-tenant isolation)', async () => {
      (prismaMock.reportSettings.upsert as any).mockResolvedValueOnce(mockExistingSettings);

      await caller.resetToDefaults();

      expect(prismaMock.reportSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
        })
      );
    });
  });
});
