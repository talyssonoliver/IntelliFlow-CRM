/**
 * Experiment Router Tests - IFC-025: A/B Testing Framework
 *
 * Tests for the experiment tRPC router endpoints.
 * Covers:
 * - Experiment lifecycle (create, update, start, pause, complete, archive)
 * - Variant assignment and retrieval
 * - Score and conversion recording
 * - Statistical analysis
 * - Query endpoints (getById, list, getStatus, getResults)
 * - Error handling when experiment service is unavailable
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { experimentRouter } from '../experiment.router';
import { createTestContext } from '../../../test/setup';
import { TRPCError } from '@trpc/server';

// Mock the tenant context helper
vi.mock('../../../security/tenant-context', () => ({
  getTenantContext: vi.fn((ctx: any) => ctx),
}));

// Mock the validators - provide real schemas that the router expects
vi.mock('@intelliflow/validators', () => {
  const { z } = require('zod');
  return {
    createExperimentSchema: z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      type: z.string(),
      hypothesis: z.string().min(10).max(500),
      controlVariant: z.string().default('manual'),
      treatmentVariant: z.string().default('ai'),
      trafficPercent: z.number().int().min(1).max(99).default(50),
      minSampleSize: z.number().int().min(1).default(100),
      significanceLevel: z.number().min(0.001).max(0.1).default(0.05),
    }),
    updateExperimentSchema: z.object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(1000).optional(),
      hypothesis: z.string().min(10).max(500).optional(),
      trafficPercent: z.number().int().min(1).max(99).optional(),
    }),
    recordScoreInputSchema: z.object({
      experimentId: z.string().cuid(),
      leadId: z.string().cuid(),
      score: z.number().int().min(0).max(100),
      confidence: z.number().min(0).max(1).optional(),
    }),
    recordConversionInputSchema: z.object({
      experimentId: z.string().cuid(),
      leadId: z.string().cuid(),
      conversionValue: z.number().min(0).optional(),
    }),
    analyzeExperimentInputSchema: z.object({
      experimentId: z.string().cuid(),
      includeConversionAnalysis: z.boolean().default(true),
    }),
  };
});

// Generate valid CUIDs for tests
const CUID_1 = 'clh2v0001000008l0g4e5d3k7';
const CUID_2 = 'clh2v0002000008l0g4e5d3k8';
const CUID_LEAD = 'clh2v0003000008l0g4e5d3k9';

describe('Experiment Router', () => {
  const mockExperimentService = {
    createExperiment: vi.fn(),
    updateExperiment: vi.fn(),
    startExperiment: vi.fn(),
    pauseExperiment: vi.fn(),
    completeExperiment: vi.fn(),
    archiveExperiment: vi.fn(),
    assignVariant: vi.fn(),
    getVariant: vi.fn(),
    recordScore: vi.fn(),
    recordConversion: vi.fn(),
    analyzeExperiment: vi.fn(),
    getExperiment: vi.fn(),
    listExperiments: vi.fn(),
    getStatus: vi.fn(),
    getResults: vi.fn(),
  };

  const ctx = createTestContext({
    services: {
      experiment: mockExperimentService,
    } as any,
  });

  const caller = experimentRouter.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Error handling: service not available
  // ===========================================================================

  describe('service unavailability', () => {
    it('should throw INTERNAL_SERVER_ERROR when experiment service is not available', async () => {
      const ctxNoService = createTestContext({
        services: {} as any,
      });
      const callerNoService = experimentRouter.createCaller(ctxNoService);

      await expect(
        callerNoService.create({
          name: 'Test Experiment',
          type: 'SCORING' as any,
          hypothesis: 'AI scoring improves lead conversion by 20%',
        })
      ).rejects.toThrow(TRPCError);

      await expect(
        callerNoService.create({
          name: 'Test Experiment',
          type: 'SCORING' as any,
          hypothesis: 'AI scoring improves lead conversion by 20%',
        })
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Experiment service not available',
      });
    });

    it('should throw when services is undefined', async () => {
      const ctxNoServices = createTestContext({
        services: undefined as any,
      });
      const callerNoServices = experimentRouter.createCaller(ctxNoServices);

      await expect(callerNoServices.list()).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
    });
  });

  // ===========================================================================
  // Experiment Lifecycle
  // ===========================================================================

  describe('create', () => {
    it('should create a new experiment', async () => {
      const mockResult = {
        id: CUID_1,
        name: 'Lead Scoring AB Test',
        status: 'DRAFT',
      };
      mockExperimentService.createExperiment.mockResolvedValue(mockResult);

      const result = await caller.create({
        name: 'Lead Scoring AB Test',
        type: 'SCORING' as any,
        hypothesis: 'AI scoring improves lead conversion by 20%',
      });

      expect(result).toEqual(mockResult);
      expect(mockExperimentService.createExperiment).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Lead Scoring AB Test',
          type: 'SCORING' as any,
          hypothesis: 'AI scoring improves lead conversion by 20%',
        }),
        expect.any(String) // tenantId
      );
    });
  });

  describe('update', () => {
    it('should update an experiment (DRAFT only)', async () => {
      const mockResult = { id: CUID_1, name: 'Updated Name', status: 'DRAFT' };
      mockExperimentService.updateExperiment.mockResolvedValue(mockResult);

      const result = await caller.update({
        experimentId: CUID_1,
        data: { name: 'Updated Name' },
      });

      expect(result).toEqual(mockResult);
      expect(mockExperimentService.updateExperiment).toHaveBeenCalledWith(CUID_1, {
        name: 'Updated Name',
      });
    });
  });

  describe('start', () => {
    it('should start an experiment', async () => {
      const mockResult = { id: CUID_1, status: 'RUNNING' };
      mockExperimentService.startExperiment.mockResolvedValue(mockResult);

      const result = await caller.start({ experimentId: CUID_1 });

      expect(result).toEqual(mockResult);
      expect(mockExperimentService.startExperiment).toHaveBeenCalledWith(CUID_1);
    });
  });

  describe('pause', () => {
    it('should pause a running experiment', async () => {
      const mockResult = { id: CUID_1, status: 'PAUSED' };
      mockExperimentService.pauseExperiment.mockResolvedValue(mockResult);

      const result = await caller.pause({ experimentId: CUID_1 });

      expect(result).toEqual(mockResult);
      expect(mockExperimentService.pauseExperiment).toHaveBeenCalledWith(CUID_1);
    });
  });

  describe('complete', () => {
    it('should complete an experiment', async () => {
      const mockResult = { id: CUID_1, status: 'COMPLETED' };
      mockExperimentService.completeExperiment.mockResolvedValue(mockResult);

      const result = await caller.complete({ experimentId: CUID_1 });

      expect(result).toEqual(mockResult);
      expect(mockExperimentService.completeExperiment).toHaveBeenCalledWith(CUID_1);
    });
  });

  describe('archive', () => {
    it('should archive a completed experiment', async () => {
      const mockResult = { id: CUID_1, status: 'ARCHIVED' };
      mockExperimentService.archiveExperiment.mockResolvedValue(mockResult);

      const result = await caller.archive({ experimentId: CUID_1 });

      expect(result).toEqual(mockResult);
      expect(mockExperimentService.archiveExperiment).toHaveBeenCalledWith(CUID_1);
    });
  });

  // ===========================================================================
  // Variant Assignment
  // ===========================================================================

  describe('assignVariant', () => {
    it('should assign a lead to an experiment variant', async () => {
      const mockResult = {
        id: CUID_2,
        experimentId: CUID_1,
        leadId: CUID_LEAD,
        variant: 'treatment',
      };
      mockExperimentService.assignVariant.mockResolvedValue(mockResult);

      const result = await caller.assignVariant({
        experimentId: CUID_1,
        leadId: CUID_LEAD,
      });

      expect(result).toEqual(mockResult);
      expect(mockExperimentService.assignVariant).toHaveBeenCalledWith(CUID_1, CUID_LEAD);
    });
  });

  describe('getVariant', () => {
    it('should get current variant for a lead', async () => {
      const mockResult = { variant: 'control' };
      mockExperimentService.getVariant.mockResolvedValue(mockResult);

      const result = await caller.getVariant({
        experimentId: CUID_1,
        leadId: CUID_LEAD,
      });

      expect(result).toEqual(mockResult);
      expect(mockExperimentService.getVariant).toHaveBeenCalledWith(CUID_1, CUID_LEAD);
    });

    it('should return null when lead is not assigned', async () => {
      mockExperimentService.getVariant.mockResolvedValue(null);

      const result = await caller.getVariant({
        experimentId: CUID_1,
        leadId: CUID_LEAD,
      });

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // Score & Conversion Recording
  // ===========================================================================

  describe('recordScore', () => {
    it('should record a score for a lead in an experiment', async () => {
      const mockResult = { success: true, score: 85 };
      mockExperimentService.recordScore.mockResolvedValue(mockResult);

      const result = await caller.recordScore({
        experimentId: CUID_1,
        leadId: CUID_LEAD,
        score: 85,
        confidence: 0.92,
      });

      expect(result).toEqual(mockResult);
      expect(mockExperimentService.recordScore).toHaveBeenCalledWith(
        expect.objectContaining({
          experimentId: CUID_1,
          leadId: CUID_LEAD,
          score: 85,
          confidence: 0.92,
        })
      );
    });
  });

  describe('recordConversion', () => {
    it('should record a conversion for a lead', async () => {
      const mockResult = { success: true };
      mockExperimentService.recordConversion.mockResolvedValue(mockResult);

      const result = await caller.recordConversion({
        experimentId: CUID_1,
        leadId: CUID_LEAD,
        conversionValue: 5000,
      });

      expect(result).toEqual(mockResult);
      expect(mockExperimentService.recordConversion).toHaveBeenCalledWith(
        expect.objectContaining({
          experimentId: CUID_1,
          leadId: CUID_LEAD,
          conversionValue: 5000,
        })
      );
    });
  });

  // ===========================================================================
  // Statistical Analysis
  // ===========================================================================

  describe('analyze', () => {
    it('should run statistical analysis on an experiment', async () => {
      const mockResult = {
        isSignificant: true,
        pValue: 0.003,
        winner: 'treatment',
        effectSize: 0.45,
      };
      mockExperimentService.analyzeExperiment.mockResolvedValue(mockResult);

      const result = await caller.analyze({
        experimentId: CUID_1,
      });

      expect(result).toEqual(mockResult);
      expect(mockExperimentService.analyzeExperiment).toHaveBeenCalledWith(CUID_1);
    });
  });

  // ===========================================================================
  // Queries
  // ===========================================================================

  describe('getById', () => {
    it('should get experiment by ID', async () => {
      const mockResult = {
        id: CUID_1,
        name: 'Lead Scoring Test',
        status: 'RUNNING',
      };
      mockExperimentService.getExperiment.mockResolvedValue(mockResult);

      const result = await caller.getById({ experimentId: CUID_1 });

      expect(result).toEqual(mockResult);
      expect(mockExperimentService.getExperiment).toHaveBeenCalledWith(CUID_1);
    });

    it('should return null for non-existent experiment', async () => {
      mockExperimentService.getExperiment.mockResolvedValue(null);

      const result = await caller.getById({ experimentId: CUID_1 });

      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('should list all experiments for the tenant', async () => {
      const mockResult = [
        { id: CUID_1, name: 'Experiment 1', status: 'RUNNING' },
        { id: CUID_2, name: 'Experiment 2', status: 'DRAFT' },
      ];
      mockExperimentService.listExperiments.mockResolvedValue(mockResult);

      const result = await caller.list();

      expect(result).toEqual(mockResult);
      expect(mockExperimentService.listExperiments).toHaveBeenCalledWith(
        expect.any(String) // tenantId
      );
    });

    it('should return empty array when no experiments exist', async () => {
      mockExperimentService.listExperiments.mockResolvedValue([]);

      const result = await caller.list();

      expect(result).toEqual([]);
    });
  });

  describe('getStatus', () => {
    it('should get experiment status with progress', async () => {
      const mockResult = {
        experimentId: CUID_1,
        status: 'RUNNING',
        controlSampleSize: 45,
        treatmentSampleSize: 43,
        targetSampleSize: 100,
        progressPercent: 44,
        canAnalyze: false,
      };
      mockExperimentService.getStatus.mockResolvedValue(mockResult);

      const result = await caller.getStatus({ experimentId: CUID_1 });

      expect(result).toEqual(mockResult);
      expect(mockExperimentService.getStatus).toHaveBeenCalledWith(CUID_1);
    });
  });

  describe('getResults', () => {
    it('should get experiment results', async () => {
      const mockResult = {
        id: CUID_2,
        experimentId: CUID_1,
        isSignificant: true,
        winner: 'treatment',
        pValue: 0.02,
        effectSize: 0.35,
        recommendation: 'Deploy treatment variant',
      };
      mockExperimentService.getResults.mockResolvedValue(mockResult);

      const result = await caller.getResults({ experimentId: CUID_1 });

      expect(result).toEqual(mockResult);
      expect(mockExperimentService.getResults).toHaveBeenCalledWith(CUID_1);
    });

    it('should return null when no results available', async () => {
      mockExperimentService.getResults.mockResolvedValue(null);

      const result = await caller.getResults({ experimentId: CUID_1 });

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // Input validation
  // ===========================================================================

  describe('input validation', () => {
    it('should reject invalid CUID for experimentId', async () => {
      await expect(caller.start({ experimentId: 'not-a-cuid' })).rejects.toThrow();
    });

    it('should reject invalid CUID for leadId in assignVariant', async () => {
      await expect(
        caller.assignVariant({
          experimentId: CUID_1,
          leadId: 'not-a-cuid',
        })
      ).rejects.toThrow();
    });

    it('should reject score out of range', async () => {
      await expect(
        caller.recordScore({
          experimentId: CUID_1,
          leadId: CUID_LEAD,
          score: 200, // > 100
        })
      ).rejects.toThrow();
    });

    it('should reject negative conversion value', async () => {
      await expect(
        caller.recordConversion({
          experimentId: CUID_1,
          leadId: CUID_LEAD,
          conversionValue: -100,
        })
      ).rejects.toThrow();
    });
  });
});
