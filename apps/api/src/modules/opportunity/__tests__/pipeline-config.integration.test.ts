/**
 * Pipeline Configuration Integration Tests
 *
 * IFC-063: FLOW-007 Pipeline Stage Customization
 *
 * Integration tests for pipeline configuration endpoints:
 * - Protected stage validation at API level
 * - Tenant isolation
 * - Full request/response cycle
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pipelineConfigRouter } from '../pipeline-config.router';
import {
  prismaMock,
  createTestContext,
} from '../../../test/setup';
import {
  PROTECTED_STAGES,
} from '@intelliflow/validators/opportunity';
import { OPPORTUNITY_STAGES } from '@intelliflow/domain';

// Mock pipeline stage config
const createMockPipelineConfig = (stageKey: string, overrides: Record<string, unknown> = {}) => ({
  id: `config-${stageKey}`,
  tenantId: 'test-tenant-id',
  stageKey,
  displayName: stageKey.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
  color: '#6366f1',
  order: OPPORTUNITY_STAGES.indexOf(stageKey as any),
  probability: 50,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

describe('Pipeline Config Router Integration', () => {
  const ctx = createTestContext();
  const caller = pipelineConfigRouter.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.pipelineStageConfig.findMany?.mockResolvedValue?.([]);
    prismaMock.pipelineStageConfig.findUnique?.mockResolvedValue?.(null);
  });

  describe('getAll', () => {
    it('returns merged defaults with custom configs', async () => {
      const customConfigs = [
        createMockPipelineConfig('PROSPECTING', { displayName: 'Custom First Stage' }),
        createMockPipelineConfig('PROPOSAL', { color: '#ff6b6b' }),
      ];
      prismaMock.pipelineStageConfig.findMany.mockResolvedValue(customConfigs as any);

      const result = await caller.getAll();

      expect(result.stages).toHaveLength(OPPORTUNITY_STAGES.length);

      // Check custom config is applied
      const prospecting = result.stages.find((s) => s.stageKey === 'PROSPECTING');
      expect(prospecting?.displayName).toBe('Custom First Stage');

      const proposal = result.stages.find((s) => s.stageKey === 'PROPOSAL');
      expect(proposal?.color).toBe('#ff6b6b');

      // Check default config is used for unconfigured stages
      const negotiation = result.stages.find((s) => s.stageKey === 'NEGOTIATION');
      expect(negotiation?.displayName).toBe('Negotiation');
    });
  });

  describe('updateStage', () => {
    it('creates new config for unconfigured stage', async () => {
      const newConfig = createMockPipelineConfig('QUALIFICATION', {
        displayName: 'New Qualification',
        color: '#22c55e',
      });

      prismaMock.pipelineStageConfig.findUnique.mockResolvedValue(null);
      prismaMock.pipelineStageConfig.create.mockResolvedValue(newConfig as any);

      const result = await caller.updateStage({
        stage: 'QUALIFICATION',
        displayName: 'New Qualification',
        color: '#22c55e',
      });

      expect(prismaMock.pipelineStageConfig.create).toHaveBeenCalled();
      expect(result.displayName).toBe('New Qualification');
    });

    it('rejects deactivation of protected stage CLOSED_WON', async () => {
      const existingConfig = createMockPipelineConfig('CLOSED_WON');
      prismaMock.pipelineStageConfig.findUnique.mockResolvedValue(existingConfig as any);

      await expect(
        caller.updateStage({
          stage: 'CLOSED_WON',
          isActive: false,
        })
      ).rejects.toThrow(/Cannot deactivate terminal stage/);
    });

    it('rejects deactivation of protected stage CLOSED_LOST', async () => {
      const existingConfig = createMockPipelineConfig('CLOSED_LOST');
      prismaMock.pipelineStageConfig.findUnique.mockResolvedValue(existingConfig as any);

      await expect(
        caller.updateStage({
          stage: 'CLOSED_LOST',
          isActive: false,
        })
      ).rejects.toThrow(/Cannot deactivate terminal stage/);
    });
  });

  describe('updateAll', () => {
    it('batch upserts all stages in transaction', async () => {
      const stages = [
        { stage: 'PROSPECTING' as const, displayName: 'Step 1', sortOrder: 0 },
        { stage: 'QUALIFICATION' as const, displayName: 'Step 2', sortOrder: 1 },
      ];

      prismaMock.$transaction.mockResolvedValue(
        stages.map((s) => createMockPipelineConfig(s.stage, s))
      );

      const result = await caller.updateAll({ stages });

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(2);
    });

    it('rejects batch update with protected stage deactivation', async () => {
      const stages = [
        { stage: 'PROSPECTING' as const, isActive: true },
        { stage: 'CLOSED_WON' as const, isActive: false }, // Should fail
      ];

      await expect(caller.updateAll({ stages })).rejects.toThrow(
        /Cannot deactivate terminal stage/
      );
    });
  });

  describe('resetToDefaults', () => {
    it('removes all tenant configs', async () => {
      prismaMock.pipelineStageConfig.deleteMany.mockResolvedValue({ count: 5 });

      const result = await caller.resetToDefaults();

      expect(prismaMock.pipelineStageConfig.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'test-tenant-id',
          }),
        })
      );
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(5);
    });
  });

  describe('tenant isolation', () => {
    it('prevents cross-tenant access', async () => {
      // All queries should include tenantId filter
      prismaMock.pipelineStageConfig.findMany.mockResolvedValue([]);

      await caller.getAll();

      expect(prismaMock.pipelineStageConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'test-tenant-id',
          }),
        })
      );
    });
  });
});
