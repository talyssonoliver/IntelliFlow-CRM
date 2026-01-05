/**
 * Experiment Validators - A/B Testing Framework
 *
 * Zod schemas for experiment inputs/outputs.
 * Derived from domain constants in packages/domain/src/ai/AIConstants.ts
 *
 * Task: IFC-025 - A/B Testing Framework
 */

import { z } from 'zod';
import {
  EXPERIMENT_STATUSES,
  EXPERIMENT_TYPES,
  EXPERIMENT_VARIANTS,
  EXPERIMENT_DEFAULTS,
  EFFECT_SIZE_THRESHOLDS,
} from '@intelliflow/domain';

// =============================================================================
// Base Schemas (derived from domain constants)
// =============================================================================

export const experimentStatusSchema = z.enum(EXPERIMENT_STATUSES);
export const experimentTypeSchema = z.enum(EXPERIMENT_TYPES);
export const experimentVariantSchema = z.enum(EXPERIMENT_VARIANTS);

// =============================================================================
// Create Experiment Input
// =============================================================================

export const createExperimentSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  type: experimentTypeSchema,
  hypothesis: z.string().min(10).max(500),
  controlVariant: z.string().default('manual'),
  treatmentVariant: z.string().default('ai'),
  trafficPercent: z
    .number()
    .int()
    .min(1)
    .max(99)
    .default(EXPERIMENT_DEFAULTS.DEFAULT_TRAFFIC_PERCENT),
  minSampleSize: z
    .number()
    .int()
    .min(EXPERIMENT_DEFAULTS.MIN_SAMPLE_SIZE)
    .default(100),
  significanceLevel: z
    .number()
    .min(0.001)
    .max(0.1)
    .default(EXPERIMENT_DEFAULTS.DEFAULT_SIGNIFICANCE_LEVEL),
});

export type CreateExperimentInput = z.infer<typeof createExperimentSchema>;

// =============================================================================
// Update Experiment Input
// =============================================================================

export const updateExperimentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  hypothesis: z.string().min(10).max(500).optional(),
  trafficPercent: z.number().int().min(1).max(99).optional(),
  minSampleSize: z.number().int().min(EXPERIMENT_DEFAULTS.MIN_SAMPLE_SIZE).optional(),
  significanceLevel: z.number().min(0.001).max(0.1).optional(),
});

export type UpdateExperimentInput = z.infer<typeof updateExperimentSchema>;

// =============================================================================
// Experiment Assignment
// =============================================================================

export const assignVariantInputSchema = z.object({
  experimentId: z.string().cuid(),
  leadId: z.string().cuid(),
});

export type AssignVariantInput = z.infer<typeof assignVariantInputSchema>;

export const experimentAssignmentSchema = z.object({
  id: z.string().cuid(),
  experimentId: z.string().cuid(),
  leadId: z.string().cuid(),
  variant: experimentVariantSchema,
  score: z.number().int().min(0).max(100).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  convertedAt: z.date().nullable(),
  conversionValue: z.number().nullable(),
  createdAt: z.date(),
});

export type ExperimentAssignment = z.infer<typeof experimentAssignmentSchema>;

// =============================================================================
// Record Score Input
// =============================================================================

export const recordScoreInputSchema = z.object({
  experimentId: z.string().cuid(),
  leadId: z.string().cuid(),
  score: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1).optional(),
});

export type RecordScoreInput = z.infer<typeof recordScoreInputSchema>;

// =============================================================================
// Record Conversion Input
// =============================================================================

export const recordConversionInputSchema = z.object({
  experimentId: z.string().cuid(),
  leadId: z.string().cuid(),
  conversionValue: z.number().min(0).optional(),
});

export type RecordConversionInput = z.infer<typeof recordConversionInputSchema>;

// =============================================================================
// Statistical Test Results
// =============================================================================

export const confidenceIntervalSchema = z.object({
  lower: z.number(),
  upper: z.number(),
});

export type ConfidenceInterval = z.infer<typeof confidenceIntervalSchema>;

export const tTestResultSchema = z.object({
  tStatistic: z.number(),
  pValue: z.number().min(0).max(1),
  degreesOfFreedom: z.number(),
  isSignificant: z.boolean(),
  confidenceInterval: confidenceIntervalSchema,
});

export type TTestResult = z.infer<typeof tTestResultSchema>;

export const chiSquareResultSchema = z.object({
  chiSquareStatistic: z.number(),
  pValue: z.number().min(0).max(1),
  degreesOfFreedom: z.number(),
  isSignificant: z.boolean(),
});

export type ChiSquareResult = z.infer<typeof chiSquareResultSchema>;

export const effectSizeInterpretationSchema = z.enum(['NEGLIGIBLE', 'SMALL', 'MEDIUM', 'LARGE']);

export type EffectSizeInterpretation = z.infer<typeof effectSizeInterpretationSchema>;

// =============================================================================
// Experiment Result
// =============================================================================

export const experimentResultSchema = z.object({
  id: z.string().cuid(),
  experimentId: z.string().cuid(),

  // Sample sizes
  controlSampleSize: z.number().int().min(0),
  treatmentSampleSize: z.number().int().min(0),

  // Descriptive statistics
  controlMean: z.number(),
  treatmentMean: z.number(),
  controlStdDev: z.number().min(0),
  treatmentStdDev: z.number().min(0),

  // T-test results
  tStatistic: z.number(),
  pValue: z.number().min(0).max(1),
  confidenceInterval: confidenceIntervalSchema,
  effectSize: z.number(),

  // Conversion metrics (optional)
  controlConversionRate: z.number().min(0).max(1).nullable(),
  treatmentConversionRate: z.number().min(0).max(1).nullable(),
  chiSquareStatistic: z.number().nullable(),
  chiSquarePValue: z.number().min(0).max(1).nullable(),

  // Conclusion
  isSignificant: z.boolean(),
  winner: z.enum(['control', 'treatment']).nullable(),
  recommendation: z.string().nullable(),

  analyzedAt: z.date(),
});

export type ExperimentResult = z.infer<typeof experimentResultSchema>;

// =============================================================================
// Experiment Summary (for listing)
// =============================================================================

export const experimentSummarySchema = z.object({
  id: z.string().cuid(),
  name: z.string(),
  description: z.string().nullable(),
  type: experimentTypeSchema,
  status: experimentStatusSchema,
  hypothesis: z.string(),

  controlVariant: z.string(),
  treatmentVariant: z.string(),
  trafficPercent: z.number(),

  startDate: z.date().nullable(),
  endDate: z.date().nullable(),

  minSampleSize: z.number(),
  significanceLevel: z.number(),

  // Progress
  controlSampleSize: z.number(),
  treatmentSampleSize: z.number(),
  totalAssignments: z.number(),
  progressPercent: z.number().min(0).max(100),

  // Has result?
  hasResult: z.boolean(),
  isSignificant: z.boolean().nullable(),
  winner: z.enum(['control', 'treatment']).nullable(),

  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ExperimentSummary = z.infer<typeof experimentSummarySchema>;

// =============================================================================
// Experiment Status Response
// =============================================================================

export const experimentStatusResponseSchema = z.object({
  experimentId: z.string().cuid(),
  status: experimentStatusSchema,
  controlSampleSize: z.number(),
  treatmentSampleSize: z.number(),
  targetSampleSize: z.number(),
  progressPercent: z.number().min(0).max(100),
  canAnalyze: z.boolean(), // true if sample sizes meet minimum
  estimatedCompletionDate: z.date().nullable(),
});

export type ExperimentStatusResponse = z.infer<typeof experimentStatusResponseSchema>;

// =============================================================================
// Statistical Analysis Request
// =============================================================================

export const analyzeExperimentInputSchema = z.object({
  experimentId: z.string().cuid(),
  includeConversionAnalysis: z.boolean().default(true),
});

export type AnalyzeExperimentInput = z.infer<typeof analyzeExperimentInputSchema>;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Interpret effect size using Cohen's d thresholds
 */
export function interpretEffectSize(cohensD: number): EffectSizeInterpretation {
  const absD = Math.abs(cohensD);
  if (absD < EFFECT_SIZE_THRESHOLDS.SMALL) return 'NEGLIGIBLE';
  if (absD < EFFECT_SIZE_THRESHOLDS.MEDIUM) return 'SMALL';
  if (absD < EFFECT_SIZE_THRESHOLDS.LARGE) return 'MEDIUM';
  return 'LARGE';
}

/**
 * Calculate required sample size per group for desired power
 * Uses simplified formula: n = 2 * ((z_α + z_β) / d)²
 * where z_α and z_β are z-scores for significance and power
 */
export function calculateRequiredSampleSize(
  effectSize: number,
  power: number = EXPERIMENT_DEFAULTS.DEFAULT_POWER,
  alpha: number = EXPERIMENT_DEFAULTS.DEFAULT_SIGNIFICANCE_LEVEL
): number {
  // Z-scores for common values (approximation)
  const zAlpha = alpha === 0.05 ? 1.96 : alpha === 0.01 ? 2.576 : 1.645;
  const zBeta = power === 0.8 ? 0.84 : power === 0.9 ? 1.28 : 0.52;

  const n = 2 * Math.pow((zAlpha + zBeta) / effectSize, 2);
  return Math.ceil(n);
}

/**
 * Check if experiment has sufficient samples for analysis
 */
export function hasSufficientSamples(
  controlSize: number,
  treatmentSize: number,
  minSampleSize: number = EXPERIMENT_DEFAULTS.MIN_SAMPLE_SIZE
): boolean {
  return controlSize >= minSampleSize && treatmentSize >= minSampleSize;
}

/**
 * Format p-value for display
 */
export function formatPValue(pValue: number): string {
  if (pValue < 0.001) return '< 0.001';
  if (pValue < 0.01) return `< 0.01`;
  return pValue.toFixed(3);
}

/**
 * Get significance level description
 */
export function getSignificanceDescription(pValue: number, alpha: number): string {
  if (pValue < alpha) {
    if (pValue < 0.001) return 'Highly significant (p < 0.001)';
    if (pValue < 0.01) return 'Very significant (p < 0.01)';
    return `Significant (p < ${alpha})`;
  }
  return 'Not significant';
}
