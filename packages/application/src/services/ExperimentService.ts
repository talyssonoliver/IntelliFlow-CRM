/**
 * Experiment Service - IFC-025: A/B Testing Framework
 *
 * Orchestrates A/B testing for AI vs manual lead scoring,
 * variant assignment, and statistical analysis.
 *
 * @module @intelliflow/application/services/ExperimentService
 */

import {
  EXPERIMENT_DEFAULTS,
  DomainEvent,
} from '@intelliflow/domain';
import type {
  ExperimentStatus,
  ExperimentType,
  ExperimentVariant,
} from '@intelliflow/domain';
import type {
  CreateExperimentInput,
  UpdateExperimentInput,
  RecordScoreInput,
  RecordConversionInput,
  ExperimentResult,
  ExperimentSummary,
  ExperimentStatusResponse,
  ConfidenceInterval,
} from '@intelliflow/validators';
import { EventBusPort } from '../ports/external';

// =============================================================================
// Types
// =============================================================================

export interface ExperimentRecord {
  id: string;
  name: string;
  description: string | null;
  type: ExperimentType;
  status: ExperimentStatus;
  hypothesis: string;
  controlVariant: string;
  treatmentVariant: string;
  trafficPercent: number;
  startDate: Date | null;
  endDate: Date | null;
  minSampleSize: number;
  significanceLevel: number;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssignmentRecord {
  id: string;
  experimentId: string;
  leadId: string;
  variant: string;
  score: number | null;
  confidence: number | null;
  convertedAt: Date | null;
  conversionValue: number | null;
  createdAt: Date;
}

export interface ExperimentResultRecord {
  id: string;
  experimentId: string;
  controlSampleSize: number;
  treatmentSampleSize: number;
  controlMean: number;
  treatmentMean: number;
  controlStdDev: number;
  treatmentStdDev: number;
  tStatistic: number;
  pValue: number;
  confidenceInterval: ConfidenceInterval;
  effectSize: number;
  controlConversionRate: number | null;
  treatmentConversionRate: number | null;
  chiSquareStatistic: number | null;
  chiSquarePValue: number | null;
  isSignificant: boolean;
  winner: 'control' | 'treatment' | null;
  recommendation: string | null;
  analyzedAt: Date;
}

// =============================================================================
// Repository Ports
// =============================================================================

/**
 * Experiment repository port (to be implemented in adapters layer)
 */
export interface ExperimentRepositoryPort {
  create(data: {
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
  }): Promise<ExperimentRecord>;

  findById(id: string): Promise<ExperimentRecord | null>;
  findByTenantId(tenantId: string): Promise<ExperimentRecord[]>;
  findRunning(tenantId: string): Promise<ExperimentRecord[]>;
  update(id: string, data: Partial<ExperimentRecord>): Promise<ExperimentRecord>;
  delete(id: string): Promise<void>;
}

/**
 * Assignment repository port
 */
export interface AssignmentRepositoryPort {
  create(data: {
    experimentId: string;
    leadId: string;
    variant: string;
  }): Promise<AssignmentRecord>;

  findByExperimentId(experimentId: string): Promise<AssignmentRecord[]>;
  findByLeadId(leadId: string): Promise<AssignmentRecord[]>;
  findByExperimentAndLead(experimentId: string, leadId: string): Promise<AssignmentRecord | null>;
  updateScore(experimentId: string, leadId: string, score: number, confidence?: number): Promise<AssignmentRecord>;
  updateConversion(experimentId: string, leadId: string, conversionValue?: number): Promise<AssignmentRecord>;
  countByVariant(experimentId: string, variant: string): Promise<number>;
  getScoresByVariant(experimentId: string, variant: string): Promise<number[]>;
  getConversionsByVariant(experimentId: string, variant: string): Promise<{ count: number; total: number }>;
}

/**
 * Result repository port
 */
export interface ResultRepositoryPort {
  create(data: Omit<ExperimentResultRecord, 'id' | 'analyzedAt'>): Promise<ExperimentResultRecord>;
  findByExperimentId(experimentId: string): Promise<ExperimentResultRecord | null>;
  update(experimentId: string, data: Partial<ExperimentResultRecord>): Promise<ExperimentResultRecord>;
}

// =============================================================================
// Domain Events
// =============================================================================

export class ExperimentCreatedEvent extends DomainEvent {
  readonly eventType = 'experiment.created';
  constructor(
    public readonly experimentId: string,
    public readonly name: string,
    public readonly type: ExperimentType,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      experimentId: this.experimentId,
      name: this.name,
      type: this.type,
      tenantId: this.tenantId,
    };
  }
}

export class ExperimentStartedEvent extends DomainEvent {
  readonly eventType = 'experiment.started';
  constructor(
    public readonly experimentId: string,
    public readonly startDate: Date
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      experimentId: this.experimentId,
      startDate: this.startDate.toISOString(),
    };
  }
}

export class ExperimentCompletedEvent extends DomainEvent {
  readonly eventType = 'experiment.completed';
  constructor(
    public readonly experimentId: string,
    public readonly winner: 'control' | 'treatment' | null,
    public readonly isSignificant: boolean,
    public readonly pValue: number,
    public readonly effectSize: number
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      experimentId: this.experimentId,
      winner: this.winner,
      isSignificant: this.isSignificant,
      pValue: this.pValue,
      effectSize: this.effectSize,
    };
  }
}

export class VariantAssignedEvent extends DomainEvent {
  readonly eventType = 'experiment.variant_assigned';
  constructor(
    public readonly experimentId: string,
    public readonly leadId: string,
    public readonly variant: ExperimentVariant
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      experimentId: this.experimentId,
      leadId: this.leadId,
      variant: this.variant,
    };
  }
}

// =============================================================================
// Experiment Service
// =============================================================================

/**
 * Experiment Service
 *
 * Manages A/B testing for lead scoring:
 * - Creates and manages experiments
 * - Assigns leads to control/treatment variants
 * - Records scores and conversions
 * - Performs statistical analysis
 */
export class ExperimentService {
  constructor(
    private readonly experimentRepo: ExperimentRepositoryPort,
    private readonly assignmentRepo: AssignmentRepositoryPort,
    private readonly resultRepo: ResultRepositoryPort,
    private readonly eventBus: EventBusPort
  ) {}

  // ===========================================================================
  // Experiment Lifecycle
  // ===========================================================================

  /**
   * Create a new A/B experiment
   */
  async createExperiment(
    input: CreateExperimentInput,
    tenantId: string
  ): Promise<ExperimentRecord> {
    const experiment = await this.experimentRepo.create({
      name: input.name,
      description: input.description ?? null,
      type: input.type,
      hypothesis: input.hypothesis,
      controlVariant: input.controlVariant ?? 'manual',
      treatmentVariant: input.treatmentVariant ?? 'ai',
      trafficPercent: input.trafficPercent ?? EXPERIMENT_DEFAULTS.DEFAULT_TRAFFIC_PERCENT,
      minSampleSize: input.minSampleSize ?? 100,
      significanceLevel: input.significanceLevel ?? EXPERIMENT_DEFAULTS.DEFAULT_SIGNIFICANCE_LEVEL,
      tenantId,
    });

    await this.eventBus.publish(
      new ExperimentCreatedEvent(
        experiment.id,
        experiment.name,
        experiment.type,
        tenantId
      )
    );

    return experiment;
  }

  /**
   * Update experiment configuration (only in DRAFT status)
   */
  async updateExperiment(
    experimentId: string,
    input: UpdateExperimentInput
  ): Promise<ExperimentRecord> {
    const experiment = await this.experimentRepo.findById(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'DRAFT') {
      throw new Error('Can only update experiments in DRAFT status');
    }

    return this.experimentRepo.update(experimentId, {
      name: input.name ?? experiment.name,
      hypothesis: input.hypothesis ?? experiment.hypothesis,
      trafficPercent: input.trafficPercent ?? experiment.trafficPercent,
      minSampleSize: input.minSampleSize ?? experiment.minSampleSize,
      significanceLevel: input.significanceLevel ?? experiment.significanceLevel,
    });
  }

  /**
   * Start an experiment
   */
  async startExperiment(experimentId: string): Promise<ExperimentRecord> {
    const experiment = await this.experimentRepo.findById(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'DRAFT' && experiment.status !== 'PAUSED') {
      throw new Error('Can only start experiments in DRAFT or PAUSED status');
    }

    const startDate = new Date();
    const updated = await this.experimentRepo.update(experimentId, {
      status: 'RUNNING',
      startDate: experiment.startDate ?? startDate,
    });

    await this.eventBus.publish(
      new ExperimentStartedEvent(experimentId, startDate)
    );

    return updated;
  }

  /**
   * Pause a running experiment
   */
  async pauseExperiment(experimentId: string): Promise<ExperimentRecord> {
    const experiment = await this.experimentRepo.findById(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'RUNNING') {
      throw new Error('Can only pause running experiments');
    }

    return this.experimentRepo.update(experimentId, {
      status: 'PAUSED',
    });
  }

  /**
   * Complete an experiment and mark it as done
   */
  async completeExperiment(experimentId: string): Promise<ExperimentRecord> {
    const experiment = await this.experimentRepo.findById(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    // Run analysis before completing
    const result = await this.analyzeExperiment(experimentId);

    const updated = await this.experimentRepo.update(experimentId, {
      status: 'COMPLETED',
      endDate: new Date(),
    });

    await this.eventBus.publish(
      new ExperimentCompletedEvent(
        experimentId,
        result.winner,
        result.isSignificant,
        result.pValue,
        result.effectSize
      )
    );

    return updated;
  }

  /**
   * Archive a completed experiment
   */
  async archiveExperiment(experimentId: string): Promise<ExperimentRecord> {
    const experiment = await this.experimentRepo.findById(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'COMPLETED') {
      throw new Error('Can only archive completed experiments');
    }

    return this.experimentRepo.update(experimentId, {
      status: 'ARCHIVED',
    });
  }

  // ===========================================================================
  // Variant Assignment
  // ===========================================================================

  /**
   * Assign a lead to a variant
   *
   * Uses deterministic hashing for consistent assignment
   */
  async assignVariant(
    experimentId: string,
    leadId: string
  ): Promise<{ variant: ExperimentVariant; assignment: AssignmentRecord }> {
    const experiment = await this.experimentRepo.findById(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'RUNNING') {
      throw new Error('Can only assign variants for running experiments');
    }

    // Check if already assigned
    const existing = await this.assignmentRepo.findByExperimentAndLead(
      experimentId,
      leadId
    );
    if (existing) {
      return {
        variant: existing.variant as ExperimentVariant,
        assignment: existing,
      };
    }

    // Deterministic variant assignment using hash
    const variant = this.calculateVariant(
      experimentId,
      leadId,
      experiment.trafficPercent
    );

    const assignment = await this.assignmentRepo.create({
      experimentId,
      leadId,
      variant,
    });

    await this.eventBus.publish(
      new VariantAssignedEvent(experimentId, leadId, variant)
    );

    return { variant, assignment };
  }

  /**
   * Get variant for a lead (without creating assignment)
   */
  async getVariant(
    experimentId: string,
    leadId: string
  ): Promise<ExperimentVariant | null> {
    const assignment = await this.assignmentRepo.findByExperimentAndLead(
      experimentId,
      leadId
    );
    return assignment ? (assignment.variant as ExperimentVariant) : null;
  }

  /**
   * Deterministic variant calculation using hash
   */
  private calculateVariant(
    experimentId: string,
    leadId: string,
    trafficPercent: number
  ): ExperimentVariant {
    // Simple hash function for deterministic assignment
    const combined = `${experimentId}:${leadId}`;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Normalize to 0-100 range
    const bucket = Math.abs(hash) % 100;

    // Assign to treatment if within traffic percentage
    return bucket < trafficPercent ? 'treatment' : 'control';
  }

  // ===========================================================================
  // Score & Conversion Recording
  // ===========================================================================

  /**
   * Record a score for a lead in an experiment
   */
  async recordScore(input: RecordScoreInput): Promise<AssignmentRecord> {
    const assignment = await this.assignmentRepo.findByExperimentAndLead(
      input.experimentId,
      input.leadId
    );

    if (!assignment) {
      throw new Error(
        `No assignment found for lead ${input.leadId} in experiment ${input.experimentId}`
      );
    }

    return this.assignmentRepo.updateScore(
      input.experimentId,
      input.leadId,
      input.score,
      input.confidence
    );
  }

  /**
   * Record a conversion for a lead
   */
  async recordConversion(input: RecordConversionInput): Promise<AssignmentRecord> {
    const assignment = await this.assignmentRepo.findByExperimentAndLead(
      input.experimentId,
      input.leadId
    );

    if (!assignment) {
      throw new Error(
        `No assignment found for lead ${input.leadId} in experiment ${input.experimentId}`
      );
    }

    return this.assignmentRepo.updateConversion(
      input.experimentId,
      input.leadId,
      input.conversionValue
    );
  }

  // ===========================================================================
  // Statistical Analysis
  // ===========================================================================

  /**
   * Analyze experiment results
   */
  async analyzeExperiment(experimentId: string): Promise<ExperimentResultRecord> {
    const experiment = await this.experimentRepo.findById(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    // Get scores by variant
    const controlScores = await this.assignmentRepo.getScoresByVariant(
      experimentId,
      'control'
    );
    const treatmentScores = await this.assignmentRepo.getScoresByVariant(
      experimentId,
      'treatment'
    );

    // Descriptive statistics
    const controlStats = this.calculateStats(controlScores);
    const treatmentStats = this.calculateStats(treatmentScores);

    // Welch's t-test
    const tTest = this.welchTTest(
      controlStats.mean,
      controlStats.variance,
      controlStats.n,
      treatmentStats.mean,
      treatmentStats.variance,
      treatmentStats.n,
      experiment.significanceLevel
    );

    // Effect size (Cohen's d)
    const effectSize = this.cohensD(
      controlStats.mean,
      controlStats.variance,
      controlStats.n,
      treatmentStats.mean,
      treatmentStats.variance,
      treatmentStats.n
    );

    // Get conversion rates (optional)
    const controlConversions = await this.assignmentRepo.getConversionsByVariant(
      experimentId,
      'control'
    );
    const treatmentConversions = await this.assignmentRepo.getConversionsByVariant(
      experimentId,
      'treatment'
    );

    const controlConversionRate = controlConversions.total > 0
      ? controlConversions.count / controlConversions.total
      : null;
    const treatmentConversionRate = treatmentConversions.total > 0
      ? treatmentConversions.count / treatmentConversions.total
      : null;

    // Chi-square test for conversions (if available)
    let chiSquare: { statistic: number; pValue: number } | null = null;
    if (
      controlConversions.total > 0 &&
      treatmentConversions.total > 0
    ) {
      chiSquare = this.chiSquareTest(
        controlConversions.count,
        controlConversions.total,
        treatmentConversions.count,
        treatmentConversions.total
      );
    }

    // Determine winner
    let winner: 'control' | 'treatment' | null = null;
    if (tTest.isSignificant) {
      winner = treatmentStats.mean > controlStats.mean ? 'treatment' : 'control';
    }

    // Generate recommendation
    const recommendation = this.generateRecommendation(
      tTest.isSignificant,
      winner,
      effectSize,
      treatmentStats.mean - controlStats.mean,
      tTest.pValue
    );

    // Save or update result
    const existingResult = await this.resultRepo.findByExperimentId(experimentId);
    const resultData = {
      experimentId,
      controlSampleSize: controlStats.n,
      treatmentSampleSize: treatmentStats.n,
      controlMean: controlStats.mean,
      treatmentMean: treatmentStats.mean,
      controlStdDev: controlStats.stdDev,
      treatmentStdDev: treatmentStats.stdDev,
      tStatistic: tTest.tStatistic,
      pValue: tTest.pValue,
      confidenceInterval: tTest.confidenceInterval,
      effectSize,
      controlConversionRate,
      treatmentConversionRate,
      chiSquareStatistic: chiSquare?.statistic ?? null,
      chiSquarePValue: chiSquare?.pValue ?? null,
      isSignificant: tTest.isSignificant,
      winner,
      recommendation,
    };

    if (existingResult) {
      return this.resultRepo.update(experimentId, resultData);
    }

    return this.resultRepo.create(resultData);
  }

  // ===========================================================================
  // Queries
  // ===========================================================================

  /**
   * Get experiment by ID
   */
  async getExperiment(experimentId: string): Promise<ExperimentRecord | null> {
    return this.experimentRepo.findById(experimentId);
  }

  /**
   * List experiments for a tenant
   */
  async listExperiments(tenantId: string): Promise<ExperimentSummary[]> {
    const experiments = await this.experimentRepo.findByTenantId(tenantId);
    const summaries: ExperimentSummary[] = [];

    for (const exp of experiments) {
      const controlCount = await this.assignmentRepo.countByVariant(exp.id, 'control');
      const treatmentCount = await this.assignmentRepo.countByVariant(exp.id, 'treatment');
      const totalAssignments = controlCount + treatmentCount;
      const targetTotal = exp.minSampleSize * 2;
      const progressPercent = Math.min(100, (totalAssignments / targetTotal) * 100);

      const result = await this.resultRepo.findByExperimentId(exp.id);

      summaries.push({
        id: exp.id,
        name: exp.name,
        description: exp.description,
        type: exp.type,
        status: exp.status,
        hypothesis: exp.hypothesis,
        controlVariant: exp.controlVariant,
        treatmentVariant: exp.treatmentVariant,
        trafficPercent: exp.trafficPercent,
        startDate: exp.startDate,
        endDate: exp.endDate,
        minSampleSize: exp.minSampleSize,
        significanceLevel: exp.significanceLevel,
        controlSampleSize: controlCount,
        treatmentSampleSize: treatmentCount,
        totalAssignments,
        progressPercent,
        hasResult: !!result,
        isSignificant: result?.isSignificant ?? null,
        winner: result?.winner ?? null,
        createdAt: exp.createdAt,
        updatedAt: exp.updatedAt,
      });
    }

    return summaries;
  }

  /**
   * Get experiment status
   */
  async getStatus(experimentId: string): Promise<ExperimentStatusResponse> {
    const experiment = await this.experimentRepo.findById(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    const controlCount = await this.assignmentRepo.countByVariant(experimentId, 'control');
    const treatmentCount = await this.assignmentRepo.countByVariant(experimentId, 'treatment');
    const targetTotal = experiment.minSampleSize * 2;
    const totalAssignments = controlCount + treatmentCount;
    const progressPercent = Math.min(100, (totalAssignments / targetTotal) * 100);

    const canAnalyze =
      controlCount >= EXPERIMENT_DEFAULTS.MIN_SAMPLE_SIZE &&
      treatmentCount >= EXPERIMENT_DEFAULTS.MIN_SAMPLE_SIZE;

    return {
      experimentId,
      status: experiment.status,
      controlSampleSize: controlCount,
      treatmentSampleSize: treatmentCount,
      targetSampleSize: experiment.minSampleSize,
      progressPercent,
      canAnalyze,
      estimatedCompletionDate: null, // Could calculate based on current rate
    };
  }

  /**
   * Get experiment results
   */
  async getResults(experimentId: string): Promise<ExperimentResult | null> {
    const result = await this.resultRepo.findByExperimentId(experimentId);
    if (!result) {
      return null;
    }

    return {
      id: result.id,
      experimentId: result.experimentId,
      controlSampleSize: result.controlSampleSize,
      treatmentSampleSize: result.treatmentSampleSize,
      controlMean: result.controlMean,
      treatmentMean: result.treatmentMean,
      controlStdDev: result.controlStdDev,
      treatmentStdDev: result.treatmentStdDev,
      tStatistic: result.tStatistic,
      pValue: result.pValue,
      confidenceInterval: result.confidenceInterval,
      effectSize: result.effectSize,
      controlConversionRate: result.controlConversionRate,
      treatmentConversionRate: result.treatmentConversionRate,
      chiSquareStatistic: result.chiSquareStatistic,
      chiSquarePValue: result.chiSquarePValue,
      isSignificant: result.isSignificant,
      winner: result.winner,
      recommendation: result.recommendation,
      analyzedAt: result.analyzedAt,
    };
  }

  // ===========================================================================
  // Private Statistical Methods
  // ===========================================================================

  private calculateStats(data: number[]): {
    n: number;
    mean: number;
    variance: number;
    stdDev: number;
  } {
    const n = data.length;
    if (n === 0) {
      return { n: 0, mean: 0, variance: 0, stdDev: 0 };
    }

    const mean = data.reduce((sum, x) => sum + x, 0) / n;
    const variance = n > 1
      ? data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n - 1)
      : 0;

    return {
      n,
      mean,
      variance,
      stdDev: Math.sqrt(variance),
    };
  }

  private welchTTest(
    mean1: number,
    var1: number,
    n1: number,
    mean2: number,
    var2: number,
    n2: number,
    alpha: number
  ): { tStatistic: number; pValue: number; isSignificant: boolean; confidenceInterval: ConfidenceInterval } {
    if (n1 < 2 || n2 < 2) {
      return {
        tStatistic: 0,
        pValue: 1,
        isSignificant: false,
        confidenceInterval: { lower: 0, upper: 0 },
      };
    }

    const se1 = var1 / n1;
    const se2 = var2 / n2;
    const seDiff = Math.sqrt(se1 + se2);

    const tStatistic = seDiff > 0 ? (mean1 - mean2) / seDiff : 0;

    // Welch-Satterthwaite degrees of freedom
    const numerator = Math.pow(se1 + se2, 2);
    const denominator = Math.pow(se1, 2) / (n1 - 1) + Math.pow(se2, 2) / (n2 - 1);
    const df = denominator > 0 ? numerator / denominator : 1;

    // Approximate p-value using normal distribution for large df
    const pValue = this.approximatePValue(Math.abs(tStatistic), df);

    // Approximate critical value
    const tCritical = this.approximateTCritical(alpha / 2, df);
    const marginOfError = tCritical * seDiff;
    const diff = mean1 - mean2;

    return {
      tStatistic,
      pValue,
      isSignificant: pValue < alpha,
      confidenceInterval: {
        lower: diff - marginOfError,
        upper: diff + marginOfError,
      },
    };
  }

  private cohensD(
    mean1: number,
    var1: number,
    n1: number,
    mean2: number,
    var2: number,
    n2: number
  ): number {
    if (n1 < 2 || n2 < 2) return 0;

    const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
    const pooledStd = Math.sqrt(pooledVar);

    return pooledStd > 0 ? (mean1 - mean2) / pooledStd : 0;
  }

  private chiSquareTest(
    controlConversions: number,
    controlTotal: number,
    treatmentConversions: number,
    treatmentTotal: number
  ): { statistic: number; pValue: number } {
    const total = controlTotal + treatmentTotal;
    const totalConversions = controlConversions + treatmentConversions;

    if (total === 0) {
      return { statistic: 0, pValue: 1 };
    }

    const expectedControlConversions = (controlTotal * totalConversions) / total;
    const expectedTreatmentConversions = (treatmentTotal * totalConversions) / total;
    const expectedControlNonConversions = controlTotal - expectedControlConversions;
    const expectedTreatmentNonConversions = treatmentTotal - expectedTreatmentConversions;

    const chiSquare =
      this.chiSquareComponent(controlConversions, expectedControlConversions) +
      this.chiSquareComponent(controlTotal - controlConversions, expectedControlNonConversions) +
      this.chiSquareComponent(treatmentConversions, expectedTreatmentConversions) +
      this.chiSquareComponent(treatmentTotal - treatmentConversions, expectedTreatmentNonConversions);

    // Approximate p-value from chi-square distribution (df=1)
    const pValue = this.approximateChiSquarePValue(chiSquare, 1);

    return { statistic: chiSquare, pValue };
  }

  private chiSquareComponent(observed: number, expected: number): number {
    if (expected === 0) return 0;
    return Math.pow(observed - expected, 2) / expected;
  }

  private approximatePValue(t: number, df: number): number {
    // For large df, t-distribution approaches normal
    // Using simple approximation
    const x = df / (df + t * t);
    const p = 0.5 * Math.pow(x, df / 2);
    return 2 * Math.min(p, 1 - p);
  }

  private approximateTCritical(alpha: number, df: number): number {
    // Simple approximation for t-critical value
    // For df > 30, use z-value approximation
    if (df > 30) {
      return alpha === 0.025 ? 1.96 : alpha === 0.005 ? 2.576 : 1.645;
    }
    // Rough interpolation for smaller df
    return 2.0 + (30 - df) * 0.02;
  }

  private approximateChiSquarePValue(x: number, df: number): number {
    if (x <= 0) return 1;
    // Simple approximation using Wilson-Hilferty transformation
    const z = Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df));
    const pValue = 1 - this.normalCDF(z / Math.sqrt(2 / (9 * df)));
    return Math.max(0, Math.min(1, pValue));
  }

  private normalCDF(z: number): number {
    // Approximation of standard normal CDF
    if (z < -8) return 0;
    if (z > 8) return 1;
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);
    const t = 1 / (1 + p * z);
    const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    return 0.5 * (1 + sign * erf);
  }

  private generateRecommendation(
    isSignificant: boolean,
    winner: 'control' | 'treatment' | null,
    effectSize: number,
    difference: number,
    pValue: number
  ): string {
    if (!isSignificant) {
      return `No statistically significant difference detected (p=${pValue.toFixed(4)}). ` +
        `Consider increasing sample size or running the experiment longer.`;
    }

    const winnerLabel = winner === 'treatment' ? 'AI scoring' : 'Manual scoring';
    const effectLabel = Math.abs(effectSize) < 0.5 ? 'small' :
      Math.abs(effectSize) < 0.8 ? 'medium' : 'large';

    return `${winnerLabel} shows a statistically significant improvement of ${Math.abs(difference).toFixed(1)} points ` +
      `(p=${pValue.toFixed(4)}, effect size: ${effectLabel}). ` +
      `Recommend adopting ${winnerLabel.toLowerCase()} for production use.`;
  }
}
