/**
 * Document Settings Router Tests - PG-186
 *
 * Tests for documentSettingsRouter procedures:
 * general, duplicateRules, requiredFields, tags, automation, retentionPolicies
 *
 * Follows the PG-183 accountSettingsRouter test pattern.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { documentSettingsRouter } from '../document-settings.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;
const now = new Date('2024-01-01');

const mockGeneralConfig = {
  id: 'gen-1',
  tenantId,
  allowedMimeTypes: [] as string[],
  maxUploadSizeMb: 50,
  defaultRetentionDays: 365,
  enableAntivirusScan: true,
  quarantineOnDetect: true,
  blockOnScanFailure: true,
  createdAt: now,
  updatedAt: now,
};

const mockRule1 = {
  id: 'rule-1',
  tenantId,
  field: 'content_hash',
  matchStrategy: 'exact',
  collisionAction: 'warn',
  isActive: true,
  sortOrder: 0,
  createdAt: now,
  updatedAt: now,
};

const mockRule2 = {
  id: 'rule-2',
  tenantId,
  field: 'filename_normalized',
  matchStrategy: 'normalized',
  collisionAction: 'warn',
  isActive: true,
  sortOrder: 1,
  createdAt: now,
  updatedAt: now,
};

const mockRequiredField = {
  id: 'rf-1',
  tenantId,
  fieldKey: 'title',
  isRequired: true,
  createdAt: now,
  updatedAt: now,
};

const mockTag = {
  id: 'tag-1',
  tenantId,
  name: 'Contract',
  colorToken: 'teal',
  description: null,
  sortOrder: 0,
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

const mockDocumentType = {
  id: 'dtype-1',
  tenantId,
  name: 'Deposition Transcript',
  description: 'Custom litigation document type',
  sortOrder: 0,
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

const mockAutomation = {
  id: 'auto-1',
  tenantId,
  normalizeFilename: true,
  preventDeleteIfReferenced: true,
  notifyOnOwnerChange: false,
  restrictTagCreationToAdmins: false,
  notifyOnDuplicate: true,
  autoVersionOnCollision: false,
  autoDetectDuplicates: false,
  autoExtractText: false,
  autoClassifyCategory: false,
  autoDetectPii: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
  createdAt: now,
  updatedAt: now,
};

const mockRetentionPolicy = {
  id: 'ret-1',
  tenantId,
  categoryKey: 'default',
  retentionDays: 365,
  autoArchive: false,
  legalHoldOverride: false,
  createdAt: now,
  updatedAt: now,
};

// Mock document-automation to avoid real DB calls in automation helpers
vi.mock('../document-automation', () => ({
  loadDocumentAutomation: vi.fn().mockResolvedValue({
    normalizeFilename: true,
    preventDeleteIfReferenced: true,
    notifyOnOwnerChange: false,
    restrictTagCreationToAdmins: false,
    notifyOnDuplicate: true,
    autoVersionOnCollision: false,
    autoDetectDuplicates: false,
    autoExtractText: false,
    autoClassifyCategory: false,
    autoDetectPii: false,
    aiTagSuggestions: false,
    aiInsightGeneration: false,
  }),
  assertCanCreateDocumentTag: vi.fn(),
  AUTOMATION_FACTORY_DEFAULTS: {
    normalizeFilename: true,
    preventDeleteIfReferenced: true,
    notifyOnOwnerChange: false,
    restrictTagCreationToAdmins: false,
    notifyOnDuplicate: true,
    autoVersionOnCollision: false,
    autoDetectDuplicates: false,
    autoExtractText: false,
    autoClassifyCategory: false,
    autoDetectPii: false,
    aiTagSuggestions: false,
    aiInsightGeneration: false,
  },
}));

describe('Document Settings Router', () => {
  let caller: ReturnType<typeof documentSettingsRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    const ctx = createTestContext();
    caller = documentSettingsRouter.createCaller(ctx);

    // Default stubs to keep automation helpers quiet
    (prismaMock.documentAutomationSetting as any).findUnique = vi.fn().mockResolvedValue(null);
    (prismaMock.documentRequiredField as any).findMany = vi.fn().mockResolvedValue([]);
  });

  // ─── general sub-router ─────────────────────────────────────────────────────

  describe('general.get', () => {
    it('seeds defaults when no row exists', async () => {
      (prismaMock.documentGeneralConfig as any).findUnique = vi.fn().mockResolvedValue(null);
      (prismaMock.documentGeneralConfig as any).create = vi
        .fn()
        .mockResolvedValue(mockGeneralConfig);

      const result = await caller.general.get();

      expect(prismaMock.documentGeneralConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId }) })
      );
      expect(result).toEqual(mockGeneralConfig);
    });

    it('returns existing row', async () => {
      (prismaMock.documentGeneralConfig as any).findUnique = vi
        .fn()
        .mockResolvedValue(mockGeneralConfig);

      const result = await caller.general.get();

      expect(prismaMock.documentGeneralConfig.create).not.toHaveBeenCalled();
      expect(result).toEqual(mockGeneralConfig);
    });
  });

  describe('general.update', () => {
    it('upserts general config', async () => {
      (prismaMock.documentGeneralConfig as any).upsert = vi
        .fn()
        .mockResolvedValue(mockGeneralConfig);

      const result = await caller.general.update({
        allowedMimeTypes: ['application/pdf'],
        maxUploadSizeMb: 50,
        defaultRetentionDays: 365,
        enableAntivirusScan: true,
        quarantineOnDetect: true,
        blockOnScanFailure: true,
      });

      expect(prismaMock.documentGeneralConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } })
      );
      expect(result).toEqual(mockGeneralConfig);
    });
  });

  describe('general.resetToDefaults', () => {
    it('restores factory defaults', async () => {
      (prismaMock.documentGeneralConfig as any).upsert = vi
        .fn()
        .mockResolvedValue(mockGeneralConfig);

      const result = await caller.general.resetToDefaults();

      expect(prismaMock.documentGeneralConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          update: expect.objectContaining({ maxUploadSizeMb: 50 }),
        })
      );
      expect(result).toEqual(mockGeneralConfig);
    });
  });

  // ─── duplicateRules sub-router ──────────────────────────────────────────────

  describe('duplicateRules.getAll', () => {
    it('returns all rules ordered by sortOrder', async () => {
      (prismaMock.documentDuplicateRule as any).findMany = vi
        .fn()
        .mockResolvedValue([mockRule1, mockRule2]);

      const result = await caller.duplicateRules.getAll();

      expect(result).toHaveLength(2);
      expect(result[0].field).toBe('content_hash');
    });

    it('seeds canonical defaults inside $transaction when no rows exist (first-load)', async () => {
      const txMock: Record<string, any> = {
        documentDuplicateRule: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };
      const findManyMock = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockRule1, mockRule2]);
      (prismaMock.documentDuplicateRule as any).findMany = findManyMock;
      (prismaMock.$transaction as any) = vi
        .fn()
        .mockImplementation(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));

      const result = await caller.duplicateRules.getAll();

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(txMock.documentDuplicateRule.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ field: 'content_hash', matchStrategy: 'exact' }),
            expect.objectContaining({ field: 'filename_normalized', matchStrategy: 'normalized' }),
          ]),
        })
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('duplicateRules.updateAll', () => {
    it('runs inside $transaction (delete-then-createMany)', async () => {
      const txMock: Record<string, any> = {
        documentDuplicateRule: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };
      (prismaMock.$transaction as any) = vi
        .fn()
        .mockImplementation(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));
      (prismaMock.documentDuplicateRule as any).findMany = vi
        .fn()
        .mockResolvedValue([mockRule1, mockRule2]);

      await caller.duplicateRules.updateAll({
        rules: [
          {
            field: 'content_hash',
            matchStrategy: 'exact',
            collisionAction: 'warn',
            isActive: true,
            sortOrder: 0,
          },
          {
            field: 'filename_normalized',
            matchStrategy: 'normalized',
            collisionAction: 'warn',
            isActive: true,
            sortOrder: 1,
          },
        ],
      });

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(txMock.documentDuplicateRule.deleteMany).toHaveBeenCalledWith({ where: { tenantId } });
      expect(txMock.documentDuplicateRule.createMany).toHaveBeenCalled();
    });

    it('rejects duplicate (field, matchStrategy) pair at validator level', async () => {
      await expect(
        caller.duplicateRules.updateAll({
          rules: [
            {
              field: 'content_hash',
              matchStrategy: 'exact',
              collisionAction: 'warn',
              isActive: true,
              sortOrder: 0,
            },
            {
              field: 'content_hash',
              matchStrategy: 'exact',
              collisionAction: 'warn',
              isActive: true,
              sortOrder: 1,
            },
          ],
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('duplicateRules.resetToDefaults', () => {
    it('seeds 2 canonical default rules inside $transaction', async () => {
      const txMock: Record<string, any> = {
        documentDuplicateRule: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };
      (prismaMock.$transaction as any) = vi
        .fn()
        .mockImplementation(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));
      (prismaMock.documentDuplicateRule as any).findMany = vi
        .fn()
        .mockResolvedValue([mockRule1, mockRule2]);

      await caller.duplicateRules.resetToDefaults();

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(txMock.documentDuplicateRule.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ field: 'content_hash', matchStrategy: 'exact' }),
          ]),
        })
      );
    });
  });

  // ─── requiredFields sub-router ──────────────────────────────────────────────

  describe('requiredFields.getAll', () => {
    it('returns all field configs', async () => {
      (prismaMock.documentRequiredField as any).findMany = vi
        .fn()
        .mockResolvedValue([mockRequiredField]);

      const result = await caller.requiredFields.getAll();

      expect(result).toHaveLength(1);
      expect(result[0].fieldKey).toBe('title');
    });

    it('seeds 5 default required fields inside $transaction when none exist (first-load)', async () => {
      const txMock: Record<string, any> = {
        documentRequiredField: {
          upsert: vi.fn().mockResolvedValue(mockRequiredField),
        },
      };
      const findManyMock = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          mockRequiredField,
          { ...mockRequiredField, fieldKey: 'description', isRequired: false },
          { ...mockRequiredField, fieldKey: 'category', isRequired: false },
          { ...mockRequiredField, fieldKey: 'tags', isRequired: false },
          { ...mockRequiredField, fieldKey: 'expiresAt', isRequired: false },
        ]);
      (prismaMock.documentRequiredField as any).findMany = findManyMock;
      (prismaMock.$transaction as any) = vi
        .fn()
        .mockImplementation(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));

      const result = await caller.requiredFields.getAll();

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(txMock.documentRequiredField.upsert).toHaveBeenCalledTimes(5);
      expect(result).toHaveLength(5);
    });
  });

  describe('requiredFields.updateAll', () => {
    it('runs inside $transaction (upsert per field)', async () => {
      const txMock: Record<string, any> = {
        documentRequiredField: {
          upsert: vi.fn().mockResolvedValue(mockRequiredField),
        },
      };
      (prismaMock.$transaction as any) = vi
        .fn()
        .mockImplementation(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));

      await caller.requiredFields.updateAll({
        fields: [
          { fieldKey: 'title', isRequired: true },
          { fieldKey: 'description', isRequired: false },
        ],
      });

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(txMock.documentRequiredField.upsert).toHaveBeenCalled();
    });
  });

  describe('requiredFields.resetToDefaults', () => {
    it('seeds defaults inside $transaction', async () => {
      const txMock: Record<string, any> = {
        documentRequiredField: {
          upsert: vi.fn().mockResolvedValue(mockRequiredField),
        },
      };
      (prismaMock.$transaction as any) = vi
        .fn()
        .mockImplementation(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));

      await caller.requiredFields.resetToDefaults();

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(txMock.documentRequiredField.upsert).toHaveBeenCalled();
    });
  });

  // ─── tags sub-router ────────────────────────────────────────────────────────

  describe('tags.list', () => {
    it('returns active tags ordered by sortOrder', async () => {
      (prismaMock.documentTag as any).findMany = vi.fn().mockResolvedValue([mockTag]);

      const result = await caller.tags.list();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Contract');
    });
  });

  describe('tags.create', () => {
    it('enforces restrictTagCreationToAdmins — FORBIDDEN for non-admin', async () => {
      const { assertCanCreateDocumentTag } =
        (await import('../document-automation.js')) as typeof import('../document-automation');
      (assertCanCreateDocumentTag as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admins only' });
      });

      await expect(caller.tags.create({ name: 'NewTag', colorToken: 'teal' })).rejects.toThrow(
        TRPCError
      );
    });

    it('succeeds for ADMIN caller', async () => {
      (prismaMock.documentTag as any).create = vi.fn().mockResolvedValue(mockTag);

      const result = await caller.tags.create({ name: 'Contract', colorToken: 'teal' });

      expect(result).toEqual(mockTag);
    });
  });

  describe('tags.delete', () => {
    it('soft-deletes when at least one document still references the tag', async () => {
      (prismaMock.documentTag as any).findFirst = vi.fn().mockResolvedValue(mockTag);

      const txMock: Record<string, any> = {
        caseDocument: {
          count: vi.fn().mockResolvedValue(3),
        },
        documentTag: {
          update: vi.fn().mockResolvedValue({ ...mockTag, isActive: false }),
          delete: vi.fn(),
        },
      };
      (prismaMock.$transaction as any) = vi
        .fn()
        .mockImplementation(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));

      const result = await caller.tags.delete({ id: 'tag-1' });

      expect(txMock.caseDocument.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId, tags: { has: mockTag.name } }),
        })
      );
      expect(txMock.documentTag.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'tag-1' }),
          data: expect.objectContaining({ isActive: false }),
        })
      );
      expect(txMock.documentTag.delete).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          softDeleted: true,
          tag: expect.objectContaining({ id: 'tag-1', isActive: false }),
        })
      );
    });

    it('hard-deletes when no document references the tag', async () => {
      (prismaMock.documentTag as any).findFirst = vi.fn().mockResolvedValue(mockTag);

      const txMock: Record<string, any> = {
        caseDocument: {
          count: vi.fn().mockResolvedValue(0),
        },
        documentTag: {
          update: vi.fn(),
          delete: vi.fn().mockResolvedValue(mockTag),
        },
      };
      (prismaMock.$transaction as any) = vi
        .fn()
        .mockImplementation(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));

      const result = await caller.tags.delete({ id: 'tag-1' });

      expect(txMock.documentTag.delete).toHaveBeenCalledWith({ where: { id: 'tag-1' } });
      expect(txMock.documentTag.update).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          softDeleted: false,
          tag: expect.objectContaining({ id: 'tag-1' }),
        })
      );
    });

    it('cross-tenant: foreign tenantId → NOT_FOUND', async () => {
      (prismaMock.documentTag as any).findFirst = vi.fn().mockResolvedValue(null);

      await expect(caller.tags.delete({ id: 'foreign-tag' })).rejects.toThrow(TRPCError);
    });
  });

  // ─── documentTypes sub-router ──────────────────────────────────────────────

  describe('documentTypes.list', () => {
    it('returns active custom document types ordered by sortOrder', async () => {
      (prismaMock.documentTypeDefinition as any).findMany = vi
        .fn()
        .mockResolvedValue([mockDocumentType]);

      const result = await caller.documentTypes.list();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Deposition Transcript');
    });
  });

  describe('documentTypes.create', () => {
    it('creates a tenant-scoped custom document type', async () => {
      (prismaMock.documentTypeDefinition as any).create = vi
        .fn()
        .mockResolvedValue(mockDocumentType);

      const result = await caller.documentTypes.create({
        name: 'Deposition Transcript',
        description: 'Custom litigation document type',
      });

      expect(prismaMock.documentTypeDefinition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId, name: 'Deposition Transcript' }),
        })
      );
      expect(result).toEqual(mockDocumentType);
    });
  });

  describe('documentTypes.update', () => {
    it('updates a custom document type when found', async () => {
      const updatedType = { ...mockDocumentType, name: 'Transcript' };
      (prismaMock.documentTypeDefinition as any).findFirst = vi
        .fn()
        .mockResolvedValue(mockDocumentType);
      (prismaMock.documentTypeDefinition as any).update = vi.fn().mockResolvedValue(updatedType);

      const result = await caller.documentTypes.update({
        id: mockDocumentType.id,
        name: 'Transcript',
      });

      expect(prismaMock.documentTypeDefinition.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: mockDocumentType.id, tenantId }),
        })
      );
      expect(result.name).toBe('Transcript');
    });

    it('throws NOT_FOUND for a foreign tenant document type', async () => {
      (prismaMock.documentTypeDefinition as any).findFirst = vi.fn().mockResolvedValue(null);

      await expect(
        caller.documentTypes.update({ id: 'missing-type', name: 'Transcript' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('documentTypes.delete', () => {
    it('soft-deletes a custom document type', async () => {
      (prismaMock.documentTypeDefinition as any).findFirst = vi
        .fn()
        .mockResolvedValue(mockDocumentType);
      (prismaMock.documentTypeDefinition as any).update = vi
        .fn()
        .mockResolvedValue({ ...mockDocumentType, isActive: false });

      const result = await caller.documentTypes.delete({ id: mockDocumentType.id });

      expect(prismaMock.documentTypeDefinition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockDocumentType.id },
          data: expect.objectContaining({ isActive: false }),
        })
      );
      expect(result.isActive).toBe(false);
    });
  });

  // ─── automation sub-router ──────────────────────────────────────────────────

  describe('automation.get', () => {
    it('seeds defaults when no row exists', async () => {
      (prismaMock.documentAutomationSetting as any).findUnique = vi.fn().mockResolvedValue(null);
      (prismaMock.documentAutomationSetting as any).create = vi
        .fn()
        .mockResolvedValue(mockAutomation);

      const result = await caller.automation.get();

      expect(result).toBeDefined();
      expect(result.normalizeFilename).toBeDefined();
    });
  });

  describe('automation.update', () => {
    it('upserts automation settings', async () => {
      (prismaMock.documentAutomationSetting as any).upsert = vi
        .fn()
        .mockResolvedValue(mockAutomation);

      const result = await caller.automation.update({
        normalizeFilename: true,
        preventDeleteIfReferenced: true,
        notifyOnOwnerChange: false,
        restrictTagCreationToAdmins: false,
        notifyOnDuplicate: true,
        autoVersionOnCollision: false,
        autoDetectDuplicates: false,
        autoExtractText: false,
        autoClassifyCategory: false,
        autoDetectPii: false,
        aiTagSuggestions: false,
        aiInsightGeneration: false,
      });

      expect(prismaMock.documentAutomationSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } })
      );
      expect(result).toEqual(mockAutomation);
    });
  });

  // ─── retentionPolicies sub-router ───────────────────────────────────────────

  describe('retentionPolicies.getAll', () => {
    it('returns all policies for tenant', async () => {
      (prismaMock.documentRetentionPolicy as any).findMany = vi
        .fn()
        .mockResolvedValue([mockRetentionPolicy]);

      const result = await caller.retentionPolicies.getAll();

      expect(result).toHaveLength(1);
      expect(result[0].categoryKey).toBe('default');
    });

    it('seeds default retention policy inside $transaction when none exist (first-load)', async () => {
      const txMock: Record<string, any> = {
        documentRetentionPolicy: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const findManyMock = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockRetentionPolicy]);
      (prismaMock.documentRetentionPolicy as any).findMany = findManyMock;
      (prismaMock.$transaction as any) = vi
        .fn()
        .mockImplementation(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));

      const result = await caller.retentionPolicies.getAll();

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(txMock.documentRetentionPolicy.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ categoryKey: 'default', retentionDays: 365 }),
          ]),
        })
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('retentionPolicies.updateAll', () => {
    it('runs inside $transaction', async () => {
      const txMock: Record<string, any> = {
        documentRetentionPolicy: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      (prismaMock.$transaction as any) = vi
        .fn()
        .mockImplementation(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));
      (prismaMock.documentRetentionPolicy as any).findMany = vi
        .fn()
        .mockResolvedValue([mockRetentionPolicy]);

      await caller.retentionPolicies.updateAll({
        policies: [
          {
            categoryKey: 'default',
            retentionDays: 365,
            autoArchive: false,
            legalHoldOverride: false,
          },
        ],
      });

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(txMock.documentRetentionPolicy.deleteMany).toHaveBeenCalledWith({
        where: { tenantId },
      });
      expect(txMock.documentRetentionPolicy.createMany).toHaveBeenCalled();
    });
  });

  describe('automation.resetToDefaults', () => {
    it('upserts factory defaults for automation settings', async () => {
      (prismaMock.documentAutomationSetting as any).upsert = vi
        .fn()
        .mockResolvedValue(mockAutomation);

      const result = await caller.automation.resetToDefaults();

      expect(prismaMock.documentAutomationSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } })
      );
      expect(result).toEqual(mockAutomation);
    });
  });

  describe('retentionPolicies.resetToDefaults', () => {
    it('deletes then creates default policy inside $transaction', async () => {
      const txMock: Record<string, any> = {
        documentRetentionPolicy: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      (prismaMock.$transaction as any) = vi
        .fn()
        .mockImplementation(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));
      (prismaMock.documentRetentionPolicy as any).findMany = vi
        .fn()
        .mockResolvedValue([mockRetentionPolicy]);

      const result = await caller.retentionPolicies.resetToDefaults();

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(txMock.documentRetentionPolicy.deleteMany).toHaveBeenCalledWith({
        where: { tenantId },
      });
      expect(txMock.documentRetentionPolicy.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([expect.objectContaining({ categoryKey: 'default' })]),
        })
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('tags.update', () => {
    it('updates tag fields when found', async () => {
      const updatedTag = { ...mockTag, name: 'Updated Contract', colorToken: 'blue' };
      (prismaMock.documentTag as any).findFirst = vi.fn().mockResolvedValue(mockTag);
      (prismaMock.documentTag as any).update = vi.fn().mockResolvedValue(updatedTag);

      const result = await caller.tags.update({
        id: mockTag.id,
        name: 'Updated Contract',
        colorToken: 'blue',
      });

      expect(prismaMock.documentTag.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: mockTag.id, tenantId }) })
      );
      expect(result.name).toBe('Updated Contract');
    });

    it('throws NOT_FOUND when tag does not belong to tenant', async () => {
      (prismaMock.documentTag as any).findFirst = vi.fn().mockResolvedValue(null);

      await expect(caller.tags.update({ id: 'non-existent-id', name: 'X' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  // ─── cross-tenant isolation ─────────────────────────────────────────────────

  describe('cross-tenant isolation', () => {
    it('tags.update with foreign-tenant id → NOT_FOUND (P2025 mapped to TRPCError)', async () => {
      (prismaMock.documentTag as any).findFirst = vi.fn().mockResolvedValue(null);

      await expect(caller.tags.delete({ id: 'foreign-id' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('general.update is scoped to ctx.tenant.tenantId — cannot mutate another tenant', async () => {
      (prismaMock.documentGeneralConfig as any).upsert = vi
        .fn()
        .mockResolvedValue(mockGeneralConfig);

      await caller.general.update({
        allowedMimeTypes: [],
        maxUploadSizeMb: 50,
        defaultRetentionDays: 365,
        enableAntivirusScan: true,
        quarantineOnDetect: true,
        blockOnScanFailure: true,
      });

      // The upsert was called with the correct tenantId from ctx, not an arbitrary one
      expect(prismaMock.documentGeneralConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } })
      );
    });
  });
});
