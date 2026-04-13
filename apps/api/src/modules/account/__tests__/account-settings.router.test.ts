/**
 * Account Settings Router Tests - PG-183
 *
 * Tests for account hierarchy, industry taxonomy, and custom fields
 * tRPC procedures. Follows the PG-178 leadSettingsRouter test pattern.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
