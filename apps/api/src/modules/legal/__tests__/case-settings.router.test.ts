import { describe, it, expect, beforeEach } from 'vitest';
import { caseSettingsRouter } from '../case-settings.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;
const VALID_CUID = 'cjld2cjxh0000qzrmn831i7rn';

const mockSettings = {
  id: 'setting-1',
  tenantId,
  casePrefix: 'CASE-',
  defaultPriority: 'MEDIUM' as const,
  autoAssignEnabled: false,
  autoAssignUserId: null,
  autoAssignUser: null,
  updatedAt: new Date('2026-04-19'),
};

const mockUpdatedSettings = {
  ...mockSettings,
  casePrefix: 'CS-',
  defaultPriority: 'HIGH' as const,
  autoAssignEnabled: true,
  autoAssignUserId: VALID_CUID,
  autoAssignUser: { id: VALID_CUID, name: 'Test User', email: 'test@example.com' },
};

describe('caseSettings router', () => {
  let caller: ReturnType<typeof caseSettingsRouter.createCaller>;

  beforeEach(() => {
    const ctx = createTestContext();
    caller = caseSettingsRouter.createCaller(ctx);
  });

  describe('get', () => {
    it('returns default settings when no row exists (upsert auto-seeds)', async () => {
      (prismaMock.caseSetting.upsert as any).mockResolvedValue(mockSettings);

      const result = await caller.get();

      expect(prismaMock.caseSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          create: expect.objectContaining({
            tenantId,
            casePrefix: 'CASE-',
            defaultPriority: 'MEDIUM',
            autoAssignEnabled: false,
            autoAssignUserId: null,
          }),
          update: {},
        })
      );
      expect(result.casePrefix).toBe('CASE-');
      expect(result.defaultPriority).toBe('MEDIUM');
      expect(result.autoAssignEnabled).toBe(false);
      expect(result.autoAssignUserId).toBeNull();
    });

    it('returns existing row without re-seeding', async () => {
      (prismaMock.caseSetting.upsert as any).mockResolvedValue({
        ...mockSettings,
        casePrefix: 'CS-',
        defaultPriority: 'HIGH' as const,
      });

      const result = await caller.get();

      expect(result.casePrefix).toBe('CS-');
      expect(result.defaultPriority).toBe('HIGH');
    });
  });

  describe('update', () => {
    it('updates all three fields atomically', async () => {
      (prismaMock.caseSetting.upsert as any).mockResolvedValue(mockUpdatedSettings);

      const result = await caller.update({
        casePrefix: 'CS-',
        defaultPriority: 'HIGH',
        autoAssignEnabled: true,
        autoAssignUserId: VALID_CUID,
      });

      expect(prismaMock.caseSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          update: expect.objectContaining({
            casePrefix: 'CS-',
            defaultPriority: 'HIGH',
            autoAssignEnabled: true,
            autoAssignUserId: VALID_CUID,
          }),
        })
      );
      expect(result.casePrefix).toBe('CS-');
      expect(result.defaultPriority).toBe('HIGH');
      expect(result.autoAssignEnabled).toBe(true);
    });

    it('rejects lowercase casePrefix with Zod error', async () => {
      await expect(
        caller.update({
          casePrefix: 'case-',
          defaultPriority: 'MEDIUM',
          autoAssignEnabled: false,
          autoAssignUserId: null,
        })
      ).rejects.toThrow();
    });

    it('rejects autoAssignEnabled:true with null user (cross-field)', async () => {
      await expect(
        caller.update({
          casePrefix: 'CASE-',
          defaultPriority: 'MEDIUM',
          autoAssignEnabled: true,
          autoAssignUserId: null,
        })
      ).rejects.toThrow();
    });
  });

  describe('resetToDefaults', () => {
    it('restores factory defaults via upsert', async () => {
      (prismaMock.caseSetting.upsert as any).mockResolvedValue(mockSettings);

      const result = await caller.resetToDefaults();

      expect(prismaMock.caseSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          update: expect.objectContaining({
            casePrefix: 'CASE-',
            defaultPriority: 'MEDIUM',
            autoAssignEnabled: false,
            autoAssignUserId: null,
          }),
        })
      );
      expect(result.casePrefix).toBe('CASE-');
      expect(result.defaultPriority).toBe('MEDIUM');
      expect(result.autoAssignEnabled).toBe(false);
    });
  });

  describe('tenant isolation', () => {
    it('uses tenantId from context — not a caller-supplied value', async () => {
      (prismaMock.caseSetting.upsert as any).mockResolvedValue(mockSettings);

      await caller.get();

      const call = (prismaMock.caseSetting.upsert as any).mock.calls[0][0];
      expect(call.where.tenantId).toBe(tenantId);
      expect(call.create.tenantId).toBe(tenantId);
    });
  });
});
