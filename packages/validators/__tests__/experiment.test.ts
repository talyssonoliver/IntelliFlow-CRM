/**
 * Experiment Validator Tests - IFC-025: A/B Testing Framework
 *
 * Tests Zod schemas for experiment inputs/outputs and utility functions.
 */

import { describe, it, expect } from 'vitest';
import {
  experimentStatusSchema,
  experimentTypeSchema,
  experimentVariantSchema,
  createExperimentSchema,
  updateExperimentSchema,
  assignVariantInputSchema,
  recordScoreInputSchema,
  recordConversionInputSchema,
  experimentResultSchema,
  experimentSummarySchema,
  experimentStatusResponseSchema,
  analyzeExperimentInputSchema,
  interpretEffectSize,
  calculateRequiredSampleSize,
  hasSufficientSamples,
  formatPValue,
  getSignificanceDescription,
} from '../src/experiment';

describe('Experiment Validators', () => {
  // ===========================================================================
  // Base Schema Tests
  // ===========================================================================

  describe('experimentStatusSchema', () => {
    it('should accept valid statuses', () => {
      expect(experimentStatusSchema.parse('DRAFT')).toBe('DRAFT');
      expect(experimentStatusSchema.parse('RUNNING')).toBe('RUNNING');
      expect(experimentStatusSchema.parse('PAUSED')).toBe('PAUSED');
      expect(experimentStatusSchema.parse('COMPLETED')).toBe('COMPLETED');
      expect(experimentStatusSchema.parse('ARCHIVED')).toBe('ARCHIVED');
    });

    it('should reject invalid statuses', () => {
      expect(() => experimentStatusSchema.parse('INVALID')).toThrow();
      expect(() => experimentStatusSchema.parse('')).toThrow();
    });
  });

  describe('experimentTypeSchema', () => {
    it('should accept valid types', () => {
      expect(experimentTypeSchema.parse('AI_VS_MANUAL')).toBe('AI_VS_MANUAL');
      expect(experimentTypeSchema.parse('MODEL_COMPARISON')).toBe('MODEL_COMPARISON');
      expect(experimentTypeSchema.parse('THRESHOLD_TEST')).toBe('THRESHOLD_TEST');
    });

    it('should reject invalid types', () => {
      expect(() => experimentTypeSchema.parse('INVALID')).toThrow();
    });
  });

  describe('experimentVariantSchema', () => {
    it('should accept control and treatment', () => {
      expect(experimentVariantSchema.parse('control')).toBe('control');
      expect(experimentVariantSchema.parse('treatment')).toBe('treatment');
    });

    it('should reject other variants', () => {
      expect(() => experimentVariantSchema.parse('other')).toThrow();
    });
  });

  // ===========================================================================
  // Create Experiment Schema Tests
  // ===========================================================================

  describe('createExperimentSchema', () => {
    const validInput = {
      name: 'AI vs Manual Scoring Test',
      type: 'AI_VS_MANUAL',
      hypothesis: 'AI scoring will improve conversion rates by 10%',
    };

    it('should accept valid minimal input', () => {
      const result = createExperimentSchema.parse(validInput);
      expect(result.name).toBe('AI vs Manual Scoring Test');
      expect(result.type).toBe('AI_VS_MANUAL');
      expect(result.hypothesis).toBe('AI scoring will improve conversion rates by 10%');
    });

    it('should apply defaults for optional fields', () => {
      const result = createExperimentSchema.parse(validInput);
      expect(result.controlVariant).toBe('manual');
      expect(result.treatmentVariant).toBe('ai');
      expect(result.trafficPercent).toBe(50);
      expect(result.minSampleSize).toBe(100);
      expect(result.significanceLevel).toBe(0.05);
    });

    it('should accept full input with all fields', () => {
      const fullInput = {
        ...validInput,
        description: 'Full experiment description',
        controlVariant: 'baseline',
        treatmentVariant: 'new_model',
        trafficPercent: 30,
        minSampleSize: 200,
        significanceLevel: 0.01,
      };
      const result = createExperimentSchema.parse(fullInput);
      expect(result.description).toBe('Full experiment description');
      expect(result.controlVariant).toBe('baseline');
      expect(result.trafficPercent).toBe(30);
      expect(result.significanceLevel).toBe(0.01);
    });

    it('should reject empty name', () => {
      expect(() =>
        createExperimentSchema.parse({ ...validInput, name: '' })
      ).toThrow();
    });

    it('should reject short hypothesis', () => {
      expect(() =>
        createExperimentSchema.parse({ ...validInput, hypothesis: 'Short' })
      ).toThrow();
    });

    it('should reject invalid traffic percent', () => {
      expect(() =>
        createExperimentSchema.parse({ ...validInput, trafficPercent: 0 })
      ).toThrow();
      expect(() =>
        createExperimentSchema.parse({ ...validInput, trafficPercent: 100 })
      ).toThrow();
    });

    it('should reject invalid significance level', () => {
      expect(() =>
        createExperimentSchema.parse({ ...validInput, significanceLevel: 0 })
      ).toThrow();
      expect(() =>
        createExperimentSchema.parse({ ...validInput, significanceLevel: 0.5 })
      ).toThrow();
    });
  });

  // ===========================================================================
  // Update Experiment Schema Tests
  // ===========================================================================

  describe('updateExperimentSchema', () => {
    it('should accept partial updates', () => {
      const result = updateExperimentSchema.parse({ name: 'Updated Name' });
      expect(result.name).toBe('Updated Name');
    });

    it('should accept empty object', () => {
      const result = updateExperimentSchema.parse({});
      expect(result).toEqual({});
    });

    it('should validate fields when provided', () => {
      expect(() =>
        updateExperimentSchema.parse({ hypothesis: 'Short' })
      ).toThrow();
    });
  });

  // ===========================================================================
  // Assignment Schema Tests
  // ===========================================================================

  describe('assignVariantInputSchema', () => {
    it('should accept valid CUIDs', () => {
      const result = assignVariantInputSchema.parse({
        experimentId: 'clr4abc123def456ghi789',
        leadId: 'clr4xyz789uvw012rst345',
      });
      expect(result.experimentId).toBeDefined();
      expect(result.leadId).toBeDefined();
    });

    it('should reject invalid IDs', () => {
      expect(() =>
        assignVariantInputSchema.parse({
          experimentId: 'invalid',
          leadId: 'also-invalid',
        })
      ).toThrow();
    });
  });

  // ===========================================================================
  // Record Score Schema Tests
  // ===========================================================================

  describe('recordScoreInputSchema', () => {
    const validInput = {
      experimentId: 'clr4abc123def456ghi789',
      leadId: 'clr4xyz789uvw012rst345',
      score: 75,
    };

    it('should accept valid score input', () => {
      const result = recordScoreInputSchema.parse(validInput);
      expect(result.score).toBe(75);
    });

    it('should accept optional confidence', () => {
      const result = recordScoreInputSchema.parse({
        ...validInput,
        confidence: 0.85,
      });
      expect(result.confidence).toBe(0.85);
    });

    it('should reject score outside 0-100', () => {
      expect(() =>
        recordScoreInputSchema.parse({ ...validInput, score: -1 })
      ).toThrow();
      expect(() =>
        recordScoreInputSchema.parse({ ...validInput, score: 101 })
      ).toThrow();
    });

    it('should reject confidence outside 0-1', () => {
      expect(() =>
        recordScoreInputSchema.parse({ ...validInput, confidence: 1.5 })
      ).toThrow();
    });
  });

  // ===========================================================================
  // Record Conversion Schema Tests
  // ===========================================================================

  describe('recordConversionInputSchema', () => {
    it('should accept basic conversion', () => {
      const result = recordConversionInputSchema.parse({
        experimentId: 'clr4abc123def456ghi789',
        leadId: 'clr4xyz789uvw012rst345',
      });
      expect(result.experimentId).toBeDefined();
    });

    it('should accept conversion with value', () => {
      const result = recordConversionInputSchema.parse({
        experimentId: 'clr4abc123def456ghi789',
        leadId: 'clr4xyz789uvw012rst345',
        conversionValue: 1500.00,
      });
      expect(result.conversionValue).toBe(1500.00);
    });

    it('should reject negative conversion value', () => {
      expect(() =>
        recordConversionInputSchema.parse({
          experimentId: 'clr4abc123def456ghi789',
          leadId: 'clr4xyz789uvw012rst345',
          conversionValue: -100,
        })
      ).toThrow();
    });
  });

  // ===========================================================================
  // Experiment Result Schema Tests
  // ===========================================================================

  describe('experimentResultSchema', () => {
    const validResult = {
      id: 'clr4abc123def456ghi789',
      experimentId: 'clr4xyz789uvw012rst345',
      controlSampleSize: 100,
      treatmentSampleSize: 100,
      controlMean: 70.5,
      treatmentMean: 75.2,
      controlStdDev: 12.3,
      treatmentStdDev: 11.8,
      tStatistic: 2.85,
      pValue: 0.0045,
      confidenceInterval: { lower: 1.5, upper: 7.9 },
      effectSize: 0.39,
      controlConversionRate: null,
      treatmentConversionRate: null,
      chiSquareStatistic: null,
      chiSquarePValue: null,
      isSignificant: true,
      winner: 'treatment',
      recommendation: 'Adopt treatment approach',
      analyzedAt: new Date(),
    };

    it('should accept valid result', () => {
      const result = experimentResultSchema.parse(validResult);
      expect(result.isSignificant).toBe(true);
      expect(result.winner).toBe('treatment');
    });

    it('should accept null winner', () => {
      const result = experimentResultSchema.parse({
        ...validResult,
        winner: null,
        isSignificant: false,
      });
      expect(result.winner).toBeNull();
    });

    it('should reject invalid pValue', () => {
      expect(() =>
        experimentResultSchema.parse({ ...validResult, pValue: 1.5 })
      ).toThrow();
    });
  });

  // ===========================================================================
  // Utility Function Tests
  // ===========================================================================

  describe('interpretEffectSize', () => {
    it('should interpret negligible effect', () => {
      expect(interpretEffectSize(0.1)).toBe('NEGLIGIBLE');
      expect(interpretEffectSize(0.19)).toBe('NEGLIGIBLE');
    });

    it('should interpret small effect', () => {
      expect(interpretEffectSize(0.2)).toBe('SMALL');
      expect(interpretEffectSize(0.49)).toBe('SMALL');
    });

    it('should interpret medium effect', () => {
      expect(interpretEffectSize(0.5)).toBe('MEDIUM');
      expect(interpretEffectSize(0.79)).toBe('MEDIUM');
    });

    it('should interpret large effect', () => {
      expect(interpretEffectSize(0.8)).toBe('LARGE');
      expect(interpretEffectSize(1.5)).toBe('LARGE');
    });

    it('should handle negative values', () => {
      expect(interpretEffectSize(-0.6)).toBe('MEDIUM');
    });
  });

  describe('calculateRequiredSampleSize', () => {
    it('should calculate sample size for small effect', () => {
      const n = calculateRequiredSampleSize(0.2);
      expect(n).toBeGreaterThan(300);
      expect(n).toBeLessThan(500);
    });

    it('should calculate sample size for medium effect', () => {
      const n = calculateRequiredSampleSize(0.5);
      expect(n).toBeGreaterThan(50);
      expect(n).toBeLessThan(100);
    });

    it('should calculate sample size for large effect', () => {
      const n = calculateRequiredSampleSize(0.8);
      expect(n).toBeGreaterThan(20);
      expect(n).toBeLessThan(50);
    });
  });

  describe('hasSufficientSamples', () => {
    it('should return true when both groups meet minimum', () => {
      expect(hasSufficientSamples(30, 30)).toBe(true);
      expect(hasSufficientSamples(100, 100)).toBe(true);
    });

    it('should return false when either group is below minimum', () => {
      expect(hasSufficientSamples(29, 30)).toBe(false);
      expect(hasSufficientSamples(30, 29)).toBe(false);
      expect(hasSufficientSamples(10, 10)).toBe(false);
    });

    it('should respect custom minimum', () => {
      expect(hasSufficientSamples(50, 50, 100)).toBe(false);
      expect(hasSufficientSamples(100, 100, 100)).toBe(true);
    });
  });

  describe('formatPValue', () => {
    it('should format very small p-values', () => {
      expect(formatPValue(0.0001)).toBe('< 0.001');
      expect(formatPValue(0.0009)).toBe('< 0.001');
    });

    it('should format small p-values', () => {
      expect(formatPValue(0.005)).toBe('< 0.01');
      expect(formatPValue(0.009)).toBe('< 0.01');
    });

    it('should format regular p-values', () => {
      expect(formatPValue(0.023)).toBe('0.023');
      expect(formatPValue(0.1)).toBe('0.100');
    });
  });

  describe('getSignificanceDescription', () => {
    it('should describe highly significant results', () => {
      expect(getSignificanceDescription(0.0001, 0.05)).toBe(
        'Highly significant (p < 0.001)'
      );
    });

    it('should describe very significant results', () => {
      expect(getSignificanceDescription(0.005, 0.05)).toBe(
        'Very significant (p < 0.01)'
      );
    });

    it('should describe significant results', () => {
      expect(getSignificanceDescription(0.03, 0.05)).toBe(
        'Significant (p < 0.05)'
      );
    });

    it('should describe non-significant results', () => {
      expect(getSignificanceDescription(0.1, 0.05)).toBe('Not significant');
    });
  });
});
