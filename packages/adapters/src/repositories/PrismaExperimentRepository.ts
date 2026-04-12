/**
 * Prisma implementation of Experiment repository ports (IFC-025)
 *
 * Implements ExperimentRepositoryPort directly and exposes
 * AssignmentRepositoryPort and ResultRepositoryPort via `.assignments`
 * and `.results` getters (method name collisions prevent a single class
 * from implementing all 3 interfaces directly).
 */

import {
  Prisma,
  type PrismaClient,
  type Experiment as PrismaExperiment,
  type ExperimentAssignment as PrismaExperimentAssignment,
  type ExperimentResult as PrismaExperimentResult,
} from '@intelliflow/db';
import type {
  ExperimentRepositoryPort,
  AssignmentRepositoryPort,
  ResultRepositoryPort,
  ExperimentRecord,
  AssignmentRecord,
  ExperimentResultRecord,
} from '@intelliflow/application';
import type { ExperimentStatus, ExperimentType } from '@intelliflow/domain';
import { z } from 'zod';

type ExperimentWinner = 'control' | 'treatment' | null;
type ConfidenceInterval = { lower: number; upper: number };

// Zod schema for validating Prisma JSON field on read
const confidenceIntervalSchema = z.object({ lower: z.number(), upper: z.number() });

export class PrismaExperimentRepository implements ExperimentRepositoryPort {
  private _assignments: AssignmentRepositoryPort | null = null;
  private _results: ResultRepositoryPort | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  /** AssignmentRepositoryPort adapter backed by the same Prisma client */
  get assignments(): AssignmentRepositoryPort {
    this._assignments ??= {
      create: (data) => this.createAssignment(data),
      findByExperimentId: (experimentId) => this.findAssignmentsByExperimentId(experimentId),
      findByLeadId: (leadId) => this.findAssignmentsByLeadId(leadId),
      findByExperimentAndLead: (experimentId, leadId) =>
        this.findAssignmentByExperimentAndLead(experimentId, leadId),
      updateScore: (experimentId, leadId, score, confidence) =>
        this.updateAssignmentScore(experimentId, leadId, score, confidence),
      updateConversion: (experimentId, leadId, conversionValue) =>
        this.updateAssignmentConversion(experimentId, leadId, conversionValue),
      countByVariant: (experimentId, variant) =>
        this.countAssignmentsByVariant(experimentId, variant),
      getScoresByVariant: (experimentId, variant) =>
        this.getAssignmentScoresByVariant(experimentId, variant),
      getConversionsByVariant: (experimentId, variant) =>
        this.getAssignmentConversionsByVariant(experimentId, variant),
    };
    return this._assignments;
  }

  /** ResultRepositoryPort adapter backed by the same Prisma client */
  get results(): ResultRepositoryPort {
    this._results ??= {
      create: (data) => this.createResult(data),
      findByExperimentId: (experimentId) => this.findResultByExperimentId(experimentId),
      update: (experimentId, data) => this.updateResult(experimentId, data),
    };
    return this._results;
  }

  // ===========================================================================
  // ExperimentRepositoryPort
  // ===========================================================================

  async create(data: {
    name: string;
    description: string | null;
    type: ExperimentType;
    hypothesis: string;
    controlVariant: string;
    treatmentVariant: string;
    trafficPercent: number;
    minSampleSize: number;
    significanceLevel: number;
    tenantId: string;
  }): Promise<ExperimentRecord> {
    const row = await this.prisma.experiment.create({
      data: {
        name: data.name,
        description: data.description,
        type: data.type as any,
        hypothesis: data.hypothesis,
        controlVariant: data.controlVariant,
        treatmentVariant: data.treatmentVariant,
        trafficPercent: data.trafficPercent,
        minSampleSize: data.minSampleSize,
        significanceLevel: data.significanceLevel,
        tenantId: data.tenantId,
      },
    });
    return this.toExperimentRecord(row);
  }

  async findById(id: string): Promise<ExperimentRecord | null> {
    const row = await this.prisma.experiment.findUnique({ where: { id } });
    return row ? this.toExperimentRecord(row) : null;
  }

  async findByTenantId(tenantId: string): Promise<ExperimentRecord[]> {
    const rows = await this.prisma.experiment.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toExperimentRecord(r));
  }

  async findRunning(tenantId: string): Promise<ExperimentRecord[]> {
    const rows = await this.prisma.experiment.findMany({
      where: { tenantId, status: 'RUNNING' },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toExperimentRecord(r));
  }

  async update(id: string, data: Partial<ExperimentRecord>): Promise<ExperimentRecord> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.hypothesis !== undefined) updateData.hypothesis = data.hypothesis;
    if (data.controlVariant !== undefined) updateData.controlVariant = data.controlVariant;
    if (data.treatmentVariant !== undefined) updateData.treatmentVariant = data.treatmentVariant;
    if (data.trafficPercent !== undefined) updateData.trafficPercent = data.trafficPercent;
    if (data.startDate !== undefined) updateData.startDate = data.startDate;
    if (data.endDate !== undefined) updateData.endDate = data.endDate;
    if (data.minSampleSize !== undefined) updateData.minSampleSize = data.minSampleSize;
    if (data.significanceLevel !== undefined) updateData.significanceLevel = data.significanceLevel;

    const row = await this.prisma.experiment.update({
      where: { id },
      data: updateData as any,
    });
    return this.toExperimentRecord(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.experiment.delete({ where: { id } });
  }

  // ===========================================================================
  // Assignment methods (delegated via .assignments getter)
  // ===========================================================================

  private async createAssignment(data: {
    experimentId: string;
    leadId: string;
    variant: string;
  }): Promise<AssignmentRecord> {
    const row = await this.prisma.experimentAssignment.create({
      data: {
        experimentId: data.experimentId,
        leadId: data.leadId,
        variant: data.variant,
      },
    });
    return this.toAssignmentRecord(row);
  }

  private async findAssignmentsByExperimentId(experimentId: string): Promise<AssignmentRecord[]> {
    const rows = await this.prisma.experimentAssignment.findMany({
      where: { experimentId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toAssignmentRecord(r));
  }

  private async findAssignmentsByLeadId(leadId: string): Promise<AssignmentRecord[]> {
    const rows = await this.prisma.experimentAssignment.findMany({
      where: { leadId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toAssignmentRecord(r));
  }

  private async findAssignmentByExperimentAndLead(
    experimentId: string,
    leadId: string
  ): Promise<AssignmentRecord | null> {
    const row = await this.prisma.experimentAssignment.findUnique({
      where: { experimentId_leadId: { experimentId, leadId } },
    });
    return row ? this.toAssignmentRecord(row) : null;
  }

  private async updateAssignmentScore(
    experimentId: string,
    leadId: string,
    score: number,
    confidence?: number
  ): Promise<AssignmentRecord> {
    const row = await this.prisma.experimentAssignment.update({
      where: { experimentId_leadId: { experimentId, leadId } },
      data: {
        score,
        ...(confidence !== undefined ? { confidence } : {}),
      },
    });
    return this.toAssignmentRecord(row);
  }

  private async updateAssignmentConversion(
    experimentId: string,
    leadId: string,
    conversionValue?: number
  ): Promise<AssignmentRecord> {
    const row = await this.prisma.experimentAssignment.update({
      where: { experimentId_leadId: { experimentId, leadId } },
      data: {
        convertedAt: new Date(),
        ...(conversionValue !== undefined ? { conversionValue } : {}),
      },
    });
    return this.toAssignmentRecord(row);
  }

  private async countAssignmentsByVariant(experimentId: string, variant: string): Promise<number> {
    return this.prisma.experimentAssignment.count({
      where: { experimentId, variant },
    });
  }

  private async getAssignmentScoresByVariant(
    experimentId: string,
    variant: string
  ): Promise<number[]> {
    const rows = await this.prisma.experimentAssignment.findMany({
      where: { experimentId, variant, score: { not: null } },
      select: { score: true },
    });
    return rows.map((r) => r.score!);
  }

  private async getAssignmentConversionsByVariant(
    experimentId: string,
    variant: string
  ): Promise<{ count: number; total: number }> {
    const [total, converted] = await Promise.all([
      this.prisma.experimentAssignment.count({ where: { experimentId, variant } }),
      this.prisma.experimentAssignment.count({
        where: { experimentId, variant, convertedAt: { not: null } },
      }),
    ]);
    return { count: converted, total };
  }

  // ===========================================================================
  // Result methods (delegated via .results getter)
  // ===========================================================================

  private async createResult(
    data: Omit<ExperimentResultRecord, 'id' | 'analyzedAt'>
  ): Promise<ExperimentResultRecord> {
    const row = await this.prisma.experimentResult.create({
      data: {
        experimentId: data.experimentId,
        controlSampleSize: data.controlSampleSize,
        treatmentSampleSize: data.treatmentSampleSize,
        controlMean: data.controlMean,
        treatmentMean: data.treatmentMean,
        controlStdDev: data.controlStdDev,
        treatmentStdDev: data.treatmentStdDev,
        tStatistic: data.tStatistic,
        pValue: data.pValue,
        confidenceInterval: data.confidenceInterval as Prisma.InputJsonValue,
        effectSize: data.effectSize,
        controlConversionRate: data.controlConversionRate,
        treatmentConversionRate: data.treatmentConversionRate,
        chiSquareStatistic: data.chiSquareStatistic,
        chiSquarePValue: data.chiSquarePValue,
        isSignificant: data.isSignificant,
        winner: data.winner,
        recommendation: data.recommendation,
      },
    });
    return this.toResultRecord(row);
  }

  private async findResultByExperimentId(
    experimentId: string
  ): Promise<ExperimentResultRecord | null> {
    const row = await this.prisma.experimentResult.findUnique({
      where: { experimentId },
    });
    return row ? this.toResultRecord(row) : null;
  }

  private buildResultUpdateData(
    data: Partial<ExperimentResultRecord>
  ): Record<string, unknown> {
    const updateData: Record<string, unknown> = {};
    const scalarFields = [
      'controlSampleSize', 'treatmentSampleSize', 'controlMean', 'treatmentMean',
      'controlStdDev', 'treatmentStdDev', 'tStatistic', 'pValue', 'effectSize',
      'controlConversionRate', 'treatmentConversionRate', 'chiSquareStatistic',
      'chiSquarePValue', 'isSignificant', 'winner', 'recommendation',
    ] as const;
    for (const field of scalarFields) {
      if (data[field] !== undefined) updateData[field] = data[field];
    }
    if (data.confidenceInterval !== undefined) {
      updateData.confidenceInterval = data.confidenceInterval as Prisma.InputJsonValue;
    }
    return updateData;
  }

  private async updateResult(
    experimentId: string,
    data: Partial<ExperimentResultRecord>
  ): Promise<ExperimentResultRecord> {
    const updateData = this.buildResultUpdateData(data);
    const row = await this.prisma.experimentResult.update({
      where: { experimentId },
      data: updateData as any,
    });
    return this.toResultRecord(row);
  }

  // ===========================================================================
  // Mappers
  // ===========================================================================

  private toExperimentRecord(row: PrismaExperiment): ExperimentRecord {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type as ExperimentType,
      status: row.status as ExperimentStatus,
      hypothesis: row.hypothesis,
      controlVariant: row.controlVariant,
      treatmentVariant: row.treatmentVariant,
      trafficPercent: row.trafficPercent,
      startDate: row.startDate,
      endDate: row.endDate,
      minSampleSize: row.minSampleSize,
      significanceLevel: row.significanceLevel,
      tenantId: row.tenantId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toAssignmentRecord(row: PrismaExperimentAssignment): AssignmentRecord {
    return {
      id: row.id,
      experimentId: row.experimentId,
      leadId: row.leadId,
      variant: row.variant,
      score: row.score,
      confidence: row.confidence,
      convertedAt: row.convertedAt,
      conversionValue: row.conversionValue,
      createdAt: row.createdAt,
    };
  }

  private toResultRecord(row: PrismaExperimentResult): ExperimentResultRecord {
    return {
      id: row.id,
      experimentId: row.experimentId,
      controlSampleSize: row.controlSampleSize,
      treatmentSampleSize: row.treatmentSampleSize,
      controlMean: row.controlMean,
      treatmentMean: row.treatmentMean,
      controlStdDev: row.controlStdDev,
      treatmentStdDev: row.treatmentStdDev,
      tStatistic: row.tStatistic,
      pValue: row.pValue,
      confidenceInterval: confidenceIntervalSchema.parse(row.confidenceInterval),
      effectSize: row.effectSize,
      controlConversionRate: row.controlConversionRate,
      treatmentConversionRate: row.treatmentConversionRate,
      chiSquareStatistic: row.chiSquareStatistic,
      chiSquarePValue: row.chiSquarePValue,
      isSignificant: row.isSignificant,
      winner: row.winner as ExperimentWinner,
      recommendation: row.recommendation,
      analyzedAt: row.analyzedAt,
    };
  }
}
