/**
 * Lead Settings Router Tests - PG-178
 *
 * Tests for lead stage configuration, scoring rules, custom fields,
 * and automation settings tRPC procedures.
 *
 * Pattern mirrors ticket-config.router.test.ts: uses prismaMock from test/setup
 * and leadSettingsRouter.createCaller(ctx).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { leadSettingsRouter } from '../lead-settings.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;

// ─── Mock data ───────────────────────────────────────────────────────────────

const mockStage = {
  id: 'stage-1',
  tenantId,
  stageKey: 'NEW',
  displayName: 'New',
  color: '#3B82F6',
  sortOrder: 0,
  isDefault: true,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockStage2 = {
  ...mockStage,
  id: 'stage-2',
  stageKey: 'CONTACTED',
  displayName: 'Contacted',
  color: '#F59E0B',
  sortOrder: 1,
  isDefault: false,
};

const mockScoringRule = {
  id: 'rule-1',
  tenantId,
  activityType: 'EMAIL_OPEN',
  points: 10,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockScoringRule2 = {
  ...mockScoringRule,
  id: 'rule-2',
  activityType: 'EMAIL_CLICK',
  points: 25,
};

const mockCustomField = {
  id: 'field-1',
  tenantId,
  fieldName: 'Lead Source Detail',
  fieldKey: 'lead_source_detail',
  dataType: 'text',
  options: null,
  isRequired: false,
  sortOrder: 0,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockAutomationSetting = {
  id: 'automation-1',
  tenantId,
  autoAssignment: true,
  instantNotifications: false,
  leadRecurrence: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Lead Settings Router', () => {
  let caller: ReturnType<typeof leadSettingsRouter.createCaller>;

  beforeEach(() => {
    const ctx = createTestContext();
    caller = leadSettingsRouter.createCaller(ctx);
  });

  // ── stages.getAll ───────────────────────────────────────

  describe('stages.getAll', () => {
    it('seeds and returns defaults when no stages exist', async () => {
      (prismaMock.leadStageConfig.findMany as any)
        .mockResolvedValueOnce([]) // first call: no existing stages
        .mockResolvedValueOnce([mockStage, mockStage2]); // second call: after seed
      (prismaMock.leadStageConfig.createMany as any).mockResolvedValue({ count: 7 });

      const result = await caller.stages.getAll();

      expect(prismaMock.leadStageConfig.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ tenantId, stageKey: 'NEW', isDefault: true }),
          ]),
          skipDuplicates: true,
        })
      );
      expect(result).toHaveLength(2);
    });

    it('returns existing stages ordered by sortOrder without seeding', async () => {
      (prismaMock.leadStageConfig.findMany as any).mockResolvedValueOnce([mockStage, mockStage2]);

      const result = await caller.stages.getAll();

      expect(prismaMock.leadStageConfig.createMany).not.toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0].stageKey).toBe('NEW');
      expect(result[1].stageKey).toBe('CONTACTED');
    });

    it('filters by tenantId', async () => {
      (prismaMock.leadStageConfig.findMany as any).mockResolvedValueOnce([mockStage]);

      await caller.stages.getAll();

      expect(prismaMock.leadStageConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId }),
        })
      );
    });
  });

  // ── stages.updateAll ────────────────────────────────────

  describe('stages.updateAll', () => {
    it('upserts stages inside a transaction', async () => {
      const tx = {
        leadStageConfig: {
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
          upsert: vi.fn().mockResolvedValue(mockStage),
          findMany: vi.fn().mockResolvedValue([mockStage]),
        },
      };
      (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(tx));

      const result = await caller.stages.updateAll({
        stages: [
          { stageKey: 'NEW', displayName: 'New', color: '#3B82F6', sortOrder: 0, isDefault: true },
        ],
      });

      expect(tx.leadStageConfig.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId }),
          data: { isActive: false },
        })
      );
      expect(tx.leadStageConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_stageKey: { tenantId, stageKey: 'NEW' } },
          create: expect.objectContaining({ tenantId, stageKey: 'NEW', isActive: true }),
          update: expect.objectContaining({ isActive: true }),
        })
      );
      expect(result).toEqual([mockStage]);
    });

    it('rejects when no stage is marked as default', async () => {
      await expect(
        caller.stages.updateAll({
          stages: [
            {
              stageKey: 'NEW',
              displayName: 'New',
              color: '#3B82F6',
              sortOrder: 0,
              isDefault: false,
            },
          ],
        })
      ).rejects.toThrow(/exactly one stage must be marked as default/i);
    });

    it('rejects when more than one default stage is provided', async () => {
      await expect(
        caller.stages.updateAll({
          stages: [
            {
              stageKey: 'NEW',
              displayName: 'New',
              color: '#3B82F6',
              sortOrder: 0,
              isDefault: true,
            },
            {
              stageKey: 'CONTACTED',
              displayName: 'Contacted',
              color: '#F59E0B',
              sortOrder: 1,
              isDefault: true,
            },
          ],
        })
      ).rejects.toThrow(/exactly one stage must be marked as default/i);
    });
  });

  // ── stages.resetToDefaults ──────────────────────────────

  describe('stages.resetToDefaults', () => {
    it('deletes existing stages and re-seeds defaults', async () => {
      const tx = {
        leadStageConfig: {
          deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
          createMany: vi.fn().mockResolvedValue({ count: 7 }),
          findMany: vi.fn().mockResolvedValue([mockStage, mockStage2]),
        },
      };
      (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(tx));

      const result = await caller.stages.resetToDefaults();

      expect(tx.leadStageConfig.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } })
      );
      expect(tx.leadStageConfig.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ tenantId, stageKey: 'NEW', isDefault: true }),
          ]),
        })
      );
      expect(result).toHaveLength(2);
    });
  });

  // ── scoringRules.getAll ─────────────────────────────────

  describe('scoringRules.getAll', () => {
    it('seeds and returns defaults when no rules exist', async () => {
      (prismaMock.leadScoringRule.findMany as any)
        .mockResolvedValueOnce([]) // no existing
        .mockResolvedValueOnce([mockScoringRule, mockScoringRule2]); // after seed
      (prismaMock.leadScoringRule.createMany as any).mockResolvedValue({ count: 6 });

      const result = await caller.scoringRules.getAll();

      expect(prismaMock.leadScoringRule.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ tenantId, activityType: 'EMAIL_OPEN', points: 10 }),
          ]),
          skipDuplicates: true,
        })
      );
      expect(result).toHaveLength(2);
    });

    it('returns existing rules without seeding', async () => {
      (prismaMock.leadScoringRule.findMany as any).mockResolvedValueOnce([
        mockScoringRule,
        mockScoringRule2,
      ]);

      const result = await caller.scoringRules.getAll();

      expect(prismaMock.leadScoringRule.createMany).not.toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('filters by tenantId', async () => {
      (prismaMock.leadScoringRule.findMany as any).mockResolvedValueOnce([mockScoringRule]);

      await caller.scoringRules.getAll();

      expect(prismaMock.leadScoringRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId }),
        })
      );
    });
  });

  // ── scoringRules.updateAll ──────────────────────────────

  describe('scoringRules.updateAll', () => {
    it('upserts scoring rules inside a transaction', async () => {
      const tx = {
        leadScoringRule: {
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
          upsert: vi.fn().mockResolvedValue(mockScoringRule),
          findMany: vi.fn().mockResolvedValue([mockScoringRule]),
        },
      };
      (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(tx));

      const result = await caller.scoringRules.updateAll({
        rules: [{ activityType: 'EMAIL_OPEN', points: 10 }],
      });

      expect(tx.leadScoringRule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId }),
          data: { isActive: false },
        })
      );
      expect(tx.leadScoringRule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_activityType: { tenantId, activityType: 'EMAIL_OPEN' } },
          create: expect.objectContaining({
            tenantId,
            activityType: 'EMAIL_OPEN',
            points: 10,
            isActive: true,
          }),
          update: expect.objectContaining({ isActive: true }),
        })
      );
      expect(result).toEqual([mockScoringRule]);
    });
  });

  // ── scoringRules.resetToDefaults ────────────────────────

  describe('scoringRules.resetToDefaults', () => {
    it('deletes existing rules and re-seeds defaults', async () => {
      const tx = {
        leadScoringRule: {
          deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
          createMany: vi.fn().mockResolvedValue({ count: 6 }),
          findMany: vi.fn().mockResolvedValue([mockScoringRule, mockScoringRule2]),
        },
      };
      (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(tx));

      const result = await caller.scoringRules.resetToDefaults();

      expect(tx.leadScoringRule.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } })
      );
      expect(tx.leadScoringRule.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ tenantId, activityType: 'EMAIL_OPEN', points: 10 }),
          ]),
        })
      );
      expect(result).toHaveLength(2);
    });
  });

  // ── customFields.list ───────────────────────────────────

  describe('customFields.list', () => {
    it('returns active custom fields ordered by sortOrder', async () => {
      (prismaMock.leadCustomField.findMany as any).mockResolvedValue([mockCustomField]);

      const result = await caller.customFields.list();

      expect(result).toHaveLength(1);
      expect(result[0].fieldName).toBe('Lead Source Detail');
    });

    it('filters by tenantId and isActive=true', async () => {
      (prismaMock.leadCustomField.findMany as any).mockResolvedValue([]);

      await caller.customFields.list();

      expect(prismaMock.leadCustomField.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId, isActive: true }),
        })
      );
    });
  });

  // ── customFields.create ─────────────────────────────────

  describe('customFields.create', () => {
    it('generates fieldKey from fieldName and creates field', async () => {
      (prismaMock.leadCustomField.findUnique as any).mockResolvedValue(null); // no duplicate
      (prismaMock.leadCustomField.aggregate as any).mockResolvedValue({
        _max: { sortOrder: null },
      });
      (prismaMock.leadCustomField.create as any).mockResolvedValue(mockCustomField);

      const result = await caller.customFields.create({
        fieldName: 'Lead Source Detail',
        dataType: 'text',
      });

      expect(prismaMock.leadCustomField.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fieldName: 'Lead Source Detail',
            fieldKey: 'lead_source_detail',
            tenantId,
          }),
        })
      );
      expect(result.fieldName).toBe('Lead Source Detail');
    });

    it('assigns sortOrder as (maxSortOrder + 1)', async () => {
      (prismaMock.leadCustomField.findUnique as any).mockResolvedValue(null);
      (prismaMock.leadCustomField.aggregate as any).mockResolvedValue({ _max: { sortOrder: 4 } });
      (prismaMock.leadCustomField.create as any).mockResolvedValue({
        ...mockCustomField,
        sortOrder: 5,
      });

      await caller.customFields.create({ fieldName: 'Budget Range', dataType: 'currency' });

      expect(prismaMock.leadCustomField.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sortOrder: 5 }),
        })
      );
    });

    it('rejects duplicate fieldKey with CONFLICT error', async () => {
      (prismaMock.leadCustomField.findUnique as any).mockResolvedValue(mockCustomField);

      await expect(
        caller.customFields.create({ fieldName: 'Lead Source Detail', dataType: 'text' })
      ).rejects.toThrow(/already exists/i);
    });

    it('checks for duplicate using tenantId-scoped unique key', async () => {
      (prismaMock.leadCustomField.findUnique as any).mockResolvedValue(null);
      (prismaMock.leadCustomField.aggregate as any).mockResolvedValue({
        _max: { sortOrder: null },
      });
      (prismaMock.leadCustomField.create as any).mockResolvedValue(mockCustomField);

      await caller.customFields.create({ fieldName: 'My Field', dataType: 'text' });

      expect(prismaMock.leadCustomField.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId_fieldKey: expect.objectContaining({ tenantId }),
          }),
        })
      );
    });
  });

  // ── customFields.update ─────────────────────────────────

  describe('customFields.update', () => {
    it('modifies an existing custom field', async () => {
      (prismaMock.leadCustomField.findFirst as any).mockResolvedValue(mockCustomField);
      (prismaMock.leadCustomField.update as any).mockResolvedValue({
        ...mockCustomField,
        fieldName: 'Updated Field',
        dataType: 'number',
      });

      const result = await caller.customFields.update({
        id: 'field-1',
        fieldName: 'Updated Field',
        dataType: 'number',
      });

      expect(prismaMock.leadCustomField.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'field-1' },
          data: expect.objectContaining({ fieldName: 'Updated Field', dataType: 'number' }),
        })
      );
      expect(result.fieldName).toBe('Updated Field');
    });

    it('throws NOT_FOUND when field does not belong to tenant', async () => {
      (prismaMock.leadCustomField.findFirst as any).mockResolvedValue(null);

      await expect(
        caller.customFields.update({ id: 'non-existent', fieldName: 'Test', dataType: 'text' })
      ).rejects.toThrow(/not found/i);
    });

    it('scopes field lookup by tenantId', async () => {
      (prismaMock.leadCustomField.findFirst as any).mockResolvedValue(mockCustomField);
      (prismaMock.leadCustomField.update as any).mockResolvedValue(mockCustomField);

      await caller.customFields.update({ id: 'field-1', fieldName: 'Updated', dataType: 'text' });

      expect(prismaMock.leadCustomField.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'field-1', tenantId }),
        })
      );
    });
  });

  // ── customFields.delete ─────────────────────────────────

  describe('customFields.delete', () => {
    it('soft-deletes by setting isActive=false', async () => {
      (prismaMock.leadCustomField.findFirst as any).mockResolvedValue(mockCustomField);
      (prismaMock.leadCustomField.update as any).mockResolvedValue({
        ...mockCustomField,
        isActive: false,
      });

      const result = await caller.customFields.delete({ id: 'field-1' });

      expect(prismaMock.leadCustomField.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'field-1' },
          data: expect.objectContaining({ isActive: false }),
        })
      );
      expect(result.isActive).toBe(false);
    });

    it('throws NOT_FOUND when field does not exist for tenant', async () => {
      (prismaMock.leadCustomField.findFirst as any).mockResolvedValue(null);

      await expect(caller.customFields.delete({ id: 'ghost-field' })).rejects.toThrow(/not found/i);
    });
  });

  // ── automation.get ──────────────────────────────────────

  describe('automation.get', () => {
    it('returns existing automation settings', async () => {
      (prismaMock.leadAutomationSetting.findUnique as any).mockResolvedValue(mockAutomationSetting);

      const result = await caller.automation.get();

      expect(prismaMock.leadAutomationSetting.create).not.toHaveBeenCalled();
      expect(result.autoAssignment).toBe(true);
      expect(result.instantNotifications).toBe(false);
      expect(result.leadRecurrence).toBe(true);
    });

    it('creates and returns defaults when no settings exist', async () => {
      (prismaMock.leadAutomationSetting.findUnique as any).mockResolvedValue(null);
      (prismaMock.leadAutomationSetting.create as any).mockResolvedValue(mockAutomationSetting);

      const result = await caller.automation.get();

      expect(prismaMock.leadAutomationSetting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId,
            autoAssignment: true,
            instantNotifications: false,
            leadRecurrence: true,
          }),
        })
      );
      expect(result.tenantId).toBe(tenantId);
    });

    it('filters by tenantId', async () => {
      (prismaMock.leadAutomationSetting.findUnique as any).mockResolvedValue(mockAutomationSetting);

      await caller.automation.get();

      expect(prismaMock.leadAutomationSetting.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } })
      );
    });
  });

  // ── automation.update ───────────────────────────────────

  describe('automation.update', () => {
    it('upserts automation settings for the tenant', async () => {
      const updatedSettings = {
        ...mockAutomationSetting,
        autoAssignment: false,
        instantNotifications: true,
        leadRecurrence: false,
      };
      (prismaMock.leadAutomationSetting.upsert as any).mockResolvedValue(updatedSettings);

      const result = await caller.automation.update({
        autoAssignment: false,
        instantNotifications: true,
        leadRecurrence: false,
      });

      expect(prismaMock.leadAutomationSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          create: expect.objectContaining({
            tenantId,
            autoAssignment: false,
            instantNotifications: true,
            leadRecurrence: false,
          }),
          update: expect.objectContaining({
            autoAssignment: false,
            instantNotifications: true,
            leadRecurrence: false,
          }),
        })
      );
      expect(result.autoAssignment).toBe(false);
      expect(result.instantNotifications).toBe(true);
    });
  });
});
