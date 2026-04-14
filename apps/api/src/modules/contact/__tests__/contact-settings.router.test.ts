/**
 * Contact Settings Router Tests - PG-182
 *
 * Pattern mirrors lead-settings.router.test.ts: uses prismaMock from
 * test/setup and contactSettingsRouter.createCaller(ctx).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { contactSettingsRouter } from '../contact-settings.router';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  TEST_UUIDS,
} from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;

const mockDuplicateRule = {
  id: 'rule-1',
  tenantId,
  field: 'email',
  matchStrategy: 'exact',
  threshold: 100,
  isActive: true,
  sortOrder: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockRequiredField = {
  id: 'field-1',
  tenantId,
  fieldKey: 'email',
  isRequired: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockTag = {
  id: 'tag-1',
  tenantId,
  name: 'VIP',
  colorToken: 'amber',
  description: 'High-value',
  sortOrder: 0,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockAutomation = {
  id: 'auto-1',
  tenantId,
  autoMergeOnExactEmail: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  normalizePhoneNumbers: true,
  autoCapitalizeNames: true,
  preventDeleteWithOpenDeals: true,
  notifyOnOwnerChange: false,
  aiDuplicateDetection: true,
  aiEnrichment: false,
  aiTagSuggestions: true,
  aiInsightGeneration: true,
  aiAutoReplyDrafting: false,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('Contact Settings Router', () => {
  let caller: ReturnType<typeof contactSettingsRouter.createCaller>;

  beforeEach(() => {
    const ctx = createTestContext();
    caller = contactSettingsRouter.createCaller(ctx);
  });

  describe('duplicateRules.getAll', () => {
    it('seeds and returns defaults when no rules exist', async () => {
      (prismaMock.contactDuplicateRule.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockDuplicateRule]);
      (prismaMock.contactDuplicateRule.createMany as any).mockResolvedValue({ count: 3 });

      const result = await caller.duplicateRules.getAll();

      expect(prismaMock.contactDuplicateRule.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ tenantId, field: 'email', matchStrategy: 'exact' }),
          ]),
        })
      );
      expect(result).toHaveLength(1);
    });

    it('returns existing rules without seeding', async () => {
      (prismaMock.contactDuplicateRule.findMany as any).mockResolvedValueOnce([mockDuplicateRule]);
      const result = await caller.duplicateRules.getAll();
      expect(prismaMock.contactDuplicateRule.createMany).not.toHaveBeenCalled();
      expect(result).toEqual([mockDuplicateRule]);
    });
  });

  describe('duplicateRules.updateAll', () => {
    it('replaces rules transactionally for tenant', async () => {
      (prismaMock.$transaction as any).mockResolvedValue([]);
      (prismaMock.contactDuplicateRule.findMany as any).mockResolvedValue([mockDuplicateRule]);

      const result = await caller.duplicateRules.updateAll({
        rules: [
          {
            field: 'email',
            matchStrategy: 'exact',
            threshold: 100,
            isActive: true,
            sortOrder: 0,
          },
        ],
      });

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('rejects empty rule list via Zod', async () => {
      await expect(caller.duplicateRules.updateAll({ rules: [] })).rejects.toThrow();
    });
  });

  describe('duplicateRules.resetToDefaults', () => {
    it('wipes and reseeds the three factory rules transactionally', async () => {
      (prismaMock.$transaction as any).mockResolvedValue([]);
      (prismaMock.contactDuplicateRule.findMany as any).mockResolvedValue([mockDuplicateRule]);

      const result = await caller.duplicateRules.resetToDefaults();

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('requiredFields.updateAll', () => {
    it('rejects when email is unset', async () => {
      await expect(
        caller.requiredFields.updateAll({
          fields: [
            { fieldKey: 'email', isRequired: false },
            { fieldKey: 'phone', isRequired: true },
          ],
        })
      ).rejects.toThrow();
    });

    it('upserts when email remains required (transactional)', async () => {
      (prismaMock.$transaction as any).mockResolvedValue([mockRequiredField, mockRequiredField]);
      (prismaMock.contactRequiredField.findMany as any).mockResolvedValue([mockRequiredField]);

      const result = await caller.requiredFields.updateAll({
        fields: [
          { fieldKey: 'email', isRequired: true },
          { fieldKey: 'phone', isRequired: true },
        ],
      });

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(result).toEqual([mockRequiredField]);
    });
  });

  describe('requiredFields.getAll', () => {
    it('seeds defaults on first call', async () => {
      (prismaMock.contactRequiredField.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockRequiredField]);
      (prismaMock.contactRequiredField.createMany as any).mockResolvedValue({ count: 5 });

      const result = await caller.requiredFields.getAll();

      expect(prismaMock.contactRequiredField.createMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('tags.create', () => {
    it('creates a tag with defaults', async () => {
      (prismaMock.contactTag.create as any).mockResolvedValue(mockTag);
      const result = await caller.tags.create({
        name: 'VIP',
        colorToken: 'amber',
        description: 'High-value',
      });
      expect(result).toEqual(mockTag);
    });

    it('maps Prisma P2002 to TRPC CONFLICT', async () => {
      (prismaMock.contactTag.create as any).mockRejectedValue({ code: 'P2002' });
      await expect(caller.tags.create({ name: 'VIP', colorToken: 'amber' })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });
  });

  describe('tags.update', () => {
    it('updates a tag', async () => {
      (prismaMock.contactTag.update as any).mockResolvedValue({ ...mockTag, name: 'VVIP' });
      const result = await caller.tags.update({ id: 'tag-1', name: 'VVIP' });
      expect(result.name).toBe('VVIP');
    });
  });

  describe('tags.delete', () => {
    it('deletes a tag by id (tenant-scoped)', async () => {
      (prismaMock.contactTag.delete as any).mockResolvedValue(mockTag);
      const result = await caller.tags.delete({ id: 'tag-1' });
      expect(result.success).toBe(true);
      expect(prismaMock.contactTag.delete).toHaveBeenCalledWith({
        where: { id: 'tag-1', tenantId },
      });
    });

    it('rejects when the tag belongs to another tenant (P2025 from Prisma)', async () => {
      (prismaMock.contactTag.delete as any).mockRejectedValue({ code: 'P2025' });
      await expect(caller.tags.delete({ id: 'tag-of-tenant-2' })).rejects.toBeTruthy();
    });
  });

  describe('tags.create — admin restriction', () => {
    it('throws FORBIDDEN for non-admin when restrictTagCreationToAdmins is on', async () => {
      (prismaMock.contactAutomationSetting.findUnique as any).mockResolvedValue({
        ...mockAutomation,
        restrictTagCreationToAdmins: true,
      });
      // default createTestContext() gives role 'USER'
      await expect(
        caller.tags.create({ name: 'Internal', colorToken: 'slate' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('allows ADMIN when restrictTagCreationToAdmins is on', async () => {
      (prismaMock.contactAutomationSetting.findUnique as any).mockResolvedValue({
        ...mockAutomation,
        restrictTagCreationToAdmins: true,
      });
      (prismaMock.contactTag.create as any).mockResolvedValue(mockTag);
      const adminCaller = contactSettingsRouter.createCaller(createAdminContext());
      const result = await adminCaller.tags.create({
        name: 'Internal',
        colorToken: 'slate',
      });
      expect(result).toEqual(mockTag);
    });
  });

  describe('duplicateRules.updateAll — Zod superRefine', () => {
    it('rejects payload with duplicate (field, matchStrategy) pairs', async () => {
      await expect(
        caller.duplicateRules.updateAll({
          rules: [
            { field: 'email', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
            { field: 'email', matchStrategy: 'exact', threshold: 50, isActive: true, sortOrder: 1 },
          ],
        })
      ).rejects.toThrow();
    });

    it('maps Prisma P2002 to CONFLICT when a race writes a colliding rule', async () => {
      (prismaMock.$transaction as any).mockRejectedValue({ code: 'P2002' });
      await expect(
        caller.duplicateRules.updateAll({
          rules: [
            { field: 'email', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
          ],
        })
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  describe('automation.resetToDefaults', () => {
    it('upserts the AI toggles back to false', async () => {
      (prismaMock.contactAutomationSetting.upsert as any).mockResolvedValue(mockAutomation);
      const result = await caller.automation.resetToDefaults();
      expect(prismaMock.contactAutomationSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          update: expect.objectContaining({
            aiDuplicateDetection: false,
            aiEnrichment: false,
            aiTagSuggestions: false,
            aiInsightGeneration: false,
            aiAutoReplyDrafting: false,
          }),
        })
      );
      expect(result).toEqual(mockAutomation);
    });
  });

  describe('tags.list', () => {
    it('lists tenant tags ordered by sortOrder then name', async () => {
      (prismaMock.contactTag.findMany as any).mockResolvedValue([mockTag]);
      const result = await caller.tags.list();
      expect(result).toEqual([mockTag]);
      expect(prismaMock.contactTag.findMany).toHaveBeenCalledWith({
        where: { tenantId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    });
  });

  describe('automation.get', () => {
    it('returns existing settings', async () => {
      (prismaMock.contactAutomationSetting.findUnique as any).mockResolvedValue(mockAutomation);
      const result = await caller.automation.get();
      expect(result).toEqual(mockAutomation);
    });

    it('seeds default row when missing', async () => {
      (prismaMock.contactAutomationSetting.findUnique as any).mockResolvedValue(null);
      (prismaMock.contactAutomationSetting.create as any).mockResolvedValue(mockAutomation);
      const result = await caller.automation.get();
      expect(prismaMock.contactAutomationSetting.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          autoMergeOnExactEmail: false,
          notifyOnDuplicate: true,
          restrictTagCreationToAdmins: false,
        }),
      });
      expect(result).toEqual(mockAutomation);
    });
  });

  describe('automation.update', () => {
    it('upserts settings for tenant', async () => {
      (prismaMock.contactAutomationSetting.upsert as any).mockResolvedValue({
        ...mockAutomation,
        autoMergeOnExactEmail: true,
        aiEnrichment: true,
      });
      const result = await caller.automation.update({
        autoMergeOnExactEmail: true,
        notifyOnDuplicate: true,
        restrictTagCreationToAdmins: false,
        normalizePhoneNumbers: true,
        autoCapitalizeNames: true,
        preventDeleteWithOpenDeals: true,
        notifyOnOwnerChange: false,
        aiDuplicateDetection: true,
        aiEnrichment: true,
        aiTagSuggestions: true,
        aiInsightGeneration: true,
        aiAutoReplyDrafting: false,
      });
      expect(result.autoMergeOnExactEmail).toBe(true);
      expect(result.aiEnrichment).toBe(true);
    });
  });
});
