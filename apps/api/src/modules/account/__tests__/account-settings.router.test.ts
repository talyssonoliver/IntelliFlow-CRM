/**
 * Account Settings Router Tests - PG-183
 *
 * Tests for account hierarchy, industry taxonomy, and custom fields
 * tRPC procedures. Follows the PG-178 leadSettingsRouter test pattern.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { accountSettingsRouter } from '../account-settings.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;

const mockHierarchy = {
  id: 'h-1',
  tenantId,
  maxDepth: 5,
  requireParentForTiers: [] as string[],
  preventCycles: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockIndustry = {
  id: 'ind-1',
  tenantId,
  label: 'Retail',
  key: 'retail',
  sortOrder: 0,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockIndustry2 = {
  ...mockIndustry,
  id: 'ind-2',
  label: 'Healthcare',
  key: 'healthcare',
  sortOrder: 1,
};

const mockField = {
  id: 'field-1',
  tenantId,
  fieldName: 'Region',
  fieldKey: 'region',
  dataType: 'text',
  options: null,
  isRequired: false,
  sortOrder: 0,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('Account Settings Router', () => {
  let caller: ReturnType<typeof accountSettingsRouter.createCaller>;

  beforeEach(() => {
    const ctx = createTestContext();
    caller = accountSettingsRouter.createCaller(ctx);
  });

  // ── hierarchy.get ──────────────────────────────────────────

  describe('hierarchy.get', () => {
    it('creates and returns defaults when none exist', async () => {
      (prismaMock.accountHierarchyConfig.findUnique as any).mockResolvedValueOnce(null);
      (prismaMock.accountHierarchyConfig.create as any).mockResolvedValueOnce(mockHierarchy);

      const result = await caller.hierarchy.get();

      expect(prismaMock.accountHierarchyConfig.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          maxDepth: 5,
          preventCycles: true,
        }),
      });
      expect(result).toEqual(mockHierarchy);
    });

    it('returns existing config without creating', async () => {
      (prismaMock.accountHierarchyConfig.findUnique as any).mockResolvedValueOnce(mockHierarchy);

      const result = await caller.hierarchy.get();

      expect(prismaMock.accountHierarchyConfig.create).not.toHaveBeenCalled();
      expect(result).toEqual(mockHierarchy);
    });
  });

  // ── hierarchy.update ───────────────────────────────────────

  describe('hierarchy.update', () => {
    it('upserts new config values', async () => {
      (prismaMock.accountHierarchyConfig.upsert as any).mockResolvedValueOnce({
        ...mockHierarchy,
        maxDepth: 7,
        requireParentForTiers: ['enterprise'],
      });

      const result = await caller.hierarchy.update({
        maxDepth: 7,
        requireParentForTiers: ['enterprise'],
        preventCycles: true,
      });

      expect(prismaMock.accountHierarchyConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          create: expect.objectContaining({ tenantId, maxDepth: 7 }),
          update: expect.objectContaining({ maxDepth: 7 }),
        })
      );
      expect(result.maxDepth).toBe(7);
    });

    it('rejects maxDepth below 1', async () => {
      await expect(
        caller.hierarchy.update({
          maxDepth: 0,
          requireParentForTiers: [],
          preventCycles: true,
        })
      ).rejects.toThrow();
    });

    it('rejects maxDepth above 10', async () => {
      await expect(
        caller.hierarchy.update({
          maxDepth: 11,
          requireParentForTiers: [],
          preventCycles: true,
        })
      ).rejects.toThrow();
    });
  });

  // ── hierarchy.resetToDefaults ──────────────────────────────

  describe('hierarchy.resetToDefaults', () => {
    it('upserts defaults', async () => {
      (prismaMock.accountHierarchyConfig.upsert as any).mockResolvedValueOnce(mockHierarchy);

      const result = await caller.hierarchy.resetToDefaults();

      expect(prismaMock.accountHierarchyConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          create: expect.objectContaining({ maxDepth: 5, preventCycles: true }),
          update: expect.objectContaining({ maxDepth: 5 }),
        })
      );
      expect(result).toEqual(mockHierarchy);
    });
  });

  // ── industry.list ──────────────────────────────────────────

  describe('industry.list', () => {
    it('returns all industries ordered by sortOrder', async () => {
      (prismaMock.accountIndustryOption.findMany as any).mockResolvedValueOnce([
        mockIndustry,
        mockIndustry2,
      ]);

      const result = await caller.industry.list();

      expect(prismaMock.accountIndustryOption.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          orderBy: { sortOrder: 'asc' },
        })
      );
      expect(result).toHaveLength(2);
    });
  });

  // ── industry.create ────────────────────────────────────────

  describe('industry.create', () => {
    it('auto-generates key and appends to end', async () => {
      (prismaMock.accountIndustryOption.findUnique as any).mockResolvedValueOnce(null);
      (prismaMock.accountIndustryOption.aggregate as any).mockResolvedValueOnce({
        _max: { sortOrder: 4 },
      });
      (prismaMock.accountIndustryOption.create as any).mockResolvedValueOnce({
        ...mockIndustry,
        label: 'Software & SaaS',
        key: 'software_saas',
        sortOrder: 5,
      });

      const result = await caller.industry.create({ label: 'Software & SaaS' });

      expect(prismaMock.accountIndustryOption.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            key: 'software_saas',
            label: 'Software & SaaS',
            sortOrder: 5,
          }),
        })
      );
      expect(result.key).toBe('software_saas');
    });

    it('throws CONFLICT when key already exists', async () => {
      (prismaMock.accountIndustryOption.findUnique as any).mockResolvedValueOnce(mockIndustry);

      await expect(caller.industry.create({ label: 'Retail' })).rejects.toThrow(/already exists/i);
    });

    it('rejects label that normalises to empty key', async () => {
      await expect(caller.industry.create({ label: '???' })).rejects.toThrow(/alphanumeric/i);
    });
  });

  // ── industry.update ────────────────────────────────────────

  describe('industry.update', () => {
    it('updates label without changing key', async () => {
      (prismaMock.accountIndustryOption.findFirst as any).mockResolvedValueOnce(mockIndustry);
      (prismaMock.accountIndustryOption.update as any).mockResolvedValueOnce({
        ...mockIndustry,
        label: 'Retail & E-Commerce',
      });

      const result = await caller.industry.update({
        id: mockIndustry.id,
        label: 'Retail & E-Commerce',
      });

      expect(prismaMock.accountIndustryOption.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockIndustry.id },
          data: { label: 'Retail & E-Commerce' },
        })
      );
      expect(result.label).toBe('Retail & E-Commerce');
    });

    it('NOT_FOUND when industry missing', async () => {
      (prismaMock.accountIndustryOption.findFirst as any).mockResolvedValueOnce(null);
      await expect(caller.industry.update({ id: 'nope', label: 'x' })).rejects.toThrow(
        /not found/i
      );
    });
  });

  // ── industry.delete ────────────────────────────────────────

  describe('industry.delete', () => {
    it('soft-deletes when referenced by an account', async () => {
      (prismaMock.accountIndustryOption.findFirst as any).mockResolvedValueOnce(mockIndustry);
      (prismaMock.account.count as any).mockResolvedValueOnce(3);
      (prismaMock.accountIndustryOption.update as any).mockResolvedValueOnce({
        ...mockIndustry,
        isActive: false,
      });

      const result = await caller.industry.delete({ id: mockIndustry.id });

      expect(prismaMock.accountIndustryOption.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockIndustry.id },
          data: { isActive: false },
        })
      );
      expect(result.softDeleted).toBe(true);
    });

    it('hard-deletes when unreferenced', async () => {
      (prismaMock.accountIndustryOption.findFirst as any).mockResolvedValueOnce(mockIndustry);
      (prismaMock.account.count as any).mockResolvedValueOnce(0);
      (prismaMock.accountIndustryOption.delete as any).mockResolvedValueOnce(mockIndustry);

      const result = await caller.industry.delete({ id: mockIndustry.id });

      expect(prismaMock.accountIndustryOption.delete).toHaveBeenCalledWith({
        where: { id: mockIndustry.id },
      });
      expect(result.softDeleted).toBe(false);
    });

    it('NOT_FOUND when missing', async () => {
      (prismaMock.accountIndustryOption.findFirst as any).mockResolvedValueOnce(null);
      await expect(caller.industry.delete({ id: 'nope' })).rejects.toThrow(/not found/i);
    });
  });

  // ── industry.resetToDefaults ────────────────────────────────

  describe('industry.resetToDefaults', () => {
    it('runs the seed transaction and returns canonical list', async () => {
      const txMock = {
        accountIndustryOption: {
          upsert: vi.fn().mockResolvedValue(mockIndustry),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findMany: vi.fn().mockResolvedValue([mockIndustry]),
        },
      };
      (prismaMock.$transaction as any).mockImplementationOnce(async (fn: any) => fn(txMock));

      const result = await caller.industry.resetToDefaults();

      // 12 upserts (one per canonical industry)
      expect(txMock.accountIndustryOption.upsert).toHaveBeenCalledTimes(12);
      // Deactivates non-canonical entries once
      expect(txMock.accountIndustryOption.updateMany).toHaveBeenCalledTimes(1);
      expect(txMock.accountIndustryOption.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { sortOrder: 'asc' } })
      );
      expect(result).toEqual([mockIndustry]);
    });
  });

  // ── customFields.list ──────────────────────────────────────

  describe('customFields.list', () => {
    it('lists active fields by sortOrder', async () => {
      (prismaMock.accountCustomField.findMany as any).mockResolvedValueOnce([mockField]);
      const result = await caller.customFields.list();
      expect(prismaMock.accountCustomField.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId, isActive: true },
          orderBy: { sortOrder: 'asc' },
        })
      );
      expect(result).toHaveLength(1);
    });
  });

  // ── customFields.create ────────────────────────────────────

  describe('customFields.create', () => {
    it('auto-generates key and appends', async () => {
      (prismaMock.accountCustomField.findUnique as any).mockResolvedValueOnce(null);
      (prismaMock.accountCustomField.aggregate as any).mockResolvedValueOnce({
        _max: { sortOrder: 0 },
      });
      (prismaMock.accountCustomField.create as any).mockResolvedValueOnce({
        ...mockField,
        fieldName: 'Segment Code',
        fieldKey: 'segment_code',
        sortOrder: 1,
      });

      const result = await caller.customFields.create({
        fieldName: 'Segment Code',
        dataType: 'text',
      });

      expect(prismaMock.accountCustomField.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fieldName: 'Segment Code',
            fieldKey: 'segment_code',
            sortOrder: 1,
          }),
        })
      );
      expect(result.fieldKey).toBe('segment_code');
    });

    it('rejects duplicate key with CONFLICT', async () => {
      (prismaMock.accountCustomField.findUnique as any).mockResolvedValueOnce(mockField);
      await expect(
        caller.customFields.create({ fieldName: 'Region', dataType: 'text' })
      ).rejects.toThrow(/already exists/i);
    });

    it('rejects field name that normalises to empty key', async () => {
      await expect(
        caller.customFields.create({ fieldName: '???', dataType: 'text' })
      ).rejects.toThrow(/alphanumeric/i);
    });
  });

  // ── customFields.update ────────────────────────────────────

  describe('customFields.update', () => {
    it('updates existing field', async () => {
      (prismaMock.accountCustomField.findFirst as any).mockResolvedValueOnce(mockField);
      (prismaMock.accountCustomField.update as any).mockResolvedValueOnce({
        ...mockField,
        fieldName: 'Region Code',
      });

      const result = await caller.customFields.update({
        id: mockField.id,
        fieldName: 'Region Code',
        dataType: 'text',
      });

      expect(result.fieldName).toBe('Region Code');
    });

    it('NOT_FOUND when missing', async () => {
      (prismaMock.accountCustomField.findFirst as any).mockResolvedValueOnce(null);
      await expect(
        caller.customFields.update({ id: 'nope', fieldName: 'X', dataType: 'text' })
      ).rejects.toThrow(/not found/i);
    });
  });

  // ── duplicateRules ─────────────────────────────────────────

  describe('duplicateRules.getAll', () => {
    it('seeds defaults when none exist', async () => {
      (prismaMock.accountDuplicateRule.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'd-1', field: 'website', matchStrategy: 'normalized' }]);
      (prismaMock.accountDuplicateRule.createMany as any).mockResolvedValue({ count: 3 });

      const result = await caller.duplicateRules.getAll();
      expect(prismaMock.accountDuplicateRule.createMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('returns existing rules without seeding', async () => {
      (prismaMock.accountDuplicateRule.findMany as any).mockResolvedValueOnce([
        { id: 'd-1' },
      ]);
      await caller.duplicateRules.getAll();
      expect(prismaMock.accountDuplicateRule.createMany).not.toHaveBeenCalled();
    });
  });

  describe('duplicateRules.updateAll', () => {
    it('deletes + recreates rules inside a transaction', async () => {
      const txMock = {
        accountDuplicateRule: {
          deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
          findMany: vi.fn().mockResolvedValue([{ id: 'd-new' }]),
        },
      };
      (prismaMock.$transaction as any).mockImplementationOnce(async (fn: any) => fn(txMock));

      const result = await caller.duplicateRules.updateAll({
        rules: [
          { field: 'name', matchStrategy: 'fuzzy', threshold: 85, isActive: true, sortOrder: 0 },
        ],
      });

      expect(txMock.accountDuplicateRule.deleteMany).toHaveBeenCalled();
      expect(txMock.accountDuplicateRule.createMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('duplicateRules.resetToDefaults', () => {
    it('seeds canonical defaults', async () => {
      const txMock = {
        accountDuplicateRule: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          createMany: vi.fn().mockResolvedValue({ count: 3 }),
          findMany: vi.fn().mockResolvedValue([]),
        },
      };
      (prismaMock.$transaction as any).mockImplementationOnce(async (fn: any) => fn(txMock));
      await caller.duplicateRules.resetToDefaults();
      expect(txMock.accountDuplicateRule.createMany).toHaveBeenCalled();
    });
  });

  // ── requiredFields ─────────────────────────────────────────

  describe('requiredFields.getAll', () => {
    it('seeds defaults when none exist', async () => {
      (prismaMock.accountRequiredField.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ fieldKey: 'name', isRequired: true }]);
      (prismaMock.accountRequiredField.createMany as any).mockResolvedValue({ count: 6 });

      const result = await caller.requiredFields.getAll();
      expect(prismaMock.accountRequiredField.createMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('returns existing without seeding', async () => {
      (prismaMock.accountRequiredField.findMany as any).mockResolvedValueOnce([{ fieldKey: 'name' }]);
      await caller.requiredFields.getAll();
      expect(prismaMock.accountRequiredField.createMany).not.toHaveBeenCalled();
    });
  });

  describe('requiredFields.updateAll', () => {
    it('upserts each field (name stays required)', async () => {
      const txMock = {
        accountRequiredField: {
          upsert: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([]),
        },
      };
      (prismaMock.$transaction as any).mockImplementationOnce(async (fn: any) => fn(txMock));

      await caller.requiredFields.updateAll({
        fields: [
          { fieldKey: 'name', isRequired: true },
          { fieldKey: 'industry', isRequired: true },
          { fieldKey: 'website', isRequired: false },
          { fieldKey: 'ownerId', isRequired: true },
          { fieldKey: 'employees', isRequired: false },
          { fieldKey: 'revenue', isRequired: false },
        ],
      });
      expect(txMock.accountRequiredField.upsert).toHaveBeenCalledTimes(6);
    });

    it('rejects when name is not required', async () => {
      await expect(
        caller.requiredFields.updateAll({
          fields: [{ fieldKey: 'name', isRequired: false }],
        })
      ).rejects.toThrow();
    });
  });

  describe('requiredFields.resetToDefaults', () => {
    it('deletes + reseeds defaults', async () => {
      const txMock = {
        accountRequiredField: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          createMany: vi.fn().mockResolvedValue({ count: 6 }),
          findMany: vi.fn().mockResolvedValue([]),
        },
      };
      (prismaMock.$transaction as any).mockImplementationOnce(async (fn: any) => fn(txMock));
      await caller.requiredFields.resetToDefaults();
      expect(txMock.accountRequiredField.createMany).toHaveBeenCalled();
    });
  });

  // ── tags ───────────────────────────────────────────────────

  describe('tags.list', () => {
    it('returns active tags', async () => {
      (prismaMock.accountTag.findMany as any).mockResolvedValueOnce([{ id: 't-1' }]);
      const result = await caller.tags.list();
      expect(result).toHaveLength(1);
    });
  });

  describe('tags.create', () => {
    it('throws CONFLICT when name exists', async () => {
      (prismaMock.accountTag.findUnique as any).mockResolvedValueOnce({ id: 't-1' });
      await expect(caller.tags.create({ name: 'Strategic', colorToken: 'slate' })).rejects.toThrow(
        /already exists/i
      );
    });

    it('auto-assigns sortOrder when omitted', async () => {
      (prismaMock.accountTag.findUnique as any).mockResolvedValueOnce(null);
      (prismaMock.accountTag.aggregate as any).mockResolvedValueOnce({ _max: { sortOrder: 2 } });
      (prismaMock.accountTag.create as any).mockResolvedValueOnce({ id: 't-new', sortOrder: 3 });
      const result = await caller.tags.create({ name: 'Strategic', colorToken: 'slate' });
      expect(result.sortOrder).toBe(3);
    });
  });

  describe('tags.update', () => {
    it('updates existing tag', async () => {
      (prismaMock.accountTag.findFirst as any).mockResolvedValueOnce({ id: 't-1' });
      (prismaMock.accountTag.update as any).mockResolvedValueOnce({ id: 't-1', name: 'New' });
      const result = await caller.tags.update({ id: 't-1', name: 'New' });
      expect(result.name).toBe('New');
    });
    it('NOT_FOUND when missing', async () => {
      (prismaMock.accountTag.findFirst as any).mockResolvedValueOnce(null);
      await expect(caller.tags.update({ id: 'nope', name: 'X' })).rejects.toThrow(/not found/i);
    });
  });

  describe('tags.delete', () => {
    it('soft-deletes via isActive:false', async () => {
      (prismaMock.accountTag.findFirst as any).mockResolvedValueOnce({ id: 't-1' });
      (prismaMock.accountTag.update as any).mockResolvedValueOnce({ id: 't-1', isActive: false });
      const result = await caller.tags.delete({ id: 't-1' });
      expect(result.isActive).toBe(false);
    });
    it('NOT_FOUND when missing', async () => {
      (prismaMock.accountTag.findFirst as any).mockResolvedValueOnce(null);
      await expect(caller.tags.delete({ id: 'nope' })).rejects.toThrow(/not found/i);
    });
  });

  // ── automation ─────────────────────────────────────────────

  describe('automation.get', () => {
    it('creates defaults when none exist', async () => {
      (prismaMock.accountAutomationSetting.findUnique as any).mockResolvedValueOnce(null);
      (prismaMock.accountAutomationSetting.create as any).mockResolvedValueOnce({
        autoAssignOwner: false,
        aiIndustryInference: true,
      });
      const result = await caller.automation.get();
      expect(prismaMock.accountAutomationSetting.create).toHaveBeenCalled();
      expect(result.aiIndustryInference).toBe(true);
    });

    it('returns existing when present', async () => {
      (prismaMock.accountAutomationSetting.findUnique as any).mockResolvedValueOnce({
        id: 'a-1',
        autoAssignOwner: true,
      });
      const result = await caller.automation.get();
      expect(prismaMock.accountAutomationSetting.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'a-1', autoAssignOwner: true });
    });
  });

  describe('automation.update', () => {
    it('upserts automation config', async () => {
      (prismaMock.accountAutomationSetting.upsert as any).mockResolvedValueOnce({
        autoAssignOwner: true,
        aiAccountScoring: true,
      });
      const input = {
        autoAssignOwner: true,
        autoLinkContactsByDomain: true,
        preventDeleteWithOpenOpportunities: true,
        notifyOnOwnerChange: false,
        normalizeWebsiteDomain: true,
        autoCapitalizeAccountNames: true,
        notifyOnDuplicate: true,
        restrictTagCreationToAdmins: false,
        aiIndustryInference: true,
        aiEnrichment: false,
        aiTagSuggestions: true,
        aiInsightGeneration: true,
        aiAccountScoring: true,
      };
      const result = await caller.automation.update(input);
      expect(result.autoAssignOwner).toBe(true);
    });
  });

  // ── customFields.delete ────────────────────────────────────

  describe('customFields.delete', () => {
    it('soft-deletes via isActive:false', async () => {
      (prismaMock.accountCustomField.findFirst as any).mockResolvedValueOnce(mockField);
      (prismaMock.accountCustomField.update as any).mockResolvedValueOnce({
        ...mockField,
        isActive: false,
      });

      const result = await caller.customFields.delete({ id: mockField.id });

      expect(prismaMock.accountCustomField.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockField.id },
          data: { isActive: false },
        })
      );
      expect(result.isActive).toBe(false);
    });

    it('NOT_FOUND when missing', async () => {
      (prismaMock.accountCustomField.findFirst as any).mockResolvedValueOnce(null);
      await expect(caller.customFields.delete({ id: 'nope' })).rejects.toThrow(/not found/i);
    });
  });
});
