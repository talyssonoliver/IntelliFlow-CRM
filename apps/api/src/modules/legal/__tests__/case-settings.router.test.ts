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

  describe('general.get', () => {
    it('returns default settings when no row exists (upsert auto-seeds)', async () => {
      (prismaMock.caseSettings.upsert as any).mockResolvedValue(mockSettings);

      const result = await caller.general.get();

      expect(prismaMock.caseSettings.upsert).toHaveBeenCalledWith(
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
      (prismaMock.caseSettings.upsert as any).mockResolvedValue({
        ...mockSettings,
        casePrefix: 'CS-',
        defaultPriority: 'HIGH' as const,
      });

      const result = await caller.general.get();

      expect(result.casePrefix).toBe('CS-');
      expect(result.defaultPriority).toBe('HIGH');
    });
  });

  describe('general.update', () => {
    it('updates all three fields atomically', async () => {
      (prismaMock.caseSettings.upsert as any).mockResolvedValue(mockUpdatedSettings);

      const result = await caller.general.update({
        casePrefix: 'CS-',
        defaultPriority: 'HIGH',
        autoAssignEnabled: true,
        autoAssignUserId: VALID_CUID,
      });

      expect(prismaMock.caseSettings.upsert).toHaveBeenCalledWith(
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
        caller.general.update({
          casePrefix: 'case-',
          defaultPriority: 'MEDIUM',
          autoAssignEnabled: false,
          autoAssignUserId: null,
        })
      ).rejects.toThrow();
    });

    it('rejects autoAssignEnabled:true with null user (cross-field)', async () => {
      await expect(
        caller.general.update({
          casePrefix: 'CASE-',
          defaultPriority: 'MEDIUM',
          autoAssignEnabled: true,
          autoAssignUserId: null,
        })
      ).rejects.toThrow();
    });
  });

  describe('general.update — autoAssignEnabled normalization', () => {
    it('with autoAssignEnabled:false clears autoAssignUserId regardless of incoming field value', async () => {
      (prismaMock.caseSettings.upsert as any).mockResolvedValue(mockSettings);

      // Case A: autoAssignEnabled:false with autoAssignUserId OMITTED from input
      await caller.general.update({
        casePrefix: 'CASE-',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
      });

      const firstCall = (prismaMock.caseSettings.upsert as any).mock.calls[0][0];
      expect(firstCall.update.autoAssignUserId).toBeNull();
      expect(firstCall.create.autoAssignUserId).toBeNull();

      // Case B: autoAssignEnabled:false with autoAssignUserId explicitly set — disable still wins
      await caller.general.update({
        casePrefix: 'CASE-',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
        autoAssignUserId: VALID_CUID,
      });

      const secondCall = (prismaMock.caseSettings.upsert as any).mock.calls[1][0];
      expect(secondCall.update.autoAssignUserId).toBeNull();
      expect(secondCall.create.autoAssignUserId).toBeNull();
    });
  });

  describe('general.resetToDefaults', () => {
    it('restores factory defaults via upsert', async () => {
      (prismaMock.caseSettings.upsert as any).mockResolvedValue(mockSettings);

      const result = await caller.general.resetToDefaults();

      expect(prismaMock.caseSettings.upsert).toHaveBeenCalledWith(
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
      (prismaMock.caseSettings.upsert as any).mockResolvedValue(mockSettings);

      await caller.general.get();

      const call = (prismaMock.caseSettings.upsert as any).mock.calls[0][0];
      expect(call.where.tenantId).toBe(tenantId);
      expect(call.create.tenantId).toBe(tenantId);
    });
  });
});
