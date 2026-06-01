/**
 * ExperimentService Tests
 *
 * Tests the ExperimentService application service which orchestrates
 * A/B testing for AI vs manual lead scoring, variant assignment,
 * and statistical analysis.
 *
 * Coverage target: >90% for application layer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ExperimentService,
  ExperimentRecord,
  AssignmentRecord,
  ExperimentResultRecord,
  ExperimentRepositoryPort,
  AssignmentRepositoryPort,
  ResultRepositoryPort,
} from '../ExperimentService';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockExperimentRepo(): Record<string, any> {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByTenantId: vi.fn(),
    findRunning: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockAssignmentRepo(): Record<string, any> {
  return {
    create: vi.fn(),
    findByExperimentId: vi.fn(),
    findByLeadId: vi.fn(),
    findByExperimentAndLead: vi.fn(),
    updateScore: vi.fn(),
    updateConversion: vi.fn(),
    countByVariant: vi.fn(),
    countVariantsForExperiments: vi.fn(),
    getScoresByVariant: vi.fn(),
    getConversionsByVariant: vi.fn(),
  };
}

function createMockResultRepo(): Record<string, any> {
  return {
    create: vi.fn(),
    findByExperimentId: vi.fn(),
    findByExperimentIds: vi.fn(),
    update: vi.fn(),
  };
}

function createMockEventBus(): Record<string, any> {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    publishAll: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExperiment(overrides: Partial<ExperimentRecord> = {}): ExperimentRecord {
  return {
    id: 'exp-1',
    name: 'Test Experiment',
    description: null,
    type: 'AI_VS_MANUAL',
    status: 'DRAFT',
    hypothesis: 'AI scoring outperforms manual',
    controlVariant: 'manual',
    treatmentVariant: 'ai',
    trafficPercent: 50,
    startDate: null,
    endDate: null,
    minSampleSize: 100,
    significanceLevel: 0.05,
    tenantId: 'tenant-1',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<AssignmentRecord> = {}): AssignmentRecord {
  return {
    id: 'assign-1',
    experimentId: 'exp-1',
    leadId: 'lead-1',
    variant: 'treatment',
    score: null,
    confidence: null,
    convertedAt: null,
    conversionValue: null,
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeResultRecord(overrides: Partial<ExperimentResultRecord> = {}): ExperimentResultRecord {
  return {
    id: 'result-1',
    experimentId: 'exp-1',
    controlSampleSize: 100,
    treatmentSampleSize: 100,
    controlMean: 50,
    treatmentMean: 60,
    controlStdDev: 10,
    treatmentStdDev: 10,
    tStatistic: 7.07,
    pValue: 0.001,
    confidenceInterval: { lower: 7, upper: 13 },
    effectSize: 1.0,
    controlConversionRate: 0.2,
    treatmentConversionRate: 0.3,
    chiSquareStatistic: 2.5,
    chiSquarePValue: 0.11,
    isSignificant: true,
    winner: 'treatment',
    recommendation: 'Recommend treatment',
    analyzedAt: new Date('2025-01-15'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExperimentService', () => {
  let service: ExperimentService;
  let experimentRepo: Record<string, any>;
  let assignmentRepo: Record<string, any>;
  let resultRepo: Record<string, any>;
  let eventBus: Record<string, any>;

  beforeEach(() => {
    experimentRepo = createMockExperimentRepo();
    assignmentRepo = createMockAssignmentRepo();
    resultRepo = createMockResultRepo();
    eventBus = createMockEventBus();

    service = new ExperimentService(
      experimentRepo as ExperimentRepositoryPort,
      assignmentRepo as AssignmentRepositoryPort,
      resultRepo as ResultRepositoryPort,
      eventBus as any
    );
  });

  // =========================================================================
  // listExperiments — NP-001 N+1 regression (was 3N+1, now a constant 3 queries)
  // =========================================================================
  describe('listExperiments (NP-001 N+1 fix)', () => {
    function wireRepos(experiments: ExperimentRecord[]): void {
      experimentRepo.findByTenantId.mockResolvedValue(experiments);
      assignmentRepo.countVariantsForExperiments.mockResolvedValue(
        experiments.flatMap((e) => [
          { experimentId: e.id, variant: 'control', count: 1 },
          { experimentId: e.id, variant: 'treatment', count: 2 },
        ])
      );
      resultRepo.findByExperimentIds.mockResolvedValue([]);
    }

    it('returns correct per-experiment summaries from batched lookups', async () => {
      const experiments = [
        makeExperiment({ id: 'exp-1', minSampleSize: 10 }),
        makeExperiment({ id: 'exp-2', minSampleSize: 10 }),
      ];
      experimentRepo.findByTenantId.mockResolvedValue(experiments);
      assignmentRepo.countVariantsForExperiments.mockResolvedValue([
        { experimentId: 'exp-1', variant: 'control', count: 4 },
        { experimentId: 'exp-1', variant: 'treatment', count: 6 },
        // exp-2 has only treatment assignments — control must default to 0.
        { experimentId: 'exp-2', variant: 'treatment', count: 3 },
      ]);
      resultRepo.findByExperimentIds.mockResolvedValue([
        makeResultRecord({ experimentId: 'exp-1', isSignificant: true, winner: 'treatment' }),
      ]);

      const summaries = await service.listExperiments('tenant-1');

      expect(summaries).toHaveLength(2);
      expect(summaries[0]).toMatchObject({
        id: 'exp-1',
        controlSampleSize: 4,
        treatmentSampleSize: 6,
        totalAssignments: 10,
        progressPercent: 50, // 10 / (10*2) * 100
        hasResult: true,
        isSignificant: true,
        winner: 'treatment',
      });
      expect(summaries[1]).toMatchObject({
        id: 'exp-2',
        controlSampleSize: 0,
        treatmentSampleSize: 3,
        totalAssignments: 3,
        hasResult: false,
        isSignificant: null,
        winner: null,
      });
    });

    it('issues a CONSTANT number of repo calls regardless of experiment count (no N+1)', async () => {
      wireRepos([makeExperiment({ id: 'a' }), makeExperiment({ id: 'b' })]);
      await service.listExperiments('tenant-1');
      const callsForTwo =
        experimentRepo.findByTenantId.mock.calls.length +
        assignmentRepo.countVariantsForExperiments.mock.calls.length +
        resultRepo.findByExperimentIds.mock.calls.length;

      vi.clearAllMocks();

      wireRepos(Array.from({ length: 10 }, (_, i) => makeExperiment({ id: `e${i}` })));
      await service.listExperiments('tenant-1');
      const callsForTen =
        experimentRepo.findByTenantId.mock.calls.length +
        assignmentRepo.countVariantsForExperiments.mock.calls.length +
        resultRepo.findByExperimentIds.mock.calls.length;

      // 3 queries total at BOTH sizes — query count does not grow with N.
      expect(callsForTwo).toBe(3);
      expect(callsForTen).toBe(3);

      // The old per-experiment N+1 methods must NOT be used by listExperiments.
      expect(assignmentRepo.countByVariant).not.toHaveBeenCalled();
      expect(resultRepo.findByExperimentId).not.toHaveBeenCalled();
    });

    it('short-circuits (no assignment/result queries) when there are no experiments', async () => {
      experimentRepo.findByTenantId.mockResolvedValue([]);
      const summaries = await service.listExperiments('tenant-1');
      expect(summaries).toEqual([]);
      expect(assignmentRepo.countVariantsForExperiments).not.toHaveBeenCalled();
      expect(resultRepo.findByExperimentIds).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // createExperiment
  // =========================================================================

  describe('createExperiment', () => {
    it('should create an experiment with provided values', async () => {
      const created = makeExperiment();
      experimentRepo.create.mockResolvedValue(created);

      const result = await service.createExperiment(
        {
          name: 'Test Experiment',
          type: 'AI_VS_MANUAL',
          hypothesis: 'AI scoring outperforms manual',
          controlVariant: 'manual',
          treatmentVariant: 'ai',
          trafficPercent: 50,
          minSampleSize: 100,
          significanceLevel: 0.05,
        },
        'tenant-1'
      );

      expect(result).toEqual(created);
      expect(experimentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Experiment',
          type: 'AI_VS_MANUAL',
          hypothesis: 'AI scoring outperforms manual',
          controlVariant: 'manual',
          treatmentVariant: 'ai',
          trafficPercent: 50,
          minSampleSize: 100,
          significanceLevel: 0.05,
          tenantId: 'tenant-1',
        })
      );
      expect(eventBus.publish).toHaveBeenCalledTimes(1);
    });

    it('should apply defaults for optional fields', async () => {
      const created = makeExperiment();
      experimentRepo.create.mockResolvedValue(created);

      await service.createExperiment(
        {
          name: 'Test',
          type: 'AI_VS_MANUAL',
          hypothesis: 'hypothesis',
        } as any,
        'tenant-1'
      );

      const call = experimentRepo.create.mock.calls[0][0];
      expect(call.controlVariant).toBe('manual');
      expect(call.treatmentVariant).toBe('ai');
      expect(call.trafficPercent).toBe(50); // EXPERIMENT_DEFAULTS.DEFAULT_TRAFFIC_PERCENT
      expect(call.minSampleSize).toBe(100);
      expect(call.significanceLevel).toBe(0.05); // EXPERIMENT_DEFAULTS.DEFAULT_SIGNIFICANCE_LEVEL
    });

    it('should publish ExperimentCreatedEvent', async () => {
      const created = makeExperiment();
      experimentRepo.create.mockResolvedValue(created);

      await service.createExperiment(
        {
          name: 'Test',
          type: 'AI_VS_MANUAL',
          hypothesis: 'hypothesis',
        } as any,
        'tenant-1'
      );

      const publishedEvent = eventBus.publish.mock.calls[0][0];
      expect(publishedEvent.eventType).toBe('experiment.created');
      expect(publishedEvent.experimentId).toBe('exp-1');
      expect(publishedEvent.tenantId).toBe('tenant-1');
    });
  });

  // =========================================================================
  // updateExperiment
  // =========================================================================

  describe('updateExperiment', () => {
    it('should update a DRAFT experiment', async () => {
      const existing = makeExperiment({ status: 'DRAFT' });
      experimentRepo.findById.mockResolvedValue(existing);
      experimentRepo.update.mockResolvedValue({ ...existing, name: 'Updated' });

      const result = await service.updateExperiment('exp-1', { name: 'Updated' });

      expect(result.name).toBe('Updated');
      expect(experimentRepo.update).toHaveBeenCalledWith(
        'exp-1',
        expect.objectContaining({ name: 'Updated' })
      );
    });

    it('should throw if experiment not found', async () => {
      experimentRepo.findById.mockResolvedValue(null);

      await expect(service.updateExperiment('missing', { name: 'X' })).rejects.toThrow(
        'Experiment missing not found'
      );
    });

    it('should throw if experiment is not in DRAFT status', async () => {
      experimentRepo.findById.mockResolvedValue(makeExperiment({ status: 'RUNNING' }));

      await expect(service.updateExperiment('exp-1', { name: 'X' })).rejects.toThrow(
        'Can only update experiments in DRAFT status'
      );
    });

    it('should preserve existing values when partial update is given', async () => {
      const existing = makeExperiment({ status: 'DRAFT', hypothesis: 'old' });
      experimentRepo.findById.mockResolvedValue(existing);
      experimentRepo.update.mockImplementation((_id: string, data: any) => ({
        ...existing,
        ...data,
      }));

      await service.updateExperiment('exp-1', { name: 'NewName' });

      const updateCall = experimentRepo.update.mock.calls[0][1];
      expect(updateCall.hypothesis).toBe('old');
    });
  });

  // =========================================================================
  // startExperiment
  // =========================================================================

  describe('startExperiment', () => {
    it('should start a DRAFT experiment', async () => {
      const existing = makeExperiment({ status: 'DRAFT' });
      experimentRepo.findById.mockResolvedValue(existing);
      experimentRepo.update.mockResolvedValue({ ...existing, status: 'RUNNING' });

      const result = await service.startExperiment('exp-1');

      expect(result.status).toBe('RUNNING');
      expect(experimentRepo.update).toHaveBeenCalledWith(
        'exp-1',
        expect.objectContaining({ status: 'RUNNING' })
      );
      expect(eventBus.publish).toHaveBeenCalledTimes(1);
    });

    it('should start a PAUSED experiment', async () => {
      const existing = makeExperiment({ status: 'PAUSED', startDate: new Date('2025-01-01') });
      experimentRepo.findById.mockResolvedValue(existing);
      experimentRepo.update.mockResolvedValue({ ...existing, status: 'RUNNING' });

      await service.startExperiment('exp-1');

      // Should retain existing startDate
      const updateCall = experimentRepo.update.mock.calls[0][1];
      expect(updateCall.startDate).toEqual(new Date('2025-01-01'));
    });

    it('should throw if experiment not found', async () => {
      experimentRepo.findById.mockResolvedValue(null);

      await expect(service.startExperiment('missing')).rejects.toThrow(
        'Experiment missing not found'
      );
    });

    it('should throw if experiment is COMPLETED', async () => {
      experimentRepo.findById.mockResolvedValue(makeExperiment({ status: 'COMPLETED' }));

      await expect(service.startExperiment('exp-1')).rejects.toThrow(
        'Can only start experiments in DRAFT or PAUSED status'
      );
    });

    it('should publish ExperimentStartedEvent', async () => {
      experimentRepo.findById.mockResolvedValue(makeExperiment({ status: 'DRAFT' }));
      experimentRepo.update.mockResolvedValue(makeExperiment({ status: 'RUNNING' }));

      await service.startExperiment('exp-1');

      const publishedEvent = eventBus.publish.mock.calls[0][0];
      expect(publishedEvent.eventType).toBe('experiment.started');
      expect(publishedEvent.experimentId).toBe('exp-1');
    });
  });

  // =========================================================================
  // pauseExperiment
  // =========================================================================

  describe('pauseExperiment', () => {
    it('should pause a RUNNING experiment', async () => {
      const existing = makeExperiment({ status: 'RUNNING' });
      experimentRepo.findById.mockResolvedValue(existing);
      experimentRepo.update.mockResolvedValue({ ...existing, status: 'PAUSED' });

      const result = await service.pauseExperiment('exp-1');

      expect(result.status).toBe('PAUSED');
      expect(experimentRepo.update).toHaveBeenCalledWith('exp-1', { status: 'PAUSED' });
    });

    it('should throw if experiment not found', async () => {
      experimentRepo.findById.mockResolvedValue(null);

      await expect(service.pauseExperiment('missing')).rejects.toThrow(
        'Experiment missing not found'
      );
    });

    it('should throw if experiment is not RUNNING', async () => {
      experimentRepo.findById.mockResolvedValue(makeExperiment({ status: 'DRAFT' }));

      await expect(service.pauseExperiment('exp-1')).rejects.toThrow(
        'Can only pause running experiments'
      );
    });
  });

  // =========================================================================
  // completeExperiment
  // =========================================================================

  describe('completeExperiment', () => {
    it('should complete an experiment and run analysis', async () => {
      const existing = makeExperiment({ status: 'RUNNING' });
      experimentRepo.findById.mockResolvedValue(existing);

      // Mock analysis dependencies
      assignmentRepo.getScoresByVariant.mockResolvedValue([50, 60, 55]);
      assignmentRepo.getConversionsByVariant.mockResolvedValue({ count: 5, total: 50 });
      resultRepo.findByExperimentId.mockResolvedValue(null);
      resultRepo.create.mockResolvedValue(makeResultRecord());

      experimentRepo.update.mockResolvedValue({ ...existing, status: 'COMPLETED' });

      const result = await service.completeExperiment('exp-1');

      expect(result.status).toBe('COMPLETED');
      expect(eventBus.publish).toHaveBeenCalled();
    });

    it('should throw if experiment not found', async () => {
      experimentRepo.findById.mockResolvedValue(null);

      await expect(service.completeExperiment('missing')).rejects.toThrow(
        'Experiment missing not found'
      );
    });

    it('should publish ExperimentCompletedEvent', async () => {
      const existing = makeExperiment({ status: 'RUNNING' });
      experimentRepo.findById.mockResolvedValue(existing);
      assignmentRepo.getScoresByVariant.mockResolvedValue([50, 60]);
      assignmentRepo.getConversionsByVariant.mockResolvedValue({ count: 0, total: 0 });
      resultRepo.findByExperimentId.mockResolvedValue(null);
      resultRepo.create.mockResolvedValue(makeResultRecord());
      experimentRepo.update.mockResolvedValue({ ...existing, status: 'COMPLETED' });

      await service.completeExperiment('exp-1');

      const completedEvent = eventBus.publish.mock.calls.find(
        (call: any[]) => call[0].eventType === 'experiment.completed'
      );
      expect(completedEvent).toBeDefined();
    });
  });

  // =========================================================================
  // archiveExperiment
  // =========================================================================

  describe('archiveExperiment', () => {
    it('should archive a COMPLETED experiment', async () => {
      const existing = makeExperiment({ status: 'COMPLETED' });
      experimentRepo.findById.mockResolvedValue(existing);
      experimentRepo.update.mockResolvedValue({ ...existing, status: 'ARCHIVED' });

      const result = await service.archiveExperiment('exp-1');

      expect(result.status).toBe('ARCHIVED');
      expect(experimentRepo.update).toHaveBeenCalledWith('exp-1', { status: 'ARCHIVED' });
    });

    it('should throw if experiment not found', async () => {
      experimentRepo.findById.mockResolvedValue(null);

      await expect(service.archiveExperiment('missing')).rejects.toThrow(
        'Experiment missing not found'
      );
    });

    it('should throw if experiment is not COMPLETED', async () => {
      experimentRepo.findById.mockResolvedValue(makeExperiment({ status: 'RUNNING' }));

      await expect(service.archiveExperiment('exp-1')).rejects.toThrow(
        'Can only archive completed experiments'
      );
    });
  });

  // =========================================================================
  // assignVariant
  // =========================================================================

  describe('assignVariant', () => {
    it('should return existing assignment if lead already assigned', async () => {
      const existing = makeExperiment({ status: 'RUNNING' });
      experimentRepo.findById.mockResolvedValue(existing);

      const existingAssignment = makeAssignment({ variant: 'control' });
      assignmentRepo.findByExperimentAndLead.mockResolvedValue(existingAssignment);

      const result = await service.assignVariant('exp-1', 'lead-1');

      expect(result.variant).toBe('control');
      expect(result.assignment).toEqual(existingAssignment);
      expect(assignmentRepo.create).not.toHaveBeenCalled();
    });

    it('should create new assignment if lead not yet assigned', async () => {
      const existing = makeExperiment({ status: 'RUNNING', trafficPercent: 50 });
      experimentRepo.findById.mockResolvedValue(existing);
      assignmentRepo.findByExperimentAndLead.mockResolvedValue(null);

      const newAssignment = makeAssignment();
      assignmentRepo.create.mockResolvedValue(newAssignment);

      const result = await service.assignVariant('exp-1', 'lead-1');

      expect(assignmentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          experimentId: 'exp-1',
          leadId: 'lead-1',
        })
      );
      expect(eventBus.publish).toHaveBeenCalled();
      expect(result.assignment).toEqual(newAssignment);
    });

    it('should throw if experiment not found', async () => {
      experimentRepo.findById.mockResolvedValue(null);

      await expect(service.assignVariant('missing', 'lead-1')).rejects.toThrow(
        'Experiment missing not found'
      );
    });

    it('should throw if experiment is not RUNNING', async () => {
      experimentRepo.findById.mockResolvedValue(makeExperiment({ status: 'DRAFT' }));

      await expect(service.assignVariant('exp-1', 'lead-1')).rejects.toThrow(
        'Can only assign variants for running experiments'
      );
    });

    it('should publish VariantAssignedEvent for new assignments', async () => {
      experimentRepo.findById.mockResolvedValue(makeExperiment({ status: 'RUNNING' }));
      assignmentRepo.findByExperimentAndLead.mockResolvedValue(null);
      assignmentRepo.create.mockResolvedValue(makeAssignment());

      await service.assignVariant('exp-1', 'lead-1');

      const publishedEvent = eventBus.publish.mock.calls[0][0];
      expect(publishedEvent.eventType).toBe('experiment.variant_assigned');
      expect(publishedEvent.experimentId).toBe('exp-1');
      expect(publishedEvent.leadId).toBe('lead-1');
    });

    it('should deterministically assign variants', async () => {
      // Same experiment + lead should always produce the same variant
      const existing = makeExperiment({ status: 'RUNNING', trafficPercent: 50 });
      experimentRepo.findById.mockResolvedValue(existing);
      assignmentRepo.findByExperimentAndLead.mockResolvedValue(null);
      assignmentRepo.create.mockImplementation((data: any) => ({
        ...makeAssignment(),
        variant: data.variant,
      }));

      const result1 = await service.assignVariant('exp-1', 'lead-deterministic');
      const variant1 = result1.variant;

      // Reset mocks and call again
      assignmentRepo.findByExperimentAndLead.mockResolvedValue(null);
      const result2 = await service.assignVariant('exp-1', 'lead-deterministic');

      expect(result2.variant).toBe(variant1);
    });
  });

  // =========================================================================
  // getVariant
  // =========================================================================

  describe('getVariant', () => {
    it('should return variant for assigned lead', async () => {
      assignmentRepo.findByExperimentAndLead.mockResolvedValue(
        makeAssignment({ variant: 'treatment' })
      );

      const result = await service.getVariant('exp-1', 'lead-1');

      expect(result).toBe('treatment');
    });

    it('should return null for unassigned lead', async () => {
      assignmentRepo.findByExperimentAndLead.mockResolvedValue(null);

      const result = await service.getVariant('exp-1', 'lead-1');

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // recordScore
  // =========================================================================

  describe('recordScore', () => {
    it('should record score for existing assignment', async () => {
      const assignment = makeAssignment();
      assignmentRepo.findByExperimentAndLead.mockResolvedValue(assignment);
      assignmentRepo.updateScore.mockResolvedValue({ ...assignment, score: 85, confidence: 0.9 });

      const result = await service.recordScore({
        experimentId: 'exp-1',
        leadId: 'lead-1',
        score: 85,
        confidence: 0.9,
      });

      expect(result.score).toBe(85);
      expect(assignmentRepo.updateScore).toHaveBeenCalledWith('exp-1', 'lead-1', 85, 0.9);
    });

    it('should throw if no assignment found', async () => {
      assignmentRepo.findByExperimentAndLead.mockResolvedValue(null);

      await expect(
        service.recordScore({
          experimentId: 'exp-1',
          leadId: 'lead-999',
          score: 85,
        })
      ).rejects.toThrow('No assignment found for lead lead-999 in experiment exp-1');
    });
  });

  // =========================================================================
  // recordConversion
  // =========================================================================

  describe('recordConversion', () => {
    it('should record conversion for existing assignment', async () => {
      const assignment = makeAssignment();
      assignmentRepo.findByExperimentAndLead.mockResolvedValue(assignment);
      assignmentRepo.updateConversion.mockResolvedValue({
        ...assignment,
        convertedAt: new Date(),
        conversionValue: 1000,
      });

      const result = await service.recordConversion({
        experimentId: 'exp-1',
        leadId: 'lead-1',
        conversionValue: 1000,
      });

      expect(result.conversionValue).toBe(1000);
      expect(assignmentRepo.updateConversion).toHaveBeenCalledWith('exp-1', 'lead-1', 1000);
    });

    it('should throw if no assignment found', async () => {
      assignmentRepo.findByExperimentAndLead.mockResolvedValue(null);

      await expect(
        service.recordConversion({
          experimentId: 'exp-1',
          leadId: 'lead-999',
        })
      ).rejects.toThrow('No assignment found for lead lead-999 in experiment exp-1');
    });
  });

  // =========================================================================
  // analyzeExperiment
  // =========================================================================

  describe('analyzeExperiment', () => {
    it('should perform statistical analysis and create result', async () => {
      const experiment = makeExperiment({ significanceLevel: 0.05 });
      experimentRepo.findById.mockResolvedValue(experiment);

      // Provide sufficient data for meaningful statistics
      const controlScores = Array.from({ length: 50 }, (_, i) => 40 + i * 0.4);
      const treatmentScores = Array.from({ length: 50 }, (_, i) => 55 + i * 0.4);

      assignmentRepo.getScoresByVariant.mockImplementation((_expId: string, variant: string) =>
        variant === 'control' ? controlScores : treatmentScores
      );

      assignmentRepo.getConversionsByVariant.mockResolvedValue({ count: 10, total: 50 });
      resultRepo.findByExperimentId.mockResolvedValue(null);
      resultRepo.create.mockImplementation((data: any) => ({
        ...data,
        id: 'result-1',
        analyzedAt: new Date(),
      }));

      const result = await service.analyzeExperiment('exp-1');

      expect(result.experimentId).toBe('exp-1');
      expect(result.controlSampleSize).toBe(50);
      expect(result.treatmentSampleSize).toBe(50);
      expect(typeof result.tStatistic).toBe('number');
      expect(typeof result.pValue).toBe('number');
      expect(typeof result.effectSize).toBe('number');
      expect(result.confidenceInterval).toBeDefined();
      expect(resultRepo.create).toHaveBeenCalled();
    });

    it('should update existing result if one already exists', async () => {
      experimentRepo.findById.mockResolvedValue(makeExperiment());
      assignmentRepo.getScoresByVariant.mockResolvedValue([50, 60, 70]);
      assignmentRepo.getConversionsByVariant.mockResolvedValue({ count: 0, total: 0 });
      resultRepo.findByExperimentId.mockResolvedValue(makeResultRecord());
      resultRepo.update.mockResolvedValue(makeResultRecord());

      await service.analyzeExperiment('exp-1');

      expect(resultRepo.update).toHaveBeenCalled();
      expect(resultRepo.create).not.toHaveBeenCalled();
    });

    it('should throw if experiment not found', async () => {
      experimentRepo.findById.mockResolvedValue(null);

      await expect(service.analyzeExperiment('missing')).rejects.toThrow(
        'Experiment missing not found'
      );
    });

    it('should handle empty score data gracefully', async () => {
      experimentRepo.findById.mockResolvedValue(makeExperiment());
      assignmentRepo.getScoresByVariant.mockResolvedValue([]);
      assignmentRepo.getConversionsByVariant.mockResolvedValue({ count: 0, total: 0 });
      resultRepo.findByExperimentId.mockResolvedValue(null);
      resultRepo.create.mockImplementation((data: any) => ({
        ...data,
        id: 'result-1',
        analyzedAt: new Date(),
      }));

      const result = await service.analyzeExperiment('exp-1');

      expect(result.controlSampleSize).toBe(0);
      expect(result.treatmentSampleSize).toBe(0);
      expect(result.controlMean).toBe(0);
      expect(result.treatmentMean).toBe(0);
      expect(result.isSignificant).toBe(false);
      expect(result.winner).toBeNull();
    });

    it('should handle single data point per variant', async () => {
      experimentRepo.findById.mockResolvedValue(makeExperiment());
      assignmentRepo.getScoresByVariant.mockResolvedValue([50]);
      assignmentRepo.getConversionsByVariant.mockResolvedValue({ count: 0, total: 0 });
      resultRepo.findByExperimentId.mockResolvedValue(null);
      resultRepo.create.mockImplementation((data: any) => ({
        ...data,
        id: 'r1',
        analyzedAt: new Date(),
      }));

      const result = await service.analyzeExperiment('exp-1');

      // With n<2, t-test returns defaults
      expect(result.tStatistic).toBe(0);
      expect(result.pValue).toBe(1);
      expect(result.isSignificant).toBe(false);
    });

    it('should compute chi-square test when conversions are available', async () => {
      experimentRepo.findById.mockResolvedValue(makeExperiment());
      assignmentRepo.getScoresByVariant.mockResolvedValue([50, 60, 70, 80]);

      assignmentRepo.getConversionsByVariant.mockImplementation(
        (_expId: string, variant: string) =>
          variant === 'control' ? { count: 10, total: 50 } : { count: 25, total: 50 }
      );

      resultRepo.findByExperimentId.mockResolvedValue(null);
      resultRepo.create.mockImplementation((data: any) => ({
        ...data,
        id: 'r1',
        analyzedAt: new Date(),
      }));

      const result = await service.analyzeExperiment('exp-1');

      expect(result.controlConversionRate).toBe(0.2);
      expect(result.treatmentConversionRate).toBe(0.5);
      expect(result.chiSquareStatistic).not.toBeNull();
      expect(result.chiSquarePValue).not.toBeNull();
    });

    it('should return null conversion rates when total is 0', async () => {
      experimentRepo.findById.mockResolvedValue(makeExperiment());
      assignmentRepo.getScoresByVariant.mockResolvedValue([50, 60]);
      assignmentRepo.getConversionsByVariant.mockResolvedValue({ count: 0, total: 0 });
      resultRepo.findByExperimentId.mockResolvedValue(null);
      resultRepo.create.mockImplementation((data: any) => ({
        ...data,
        id: 'r1',
        analyzedAt: new Date(),
      }));

      const result = await service.analyzeExperiment('exp-1');

      expect(result.controlConversionRate).toBeNull();
      expect(result.treatmentConversionRate).toBeNull();
      expect(result.chiSquareStatistic).toBeNull();
      expect(result.chiSquarePValue).toBeNull();
    });

    it('should generate recommendation for significant result', async () => {
      experimentRepo.findById.mockResolvedValue(makeExperiment({ significanceLevel: 0.05 }));

      // Create clearly significant difference
      const controlScores = Array.from({ length: 100 }, () => 40);
      const treatmentScores = Array.from({ length: 100 }, () => 80);

      assignmentRepo.getScoresByVariant.mockImplementation((_expId: string, variant: string) =>
        variant === 'control' ? controlScores : treatmentScores
      );
      assignmentRepo.getConversionsByVariant.mockResolvedValue({ count: 0, total: 0 });
      resultRepo.findByExperimentId.mockResolvedValue(null);
      resultRepo.create.mockImplementation((data: any) => ({
        ...data,
        id: 'r1',
        analyzedAt: new Date(),
      }));

      const result = await service.analyzeExperiment('exp-1');

      expect(result.recommendation).toBeDefined();
      expect(result.recommendation).not.toBeNull();
    });
  });

  // =========================================================================
  // getExperiment
  // =========================================================================

  describe('getExperiment', () => {
    it('should return experiment by id', async () => {
      const exp = makeExperiment();
      experimentRepo.findById.mockResolvedValue(exp);

      const result = await service.getExperiment('exp-1');

      expect(result).toEqual(exp);
      expect(experimentRepo.findById).toHaveBeenCalledWith('exp-1');
    });

    it('should return null if not found', async () => {
      experimentRepo.findById.mockResolvedValue(null);

      const result = await service.getExperiment('missing');

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // listExperiments
  // =========================================================================

  describe('listExperiments', () => {
    // Batched groupBy mock helper: `n` control AND `n` treatment per experiment.
    const variantRows = (exps: ExperimentRecord[], n: number) =>
      exps.flatMap((e) => [
        { experimentId: e.id, variant: 'control', count: n },
        { experimentId: e.id, variant: 'treatment', count: n },
      ]);

    it('should return experiment summaries with assignment counts', async () => {
      const experiments = [makeExperiment({ id: 'exp-1' }), makeExperiment({ id: 'exp-2' })];
      experimentRepo.findByTenantId.mockResolvedValue(experiments);
      assignmentRepo.countVariantsForExperiments.mockResolvedValue(variantRows(experiments, 25));
      resultRepo.findByExperimentIds.mockResolvedValue([]);

      const summaries = await service.listExperiments('tenant-1');

      expect(summaries).toHaveLength(2);
      expect(summaries[0].controlSampleSize).toBe(25);
      expect(summaries[0].treatmentSampleSize).toBe(25);
      expect(summaries[0].totalAssignments).toBe(50);
      expect(summaries[0].hasResult).toBe(false);
    });

    it('should compute progress percent', async () => {
      const experiments = [makeExperiment({ minSampleSize: 100 })];
      experimentRepo.findByTenantId.mockResolvedValue(experiments);
      // 50 per variant -> 100 total out of target 200.
      assignmentRepo.countVariantsForExperiments.mockResolvedValue(variantRows(experiments, 50));
      resultRepo.findByExperimentIds.mockResolvedValue([]);

      const summaries = await service.listExperiments('tenant-1');

      expect(summaries[0].progressPercent).toBe(50);
    });

    it('should cap progress percent at 100', async () => {
      const experiments = [makeExperiment({ minSampleSize: 10 })];
      experimentRepo.findByTenantId.mockResolvedValue(experiments);
      assignmentRepo.countVariantsForExperiments.mockResolvedValue(variantRows(experiments, 100)); // over target
      resultRepo.findByExperimentIds.mockResolvedValue([]);

      const summaries = await service.listExperiments('tenant-1');

      expect(summaries[0].progressPercent).toBe(100);
    });

    it('should include result data if available', async () => {
      const experiments = [makeExperiment()];
      experimentRepo.findByTenantId.mockResolvedValue(experiments);
      assignmentRepo.countVariantsForExperiments.mockResolvedValue(variantRows(experiments, 50));
      resultRepo.findByExperimentIds.mockResolvedValue([
        makeResultRecord({
          experimentId: experiments[0].id,
          isSignificant: true,
          winner: 'treatment',
        }),
      ]);

      const summaries = await service.listExperiments('tenant-1');

      expect(summaries[0].hasResult).toBe(true);
      expect(summaries[0].isSignificant).toBe(true);
      expect(summaries[0].winner).toBe('treatment');
    });
  });

  // =========================================================================
  // getStatus
  // =========================================================================

  describe('getStatus', () => {
    it('should return experiment status with sample counts', async () => {
      experimentRepo.findById.mockResolvedValue(makeExperiment({ minSampleSize: 100 }));
      assignmentRepo.countByVariant.mockImplementation((_expId: string, variant: string) =>
        variant === 'control' ? 40 : 35
      );

      const status = await service.getStatus('exp-1');

      expect(status.experimentId).toBe('exp-1');
      expect(status.controlSampleSize).toBe(40);
      expect(status.treatmentSampleSize).toBe(35);
      expect(status.targetSampleSize).toBe(100);
      expect(status.progressPercent).toBeCloseTo(37.5);
    });

    it('should indicate canAnalyze when both variants have enough samples', async () => {
      experimentRepo.findById.mockResolvedValue(makeExperiment());
      // EXPERIMENT_DEFAULTS.MIN_SAMPLE_SIZE is 30
      assignmentRepo.countByVariant.mockResolvedValue(30);

      const status = await service.getStatus('exp-1');

      expect(status.canAnalyze).toBe(true);
    });

    it('should indicate canAnalyze=false when samples are insufficient', async () => {
      experimentRepo.findById.mockResolvedValue(makeExperiment());
      assignmentRepo.countByVariant.mockResolvedValue(10);

      const status = await service.getStatus('exp-1');

      expect(status.canAnalyze).toBe(false);
    });

    it('should throw if experiment not found', async () => {
      experimentRepo.findById.mockResolvedValue(null);

      await expect(service.getStatus('missing')).rejects.toThrow('Experiment missing not found');
    });
  });

  // =========================================================================
  // getResults
  // =========================================================================

  describe('getResults', () => {
    it('should return formatted results', async () => {
      resultRepo.findByExperimentId.mockResolvedValue(makeResultRecord());

      const result = await service.getResults('exp-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('result-1');
      expect(result!.experimentId).toBe('exp-1');
      expect(result!.isSignificant).toBe(true);
      expect(result!.winner).toBe('treatment');
    });

    it('should return null if no results exist', async () => {
      resultRepo.findByExperimentId.mockResolvedValue(null);

      const result = await service.getResults('exp-1');

      expect(result).toBeNull();
    });
  });
});
