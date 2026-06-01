/**
 * PrismaExperimentRepository Tests (IFC-025)
 *
 * Unit tests for the Experiment repository implementation.
 * Covers ExperimentRepositoryPort methods, the .assignments getter
 * (AssignmentRepositoryPort), and the .results getter (ResultRepositoryPort),
 * plus all mapper paths.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaClient } from '@intelliflow/db';
import { PrismaExperimentRepository } from '../PrismaExperimentRepository';
import { randomUUID } from 'node:crypto';

// ─── Stable IDs ──────────────────────────────────────────────────────────────
const EXPERIMENT_ID = randomUUID();
const EXPERIMENT_ID_2 = randomUUID();
const LEAD_ID = randomUUID();
const LEAD_ID_2 = randomUUID();
const ASSIGNMENT_ID = randomUUID();
const RESULT_ID = randomUUID();
const TENANT_ID = 'tenant-experiment-abc';
const OTHER_TENANT_ID = 'tenant-other-xyz';

// ─── Mock Prisma client ───────────────────────────────────────────────────────
const mockPrisma = {
  experiment: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  experimentAssignment: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  experimentResult: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
} as unknown as PrismaClient;

// ─── Mock data factories ──────────────────────────────────────────────────────
const createMockExperimentRow = (overrides: Record<string, unknown> = {}) => ({
  id: EXPERIMENT_ID,
  name: 'AI vs Manual Scoring',
  description: 'Testing AI scoring quality',
  type: 'SCORING',
  status: 'DRAFT',
  hypothesis: 'AI scoring outperforms manual review',
  controlVariant: 'manual',
  treatmentVariant: 'ai',
  trafficPercent: 50,
  startDate: null,
  endDate: null,
  minSampleSize: 100,
  significanceLevel: 0.05,
  tenantId: TENANT_ID,
  createdAt: new Date('2026-01-10T09:00:00Z'),
  updatedAt: new Date('2026-01-10T09:00:00Z'),
  ...overrides,
});

const createMockAssignmentRow = (overrides: Record<string, unknown> = {}) => ({
  id: ASSIGNMENT_ID,
  experimentId: EXPERIMENT_ID,
  leadId: LEAD_ID,
  variant: 'control',
  score: null,
  confidence: null,
  convertedAt: null,
  conversionValue: null,
  createdAt: new Date('2026-01-11T10:00:00Z'),
  ...overrides,
});

const createMockResultRow = (overrides: Record<string, unknown> = {}) => ({
  id: RESULT_ID,
  experimentId: EXPERIMENT_ID,
  controlSampleSize: 120,
  treatmentSampleSize: 115,
  controlMean: 0.65,
  treatmentMean: 0.72,
  controlStdDev: 0.12,
  treatmentStdDev: 0.11,
  tStatistic: 2.34,
  pValue: 0.019,
  confidenceInterval: { lower: 0.01, upper: 0.13 },
  effectSize: 0.58,
  controlConversionRate: 0.22,
  treatmentConversionRate: 0.31,
  chiSquareStatistic: 4.82,
  chiSquarePValue: 0.028,
  isSignificant: true,
  winner: 'treatment',
  recommendation: 'Adopt AI scoring for this cohort.',
  analyzedAt: new Date('2026-01-20T14:00:00Z'),
  ...overrides,
});

// ─── Test suite ───────────────────────────────────────────────────────────────
describe('PrismaExperimentRepository', () => {
  let repo: PrismaExperimentRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new PrismaExperimentRepository(mockPrisma);
  });

  // ==========================================================================
  // ExperimentRepositoryPort — create
  // ==========================================================================
  describe('create', () => {
    it('should create an experiment and return a mapped record', async () => {
      vi.mocked(mockPrisma.experiment.create).mockResolvedValue(createMockExperimentRow() as any);

      const result = await repo.create({
        name: 'AI vs Manual Scoring',
        description: 'Testing AI scoring quality',
        type: 'SCORING' as any,
        hypothesis: 'AI scoring outperforms manual review',
        controlVariant: 'manual',
        treatmentVariant: 'ai',
        trafficPercent: 50,
        minSampleSize: 100,
        significanceLevel: 0.05,
        tenantId: TENANT_ID,
      });

      expect(result.id).toBe(EXPERIMENT_ID);
      expect(result.name).toBe('AI vs Manual Scoring');
      expect(result.type).toBe('SCORING');
      expect(result.status).toBe('DRAFT');
      expect(result.tenantId).toBe(TENANT_ID);

      expect(mockPrisma.experiment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'AI vs Manual Scoring',
          tenantId: TENANT_ID,
          trafficPercent: 50,
          minSampleSize: 100,
          significanceLevel: 0.05,
        }),
      });
    });

    it('should pass null description through to Prisma', async () => {
      vi.mocked(mockPrisma.experiment.create).mockResolvedValue(
        createMockExperimentRow({ description: null }) as any
      );

      await repo.create({
        name: 'No-description experiment',
        description: null,
        type: 'QUALIFICATION' as any,
        hypothesis: 'Hypothesis text',
        controlVariant: 'v1',
        treatmentVariant: 'v2',
        trafficPercent: 100,
        minSampleSize: 50,
        significanceLevel: 0.1,
        tenantId: TENANT_ID,
      });

      expect(mockPrisma.experiment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ description: null }),
      });
    });
  });

  // ==========================================================================
  // ExperimentRepositoryPort — findById
  // ==========================================================================
  describe('findById', () => {
    it('should return a mapped record when found', async () => {
      vi.mocked(mockPrisma.experiment.findUnique).mockResolvedValue(
        createMockExperimentRow() as any
      );

      const result = await repo.findById(EXPERIMENT_ID);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(EXPERIMENT_ID);
      expect(result!.hypothesis).toBe('AI scoring outperforms manual review');
      expect(mockPrisma.experiment.findUnique).toHaveBeenCalledWith({
        where: { id: EXPERIMENT_ID },
      });
    });

    it('should return null when not found', async () => {
      vi.mocked(mockPrisma.experiment.findUnique).mockResolvedValue(null);

      const result = await repo.findById(randomUUID());

      expect(result).toBeNull();
    });

    it('should map all fields including dates', async () => {
      const startDate = new Date('2026-02-01T00:00:00Z');
      const endDate = new Date('2026-03-01T00:00:00Z');

      vi.mocked(mockPrisma.experiment.findUnique).mockResolvedValue(
        createMockExperimentRow({
          status: 'RUNNING',
          startDate,
          endDate,
        }) as any
      );

      const result = await repo.findById(EXPERIMENT_ID);

      expect(result!.status).toBe('RUNNING');
      expect(result!.startDate).toEqual(startDate);
      expect(result!.endDate).toEqual(endDate);
      expect(result!.createdAt).toBeInstanceOf(Date);
      expect(result!.updatedAt).toBeInstanceOf(Date);
    });
  });

  // ==========================================================================
  // ExperimentRepositoryPort — findByTenantId
  // ==========================================================================
  describe('findByTenantId', () => {
    it('should return all experiments for a tenant ordered by createdAt desc', async () => {
      vi.mocked(mockPrisma.experiment.findMany).mockResolvedValue([
        createMockExperimentRow({ id: EXPERIMENT_ID }),
        createMockExperimentRow({ id: EXPERIMENT_ID_2, name: 'Second Experiment' }),
      ] as any);

      const results = await repo.findByTenantId(TENANT_ID);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe(EXPERIMENT_ID);
      expect(results[1].name).toBe('Second Experiment');
      expect(mockPrisma.experiment.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array when tenant has no experiments', async () => {
      vi.mocked(mockPrisma.experiment.findMany).mockResolvedValue([]);

      const results = await repo.findByTenantId(OTHER_TENANT_ID);

      expect(results).toHaveLength(0);
    });
  });

  // ==========================================================================
  // ExperimentRepositoryPort — findRunning
  // ==========================================================================
  describe('findRunning', () => {
    it('should return only RUNNING experiments for the tenant', async () => {
      vi.mocked(mockPrisma.experiment.findMany).mockResolvedValue([
        createMockExperimentRow({ status: 'RUNNING' }),
      ] as any);

      const results = await repo.findRunning(TENANT_ID);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('RUNNING');
      expect(mockPrisma.experiment.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, status: 'RUNNING' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array when no running experiments exist', async () => {
      vi.mocked(mockPrisma.experiment.findMany).mockResolvedValue([]);

      const results = await repo.findRunning(TENANT_ID);

      expect(results).toHaveLength(0);
    });
  });

  // ==========================================================================
  // ExperimentRepositoryPort — update
  // ==========================================================================
  describe('update', () => {
    it('should update name and return mapped record', async () => {
      vi.mocked(mockPrisma.experiment.update).mockResolvedValue(
        createMockExperimentRow({ name: 'Updated Name' }) as any
      );

      const result = await repo.update(EXPERIMENT_ID, { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
      expect(mockPrisma.experiment.update).toHaveBeenCalledWith({
        where: { id: EXPERIMENT_ID },
        data: expect.objectContaining({ name: 'Updated Name' }),
      });
    });

    it('should update status field', async () => {
      vi.mocked(mockPrisma.experiment.update).mockResolvedValue(
        createMockExperimentRow({ status: 'RUNNING' }) as any
      );

      await repo.update(EXPERIMENT_ID, { status: 'RUNNING' as any });

      expect(mockPrisma.experiment.update).toHaveBeenCalledWith({
        where: { id: EXPERIMENT_ID },
        data: expect.objectContaining({ status: 'RUNNING' }),
      });
    });

    it('should update startDate and endDate', async () => {
      const startDate = new Date('2026-02-01');
      const endDate = new Date('2026-03-01');

      vi.mocked(mockPrisma.experiment.update).mockResolvedValue(
        createMockExperimentRow({ startDate, endDate }) as any
      );

      await repo.update(EXPERIMENT_ID, { startDate, endDate });

      expect(mockPrisma.experiment.update).toHaveBeenCalledWith({
        where: { id: EXPERIMENT_ID },
        data: expect.objectContaining({ startDate, endDate }),
      });
    });

    it('should update trafficPercent, minSampleSize, and significanceLevel', async () => {
      vi.mocked(mockPrisma.experiment.update).mockResolvedValue(
        createMockExperimentRow({
          trafficPercent: 75,
          minSampleSize: 200,
          significanceLevel: 0.01,
        }) as any
      );

      await repo.update(EXPERIMENT_ID, {
        trafficPercent: 75,
        minSampleSize: 200,
        significanceLevel: 0.01,
      });

      expect(mockPrisma.experiment.update).toHaveBeenCalledWith({
        where: { id: EXPERIMENT_ID },
        data: expect.objectContaining({
          trafficPercent: 75,
          minSampleSize: 200,
          significanceLevel: 0.01,
        }),
      });
    });

    it('should not include undefined fields in update data', async () => {
      vi.mocked(mockPrisma.experiment.update).mockResolvedValue(
        createMockExperimentRow({ description: 'New description' }) as any
      );

      await repo.update(EXPERIMENT_ID, { description: 'New description' });

      const callData = vi.mocked(mockPrisma.experiment.update).mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(callData).toHaveProperty('description', 'New description');
      expect(callData).not.toHaveProperty('name');
      expect(callData).not.toHaveProperty('status');
      expect(callData).not.toHaveProperty('trafficPercent');
    });

    it('should update hypothesis, controlVariant, and treatmentVariant', async () => {
      vi.mocked(mockPrisma.experiment.update).mockResolvedValue(
        createMockExperimentRow({
          hypothesis: 'New hypothesis',
          controlVariant: 'baseline',
          treatmentVariant: 'variant-a',
        }) as any
      );

      await repo.update(EXPERIMENT_ID, {
        hypothesis: 'New hypothesis',
        controlVariant: 'baseline',
        treatmentVariant: 'variant-a',
      });

      expect(mockPrisma.experiment.update).toHaveBeenCalledWith({
        where: { id: EXPERIMENT_ID },
        data: expect.objectContaining({
          hypothesis: 'New hypothesis',
          controlVariant: 'baseline',
          treatmentVariant: 'variant-a',
        }),
      });
    });
  });

  // ==========================================================================
  // ExperimentRepositoryPort — delete
  // ==========================================================================
  describe('delete', () => {
    it('should call Prisma delete with the correct id', async () => {
      vi.mocked(mockPrisma.experiment.delete).mockResolvedValue(createMockExperimentRow() as any);

      await repo.delete(EXPERIMENT_ID);

      expect(mockPrisma.experiment.delete).toHaveBeenCalledWith({
        where: { id: EXPERIMENT_ID },
      });
    });

    it('should resolve without returning a value', async () => {
      vi.mocked(mockPrisma.experiment.delete).mockResolvedValue(createMockExperimentRow() as any);

      const result = await repo.delete(EXPERIMENT_ID);

      expect(result).toBeUndefined();
    });
  });

  // ==========================================================================
  // .assignments getter — lazy initialisation
  // ==========================================================================
  describe('assignments getter', () => {
    it('should return the same object instance on repeated access', () => {
      const first = repo.assignments;
      const second = repo.assignments;
      expect(first).toBe(second);
    });

    // -------------------------------------------------------------------------
    // assignments.create
    // -------------------------------------------------------------------------
    describe('create', () => {
      it('should create an assignment and return a mapped record', async () => {
        vi.mocked(mockPrisma.experimentAssignment.create).mockResolvedValue(
          createMockAssignmentRow() as any
        );

        const result = await repo.assignments.create({
          experimentId: EXPERIMENT_ID,
          leadId: LEAD_ID,
          variant: 'control',
        });

        expect(result.id).toBe(ASSIGNMENT_ID);
        expect(result.experimentId).toBe(EXPERIMENT_ID);
        expect(result.leadId).toBe(LEAD_ID);
        expect(result.variant).toBe('control');
        expect(result.score).toBeNull();
        expect(result.convertedAt).toBeNull();

        expect(mockPrisma.experimentAssignment.create).toHaveBeenCalledWith({
          data: {
            experimentId: EXPERIMENT_ID,
            leadId: LEAD_ID,
            variant: 'control',
          },
        });
      });
    });

    // -------------------------------------------------------------------------
    // assignments.findByExperimentId
    // -------------------------------------------------------------------------
    describe('findByExperimentId', () => {
      it('should return all assignments for an experiment ordered by createdAt asc', async () => {
        vi.mocked(mockPrisma.experimentAssignment.findMany).mockResolvedValue([
          createMockAssignmentRow({ id: ASSIGNMENT_ID, variant: 'control' }),
          createMockAssignmentRow({ id: randomUUID(), leadId: LEAD_ID_2, variant: 'treatment' }),
        ] as any);

        const results = await repo.assignments.findByExperimentId(EXPERIMENT_ID);

        expect(results).toHaveLength(2);
        expect(results[0].variant).toBe('control');
        expect(results[1].variant).toBe('treatment');
        expect(mockPrisma.experimentAssignment.findMany).toHaveBeenCalledWith({
          where: { experimentId: EXPERIMENT_ID },
          orderBy: { createdAt: 'asc' },
        });
      });

      it('should return empty array when no assignments exist', async () => {
        vi.mocked(mockPrisma.experimentAssignment.findMany).mockResolvedValue([]);

        const results = await repo.assignments.findByExperimentId(EXPERIMENT_ID);

        expect(results).toHaveLength(0);
      });
    });

    // -------------------------------------------------------------------------
    // assignments.findByLeadId
    // -------------------------------------------------------------------------
    describe('findByLeadId', () => {
      it('should return all assignments for a lead ordered by createdAt asc', async () => {
        vi.mocked(mockPrisma.experimentAssignment.findMany).mockResolvedValue([
          createMockAssignmentRow(),
        ] as any);

        const results = await repo.assignments.findByLeadId(LEAD_ID);

        expect(results).toHaveLength(1);
        expect(results[0].leadId).toBe(LEAD_ID);
        expect(mockPrisma.experimentAssignment.findMany).toHaveBeenCalledWith({
          where: { leadId: LEAD_ID },
          orderBy: { createdAt: 'asc' },
        });
      });

      it('should return empty array when lead has no assignments', async () => {
        vi.mocked(mockPrisma.experimentAssignment.findMany).mockResolvedValue([]);

        const results = await repo.assignments.findByLeadId(LEAD_ID);

        expect(results).toHaveLength(0);
      });
    });

    // -------------------------------------------------------------------------
    // assignments.findByExperimentAndLead
    // -------------------------------------------------------------------------
    describe('findByExperimentAndLead', () => {
      it('should return mapped record when found', async () => {
        vi.mocked(mockPrisma.experimentAssignment.findUnique).mockResolvedValue(
          createMockAssignmentRow() as any
        );

        const result = await repo.assignments.findByExperimentAndLead(EXPERIMENT_ID, LEAD_ID);

        expect(result).not.toBeNull();
        expect(result!.experimentId).toBe(EXPERIMENT_ID);
        expect(result!.leadId).toBe(LEAD_ID);
        expect(mockPrisma.experimentAssignment.findUnique).toHaveBeenCalledWith({
          where: { experimentId_leadId: { experimentId: EXPERIMENT_ID, leadId: LEAD_ID } },
        });
      });

      it('should return null when not found', async () => {
        vi.mocked(mockPrisma.experimentAssignment.findUnique).mockResolvedValue(null);

        const result = await repo.assignments.findByExperimentAndLead(EXPERIMENT_ID, LEAD_ID);

        expect(result).toBeNull();
      });
    });

    // -------------------------------------------------------------------------
    // assignments.updateScore
    // -------------------------------------------------------------------------
    describe('updateScore', () => {
      it('should update score and return mapped record', async () => {
        vi.mocked(mockPrisma.experimentAssignment.update).mockResolvedValue(
          createMockAssignmentRow({ score: 0.87, confidence: 0.95 }) as any
        );

        const result = await repo.assignments.updateScore(EXPERIMENT_ID, LEAD_ID, 0.87, 0.95);

        expect(result.score).toBe(0.87);
        expect(result.confidence).toBe(0.95);
        expect(mockPrisma.experimentAssignment.update).toHaveBeenCalledWith({
          where: { experimentId_leadId: { experimentId: EXPERIMENT_ID, leadId: LEAD_ID } },
          data: { score: 0.87, confidence: 0.95 },
        });
      });

      it('should omit confidence from update data when not provided', async () => {
        vi.mocked(mockPrisma.experimentAssignment.update).mockResolvedValue(
          createMockAssignmentRow({ score: 0.65 }) as any
        );

        await repo.assignments.updateScore(EXPERIMENT_ID, LEAD_ID, 0.65);

        const callData = vi.mocked(mockPrisma.experimentAssignment.update).mock.calls[0][0]
          .data as Record<string, unknown>;
        expect(callData).toHaveProperty('score', 0.65);
        expect(callData).not.toHaveProperty('confidence');
      });
    });

    // -------------------------------------------------------------------------
    // assignments.updateConversion
    // -------------------------------------------------------------------------
    describe('updateConversion', () => {
      it('should set convertedAt and conversionValue', async () => {
        vi.mocked(mockPrisma.experimentAssignment.update).mockResolvedValue(
          createMockAssignmentRow({
            convertedAt: new Date('2026-01-15T12:00:00Z'),
            conversionValue: 1500,
          }) as any
        );

        const result = await repo.assignments.updateConversion(EXPERIMENT_ID, LEAD_ID, 1500);

        expect(result.convertedAt).not.toBeNull();
        expect(result.conversionValue).toBe(1500);
        expect(mockPrisma.experimentAssignment.update).toHaveBeenCalledWith({
          where: { experimentId_leadId: { experimentId: EXPERIMENT_ID, leadId: LEAD_ID } },
          data: expect.objectContaining({
            convertedAt: expect.any(Date),
            conversionValue: 1500,
          }),
        });
      });

      it('should omit conversionValue when not provided', async () => {
        vi.mocked(mockPrisma.experimentAssignment.update).mockResolvedValue(
          createMockAssignmentRow({ convertedAt: new Date() }) as any
        );

        await repo.assignments.updateConversion(EXPERIMENT_ID, LEAD_ID);

        const callData = vi.mocked(mockPrisma.experimentAssignment.update).mock.calls[0][0]
          .data as Record<string, unknown>;
        expect(callData).toHaveProperty('convertedAt');
        expect(callData).not.toHaveProperty('conversionValue');
      });
    });

    // -------------------------------------------------------------------------
    // assignments.countByVariant
    // -------------------------------------------------------------------------
    describe('countByVariant', () => {
      it('should return count of assignments for a given variant', async () => {
        vi.mocked(mockPrisma.experimentAssignment.count).mockResolvedValue(42);

        const count = await repo.assignments.countByVariant(EXPERIMENT_ID, 'control');

        expect(count).toBe(42);
        expect(mockPrisma.experimentAssignment.count).toHaveBeenCalledWith({
          where: { experimentId: EXPERIMENT_ID, variant: 'control' },
        });
      });

      it('should return 0 when no assignments exist for variant', async () => {
        vi.mocked(mockPrisma.experimentAssignment.count).mockResolvedValue(0);

        const count = await repo.assignments.countByVariant(EXPERIMENT_ID, 'treatment');

        expect(count).toBe(0);
      });
    });

    // -------------------------------------------------------------------------
    // assignments.countVariantsForExperiments (NP-001 batched groupBy)
    // -------------------------------------------------------------------------
    describe('countVariantsForExperiments', () => {
      it('issues a SINGLE groupBy for all experiments and maps variant counts', async () => {
        vi.mocked(mockPrisma.experimentAssignment.groupBy).mockResolvedValue([
          { experimentId: EXPERIMENT_ID, variant: 'control', _count: 4 },
          { experimentId: EXPERIMENT_ID, variant: 'treatment', _count: 6 },
          { experimentId: EXPERIMENT_ID_2, variant: 'treatment', _count: 3 },
        ] as any);

        const rows = await repo.assignments.countVariantsForExperiments([
          EXPERIMENT_ID,
          EXPERIMENT_ID_2,
        ]);

        expect(mockPrisma.experimentAssignment.groupBy).toHaveBeenCalledTimes(1);
        expect(mockPrisma.experimentAssignment.groupBy).toHaveBeenCalledWith({
          by: ['experimentId', 'variant'],
          where: { experimentId: { in: [EXPERIMENT_ID, EXPERIMENT_ID_2] } },
          _count: true,
        });
        expect(rows).toEqual([
          { experimentId: EXPERIMENT_ID, variant: 'control', count: 4 },
          { experimentId: EXPERIMENT_ID, variant: 'treatment', count: 6 },
          { experimentId: EXPERIMENT_ID_2, variant: 'treatment', count: 3 },
        ]);
      });

      it('short-circuits without querying for an empty id list', async () => {
        const rows = await repo.assignments.countVariantsForExperiments([]);
        expect(rows).toEqual([]);
        expect(mockPrisma.experimentAssignment.groupBy).not.toHaveBeenCalled();
      });
    });

    // -------------------------------------------------------------------------
    // assignments.getScoresByVariant
    // -------------------------------------------------------------------------
    describe('getScoresByVariant', () => {
      it('should return scores for assignments with a non-null score', async () => {
        vi.mocked(mockPrisma.experimentAssignment.findMany).mockResolvedValue([
          { score: 0.75 },
          { score: 0.88 },
          { score: 0.61 },
        ] as any);

        const scores = await repo.assignments.getScoresByVariant(EXPERIMENT_ID, 'control');

        expect(scores).toEqual([0.75, 0.88, 0.61]);
        expect(mockPrisma.experimentAssignment.findMany).toHaveBeenCalledWith({
          where: { experimentId: EXPERIMENT_ID, variant: 'control', score: { not: null } },
          select: { score: true },
        });
      });

      it('should return empty array when no scored assignments exist', async () => {
        vi.mocked(mockPrisma.experimentAssignment.findMany).mockResolvedValue([]);

        const scores = await repo.assignments.getScoresByVariant(EXPERIMENT_ID, 'treatment');

        expect(scores).toEqual([]);
      });
    });

    // -------------------------------------------------------------------------
    // assignments.getConversionsByVariant
    // -------------------------------------------------------------------------
    describe('getConversionsByVariant', () => {
      it('should return count (converted) and total for the variant', async () => {
        vi.mocked(mockPrisma.experimentAssignment.count)
          .mockResolvedValueOnce(100) // total
          .mockResolvedValueOnce(35); // converted

        const result = await repo.assignments.getConversionsByVariant(EXPERIMENT_ID, 'treatment');

        expect(result.total).toBe(100);
        expect(result.count).toBe(35);

        // Verify both count calls were made
        expect(mockPrisma.experimentAssignment.count).toHaveBeenCalledTimes(2);
        expect(mockPrisma.experimentAssignment.count).toHaveBeenCalledWith({
          where: { experimentId: EXPERIMENT_ID, variant: 'treatment' },
        });
        expect(mockPrisma.experimentAssignment.count).toHaveBeenCalledWith({
          where: {
            experimentId: EXPERIMENT_ID,
            variant: 'treatment',
            convertedAt: { not: null },
          },
        });
      });

      it('should return zeros when there are no assignments', async () => {
        vi.mocked(mockPrisma.experimentAssignment.count)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0);

        const result = await repo.assignments.getConversionsByVariant(EXPERIMENT_ID, 'control');

        expect(result.count).toBe(0);
        expect(result.total).toBe(0);
      });
    });
  });

  // ==========================================================================
  // .results getter — lazy initialisation
  // ==========================================================================
  describe('results getter', () => {
    it('should return the same object instance on repeated access', () => {
      const first = repo.results;
      const second = repo.results;
      expect(first).toBe(second);
    });

    // -------------------------------------------------------------------------
    // results.create
    // -------------------------------------------------------------------------
    describe('create', () => {
      it('should create a result record and return mapped data', async () => {
        vi.mocked(mockPrisma.experimentResult.create).mockResolvedValue(
          createMockResultRow() as any
        );

        const input = {
          experimentId: EXPERIMENT_ID,
          controlSampleSize: 120,
          treatmentSampleSize: 115,
          controlMean: 0.65,
          treatmentMean: 0.72,
          controlStdDev: 0.12,
          treatmentStdDev: 0.11,
          tStatistic: 2.34,
          pValue: 0.019,
          confidenceInterval: { lower: 0.01, upper: 0.13 },
          effectSize: 0.58,
          controlConversionRate: 0.22,
          treatmentConversionRate: 0.31,
          chiSquareStatistic: 4.82,
          chiSquarePValue: 0.028,
          isSignificant: true,
          winner: 'treatment' as const,
          recommendation: 'Adopt AI scoring for this cohort.',
        };

        const result = await repo.results.create(input);

        expect(result.id).toBe(RESULT_ID);
        expect(result.experimentId).toBe(EXPERIMENT_ID);
        expect(result.isSignificant).toBe(true);
        expect(result.winner).toBe('treatment');
        expect(result.tStatistic).toBe(2.34);
        expect(result.pValue).toBe(0.019);

        expect(mockPrisma.experimentResult.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            experimentId: EXPERIMENT_ID,
            controlSampleSize: 120,
            isSignificant: true,
            winner: 'treatment',
          }),
        });
      });

      it('should handle null optional fields', async () => {
        vi.mocked(mockPrisma.experimentResult.create).mockResolvedValue(
          createMockResultRow({
            controlConversionRate: null,
            treatmentConversionRate: null,
            chiSquareStatistic: null,
            chiSquarePValue: null,
            winner: null,
            recommendation: null,
          }) as any
        );

        const result = await repo.results.create({
          experimentId: EXPERIMENT_ID,
          controlSampleSize: 50,
          treatmentSampleSize: 48,
          controlMean: 0.5,
          treatmentMean: 0.55,
          controlStdDev: 0.1,
          treatmentStdDev: 0.1,
          tStatistic: 1.2,
          pValue: 0.23,
          confidenceInterval: { lower: -0.02, upper: 0.12 },
          effectSize: 0.3,
          controlConversionRate: null,
          treatmentConversionRate: null,
          chiSquareStatistic: null,
          chiSquarePValue: null,
          isSignificant: false,
          winner: null,
          recommendation: null,
        });

        expect(result.controlConversionRate).toBeNull();
        expect(result.winner).toBeNull();
        expect(result.recommendation).toBeNull();
      });
    });

    // -------------------------------------------------------------------------
    // results.findByExperimentId
    // -------------------------------------------------------------------------
    describe('findByExperimentId', () => {
      it('should return a mapped result record when found', async () => {
        vi.mocked(mockPrisma.experimentResult.findUnique).mockResolvedValue(
          createMockResultRow() as any
        );

        const result = await repo.results.findByExperimentId(EXPERIMENT_ID);

        expect(result).not.toBeNull();
        expect(result!.id).toBe(RESULT_ID);
        expect(result!.effectSize).toBe(0.58);
        expect(result!.analyzedAt).toBeInstanceOf(Date);
        expect(mockPrisma.experimentResult.findUnique).toHaveBeenCalledWith({
          where: { experimentId: EXPERIMENT_ID },
        });
      });

      it('should return null when no result exists for experiment', async () => {
        vi.mocked(mockPrisma.experimentResult.findUnique).mockResolvedValue(null);

        const result = await repo.results.findByExperimentId(EXPERIMENT_ID);

        expect(result).toBeNull();
      });
    });

    // -------------------------------------------------------------------------
    // results.findByExperimentIds (NP-001 batched findMany)
    // -------------------------------------------------------------------------
    describe('findByExperimentIds', () => {
      it('issues a SINGLE findMany for all experiment ids and maps the rows', async () => {
        vi.mocked(mockPrisma.experimentResult.findMany).mockResolvedValue([
          createMockResultRow(),
        ] as any);

        const results = await repo.results.findByExperimentIds([EXPERIMENT_ID, EXPERIMENT_ID_2]);

        expect(mockPrisma.experimentResult.findMany).toHaveBeenCalledTimes(1);
        expect(mockPrisma.experimentResult.findMany).toHaveBeenCalledWith({
          where: { experimentId: { in: [EXPERIMENT_ID, EXPERIMENT_ID_2] } },
        });
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe(RESULT_ID);
        expect(results[0].analyzedAt).toBeInstanceOf(Date);
      });

      it('short-circuits without querying for an empty id list', async () => {
        const results = await repo.results.findByExperimentIds([]);
        expect(results).toEqual([]);
        expect(mockPrisma.experimentResult.findMany).not.toHaveBeenCalled();
      });
    });

    // -------------------------------------------------------------------------
    // results.update
    // -------------------------------------------------------------------------
    describe('update', () => {
      it('should update isSignificant and winner and return mapped record', async () => {
        vi.mocked(mockPrisma.experimentResult.update).mockResolvedValue(
          createMockResultRow({ isSignificant: false, winner: null }) as any
        );

        const result = await repo.results.update(EXPERIMENT_ID, {
          isSignificant: false,
          winner: null,
        });

        expect(result.isSignificant).toBe(false);
        expect(result.winner).toBeNull();
        expect(mockPrisma.experimentResult.update).toHaveBeenCalledWith({
          where: { experimentId: EXPERIMENT_ID },
          data: expect.objectContaining({ isSignificant: false, winner: null }),
        });
      });

      it('should update pValue and tStatistic fields', async () => {
        vi.mocked(mockPrisma.experimentResult.update).mockResolvedValue(
          createMockResultRow({ pValue: 0.003, tStatistic: 3.1 }) as any
        );

        await repo.results.update(EXPERIMENT_ID, { pValue: 0.003, tStatistic: 3.1 });

        expect(mockPrisma.experimentResult.update).toHaveBeenCalledWith({
          where: { experimentId: EXPERIMENT_ID },
          data: expect.objectContaining({ pValue: 0.003, tStatistic: 3.1 }),
        });
      });

      it('should update sample sizes and means', async () => {
        vi.mocked(mockPrisma.experimentResult.update).mockResolvedValue(
          createMockResultRow({
            controlSampleSize: 200,
            treatmentSampleSize: 195,
            controlMean: 0.7,
            treatmentMean: 0.78,
          }) as any
        );

        await repo.results.update(EXPERIMENT_ID, {
          controlSampleSize: 200,
          treatmentSampleSize: 195,
          controlMean: 0.7,
          treatmentMean: 0.78,
        });

        expect(mockPrisma.experimentResult.update).toHaveBeenCalledWith({
          where: { experimentId: EXPERIMENT_ID },
          data: expect.objectContaining({
            controlSampleSize: 200,
            treatmentSampleSize: 195,
          }),
        });
      });

      it('should update conversion rates and chi-square statistics', async () => {
        vi.mocked(mockPrisma.experimentResult.update).mockResolvedValue(
          createMockResultRow({
            controlConversionRate: 0.18,
            treatmentConversionRate: 0.27,
            chiSquareStatistic: 6.1,
            chiSquarePValue: 0.013,
          }) as any
        );

        await repo.results.update(EXPERIMENT_ID, {
          controlConversionRate: 0.18,
          treatmentConversionRate: 0.27,
          chiSquareStatistic: 6.1,
          chiSquarePValue: 0.013,
        });

        expect(mockPrisma.experimentResult.update).toHaveBeenCalledWith({
          where: { experimentId: EXPERIMENT_ID },
          data: expect.objectContaining({
            controlConversionRate: 0.18,
            chiSquareStatistic: 6.1,
          }),
        });
      });

      it('should update standard deviations and effect size', async () => {
        vi.mocked(mockPrisma.experimentResult.update).mockResolvedValue(
          createMockResultRow({
            controlStdDev: 0.09,
            treatmentStdDev: 0.08,
            effectSize: 0.72,
          }) as any
        );

        await repo.results.update(EXPERIMENT_ID, {
          controlStdDev: 0.09,
          treatmentStdDev: 0.08,
          effectSize: 0.72,
        });

        expect(mockPrisma.experimentResult.update).toHaveBeenCalledWith({
          where: { experimentId: EXPERIMENT_ID },
          data: expect.objectContaining({
            controlStdDev: 0.09,
            effectSize: 0.72,
          }),
        });
      });

      it('should update recommendation text', async () => {
        vi.mocked(mockPrisma.experimentResult.update).mockResolvedValue(
          createMockResultRow({ recommendation: 'Roll out to all users.' }) as any
        );

        await repo.results.update(EXPERIMENT_ID, {
          recommendation: 'Roll out to all users.',
        });

        expect(mockPrisma.experimentResult.update).toHaveBeenCalledWith({
          where: { experimentId: EXPERIMENT_ID },
          data: expect.objectContaining({ recommendation: 'Roll out to all users.' }),
        });
      });

      it('should not include undefined fields in update data', async () => {
        vi.mocked(mockPrisma.experimentResult.update).mockResolvedValue(
          createMockResultRow() as any
        );

        await repo.results.update(EXPERIMENT_ID, { winner: 'control' });

        const callData = vi.mocked(mockPrisma.experimentResult.update).mock.calls[0][0]
          .data as Record<string, unknown>;
        expect(callData).toHaveProperty('winner', 'control');
        expect(callData).not.toHaveProperty('pValue');
        expect(callData).not.toHaveProperty('tStatistic');
        expect(callData).not.toHaveProperty('effectSize');
      });
    });
  });

  // ==========================================================================
  // Mapper verification (toExperimentRecord)
  // ==========================================================================
  describe('field mapping — toExperimentRecord', () => {
    it('should map type and status as string pass-through', async () => {
      vi.mocked(mockPrisma.experiment.findUnique).mockResolvedValue(
        createMockExperimentRow({ type: 'QUALIFICATION', status: 'COMPLETED' }) as any
      );

      const result = await repo.findById(EXPERIMENT_ID);

      expect(result!.type).toBe('QUALIFICATION');
      expect(result!.status).toBe('COMPLETED');
    });

    it('should preserve null startDate and endDate', async () => {
      vi.mocked(mockPrisma.experiment.findUnique).mockResolvedValue(
        createMockExperimentRow({ startDate: null, endDate: null }) as any
      );

      const result = await repo.findById(EXPERIMENT_ID);

      expect(result!.startDate).toBeNull();
      expect(result!.endDate).toBeNull();
    });

    it('should include tenantId in the mapped record', async () => {
      vi.mocked(mockPrisma.experiment.findUnique).mockResolvedValue(
        createMockExperimentRow({ tenantId: 'another-tenant' }) as any
      );

      const result = await repo.findById(EXPERIMENT_ID);

      expect(result!.tenantId).toBe('another-tenant');
    });
  });

  // ==========================================================================
  // Mapper verification (toAssignmentRecord)
  // ==========================================================================
  describe('field mapping — toAssignmentRecord', () => {
    it('should map score, confidence, convertedAt and conversionValue when set', async () => {
      const convertedAt = new Date('2026-01-18T08:00:00Z');

      vi.mocked(mockPrisma.experimentAssignment.findUnique).mockResolvedValue(
        createMockAssignmentRow({
          score: 0.9,
          confidence: 0.99,
          convertedAt,
          conversionValue: 2000,
        }) as any
      );

      const result = await repo.assignments.findByExperimentAndLead(EXPERIMENT_ID, LEAD_ID);

      expect(result!.score).toBe(0.9);
      expect(result!.confidence).toBe(0.99);
      expect(result!.convertedAt).toEqual(convertedAt);
      expect(result!.conversionValue).toBe(2000);
    });

    it('should map null nullable fields correctly', async () => {
      vi.mocked(mockPrisma.experimentAssignment.findUnique).mockResolvedValue(
        createMockAssignmentRow({
          score: null,
          confidence: null,
          convertedAt: null,
          conversionValue: null,
        }) as any
      );

      const result = await repo.assignments.findByExperimentAndLead(EXPERIMENT_ID, LEAD_ID);

      expect(result!.score).toBeNull();
      expect(result!.confidence).toBeNull();
      expect(result!.convertedAt).toBeNull();
      expect(result!.conversionValue).toBeNull();
    });
  });

  // ==========================================================================
  // Mapper verification (toResultRecord)
  // ==========================================================================
  describe('field mapping — toResultRecord', () => {
    it('should pass confidenceInterval through as-is from the Prisma row', async () => {
      const ci = { lower: 0.05, upper: 0.15 };

      vi.mocked(mockPrisma.experimentResult.findUnique).mockResolvedValue(
        createMockResultRow({ confidenceInterval: ci }) as any
      );

      const result = await repo.results.findByExperimentId(EXPERIMENT_ID);

      expect(result!.confidenceInterval).toEqual(ci);
    });

    it('should map winner as string or null', async () => {
      vi.mocked(mockPrisma.experimentResult.findUnique).mockResolvedValue(
        createMockResultRow({ winner: 'control' }) as any
      );

      const result = await repo.results.findByExperimentId(EXPERIMENT_ID);

      expect(result!.winner).toBe('control');
    });

    it('should map analyzedAt as a Date', async () => {
      const analyzedAt = new Date('2026-01-22T16:30:00Z');

      vi.mocked(mockPrisma.experimentResult.findUnique).mockResolvedValue(
        createMockResultRow({ analyzedAt }) as any
      );

      const result = await repo.results.findByExperimentId(EXPERIMENT_ID);

      expect(result!.analyzedAt).toEqual(analyzedAt);
    });
  });
});
