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

  // ────────────────────────── v2 sub-routers ──────────────────────────

  describe('duplicateRules.list', () => {
    it('returns existing rules when rows are present (no seed)', async () => {
      (prismaMock.caseDuplicateRule.findMany as any).mockResolvedValueOnce([
        {
          id: 'x',
          tenantId,
          field: 'title',
          matchStrategy: 'exact',
          collisionAction: 'warn',
          isActive: true,
          sortOrder: 0,
        },
      ]);
      const result = await caller.duplicateRules.list();
      expect(result.length).toBe(1);
      expect(prismaMock.caseDuplicateRule.createMany as any).not.toHaveBeenCalled();
    });

    it('seeds defaults on first read when no rows exist', async () => {
      (prismaMock.caseDuplicateRule.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 's1',
            tenantId,
            field: 'title',
            matchStrategy: 'fuzzy',
            collisionAction: 'warn',
            isActive: true,
            sortOrder: 0,
          },
        ]);
      (prismaMock.caseDuplicateRule.createMany as any).mockResolvedValue({ count: 2 });
      await caller.duplicateRules.list();
      expect(prismaMock.caseDuplicateRule.createMany as any).toHaveBeenCalled();
      const seeded = (prismaMock.caseDuplicateRule.createMany as any).mock.calls[0][0].data;
      expect(Array.isArray(seeded)).toBe(true);
      expect(seeded[0].tenantId).toBe(tenantId);
    });
  });

  describe('duplicateRules.update', () => {
    it('rejects duplicate (field, matchStrategy) pair via Zod superRefine', async () => {
      await expect(
        caller.duplicateRules.update({
          rules: [
            {
              field: 'title',
              matchStrategy: 'fuzzy',
              collisionAction: 'warn',
              isActive: true,
              sortOrder: 0,
            },
            {
              field: 'title',
              matchStrategy: 'fuzzy',
              collisionAction: 'block',
              isActive: true,
              sortOrder: 1,
            },
          ],
        })
      ).rejects.toThrow();
    });

    it('replaces the rule set atomically inside $transaction', async () => {
      (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
      (prismaMock.caseDuplicateRule.deleteMany as any).mockResolvedValue({ count: 2 });
      (prismaMock.caseDuplicateRule.createMany as any).mockResolvedValue({ count: 1 });
      (prismaMock.caseDuplicateRule.findMany as any).mockResolvedValue([
        {
          id: 'n1',
          tenantId,
          field: 'client',
          matchStrategy: 'exact',
          collisionAction: 'warn',
          isActive: true,
          sortOrder: 0,
        },
      ]);
      await caller.duplicateRules.update({
        rules: [
          {
            field: 'client',
            matchStrategy: 'exact',
            collisionAction: 'warn',
            isActive: true,
            sortOrder: 0,
          },
        ],
      });
      expect(prismaMock.caseDuplicateRule.deleteMany as any).toHaveBeenCalledWith({
        where: { tenantId },
      });
      expect(prismaMock.caseDuplicateRule.createMany as any).toHaveBeenCalled();
    });
  });

  describe('duplicateRules.resetToDefaults', () => {
    it('wipes rules and re-seeds defaults', async () => {
      (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
      (prismaMock.caseDuplicateRule.deleteMany as any).mockResolvedValue({ count: 3 });
      (prismaMock.caseDuplicateRule.createMany as any).mockResolvedValue({ count: 2 });
      (prismaMock.caseDuplicateRule.findMany as any).mockResolvedValue([]);
      await caller.duplicateRules.resetToDefaults();
      expect(prismaMock.caseDuplicateRule.deleteMany as any).toHaveBeenCalled();
      expect(prismaMock.caseDuplicateRule.createMany as any).toHaveBeenCalled();
    });
  });

  describe('requiredFields.list', () => {
    it('returns existing fields without re-seeding', async () => {
      (prismaMock.caseRequiredField.findMany as any).mockResolvedValueOnce([
        { id: 'r', tenantId, fieldKey: 'title', isRequired: true },
      ]);
      const result = await caller.requiredFields.list();
      expect(result.length).toBe(1);
      expect(prismaMock.caseRequiredField.createMany as any).not.toHaveBeenCalled();
    });

    it('seeds defaults on first read', async () => {
      (prismaMock.caseRequiredField.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 's', tenantId, fieldKey: 'title', isRequired: true }]);
      (prismaMock.caseRequiredField.createMany as any).mockResolvedValue({ count: 6 });
      await caller.requiredFields.list();
      expect(prismaMock.caseRequiredField.createMany as any).toHaveBeenCalled();
    });
  });

  describe('requiredFields.resetToDefaults', () => {
    it('wipes required-field rows and re-seeds DEFAULT_CASE_REQUIRED_FIELDS', async () => {
      (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
      (prismaMock.caseRequiredField.deleteMany as any).mockResolvedValue({ count: 6 });
      (prismaMock.caseRequiredField.createMany as any).mockResolvedValue({ count: 6 });
      (prismaMock.caseRequiredField.findMany as any).mockResolvedValue([]);
      await caller.requiredFields.resetToDefaults();
      expect(prismaMock.caseRequiredField.deleteMany as any).toHaveBeenCalledWith({
        where: { tenantId },
      });
      const seeded = (prismaMock.caseRequiredField.createMany as any).mock.calls[0][0].data;
      expect(seeded.length).toBe(6);
      expect(seeded[0].tenantId).toBe(tenantId);
    });
  });

  describe('requiredFields.update', () => {
    it('replaces the full required-field set in 2 batched statements (NP-027, no N upserts)', async () => {
      (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
      (prismaMock.caseRequiredField.deleteMany as any).mockResolvedValue({ count: 2 });
      (prismaMock.caseRequiredField.createMany as any).mockResolvedValue({ count: 2 });
      (prismaMock.caseRequiredField.findMany as any).mockResolvedValue([
        { id: 'a', tenantId, fieldKey: 'title', isRequired: true },
      ]);
      await caller.requiredFields.update({
        fields: [
          { fieldKey: 'title', isRequired: true },
          { fieldKey: 'deadline', isRequired: false },
        ],
      });
      // Constant 2 writes regardless of field count — not N upserts.
      expect(prismaMock.caseRequiredField.deleteMany as any).toHaveBeenCalledTimes(1);
      expect(prismaMock.caseRequiredField.createMany as any).toHaveBeenCalledTimes(1);
      expect(prismaMock.caseRequiredField.upsert as any).not.toHaveBeenCalled();
    });
  });

  describe('tags', () => {
    it('list returns tenant tags ordered by sortOrder then name', async () => {
      (prismaMock.caseTag.findMany as any).mockResolvedValue([
        {
          id: 't1',
          tenantId,
          name: 'A',
          colorToken: 'slate',
          description: null,
          sortOrder: 0,
          isActive: true,
        },
      ]);
      await caller.tags.list();
      const args = (prismaMock.caseTag.findMany as any).mock.calls[0][0];
      expect(args.where.tenantId).toBe(tenantId);
      expect(args.orderBy).toEqual([{ sortOrder: 'asc' }, { name: 'asc' }]);
    });

    it('create writes a tag when restrictTagCreationToAdmins is OFF', async () => {
      (prismaMock.caseAutomationSetting.findUnique as any).mockResolvedValue({
        tenantId,
        restrictTagCreationToAdmins: false,
        autoEscalateOverdue: false,
        notifyOnAssignmentChange: true,
        notifyOnDeadlineApproaching: true,
        notifyOnStatusChange: false,
        notifyOnDuplicate: true,
        preventDeleteWithOpenTasks: true,
        aiCaseSummarization: false,
        aiPriorityPrediction: false,
        aiResolutionSuggestion: false,
        aiTagSuggestions: false,
        aiInsightGeneration: false,
      });
      (prismaMock.caseTag.create as any).mockResolvedValue({ id: 't', name: 'VIP' });
      await caller.tags.create({ name: 'VIP', colorToken: 'amber' });
      expect(prismaMock.caseTag.create as any).toHaveBeenCalled();
    });

    it('create throws FORBIDDEN when restrictTagCreationToAdmins is ON and user is not ADMIN/OWNER', async () => {
      (prismaMock.caseAutomationSetting.findUnique as any).mockResolvedValue({
        tenantId,
        restrictTagCreationToAdmins: true,
        autoEscalateOverdue: false,
        notifyOnAssignmentChange: true,
        notifyOnDeadlineApproaching: true,
        notifyOnStatusChange: false,
        notifyOnDuplicate: true,
        preventDeleteWithOpenTasks: true,
        aiCaseSummarization: false,
        aiPriorityPrediction: false,
        aiResolutionSuggestion: false,
        aiTagSuggestions: false,
        aiInsightGeneration: false,
      });
      await expect(caller.tags.create({ name: 'VIP', colorToken: 'amber' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(prismaMock.caseTag.create as any).not.toHaveBeenCalled();
    });

    it('delete deletes when tag is tenant-owned', async () => {
      (prismaMock.caseTag.findFirst as any).mockResolvedValue({ id: 'ok', tenantId });
      (prismaMock.caseTag.delete as any).mockResolvedValue({ id: 'ok' });
      const result = await caller.tags.delete({ id: 'ok' });
      expect(result).toEqual({ success: true });
      expect(prismaMock.caseTag.delete as any).toHaveBeenCalledWith({ where: { id: 'ok' } });
    });

    it('create allows an ADMIN user even when restrictTagCreationToAdmins is ON', async () => {
      (prismaMock.caseAutomationSetting.findUnique as any).mockResolvedValue({
        tenantId,
        restrictTagCreationToAdmins: true,
        autoEscalateOverdue: false,
        notifyOnAssignmentChange: true,
        notifyOnDeadlineApproaching: true,
        notifyOnStatusChange: false,
        notifyOnDuplicate: true,
        preventDeleteWithOpenTasks: true,
        aiCaseSummarization: false,
        aiPriorityPrediction: false,
        aiResolutionSuggestion: false,
        aiTagSuggestions: false,
        aiInsightGeneration: false,
      });
      (prismaMock.caseTag.create as any).mockResolvedValue({ id: 'adm', name: 'Hot' });
      const adminCaller = caseSettingsRouter.createCaller(
        createTestContext({
          user: {
            userId: TEST_UUIDS.user1,
            email: 'a@x.y',
            role: 'ADMIN',
            tenantId,
            timezone: 'UTC',
            emailVerified: true,
          },
        })
      );
      await expect(
        adminCaller.tags.create({ name: 'Hot', colorToken: 'red' })
      ).resolves.toBeTruthy();
    });

    it('create falls back to factory defaults when no automation row seeded yet', async () => {
      (prismaMock.caseAutomationSetting.findUnique as any).mockResolvedValue(null);
      (prismaMock.caseTag.create as any).mockResolvedValue({ id: 'new', name: 'Fresh' });
      await expect(
        caller.tags.create({ name: 'Fresh', colorToken: 'green' })
      ).resolves.toBeTruthy();
    });

    it('update throws NOT_FOUND when tag does not belong to tenant', async () => {
      (prismaMock.caseTag.findFirst as any).mockResolvedValue(null);
      await expect(caller.tags.update({ id: 'missing', name: 'New' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('delete throws NOT_FOUND when tag does not belong to tenant', async () => {
      (prismaMock.caseTag.findFirst as any).mockResolvedValue(null);
      await expect(caller.tags.delete({ id: 'missing' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('update only affects tenant-owned rows (findFirst scoped to tenantId)', async () => {
      (prismaMock.caseTag.findFirst as any).mockResolvedValue({ id: 'ok', tenantId });
      (prismaMock.caseTag.update as any).mockResolvedValue({ id: 'ok', name: 'Renamed' });
      await caller.tags.update({ id: 'ok', name: 'Renamed' });
      const findCall = (prismaMock.caseTag.findFirst as any).mock.calls[0][0];
      expect(findCall.where.tenantId).toBe(tenantId);
    });
  });

  describe('automation', () => {
    it('get upserts with DEFAULT_CASE_AUTOMATION on first read', async () => {
      (prismaMock.caseAutomationSetting.upsert as any).mockResolvedValue({
        tenantId,
        aiCaseSummarization: false,
      });
      await caller.automation.get();
      const call = (prismaMock.caseAutomationSetting.upsert as any).mock.calls[0][0];
      expect(call.where.tenantId).toBe(tenantId);
      expect(call.create.autoEscalateOverdue).toBe(false);
      expect(call.create.aiCaseSummarization).toBe(false); // playbook opt-in default
    });

    it('update accepts partial payload', async () => {
      (prismaMock.caseAutomationSetting.upsert as any).mockResolvedValue({ tenantId });
      await caller.automation.update({ aiCaseSummarization: true });
      const call = (prismaMock.caseAutomationSetting.upsert as any).mock.calls[0][0];
      expect(call.update.aiCaseSummarization).toBe(true);
      expect(call.update.autoEscalateOverdue).toBeUndefined();
    });

    it('resetToDefaults writes all 12 toggles back to factory defaults', async () => {
      (prismaMock.caseAutomationSetting.upsert as any).mockResolvedValue({ tenantId });
      await caller.automation.resetToDefaults();
      const call = (prismaMock.caseAutomationSetting.upsert as any).mock.calls[0][0];
      expect(call.update.notifyOnDuplicate).toBe(true);
      expect(call.update.restrictTagCreationToAdmins).toBe(false);
      expect(call.update.preventDeleteWithOpenTasks).toBe(true);
      // AI defaults FALSE
      expect(call.update.aiCaseSummarization).toBe(false);
    });
  });
});
