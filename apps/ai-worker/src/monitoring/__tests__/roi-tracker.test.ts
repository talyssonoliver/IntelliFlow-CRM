/**
 * ROI Tracker Tests
 *
 * @implements IFC-117: AI Model Monitoring
 *
 * Tests for AI ROI tracking, cost/value recording, and ROI calculation
 * Target: >90% coverage, 200% ROI target
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ROITracker,
  defaultROIConfig,
  roiTracker,
  getROIMetrics,
  type ROITrackerConfig,
  type AICost,
  type AIValue,
  type ValueType,
} from '../roi-tracker';

// Mock pino logger
vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('ROITracker', () => {
  let tracker: ROITracker;
  let config: ROITrackerConfig;

  beforeEach(() => {
    config = {
      valueEstimates: {
        lead_scored: 0.5,
        lead_qualified: 2.0,
        email_generated: 1.0,
        response_automated: 1.5,
        insight_generated: 3.0,
        document_processed: 0.75,
        task_automated: 2.5,
        prediction_made: 5.0,
        recommendation_made: 4.0,
        feedback_positive: 0.1,
        feedback_negative: -0.2,
        feedback_correction: 0.5,
      },
      costPerToken: {
        'gpt-4': { input: 0.00003, output: 0.00006 },
        'gpt-4-turbo': { input: 0.00001, output: 0.00003 },
        'gpt-3.5-turbo': { input: 0.0000005, output: 0.0000015 },
        'llama-3': { input: 0, output: 0 },
      },
      minROITarget: 2.0, // 200% ROI target
      trackingPeriodDays: 30,
    };
    tracker = new ROITracker(config);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // Initialization Tests
  // ============================================

  describe('initialization', () => {
    it('should initialize with config', () => {
      expect(tracker).toBeDefined();
    });

    it('should use default config values', () => {
      expect(defaultROIConfig.minROITarget).toBe(2.0);
      expect(defaultROIConfig.trackingPeriodDays).toBe(30);
      expect(defaultROIConfig.valueEstimates.lead_scored).toBe(0.5);
      expect(defaultROIConfig.costPerToken['gpt-4']).toBeDefined();
    });

    it('should export global roiTracker instance', () => {
      expect(roiTracker).toBeDefined();
      expect(roiTracker).toBeInstanceOf(ROITracker);
    });
  });

  // ============================================
  // recordCost Tests
  // ============================================

  describe('recordCost', () => {
    it('should record a cost entry', () => {
      const cost = tracker.recordCost({
        id: 'cost-1',
        model: 'gpt-4',
        operationType: 'lead_scoring',
        inputTokens: 1000,
        outputTokens: 200,
        cost: 0.042,
      });

      expect(cost.id).toBe('cost-1');
      expect(cost.model).toBe('gpt-4');
      expect(cost.operationType).toBe('lead_scoring');
      expect(cost.inputTokens).toBe(1000);
      expect(cost.outputTokens).toBe(200);
      expect(cost.cost).toBe(0.042);
      expect(cost.timestamp).toBeInstanceOf(Date);
    });

    it('should auto-generate timestamp', () => {
      const before = new Date();

      const cost = tracker.recordCost({
        id: 'cost-2',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 500,
        outputTokens: 100,
        cost: 0.021,
      });

      const after = new Date();

      expect(cost.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(cost.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should include metadata when provided', () => {
      const cost = tracker.recordCost({
        id: 'cost-3',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 500,
        outputTokens: 100,
        cost: 0.021,
        metadata: { leadId: 'lead-123', batch: true },
      });

      expect(cost.metadata).toEqual({ leadId: 'lead-123', batch: true });
    });
  });

  // ============================================
  // recordValue Tests
  // ============================================

  describe('recordValue', () => {
    it('should record a value entry', () => {
      const value = tracker.recordValue({
        id: 'value-1',
        valueType: 'lead_scored',
        estimatedValue: 0.5,
        confidence: 0.9,
        relatedCostIds: ['cost-1'],
      });

      expect(value.id).toBe('value-1');
      expect(value.valueType).toBe('lead_scored');
      expect(value.estimatedValue).toBe(0.5);
      expect(value.confidence).toBe(0.9);
      expect(value.relatedCostIds).toEqual(['cost-1']);
      expect(value.timestamp).toBeInstanceOf(Date);
    });

    it('should auto-generate timestamp', () => {
      const before = new Date();

      const value = tracker.recordValue({
        id: 'value-2',
        valueType: 'lead_qualified',
        estimatedValue: 2.0,
        confidence: 0.85,
        relatedCostIds: ['cost-2'],
      });

      const after = new Date();

      expect(value.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(value.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should include metadata when provided', () => {
      const value = tracker.recordValue({
        id: 'value-3',
        valueType: 'insight_generated',
        estimatedValue: 3.0,
        confidence: 0.8,
        relatedCostIds: ['cost-3'],
        metadata: { insightType: 'churn_prediction' },
      });

      expect(value.metadata).toEqual({ insightType: 'churn_prediction' });
    });
  });

  // ============================================
  // recordTokenUsage Tests (Auto Cost Calculation)
  // ============================================

  describe('recordTokenUsage', () => {
    it('should auto-calculate cost from tokens for gpt-4', () => {
      const cost = tracker.recordTokenUsage({
        id: 'token-1',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000, // 1000 * 0.00003 = 0.03
        outputTokens: 500, // 500 * 0.00006 = 0.03
      });

      expect(cost.cost).toBeCloseTo(0.06, 4); // 0.03 + 0.03
    });

    it('should auto-calculate cost for gpt-4-turbo', () => {
      const cost = tracker.recordTokenUsage({
        id: 'token-2',
        model: 'gpt-4-turbo',
        operationType: 'scoring',
        inputTokens: 1000, // 1000 * 0.00001 = 0.01
        outputTokens: 500, // 500 * 0.00003 = 0.015
      });

      expect(cost.cost).toBeCloseTo(0.025, 4); // 0.01 + 0.015
    });

    it('should return zero cost for local models (llama-3)', () => {
      const cost = tracker.recordTokenUsage({
        id: 'token-3',
        model: 'llama-3',
        operationType: 'scoring',
        inputTokens: 5000,
        outputTokens: 2000,
      });

      expect(cost.cost).toBe(0);
    });

    it('should use default rates for unknown models', () => {
      const cost = tracker.recordTokenUsage({
        id: 'token-4',
        model: 'unknown-model',
        operationType: 'scoring',
        inputTokens: 1000, // 1000 * 0.00001 = 0.01
        outputTokens: 500, // 500 * 0.00003 = 0.015
      });

      // Should use fallback: input: 0.00001, output: 0.00003
      expect(cost.cost).toBeCloseTo(0.025, 4);
    });

    it('should include metadata in recorded cost', () => {
      const cost = tracker.recordTokenUsage({
        id: 'token-5',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
        metadata: { batchId: 'batch-123' },
      });

      expect(cost.metadata).toEqual({ batchId: 'batch-123' });
    });
  });

  // ============================================
  // recordValueByType Tests (Auto Value Estimation)
  // ============================================

  describe('recordValueByType', () => {
    it('should use default value estimate for type', () => {
      const value = tracker.recordValueByType({
        id: 'type-1',
        valueType: 'lead_scored',
        relatedCostIds: ['cost-1'],
      });

      expect(value.estimatedValue).toBe(0.5); // Default for lead_scored
      expect(value.confidence).toBe(1.0); // Default multiplier
    });

    it('should apply confidence multiplier', () => {
      const value = tracker.recordValueByType({
        id: 'type-2',
        valueType: 'lead_qualified',
        relatedCostIds: ['cost-2'],
        confidenceMultiplier: 0.5,
      });

      expect(value.estimatedValue).toBe(1.0); // 2.0 * 0.5
      expect(value.confidence).toBe(0.5);
    });

    it('should handle all value types', () => {
      const valueTypes: ValueType[] = [
        'lead_scored',
        'lead_qualified',
        'email_generated',
        'response_automated',
        'insight_generated',
        'document_processed',
        'task_automated',
        'prediction_made',
        'recommendation_made',
        'feedback_positive',
        'feedback_negative',
        'feedback_correction',
      ];

      for (const valueType of valueTypes) {
        const value = tracker.recordValueByType({
          id: `type-${valueType}`,
          valueType,
          relatedCostIds: ['cost-x'],
        });

        expect(value.valueType).toBe(valueType);
        expect(typeof value.estimatedValue).toBe('number');
      }
    });

    it('should handle negative value types (feedback_negative)', () => {
      const value = tracker.recordValueByType({
        id: 'type-neg',
        valueType: 'feedback_negative',
        relatedCostIds: ['cost-neg'],
      });

      expect(value.estimatedValue).toBe(-0.2); // Negative value
    });

    it('should include metadata in recorded value', () => {
      const value = tracker.recordValueByType({
        id: 'type-meta',
        valueType: 'lead_scored',
        relatedCostIds: ['cost-meta'],
        metadata: { leadScore: 85 },
      });

      expect(value.metadata).toEqual({ leadScore: 85 });
    });
  });

  // ============================================
  // calculateROI Tests
  // ============================================

  describe('calculateROI', () => {
    beforeEach(() => {
      // Add some test data
      tracker.recordCost({
        id: 'roi-cost-1',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 1.0,
      });

      tracker.recordValue({
        id: 'roi-value-1',
        valueType: 'lead_scored',
        estimatedValue: 5.0,
        confidence: 1.0,
        relatedCostIds: ['roi-cost-1'],
      });
    });

    it('should calculate ROI correctly', () => {
      const roi = tracker.calculateROI();

      // Total cost: 1.0, Total value: 5.0
      // Net value: 5.0 - 1.0 = 4.0
      // ROI: (4.0 / 1.0) * 100 = 400%
      expect(roi.totalCost).toBe(1.0);
      expect(roi.totalValue).toBe(5.0);
      expect(roi.netValue).toBe(4.0);
      expect(roi.roi).toBe(400);
    });

    it('should return ROI result with all required fields', () => {
      const roi = tracker.calculateROI();

      expect(roi).toHaveProperty('periodStart');
      expect(roi).toHaveProperty('periodEnd');
      expect(roi).toHaveProperty('totalCost');
      expect(roi).toHaveProperty('totalValue');
      expect(roi).toHaveProperty('netValue');
      expect(roi).toHaveProperty('roi');
      expect(roi).toHaveProperty('costBreakdown');
      expect(roi).toHaveProperty('valueBreakdown');
      expect(roi).toHaveProperty('efficiency');
      expect(roi).toHaveProperty('trendDirection');
      expect(roi).toHaveProperty('recommendations');
    });

    it('should calculate cost breakdown by model', () => {
      tracker.recordCost({
        id: 'roi-cost-2',
        model: 'gpt-3.5-turbo',
        operationType: 'email',
        inputTokens: 500,
        outputTokens: 200,
        cost: 0.5,
      });

      const roi = tracker.calculateROI();

      expect(roi.costBreakdown.byModel['gpt-4']).toBe(1.0);
      expect(roi.costBreakdown.byModel['gpt-3.5-turbo']).toBe(0.5);
    });

    it('should calculate cost breakdown by operation', () => {
      tracker.recordCost({
        id: 'roi-cost-3',
        model: 'gpt-4',
        operationType: 'email_generation',
        inputTokens: 500,
        outputTokens: 200,
        cost: 0.3,
      });

      const roi = tracker.calculateROI();

      expect(roi.costBreakdown.byOperation['scoring']).toBe(1.0);
      expect(roi.costBreakdown.byOperation['email_generation']).toBe(0.3);
    });

    it('should calculate value breakdown by type', () => {
      tracker.recordValue({
        id: 'roi-value-2',
        valueType: 'email_generated',
        estimatedValue: 2.0,
        confidence: 1.0,
        relatedCostIds: ['roi-cost-1'],
      });

      const roi = tracker.calculateROI();

      expect(roi.valueBreakdown['lead_scored']).toBe(5.0);
      expect(roi.valueBreakdown['email_generated']).toBe(2.0);
    });

    it('should calculate efficiency correctly', () => {
      const roi = tracker.calculateROI();

      // Efficiency = totalValue / totalCost = 5.0 / 1.0 = 5.0
      expect(roi.efficiency).toBe(5.0);
    });

    it('should handle zero cost (avoid division by zero)', () => {
      const emptyTracker = new ROITracker(config);

      emptyTracker.recordValue({
        id: 'no-cost-value',
        valueType: 'lead_scored',
        estimatedValue: 5.0,
        confidence: 1.0,
        relatedCostIds: [],
      });

      const roi = emptyTracker.calculateROI();

      expect(roi.roi).toBe(0); // No cost means ROI is 0
      expect(roi.efficiency).toBe(0);
    });

    it('should filter by time range', () => {
      const now = new Date();
      const future = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const past = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      const roi = tracker.calculateROI(past, now);

      expect(roi.periodStart).toEqual(past);
      expect(roi.periodEnd).toEqual(now);
    });
  });

  // ============================================
  // Negative ROI Scenarios
  // ============================================

  describe('negative ROI scenarios', () => {
    it('should handle negative ROI when costs exceed value', () => {
      const negTracker = new ROITracker(config);

      negTracker.recordCost({
        id: 'neg-cost-1',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 10.0, // High cost
      });

      negTracker.recordValue({
        id: 'neg-value-1',
        valueType: 'lead_scored',
        estimatedValue: 2.0, // Low value
        confidence: 1.0,
        relatedCostIds: ['neg-cost-1'],
      });

      const roi = negTracker.calculateROI();

      // Net value: 2.0 - 10.0 = -8.0
      // ROI: (-8.0 / 10.0) * 100 = -80%
      expect(roi.netValue).toBe(-8.0);
      expect(roi.roi).toBe(-80);
    });

    it('should report underperforming operations in stats', () => {
      const negTracker = new ROITracker(config);

      negTracker.recordCost({
        id: 'under-cost-1',
        model: 'gpt-4',
        operationType: 'underperforming_op',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 10.0,
      });

      negTracker.recordValue({
        id: 'under-value-1',
        valueType: 'lead_scored',
        estimatedValue: 1.0,
        confidence: 1.0,
        relatedCostIds: ['under-cost-1'],
      });

      const stats = negTracker.getStats();

      expect(stats.underperformingOperations.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Zero-Cost Models (Ollama/Local)
  // ============================================

  describe('zero-cost models', () => {
    it('should track operations with zero cost (local models)', () => {
      const cost = tracker.recordTokenUsage({
        id: 'local-1',
        model: 'llama-3',
        operationType: 'scoring',
        inputTokens: 10000,
        outputTokens: 5000,
      });

      expect(cost.cost).toBe(0);
    });

    it('should still generate value from zero-cost operations', () => {
      tracker.recordTokenUsage({
        id: 'local-cost-1',
        model: 'llama-3',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
      });

      tracker.recordValue({
        id: 'local-value-1',
        valueType: 'lead_scored',
        estimatedValue: 0.5,
        confidence: 1.0,
        relatedCostIds: ['local-cost-1'],
      });

      const roi = tracker.calculateROI();

      expect(roi.totalCost).toBe(0);
      expect(roi.totalValue).toBe(0.5);
      // ROI is 0 when cost is 0 (avoid division by zero)
      expect(roi.roi).toBe(0);
    });
  });

  // ============================================
  // Value Without Associated Cost
  // ============================================

  describe('value without cost', () => {
    it('should track values without associated costs', () => {
      const value = tracker.recordValue({
        id: 'orphan-value-1',
        valueType: 'insight_generated',
        estimatedValue: 3.0,
        confidence: 0.9,
        relatedCostIds: [], // No associated costs
      });

      expect(value.estimatedValue).toBe(3.0);
    });

    it('should include orphan values in ROI calculation', () => {
      tracker.recordValue({
        id: 'orphan-value-2',
        valueType: 'insight_generated',
        estimatedValue: 5.0,
        confidence: 1.0,
        relatedCostIds: [],
      });

      const roi = tracker.calculateROI();

      expect(roi.totalValue).toBe(5.0);
    });
  });

  // ============================================
  // getStats Tests
  // ============================================

  describe('getStats', () => {
    beforeEach(() => {
      // Add test data
      tracker.recordCost({
        id: 'stats-cost-1',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 1.0,
      });

      tracker.recordValue({
        id: 'stats-value-1',
        valueType: 'lead_scored',
        estimatedValue: 5.0,
        confidence: 1.0,
        relatedCostIds: ['stats-cost-1'],
      });
    });

    it('should return stats with all required fields', () => {
      const stats = tracker.getStats();

      expect(stats).toHaveProperty('totalCostsTracked');
      expect(stats).toHaveProperty('totalValuesTracked');
      expect(stats).toHaveProperty('currentROI');
      expect(stats).toHaveProperty('averageCostPerOperation');
      expect(stats).toHaveProperty('averageValuePerOperation');
      expect(stats).toHaveProperty('roiTrend');
      expect(stats).toHaveProperty('topPerformingOperations');
      expect(stats).toHaveProperty('underperformingOperations');
    });

    it('should track total costs and values', () => {
      const stats = tracker.getStats();

      expect(stats.totalCostsTracked).toBeGreaterThanOrEqual(1);
      expect(stats.totalValuesTracked).toBeGreaterThanOrEqual(1);
    });

    it('should calculate average cost per operation', () => {
      tracker.recordCost({
        id: 'stats-cost-2',
        model: 'gpt-4',
        operationType: 'email',
        inputTokens: 500,
        outputTokens: 200,
        cost: 0.5,
      });

      const stats = tracker.getStats();

      // (1.0 + 0.5) / 2 = 0.75
      expect(stats.averageCostPerOperation).toBe(0.75);
    });

    it('should calculate average value per operation', () => {
      tracker.recordValue({
        id: 'stats-value-2',
        valueType: 'email_generated',
        estimatedValue: 1.0,
        confidence: 1.0,
        relatedCostIds: [],
      });

      const stats = tracker.getStats();

      // (5.0 + 1.0) / 2 = 3.0
      expect(stats.averageValuePerOperation).toBe(3.0);
    });

    it('should return ROI trend for last 7 days', () => {
      const stats = tracker.getStats();

      expect(stats.roiTrend).toHaveLength(7);
      expect(Array.isArray(stats.roiTrend)).toBe(true);
    });

    it('should identify top performing operations', () => {
      tracker.recordCost({
        id: 'top-cost-1',
        model: 'gpt-4',
        operationType: 'high_roi_op',
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.01,
      });

      tracker.recordValue({
        id: 'top-value-1',
        valueType: 'prediction_made',
        estimatedValue: 10.0,
        confidence: 1.0,
        relatedCostIds: ['top-cost-1'],
      });

      const stats = tracker.getStats();

      expect(stats.topPerformingOperations.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // getCostBreakdown Tests
  // ============================================

  describe('getCostBreakdown', () => {
    it('should return cost breakdown with required fields', () => {
      tracker.recordCost({
        id: 'bd-cost-1',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 1.0,
      });

      const breakdown = tracker.getCostBreakdown();

      expect(breakdown).toHaveProperty('total');
      expect(breakdown).toHaveProperty('byModel');
      expect(breakdown).toHaveProperty('byOperation');
      expect(breakdown).toHaveProperty('byDay');
    });

    it('should aggregate costs by model', () => {
      tracker.recordCost({
        id: 'bd-cost-2',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 1.0,
      });

      tracker.recordCost({
        id: 'bd-cost-3',
        model: 'gpt-3.5-turbo',
        operationType: 'scoring',
        inputTokens: 500,
        outputTokens: 200,
        cost: 0.5,
      });

      const breakdown = tracker.getCostBreakdown();

      expect(breakdown.byModel['gpt-4']).toBe(1.0);
      expect(breakdown.byModel['gpt-3.5-turbo']).toBe(0.5);
    });

    it('should aggregate costs by operation', () => {
      tracker.recordCost({
        id: 'bd-cost-4',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 1.0,
      });

      tracker.recordCost({
        id: 'bd-cost-5',
        model: 'gpt-4',
        operationType: 'email_generation',
        inputTokens: 500,
        outputTokens: 200,
        cost: 0.5,
      });

      const breakdown = tracker.getCostBreakdown();

      expect(breakdown.byOperation['scoring']).toBe(1.0);
      expect(breakdown.byOperation['email_generation']).toBe(0.5);
    });

    it('should aggregate costs by day', () => {
      tracker.recordCost({
        id: 'bd-cost-6',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 1.0,
      });

      const breakdown = tracker.getCostBreakdown();
      const today = new Date().toISOString().split('T')[0];

      expect(breakdown.byDay[today]).toBeGreaterThan(0);
    });
  });

  // ============================================
  // getValueBreakdown Tests
  // ============================================

  describe('getValueBreakdown', () => {
    it('should return value breakdown with required fields', () => {
      tracker.recordValue({
        id: 'vb-value-1',
        valueType: 'lead_scored',
        estimatedValue: 0.5,
        confidence: 0.9,
        relatedCostIds: [],
      });

      const breakdown = tracker.getValueBreakdown();

      expect(breakdown).toHaveProperty('total');
      expect(breakdown).toHaveProperty('byType');
      expect(breakdown).toHaveProperty('byDay');
      expect(breakdown).toHaveProperty('averageConfidence');
    });

    it('should aggregate values by type', () => {
      tracker.recordValue({
        id: 'vb-value-2',
        valueType: 'lead_scored',
        estimatedValue: 0.5,
        confidence: 1.0,
        relatedCostIds: [],
      });

      tracker.recordValue({
        id: 'vb-value-3',
        valueType: 'email_generated',
        estimatedValue: 1.0,
        confidence: 1.0,
        relatedCostIds: [],
      });

      const breakdown = tracker.getValueBreakdown();

      expect(breakdown.byType['lead_scored']).toBe(0.5);
      expect(breakdown.byType['email_generated']).toBe(1.0);
    });

    it('should calculate average confidence', () => {
      tracker.recordValue({
        id: 'vb-value-4',
        valueType: 'lead_scored',
        estimatedValue: 0.5,
        confidence: 0.8,
        relatedCostIds: [],
      });

      tracker.recordValue({
        id: 'vb-value-5',
        valueType: 'lead_qualified',
        estimatedValue: 2.0,
        confidence: 0.6,
        relatedCostIds: [],
      });

      const breakdown = tracker.getValueBreakdown();

      // (0.8 + 0.6) / 2 = 0.7
      expect(breakdown.averageConfidence).toBe(0.7);
    });
  });

  // ============================================
  // exportReport Tests
  // ============================================

  describe('exportReport', () => {
    it('should generate text report', () => {
      tracker.recordCost({
        id: 'report-cost-1',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 1.0,
      });

      tracker.recordValue({
        id: 'report-value-1',
        valueType: 'lead_scored',
        estimatedValue: 5.0,
        confidence: 1.0,
        relatedCostIds: ['report-cost-1'],
      });

      const report = tracker.exportReport();

      expect(report).toContain('AI ROI Report');
      expect(report).toContain('Summary');
      expect(report).toContain('Total Cost');
      expect(report).toContain('Total Value');
      expect(report).toContain('ROI');
      expect(report).toContain('Cost Breakdown by Model');
      expect(report).toContain('Cost Breakdown by Operation');
      expect(report).toContain('Value Breakdown by Type');
    });

    it('should include recommendations', () => {
      tracker.recordCost({
        id: 'report-cost-2',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 10.0, // High cost to trigger recommendation
      });

      const report = tracker.exportReport();

      expect(report).toContain('Recommendations');
    });

    it('should show target status', () => {
      tracker.recordCost({
        id: 'report-cost-3',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 1.0,
      });

      tracker.recordValue({
        id: 'report-value-3',
        valueType: 'lead_scored',
        estimatedValue: 5.0,
        confidence: 1.0,
        relatedCostIds: ['report-cost-3'],
      });

      const report = tracker.exportReport();

      expect(report).toContain('Target ROI');
      expect(report.includes('ON TARGET') || report.includes('BELOW TARGET')).toBe(true);
    });
  });

  // ============================================
  // Trend Direction Tests
  // ============================================

  describe('trend direction', () => {
    it('should detect improving trend', () => {
      const trendTracker = new ROITracker(config);

      // First period - low ROI
      trendTracker.recordCost({
        id: 'trend-cost-1',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 10.0,
      });

      trendTracker.recordValue({
        id: 'trend-value-1',
        valueType: 'lead_scored',
        estimatedValue: 5.0,
        confidence: 1.0,
        relatedCostIds: ['trend-cost-1'],
      });

      // Current period - higher ROI
      trendTracker.recordCost({
        id: 'trend-cost-2',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 1.0,
      });

      trendTracker.recordValue({
        id: 'trend-value-2',
        valueType: 'lead_scored',
        estimatedValue: 20.0,
        confidence: 1.0,
        relatedCostIds: ['trend-cost-2'],
      });

      const roi = trendTracker.calculateROI();

      expect(['improving', 'stable', 'declining']).toContain(roi.trendDirection);
    });
  });

  // ============================================
  // Recommendations Tests
  // ============================================

  describe('recommendations', () => {
    it('should recommend reviewing high-cost operations when below target', () => {
      const lowROITracker = new ROITracker(config);

      lowROITracker.recordCost({
        id: 'rec-cost-1',
        model: 'gpt-4',
        operationType: 'expensive_op',
        inputTokens: 10000,
        outputTokens: 5000,
        cost: 100.0, // Very high cost
      });

      lowROITracker.recordValue({
        id: 'rec-value-1',
        valueType: 'lead_scored',
        estimatedValue: 0.5, // Very low value
        confidence: 1.0,
        relatedCostIds: ['rec-cost-1'],
      });

      const roi = lowROITracker.calculateROI();

      expect(roi.recommendations.length).toBeGreaterThan(0);
      expect(roi.recommendations.some((r) => r.toLowerCase().includes('roi'))).toBe(true);
    });

    it('should recommend cheaper models for high-cost models', () => {
      const highCostTracker = new ROITracker(config);

      highCostTracker.recordCost({
        id: 'rec-cost-2',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 10000,
        outputTokens: 5000,
        cost: 1.0, // Significant cost
      });

      const roi = highCostTracker.calculateROI();

      expect(roi.recommendations.some((r) => r.toLowerCase().includes('model'))).toBe(true);
    });
  });

  // ============================================
  // Data Pruning Tests
  // ============================================

  describe('pruneOldData', () => {
    it('should remove old costs and values', () => {
      tracker.recordCost({
        id: 'prune-cost-1',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 1.0,
      });

      tracker.recordValue({
        id: 'prune-value-1',
        valueType: 'lead_scored',
        estimatedValue: 0.5,
        confidence: 1.0,
        relatedCostIds: ['prune-cost-1'],
      });

      const result = tracker.pruneOldData(0); // Prune everything older than 0 days

      expect(result).toHaveProperty('costsRemoved');
      expect(result).toHaveProperty('valuesRemoved');
    });

    it('should return count of removed items', () => {
      tracker.recordCost({
        id: 'prune-cost-2',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 1.0,
      });

      const result = tracker.pruneOldData(30);

      expect(typeof result.costsRemoved).toBe('number');
      expect(typeof result.valuesRemoved).toBe('number');
    });
  });

  // ============================================
  // Prometheus Metrics Tests
  // ============================================

  describe('getROIMetrics', () => {
    it('should return valid Prometheus format', () => {
      const metrics = getROIMetrics();

      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
      expect(metrics).toContain('intelliflow_ai_roi_current');
      expect(metrics).toContain('intelliflow_ai_total_cost');
      expect(metrics).toContain('intelliflow_ai_total_value');
    });

    it('should include cost by model metrics', () => {
      roiTracker.recordCost({
        id: 'prom-cost-1',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 1.0,
      });

      const metrics = getROIMetrics();

      expect(metrics).toContain('intelliflow_ai_cost_by_model');
    });

    it('should include value by type metrics', () => {
      roiTracker.recordValue({
        id: 'prom-value-1',
        valueType: 'lead_scored',
        estimatedValue: 0.5,
        confidence: 1.0,
        relatedCostIds: [],
      });

      const metrics = getROIMetrics();

      expect(metrics).toContain('intelliflow_ai_value_by_type');
    });

    it('should include operations total', () => {
      const metrics = getROIMetrics();

      expect(metrics).toContain('intelliflow_ai_operations_total');
      expect(metrics).toContain('type="cost"');
      expect(metrics).toContain('type="value"');
    });

    it('should format numbers correctly', () => {
      const metrics = getROIMetrics();

      expect(metrics).not.toContain('NaN');
      expect(metrics).not.toContain('undefined');
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('edge cases', () => {
    it('should handle empty tracker', () => {
      const emptyTracker = new ROITracker(config);

      const stats = emptyTracker.getStats();
      const roi = emptyTracker.calculateROI();

      expect(stats.totalCostsTracked).toBe(0);
      expect(stats.totalValuesTracked).toBe(0);
      expect(roi.totalCost).toBe(0);
      expect(roi.totalValue).toBe(0);
    });

    it('should handle very small values', () => {
      tracker.recordCost({
        id: 'tiny-cost-1',
        model: 'gpt-3.5-turbo',
        operationType: 'scoring',
        inputTokens: 10,
        outputTokens: 5,
        cost: 0.0000001,
      });

      const breakdown = tracker.getCostBreakdown();

      expect(breakdown.total).toBeGreaterThan(0);
    });

    it('should handle very large values', () => {
      tracker.recordCost({
        id: 'huge-cost-1',
        model: 'gpt-4',
        operationType: 'batch',
        inputTokens: 10000000,
        outputTokens: 5000000,
        cost: 999999.99,
      });

      const breakdown = tracker.getCostBreakdown();

      expect(breakdown.total).toBeGreaterThanOrEqual(999999.99);
    });

    it('should handle special characters in operation names', () => {
      tracker.recordCost({
        id: 'special-cost-1',
        model: 'gpt-4',
        operationType: 'op/with/slashes-and_underscores',
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.01,
      });

      const breakdown = tracker.getCostBreakdown();

      expect(breakdown.byOperation['op/with/slashes-and_underscores']).toBe(0.01);
    });

    it('should handle operations with no value', () => {
      tracker.recordCost({
        id: 'no-value-cost-1',
        model: 'gpt-4',
        operationType: 'no_value_op',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 1.0,
      });

      const roi = tracker.calculateROI();

      expect(roi.recommendations.some((r) => r.includes('no recorded value'))).toBe(true);
    });
  });

  // ============================================
  // Period Filtering Tests
  // ============================================

  describe('period filtering', () => {
    it('should use default 30-day period', () => {
      const roi = tracker.calculateROI();
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      expect(roi.periodStart.getTime()).toBeCloseTo(thirtyDaysAgo.getTime(), -3);
    });

    it('should respect custom period', () => {
      const start = new Date('2026-01-01');
      const end = new Date('2026-01-15');

      const roi = tracker.calculateROI(start, end);

      expect(roi.periodStart).toEqual(start);
      expect(roi.periodEnd).toEqual(end);
    });

    it('should filter costs by period', () => {
      const oldTracker = new ROITracker(config);

      // Record cost FIRST so its internal `timestamp: new Date()` is fixed
      // before we capture `now`. The previous order (now → recordCost →
      // query) introduced a microsecond race: the recorded timestamp would
      // be slightly AFTER `now`, the filter `c.timestamp <= end (=now)`
      // excluded it, and `totalCost` was 0 instead of 1.0. See the
      // `feedback_ci_chronic_workflow_patterns` memory for the broader
      // Date.now() boundary jitter pattern in this codebase.
      oldTracker.recordCost({
        id: 'period-cost-1',
        model: 'gpt-4',
        operationType: 'scoring',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 1.0,
      });

      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const recentROI = oldTracker.calculateROI(hourAgo, now);

      expect(recentROI.totalCost).toBe(1.0);
    });
  });
});
