/**
 * Churn Risk Chain Tests (IFC-095)
 *
 * Tests for the churn risk prediction chain ensuring:
 * - Proper risk score calculation (0-1)
 * - Risk level categorization
 * - Latency requirements (<2s)
 * - Confidence scoring
 * - Fallback behavior on errors
 *
 * @module chains/churn-risk.chain.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ChurnRiskChain,
  getChurnRiskChain,
  CHURN_RISK_LEVELS,
  RISK_LEVEL_CONFIG,
  type ChurnRiskInput,
  type ChurnRiskResult,
} from './churn-risk.chain';

// Mock the AI config
vi.mock('../config/ai.config', () => ({
  aiConfig: {
    provider: 'mock',
    openai: {
      apiKey: 'test-key',
      model: 'gpt-4-turbo-preview',
      temperature: 0.3,
      maxTokens: 1500,
      timeout: 30000,
    },
    ollama: {
      baseUrl: 'http://localhost:11434',
      model: 'mistral',
      temperature: 0.3,
      timeout: 60000,
    },
    costTracking: {
      enabled: false,
      warningThreshold: 10,
    },
    performance: {
      cacheEnabled: false,
      cacheTTL: 3600,
      rateLimitPerMinute: 60,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    features: {
      enableChainLogging: false,
      enableConfidenceScores: true,
      enableStructuredOutputs: true,
      enableMultiAgentWorkflows: false,
    },
  },
}));

// Mock cost tracker
vi.mock('../utils/cost-tracker', () => ({
  costTracker: {
    recordUsage: vi.fn(),
  },
}));

describe('ChurnRiskChain', () => {
  let chain: ChurnRiskChain;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the singleton
    vi.resetModules();
    chain = new ChurnRiskChain();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Risk Level Configuration', () => {
    it('should have correct risk level thresholds', () => {
      // Using uppercase domain constants (IFC-095)
      expect(RISK_LEVEL_CONFIG.CRITICAL.threshold).toBe(0.8);
      expect(RISK_LEVEL_CONFIG.HIGH.threshold).toBe(0.6);
      expect(RISK_LEVEL_CONFIG.MEDIUM.threshold).toBe(0.4);
      expect(RISK_LEVEL_CONFIG.LOW.threshold).toBe(0.2);
      expect(RISK_LEVEL_CONFIG.MINIMAL.threshold).toBe(0.0);
    });

    it('should have SLA hours for each risk level', () => {
      expect(RISK_LEVEL_CONFIG.CRITICAL.slaHours).toBe(24);
      expect(RISK_LEVEL_CONFIG.HIGH.slaHours).toBe(48);
      expect(RISK_LEVEL_CONFIG.MEDIUM.slaHours).toBe(168); // 7 days
      expect(RISK_LEVEL_CONFIG.LOW.slaHours).toBe(336); // 14 days
      expect(RISK_LEVEL_CONFIG.MINIMAL.slaHours).toBe(720); // 30 days
    });

    it('should export all risk levels', () => {
      // Using uppercase domain constants (IFC-095)
      expect(CHURN_RISK_LEVELS).toContain('CRITICAL');
      expect(CHURN_RISK_LEVELS).toContain('HIGH');
      expect(CHURN_RISK_LEVELS).toContain('MEDIUM');
      expect(CHURN_RISK_LEVELS).toContain('LOW');
      expect(CHURN_RISK_LEVELS).toContain('MINIMAL');
    });
  });

  describe('predictChurnRisk', () => {
    const baseInput: ChurnRiskInput = {
      entityType: 'contact',
      entityId: '550e8400-e29b-41d4-a716-446655440000',
    };

    it('should return a valid churn risk result', async () => {
      const result = await chain.predictChurnRisk(baseInput);

      expect(result).toBeDefined();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(1);
      expect(CHURN_RISK_LEVELS).toContain(result.riskLevel);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.topRiskFactors).toBeDefined();
      expect(Array.isArray(result.topRiskFactors)).toBe(true);
      expect(result.explanation).toBeDefined();
      expect(typeof result.explanation).toBe('string');
      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.primaryAction).toBeDefined();
      expect(typeof result.primaryAction).toBe('string');
      expect(result.slaHours).toBeDefined();
      expect(typeof result.slaHours).toBe('number');
      expect(result.executionTimeMs).toBeDefined();
      expect(typeof result.executionTimeMs).toBe('number');
      expect(result.modelVersion).toBeDefined();
      expect(typeof result.modelVersion).toBe('string');
    });

    it('should complete within 2 seconds (KPI)', async () => {
      const startTime = Date.now();
      await chain.predictChurnRisk(baseInput);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000); // <2s KPI requirement
    });

    it('should handle input with engagement metrics', async () => {
      const inputWithMetrics: ChurnRiskInput = {
        ...baseInput,
        daysSinceLastLogin: 45,
        loginFrequency30d: 2,
        sessionDurationAvg: 5.5,
        featureUsageScore: 25,
        emailOpenRate: 0.15,
      };

      const result = await chain.predictChurnRisk(inputWithMetrics);

      expect(result).toBeDefined();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(1);
    });

    it('should handle input with support data', async () => {
      const inputWithSupport: ChurnRiskInput = {
        ...baseInput,
        supportTickets30d: 8,
        npsScore: 3,
        escalationCount: 2,
        csatAvg: 2.5,
      };

      const result = await chain.predictChurnRisk(inputWithSupport);

      expect(result).toBeDefined();
      expect(result.topRiskFactors.length).toBeGreaterThan(0);
    });

    it('should handle input with transaction data', async () => {
      const inputWithTransaction: ChurnRiskInput = {
        ...baseInput,
        totalRevenue: 50000,
        paymentConsistency: 0.95,
        billingIssuesCount: 0,
        contractLengthMonths: 24,
      };

      const result = await chain.predictChurnRisk(inputWithTransaction);

      expect(result).toBeDefined();
    });

    it('should handle all entity types', async () => {
      const entityTypes: ChurnRiskInput['entityType'][] = ['lead', 'contact', 'opportunity', 'account'];

      for (const entityType of entityTypes) {
        const result = await chain.predictChurnRisk({
          entityType,
          entityId: '550e8400-e29b-41d4-a716-446655440001',
        });

        expect(result).toBeDefined();
        expect(result.riskScore).toBeGreaterThanOrEqual(0);
      }
    });

    it('should map risk score to correct risk level', async () => {
      // Mock will return 0.35 risk score which should be "LOW" level
      const result = await chain.predictChurnRisk(baseInput);

      // With mock returning 0.35, the risk level should be "LOW"
      // Since 0.35 >= 0.2 (LOW threshold) but < 0.4 (MEDIUM threshold)
      expect(result.riskLevel).toBe('LOW');
    });

    it('should include SLA hours based on risk level', async () => {
      const result = await chain.predictChurnRisk(baseInput);

      // SLA should match the risk level config
      expect(result.slaHours).toBe(RISK_LEVEL_CONFIG[result.riskLevel].slaHours);
    });

    it('should include model version', async () => {
      const result = await chain.predictChurnRisk(baseInput);

      expect(result.modelVersion).toContain('churn-risk');
    });
  });

  describe('Fallback Behavior', () => {
    it('should generate fallback result on error', async () => {
      // Create a chain that will fail
      const failingChain = new ChurnRiskChain();

      // Override the model to throw
      // @ts-expect-error - accessing private property for test
      failingChain.model = {
        invoke: vi.fn().mockRejectedValue(new Error('API Error')),
      };

      const result = await failingChain.predictChurnRisk({
        entityType: 'contact',
        entityId: '550e8400-e29b-41d4-a716-446655440002',
        daysSinceLastLogin: 45,
        npsScore: 3,
      });

      // Fallback should still return a valid result
      expect(result).toBeDefined();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(1);
      expect(result.confidence).toBeLessThan(0.5); // Low confidence for fallback
      expect(result.modelVersion).toContain('fallback');
    });

    it('should use heuristics for fallback risk calculation', async () => {
      const failingChain = new ChurnRiskChain();

      // @ts-expect-error - accessing private property for test
      failingChain.model = {
        invoke: vi.fn().mockRejectedValue(new Error('API Error')),
      };

      // High risk indicators
      const highRiskResult = await failingChain.predictChurnRisk({
        entityType: 'contact',
        entityId: '550e8400-e29b-41d4-a716-446655440003',
        daysSinceLastLogin: 45, // >30 days = high risk indicator
        npsScore: 3, // <6 = high risk indicator
        supportTickets30d: 10, // >5 = elevated risk
        usageTrendSlope: -0.5, // <-0.2 = declining usage
      });

      // Should have elevated risk due to multiple risk factors
      expect(highRiskResult.riskScore).toBeGreaterThan(0.5);
      expect(highRiskResult.topRiskFactors.length).toBeGreaterThan(0);
    });
  });

  describe('getChurnRiskChain singleton', () => {
    it('should return a ChurnRiskChain instance', () => {
      const instance = getChurnRiskChain();
      expect(instance).toBeInstanceOf(ChurnRiskChain);
    });

    it('should return the same instance on multiple calls', () => {
      const instance1 = getChurnRiskChain();
      const instance2 = getChurnRiskChain();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Input Validation', () => {
    it('should validate required fields', async () => {
      const validInput: ChurnRiskInput = {
        entityType: 'lead',
        entityId: '550e8400-e29b-41d4-a716-446655440004',
      };

      const result = await chain.predictChurnRisk(validInput);
      expect(result).toBeDefined();
    });

    it('should handle invalid UUID gracefully with fallback', async () => {
      // The chain should return a fallback result instead of throwing
      const invalidInput = {
        entityType: 'lead',
        entityId: 'not-a-valid-uuid',
      };

      const result = await chain.predictChurnRisk(invalidInput as ChurnRiskInput);

      // Should return a fallback result with low confidence
      expect(result).toBeDefined();
      expect(result.confidence).toBeLessThan(0.5); // Low confidence indicates fallback
      expect(result.modelVersion).toContain('fallback');
      expect(result.explanation).toContain('Fallback');
    });

    it('should handle invalid entity type gracefully with fallback', async () => {
      const invalidInput = {
        entityType: 'invalid' as ChurnRiskInput['entityType'],
        entityId: '550e8400-e29b-41d4-a716-446655440005',
      };

      const result = await chain.predictChurnRisk(invalidInput);

      // Should return a fallback result with low confidence
      expect(result).toBeDefined();
      expect(result.confidence).toBeLessThan(0.5); // Low confidence indicates fallback
      expect(result.modelVersion).toContain('fallback');
    });
  });

  describe('Risk Factor Analysis', () => {
    it('should identify risk factors with impact levels', async () => {
      const result = await chain.predictChurnRisk({
        entityType: 'contact',
        entityId: '550e8400-e29b-41d4-a716-446655440006',
        daysSinceLastLogin: 30,
        npsScore: 4,
      });

      expect(result.topRiskFactors).toBeDefined();

      // Each factor should have required fields
      for (const factor of result.topRiskFactors) {
        expect(factor.factor).toBeDefined();
        expect(factor.value).toBeDefined();
        expect(['high', 'medium', 'low']).toContain(factor.impact);
        expect(factor.reasoning).toBeDefined();
      }
    });
  });

  describe('Recommendations', () => {
    it('should return actionable recommendations', async () => {
      const result = await chain.predictChurnRisk({
        entityType: 'contact',
        entityId: '550e8400-e29b-41d4-a716-446655440007',
      });

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.primaryAction).toBeDefined();
      expect(result.primaryAction.length).toBeGreaterThan(0);
    });
  });
});
