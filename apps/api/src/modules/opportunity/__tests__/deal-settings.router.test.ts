/**
 * Deal Settings Router Tests - PG-184
 *
 * Covers CRUD, tenant isolation, $transaction wrapping, superRefine dedup,
 * admin-only tag RBAC, P2002 → CONFLICT mapping, and P2025 → NOT_FOUND
 * mapping. Pattern mirrors contact-settings.router.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dealSettingsRouter } from '../deal-settings.router';
import { prismaMock, createTestContext, createAdminContext, TEST_UUIDS } from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;

const mockDuplicateRule = {
  id: 'rule-1',
  tenantId,
  field: 'name_account',
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
  fieldKey: 'accountId',
  isRequired: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockWinLossReason = {
  id: 'reason-1',
  tenantId,
  category: 'WON',
  label: 'Price',
  key: 'price',
  sortOrder: 0,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockScoringRule = {
  id: 'score-1',
  tenantId,
  name: 'High value',
  field: 'value',
  operator: 'gte',
  valueJson: { type: 'number', value: 50000 },
  points: 10,
  isActive: true,
  sortOrder: 0,
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
  autoMergeOnExactNameAccount: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  normalizeCurrency: true,
  autoCapitalizeDealNames: true,
  preventDeleteWithOpenTasks: true,
  notifyOnOwnerChange: false,
  notifyOnStageChange: false,
  notifyOnHighValueStageMove: false,
  highValueThreshold: 50000,
  aiDuplicateDetection: false,
  aiDealScoring: false,
  aiNextStepRecommendation: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
  aiWinLossPrediction: false,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('Deal Settings Router', () => {
  let caller: ReturnType<typeof dealSettingsRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    const ctx = createTestContext();
    caller = dealSettingsRouter.createCaller(ctx);
    // Per playbook §12: stub automation + required-field reads that
    // the tags.create path consults through loadDealAutomation.
    (prismaMock.dealAutomationSetting.findUnique as any).mockResolvedValue(null);
  });

  // ─── Duplicate Rules ────────────────────────────────────────────────────

  describe('duplicateRules.getAll', () => {
    it('seeds defaults when no rules exist', async () => {
      (prismaMock.dealDuplicateRule.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockDuplicateRule]);
      (prismaMock.dealDuplicateRule.createMany as any).mockResolvedValue({ count: 3 });

      const result = await caller.duplicateRules.getAll();

      expect(prismaMock.dealDuplicateRule.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              tenantId,
              field: 'name_account',
              matchStrategy: 'exact',
            }),
          ]),
        })
      );
      expect(result).toHaveLength(1);
    });

    it('never passes skipDuplicates: true on createMany (playbook §5)', async () => {
      (prismaMock.dealDuplicateRule.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockDuplicateRule]);
      (prismaMock.dealDuplicateRule.createMany as any).mockResolvedValue({ count: 3 });

      await caller.duplicateRules.getAll();

      const lastCall = (prismaMock.dealDuplicateRule.createMany as any).mock.calls[0][0];
      expect(lastCall.skipDuplicates).toBeUndefined();
    });

    it('returns existing rules without seeding', async () => {
      (prismaMock.dealDuplicateRule.findMany as any).mockResolvedValueOnce([mockDuplicateRule]);
      const result = await caller.duplicateRules.getAll();
      expect(prismaMock.dealDuplicateRule.createMany).not.toHaveBeenCalled();
      expect(result).toEqual([mockDuplicateRule]);
    });

    it('swallows P2002 from a concurrent seed and returns the populated list', async () => {
      // Simulate the race: we see empty, then another request already seeded,
      // so our createMany fails P2002. The refetch must still return the list.
      (prismaMock.dealDuplicateRule.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockDuplicateRule]);
      (prismaMock.dealDuplicateRule.createMany as any).mockRejectedValue({ code: 'P2002' });

      const result = await caller.duplicateRules.getAll();

      expect(result).toEqual([mockDuplicateRule]);
    });
  });

  describe('duplicateRules.updateAll', () => {
    it('replaces rules transactionally (playbook §5)', async () => {
      (prismaMock.$transaction as any).mockResolvedValue([]);
      (prismaMock.dealDuplicateRule.findMany as any).mockResolvedValue([mockDuplicateRule]);

      const result = await caller.duplicateRules.updateAll({
        rules: [
          {
            field: 'name_account',
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

    it('rejects an empty rules array via Zod', async () => {
      await expect(caller.duplicateRules.updateAll({ rules: [] })).rejects.toThrow();
    });

    it('rejects duplicate (field, matchStrategy) pairs via Zod superRefine', async () => {
      await expect(
        caller.duplicateRules.updateAll({
          rules: [
            {
              field: 'name_account',
              matchStrategy: 'exact',
              threshold: 100,
              isActive: true,
              sortOrder: 0,
            },
            {
              field: 'name_account',
              matchStrategy: 'exact',
              threshold: 80,
              isActive: true,
              sortOrder: 1,
            },
          ],
        })
      ).rejects.toThrow();
    });

    it('maps Prisma P2002 to TRPCError CONFLICT', async () => {
      const p2002 = { code: 'P2002' };
      (prismaMock.$transaction as any).mockRejectedValue(p2002);

      await expect(
        caller.duplicateRules.updateAll({
          rules: [
            {
              field: 'name_account',
              matchStrategy: 'exact',
              threshold: 100,
              isActive: true,
              sortOrder: 0,
            },
          ],
        })
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  describe('duplicateRules.resetToDefaults', () => {
    it('wipes and reseeds transactionally', async () => {
      (prismaMock.$transaction as any).mockResolvedValue([]);
      (prismaMock.dealDuplicateRule.findMany as any).mockResolvedValue([mockDuplicateRule]);

      const result = await caller.duplicateRules.resetToDefaults();

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  // ─── Required Fields ────────────────────────────────────────────────────

  describe('requiredFields.getAll', () => {
    it('seeds defaults when no rows exist', async () => {
      (prismaMock.dealRequiredField.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockRequiredField]);
      (prismaMock.dealRequiredField.createMany as any).mockResolvedValue({ count: 6 });

      const result = await caller.requiredFields.getAll();

      expect(prismaMock.dealRequiredField.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              tenantId,
              fieldKey: 'accountId',
              isRequired: true,
            }),
            expect.objectContaining({
              tenantId,
              fieldKey: 'ownerId',
              isRequired: true,
            }),
          ]),
        })
      );
      expect(result).toHaveLength(1);
    });

    it('swallows P2002 from a concurrent seed and returns the populated list', async () => {
      (prismaMock.dealRequiredField.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockRequiredField]);
      (prismaMock.dealRequiredField.createMany as any).mockRejectedValue({ code: 'P2002' });

      const result = await caller.requiredFields.getAll();

      expect(result).toEqual([mockRequiredField]);
    });
  });

  describe('requiredFields.updateAll', () => {
    it('rejects payload when accountId is unchecked', async () => {
      await expect(
        caller.requiredFields.updateAll({
          fields: [
            { fieldKey: 'accountId', isRequired: false },
            { fieldKey: 'ownerId', isRequired: true },
          ],
        })
      ).rejects.toThrow();
    });

    it('rejects payload when ownerId is unchecked', async () => {
      await expect(
        caller.requiredFields.updateAll({
          fields: [
            { fieldKey: 'accountId', isRequired: true },
            { fieldKey: 'ownerId', isRequired: false },
          ],
        })
      ).rejects.toThrow();
    });

    it('upserts each field inside a $transaction', async () => {
      (prismaMock.$transaction as any).mockResolvedValue([]);
      (prismaMock.dealRequiredField.findMany as any).mockResolvedValue([mockRequiredField]);

      const result = await caller.requiredFields.updateAll({
        fields: [
          { fieldKey: 'accountId', isRequired: true },
          { fieldKey: 'ownerId', isRequired: true },
          { fieldKey: 'value', isRequired: true },
        ],
      });

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(result).toEqual([mockRequiredField]);
    });
  });

  // ─── Win/Loss Reasons ──────────────────────────────────────────────────

  describe('winLossReasons.create', () => {
    it('auto-derives key via slugify', async () => {
      (prismaMock.dealWinLossReason.create as any).mockResolvedValue(mockWinLossReason);

      await caller.winLossReasons.create({ category: 'WON', label: 'Fastest To Market' });

      expect(prismaMock.dealWinLossReason.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId,
            category: 'WON',
            label: 'Fastest To Market',
            key: 'fastest_to_market',
          }),
        })
      );
    });

    it('maps P2002 to CONFLICT', async () => {
      (prismaMock.dealWinLossReason.create as any).mockRejectedValue({ code: 'P2002' });

      await expect(
        caller.winLossReasons.create({ category: 'WON', label: 'Price' })
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  describe('winLossReasons.delete', () => {
    it('hard-deletes the row scoped to the current tenant', async () => {
      (prismaMock.dealWinLossReason.delete as any).mockResolvedValue(mockWinLossReason);

      const result = await caller.winLossReasons.delete({ id: 'reason-1' });

      expect(result.softDeleted).toBe(false);
      expect(prismaMock.dealWinLossReason.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'reason-1', tenantId } })
      );
    });

    it('throws NOT_FOUND for foreign-tenant id (cross-tenant negative)', async () => {
      // `where: { id, tenantId }` makes a foreign-tenant row miss → P2025.
      (prismaMock.dealWinLossReason.delete as any).mockRejectedValue({ code: 'P2025' });

      await expect(caller.winLossReasons.delete({ id: 'reason-1' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('winLossReasons.resetToDefaults', () => {
    it('seeds 4 WON + 4 LOST canonical reasons transactionally', async () => {
      (prismaMock.$transaction as any).mockResolvedValue([]);
      (prismaMock.dealWinLossReason.findMany as any).mockResolvedValue([]);

      await caller.winLossReasons.resetToDefaults();

      expect(prismaMock.$transaction).toHaveBeenCalled();
      const callArgs = (prismaMock.dealWinLossReason.createMany as any).mock.calls[0][0];
      expect(callArgs.data).toHaveLength(8);
      expect(callArgs.data.filter((r: { category: string }) => r.category === 'WON')).toHaveLength(
        4
      );
      expect(callArgs.data.filter((r: { category: string }) => r.category === 'LOST')).toHaveLength(
        4
      );
    });
  });

  // ─── Scoring Rules ─────────────────────────────────────────────────────

  describe('scoringRules.create', () => {
    it('creates a rule with tenant-scoped write', async () => {
      (prismaMock.dealScoringRule.create as any).mockResolvedValue(mockScoringRule);

      await caller.scoringRules.create({
        name: 'High value',
        field: 'value',
        operator: 'gte',
        valueJson: { type: 'number', value: 50000 },
        points: 10,
        isActive: true,
      });

      expect(prismaMock.dealScoringRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId, name: 'High value' }),
        })
      );
    });
  });

  describe('scoringRules.update — cross-tenant negative', () => {
    it('throws NOT_FOUND on P2025 (foreign tenant id)', async () => {
      (prismaMock.dealScoringRule.update as any).mockRejectedValue({ code: 'P2025' });

      await expect(
        caller.scoringRules.update({ id: 'foreign-id', points: 5 })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('scoringRules.resetToDefaults', () => {
    it('wipes the tenant list and returns the fresh (empty) list', async () => {
      (prismaMock.dealScoringRule.deleteMany as any).mockResolvedValue({ count: 3 });
      (prismaMock.dealScoringRule.findMany as any).mockResolvedValue([]);

      const result = await caller.scoringRules.resetToDefaults();

      expect(prismaMock.dealScoringRule.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } })
      );
      expect(prismaMock.dealScoringRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } })
      );
      expect(result).toEqual([]);
    });
  });

  // ─── Tags ──────────────────────────────────────────────────────────────

  describe('tags.create', () => {
    it('creates a tag when no admin restriction is set', async () => {
      (prismaMock.dealTag.create as any).mockResolvedValue(mockTag);

      const result = await caller.tags.create({ name: 'VIP', colorToken: 'amber' });

      expect(result).toEqual(mockTag);
    });

    it('FORBIDDEN for non-admin when restrictTagCreationToAdmins=true', async () => {
      (prismaMock.dealAutomationSetting.findUnique as any).mockResolvedValue({
        ...mockAutomation,
        restrictTagCreationToAdmins: true,
      });

      await expect(
        caller.tags.create({ name: 'Admin-only', colorToken: 'slate' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('allows ADMIN caller when restrictTagCreationToAdmins=true', async () => {
      const adminCtx = createAdminContext();
      const adminCaller = dealSettingsRouter.createCaller(adminCtx);

      (prismaMock.dealAutomationSetting.findUnique as any).mockResolvedValue({
        ...mockAutomation,
        restrictTagCreationToAdmins: true,
      });
      (prismaMock.dealTag.create as any).mockResolvedValue(mockTag);

      const result = await adminCaller.tags.create({ name: 'VIP', colorToken: 'amber' });

      expect(result).toEqual(mockTag);
    });

    it('maps P2002 to CONFLICT on duplicate tag name', async () => {
      (prismaMock.dealTag.create as any).mockRejectedValue({ code: 'P2002' });

      await expect(caller.tags.create({ name: 'VIP', colorToken: 'amber' })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });
  });

  describe('tags.update — cross-tenant negative', () => {
    it('throws NOT_FOUND on P2025', async () => {
      (prismaMock.dealTag.update as any).mockRejectedValue({ code: 'P2025' });

      await expect(caller.tags.update({ id: 'foreign-id', name: 'Hijack' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('tags.delete — cross-tenant negative', () => {
    it('throws NOT_FOUND on P2025', async () => {
      (prismaMock.dealTag.delete as any).mockRejectedValue({ code: 'P2025' });

      await expect(caller.tags.delete({ id: 'foreign-id' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  // ─── Automation ────────────────────────────────────────────────────────

  describe('automation.get', () => {
    it('upserts with defaults on first call (atomic — no read-then-write race)', async () => {
      (prismaMock.dealAutomationSetting.upsert as any).mockResolvedValue(mockAutomation);

      const result = await caller.automation.get();

      expect(prismaMock.dealAutomationSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          update: {},
          create: expect.objectContaining({ tenantId, aiDuplicateDetection: false }),
        })
      );
      expect(result.aiDuplicateDetection).toBe(false);
    });

    it('returns existing row via upsert no-op on subsequent calls', async () => {
      (prismaMock.dealAutomationSetting.upsert as any).mockResolvedValue(mockAutomation);

      const result = await caller.automation.get();
      expect(result).toEqual(mockAutomation);
    });
  });

  describe('automation.update', () => {
    it('upserts the full 16-flag settings row', async () => {
      const updated = { ...mockAutomation, aiDealScoring: true };
      (prismaMock.dealAutomationSetting.upsert as any).mockResolvedValue(updated);

      const result = await caller.automation.update({
        autoMergeOnExactNameAccount: false,
        notifyOnDuplicate: true,
        restrictTagCreationToAdmins: false,
        normalizeCurrency: true,
        autoCapitalizeDealNames: true,
        preventDeleteWithOpenTasks: true,
        notifyOnOwnerChange: false,
        notifyOnStageChange: false,
        notifyOnHighValueStageMove: false,
        highValueThreshold: 50000,
        aiDuplicateDetection: false,
        aiDealScoring: true,
        aiNextStepRecommendation: false,
        aiTagSuggestions: false,
        aiInsightGeneration: false,
        aiWinLossPrediction: false,
      });

      expect(prismaMock.dealAutomationSetting.upsert).toHaveBeenCalled();
      expect(result.aiDealScoring).toBe(true);
    });
  });

  describe('automation.resetToDefaults', () => {
    it('upserts factory defaults', async () => {
      (prismaMock.dealAutomationSetting.upsert as any).mockResolvedValue(mockAutomation);

      await caller.automation.resetToDefaults();

      const call = (prismaMock.dealAutomationSetting.upsert as any).mock.calls[0][0];
      expect(call.create.aiDuplicateDetection).toBe(false);
      expect(call.create.notifyOnDuplicate).toBe(true);
    });
  });

  // ─── Pipeline re-export ────────────────────────────────────────────────

  describe('pipeline sub-router (re-export of pipelineConfigRouter)', () => {
    it('is reachable as dealSettings.pipeline.getAll', async () => {
      (prismaMock.pipelineStageConfig.findMany as any).mockResolvedValue([]);

      // The call should succeed without throwing — we just verify the
      // re-export wire is in place and the child router responds.
      const result = await caller.pipeline.getAll();

      expect(result).toHaveProperty('stages');
    });
  });
});
