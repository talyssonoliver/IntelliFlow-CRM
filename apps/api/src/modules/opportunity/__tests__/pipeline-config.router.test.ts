/**
 * Pipeline Configuration Router Tests
 *
 * IFC-063: FLOW-007 Pipeline Stage Customization
 *
 * Comprehensive tests for pipeline configuration CRUD operations:
 * - getAll: Retrieve all stages with defaults for unconfigured
 * - updateStage: Update individual stage configuration
 * - updateAll: Batch update all stages
 * - resetToDefaults: Clear all custom configurations
 * - getStats: Get deal statistics per stage
 *
 * Target: <100ms save operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pipelineConfigRouter } from '../pipeline-config.router';
import {
  prismaMock,
  createTestContext,
  TEST_UUIDS,
} from '../../../test/setup';
import {
  DEFAULT_STAGE_COLORS,
  DEFAULT_STAGE_NAMES,
  DEFAULT_STAGE_PROBABILITIES,
} from '@intelliflow/validators/opportunity';
import { OPPORTUNITY_STAGES } from '@intelliflow/domain';
import { Prisma } from '@prisma/client';

// Mock pipeline stage config
const createMockPipelineConfig = (stageKey: string, overrides: Record<string, unknown> = {}) => ({
  id: `config-${stageKey}`,
  tenantId: 'test-tenant-id',
  stageKey,
  displayName: DEFAULT_STAGE_NAMES[stageKey] || stageKey,
  color: DEFAULT_STAGE_COLORS[stageKey] || '#6366f1',
  order: OPPORTUNITY_STAGES.indexOf(stageKey as any),
  probability: DEFAULT_STAGE_PROBABILITIES[stageKey] || 0,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

describe('Pipeline Config Router', () => {
  const ctx = createTestContext();
  const caller = pipelineConfigRouter.createCaller(ctx);

  beforeEach(() => {
    // Reset is handled by setup.ts
    // Add defaults for pipelineStageConfig
    prismaMock.pipelineStageConfig.findMany?.mockResolvedValue?.([]);
    prismaMock.pipelineStageConfig.findUnique?.mockResolvedValue?.(null);
  });

  describe('getAll', () => {
    it('should return all stages with defaults when no custom configs exist', async () => {
      prismaMock.pipelineStageConfig.findMany.mockResolvedValue([]);

      const result = await caller.getAll();

      expect(result.stages).toHaveLength(7);
      expect(result.stages[0].stageKey).toBe('PROSPECTING');
      expect(result.stages[0].displayName).toBe('Prospecting');
      expect(result.stages[0].color).toBe('#6366f1');
      expect(result.stages[0].probability).toBe(10);
      expect(result.stages[0].isActive).toBe(true);
    });

    it('should merge custom configs with defaults', async () => {
      const customConfig = createMockPipelineConfig('PROPOSAL', {
        displayName: 'Custom Proposal Stage',
        color: '#ff6b6b',
        probability: 55,
      });

      prismaMock.pipelineStageConfig.findMany.mockResolvedValue([customConfig] as any);

      const result = await caller.getAll();

      expect(result.stages).toHaveLength(7);

      // Custom config should be used
      const proposalStage = result.stages.find((s) => s.stageKey === 'PROPOSAL');
      expect(proposalStage?.displayName).toBe('Custom Proposal Stage');
      expect(proposalStage?.color).toBe('#ff6b6b');
      expect(proposalStage?.probability).toBe(55);

      // Other stages should use defaults
      const prospectingStage = result.stages.find((s) => s.stageKey === 'PROSPECTING');
      expect(prospectingStage?.displayName).toBe('Prospecting');
    });

    it('should sort stages by order', async () => {
      const customConfigs = [
        createMockPipelineConfig('PROSPECTING', { order: 2 }),
        createMockPipelineConfig('QUALIFICATION', { order: 0 }),
        createMockPipelineConfig('PROPOSAL', { order: 1 }),
      ];

      prismaMock.pipelineStageConfig.findMany.mockResolvedValue(customConfigs as any);

      const result = await caller.getAll();

      // Check that sorting works - first 3 should be in custom order
      expect(result.stages[0].stageKey).toBe('QUALIFICATION');
      expect(result.stages[1].stageKey).toBe('PROPOSAL');
      expect(result.stages[2].stageKey).toBe('PROSPECTING');
    });

    it('should include all required fields in response', async () => {
      prismaMock.pipelineStageConfig.findMany.mockResolvedValue([]);

      const result = await caller.getAll();
      const stage = result.stages[0];

      expect(stage).toHaveProperty('id');
      expect(stage).toHaveProperty('stageKey');
      expect(stage).toHaveProperty('displayName');
      expect(stage).toHaveProperty('color');
      expect(stage).toHaveProperty('order');
      expect(stage).toHaveProperty('probability');
      expect(stage).toHaveProperty('isActive');
      expect(stage).toHaveProperty('createdAt');
      expect(stage).toHaveProperty('updatedAt');
    });
  });

  describe('updateStage', () => {
    it('should update existing stage configuration', async () => {
      const existingConfig = createMockPipelineConfig('PROPOSAL');
      const updatedConfig = {
        ...existingConfig,
        displayName: 'Updated Proposal',
        color: '#22c55e',
      };

      prismaMock.pipelineStageConfig.findUnique.mockResolvedValue(existingConfig as any);
      prismaMock.pipelineStageConfig.update.mockResolvedValue(updatedConfig as any);

      const result = await caller.updateStage({
        stageKey: 'PROPOSAL',
        displayName: 'Updated Proposal',
        color: '#22c55e',
      });

      expect(result.displayName).toBe('Updated Proposal');
      expect(result.color).toBe('#22c55e');
      expect(prismaMock.pipelineStageConfig.update).toHaveBeenCalled();
    });

    it('should create new config when stage not configured yet', async () => {
      const newConfig = createMockPipelineConfig('PROPOSAL', {
        displayName: 'New Proposal Name',
      });

      prismaMock.pipelineStageConfig.findUnique.mockResolvedValue(null);
      prismaMock.pipelineStageConfig.create.mockResolvedValue(newConfig as any);

      const result = await caller.updateStage({
        stageKey: 'PROPOSAL',
        displayName: 'New Proposal Name',
      });

      expect(result.displayName).toBe('New Proposal Name');
      expect(prismaMock.pipelineStageConfig.create).toHaveBeenCalled();
    });

    it('should use defaults for unspecified fields when creating', async () => {
      prismaMock.pipelineStageConfig.findUnique.mockResolvedValue(null);
      prismaMock.pipelineStageConfig.create.mockResolvedValue(
        createMockPipelineConfig('NEGOTIATION', { color: '#ff9f43' }) as any
      );

      await caller.updateStage({
        stageKey: 'NEGOTIATION',
        color: '#ff9f43',
      });

      expect(prismaMock.pipelineStageConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stageKey: 'NEGOTIATION',
            color: '#ff9f43',
            displayName: 'Negotiation', // Default
            probability: 80, // Default for NEGOTIATION
          }),
        })
      );
    });

    it('should validate hex color format', async () => {
      // Zod validation should reject invalid colors
      await expect(
        caller.updateStage({
          stageKey: 'PROPOSAL',
          color: 'not-a-hex-color',
        })
      ).rejects.toThrow();
    });

    it('should validate probability range 0-100', async () => {
      await expect(
        caller.updateStage({
          stageKey: 'PROPOSAL',
          probability: 150, // Invalid - over 100
        })
      ).rejects.toThrow();

      await expect(
        caller.updateStage({
          stageKey: 'PROPOSAL',
          probability: -10, // Invalid - negative
        })
      ).rejects.toThrow();
    });

    it('should update isActive flag', async () => {
      const existingConfig = createMockPipelineConfig('NEEDS_ANALYSIS');
      const updatedConfig = { ...existingConfig, isActive: false };

      prismaMock.pipelineStageConfig.findUnique.mockResolvedValue(existingConfig as any);
      prismaMock.pipelineStageConfig.update.mockResolvedValue(updatedConfig as any);

      const result = await caller.updateStage({
        stageKey: 'NEEDS_ANALYSIS',
        isActive: false,
      });

      expect(result.isActive).toBe(false);
    });
  });

  describe('updateAll', () => {
    it('should batch update all stages', async () => {
      const stages = OPPORTUNITY_STAGES.map((stageKey, index) => ({
        stageKey,
        displayName: `Custom ${stageKey}`,
        color: '#6366f1',
        order: index,
        probability: index * 15,
        isActive: true,
      }));

      prismaMock.$transaction.mockResolvedValue(
        stages.map((s) => createMockPipelineConfig(s.stageKey, s))
      );

      const result = await caller.updateAll({ stages });

      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(7);
    });

    it('should use upsert for each stage', async () => {
      const stages = [
        {
          stageKey: 'PROSPECTING' as const,
          displayName: 'First Contact',
          color: '#6366f1',
          order: 0,
          probability: 10,
          isActive: true,
        },
      ];

      prismaMock.$transaction.mockResolvedValue([createMockPipelineConfig('PROSPECTING')]);

      await caller.updateAll({ stages });

      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('should validate all stages in batch', async () => {
      const invalidStages = [
        {
          stageKey: 'PROSPECTING' as const,
          displayName: 'Valid',
          color: 'invalid', // Invalid color
          order: 0,
          probability: 10,
          isActive: true,
        },
      ];

      await expect(caller.updateAll({ stages: invalidStages })).rejects.toThrow();
    });

    it('should handle empty stages array', async () => {
      await expect(caller.updateAll({ stages: [] })).rejects.toThrow();
    });
  });

  describe('resetToDefaults', () => {
    it('should delete all custom configurations', async () => {
      prismaMock.pipelineStageConfig.deleteMany.mockResolvedValue({ count: 5 });

      const result = await caller.resetToDefaults();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(5);
      expect(prismaMock.pipelineStageConfig.deleteMany).toHaveBeenCalled();
    });

    it('should handle case when no configs exist', async () => {
      prismaMock.pipelineStageConfig.deleteMany.mockResolvedValue({ count: 0 });

      const result = await caller.resetToDefaults();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return deal statistics per stage', async () => {
      const stageStats = [
        { stage: 'PROSPECTING', _count: 5, _sum: { value: new Prisma.Decimal(50000) } },
        { stage: 'PROPOSAL', _count: 3, _sum: { value: new Prisma.Decimal(150000) } },
        { stage: 'CLOSED_WON', _count: 10, _sum: { value: new Prisma.Decimal(500000) } },
      ];

      const configs = [
        createMockPipelineConfig('PROSPECTING'),
        createMockPipelineConfig('PROPOSAL', { color: '#ff6b6b' }),
      ];

      vi.mocked(prismaMock.opportunity.groupBy).mockResolvedValue(
        stageStats as unknown as Awaited<ReturnType<typeof prismaMock.opportunity.groupBy>>
      );
      prismaMock.pipelineStageConfig.findMany.mockResolvedValue(configs as any);

      const result = await caller.getStats();

      expect(result.stats).toHaveLength(7);

      const prospecting = result.stats.find((s) => s.stageKey === 'PROSPECTING');
      expect(prospecting?.dealCount).toBe(5);
      expect(prospecting?.totalValue).toBe('50000');

      const closedWon = result.stats.find((s) => s.stageKey === 'CLOSED_WON');
      expect(closedWon?.dealCount).toBe(10);
      expect(closedWon?.totalValue).toBe('500000');

      // Stage with no deals
      const negotiation = result.stats.find((s) => s.stageKey === 'NEGOTIATION');
      expect(negotiation?.dealCount).toBe(0);
      expect(negotiation?.totalValue).toBe('0');
    });

    it('should use custom colors from config', async () => {
      const configs = [
        createMockPipelineConfig('PROPOSAL', { color: '#custom-color' }),
      ];

      vi.mocked(prismaMock.opportunity.groupBy).mockResolvedValue([]);
      prismaMock.pipelineStageConfig.findMany.mockResolvedValue(configs as any);

      const result = await caller.getStats();

      const proposal = result.stats.find((s) => s.stageKey === 'PROPOSAL');
      expect(proposal?.color).toBe('#custom-color');
    });

    it('should handle empty pipeline', async () => {
      vi.mocked(prismaMock.opportunity.groupBy).mockResolvedValue([]);
      prismaMock.pipelineStageConfig.findMany.mockResolvedValue([]);

      const result = await caller.getStats();

      expect(result.stats).toHaveLength(7);
      result.stats.forEach((stat) => {
        expect(stat.dealCount).toBe(0);
        expect(stat.totalValue).toBe('0');
      });
    });
  });

  describe('performance', () => {
    it('should complete getAll in under 100ms', async () => {
      prismaMock.pipelineStageConfig.findMany.mockResolvedValue([]);

      const start = Date.now();
      await caller.getAll();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should complete updateStage in under 100ms', async () => {
      const config = createMockPipelineConfig('PROPOSAL');
      prismaMock.pipelineStageConfig.findUnique.mockResolvedValue(config as any);
      prismaMock.pipelineStageConfig.update.mockResolvedValue(config as any);

      const start = Date.now();
      await caller.updateStage({
        stageKey: 'PROPOSAL',
        displayName: 'Fast Update',
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });
});
