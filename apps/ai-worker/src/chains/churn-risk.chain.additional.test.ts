import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChurnRiskChain, churnRiskInputSchema, type ChurnRiskInput } from './churn-risk.chain';

vi.mock('../config/ai.config', () => ({
  aiConfig: {
    provider: 'mock',
    openai: { apiKey: 'k', model: 'gpt-4', temperature: 0.3, maxTokens: 1500, timeout: 30000 },
    ollama: { baseUrl: 'http://localhost:11434', model: 'mistral', temperature: 0.3, timeout: 60000 },
    costTracking: { enabled: false, warningThreshold: 10 },
    performance: { cacheEnabled: false, cacheTTL: 3600, rateLimitPerMinute: 60, retryAttempts: 3, retryDelay: 1000 },
    features: { enableChainLogging: false, enableConfidenceScores: true, enableStructuredOutputs: true, enableMultiAgentWorkflows: false },
  },
}));
vi.mock('../utils/cost-tracker', () => ({ costTracker: { recordUsage: vi.fn() } }));

describe('ChurnRiskChain additional', () => {
  let chain: ChurnRiskChain;
  const baseInput: ChurnRiskInput = { entityType: 'contact', entityId: '550e8400-e29b-41d4-a716-446655440000' };

  beforeEach(() => { vi.clearAllMocks(); chain = new ChurnRiskChain(); });

  describe('assessDataQuality', () => {
    it('complete when >70% fields provided', async () => {
      const input: ChurnRiskInput = {
        ...baseInput,
        daysSinceLastLogin: 5, loginFrequency30d: 20, sessionDurationAvg: 30,
        featureUsageScore: 80, emailOpenRate: 0.6, usageTrendSlope: 0.1,
        sessionTimeTrend: 0.05, totalRevenue: 50000, paymentConsistency: 0.95,
        billingIssuesCount: 0, contractLengthMonths: 24, supportTickets30d: 1,
        ticketResolutionSatisfaction: 0.9, escalationCount: 0, npsScore: 8,
      };
      const r = await chain.predictChurnRisk(input);
      expect(r.dataQuality).toBe('complete');
    });

    it('partial when 30-70% fields', async () => {
      const input: ChurnRiskInput = {
        ...baseInput,
        daysSinceLastLogin: 10, loginFrequency30d: 15, featureUsageScore: 60,
        supportTickets30d: 2, npsScore: 7, accountAgeMonths: 12, planTier: 'pro',
      };
      const r = await chain.predictChurnRisk(input);
      expect(r.dataQuality).toBe('partial');
    });

    it('minimal when <30% fields', async () => {
      const r = await chain.predictChurnRisk(baseInput);
      expect(r.dataQuality).toBe('minimal');
    });
  });

  describe('fallback heuristics', () => {
    it('no risk factors yields insufficient_data', async () => {
      // Force error to trigger fallback by making model throw
      const orig = (chain as any).model;
      (chain as any).model = { invoke: async () => { throw new Error('forced'); } };
      const r = await chain.predictChurnRisk(baseInput);
      expect(r.modelVersion).toContain('fallback');
      expect(r.topRiskFactors[0].factor).toBe('insufficient_data');
      expect(r.riskScore).toBeCloseTo(0.3, 1);
      (chain as any).model = orig;
    });

    it('declining usage adds usage_trend factor', async () => {
      (chain as any).model = { invoke: async () => { throw new Error('err'); } };
      const r = await chain.predictChurnRisk({ ...baseInput, usageTrendSlope: -0.5 });
      const f = r.topRiskFactors.find((x: any) => x.factor === 'usage_trend');
      expect(f).toBeDefined();
      expect(f!.impact).toBe('medium');
    });

    it('high support tickets adds support_tickets factor', async () => {
      (chain as any).model = { invoke: async () => { throw new Error('err'); } };
      const r = await chain.predictChurnRisk({ ...baseInput, supportTickets30d: 10 });
      const f = r.topRiskFactors.find((x: any) => x.factor === 'support_tickets');
      expect(f).toBeDefined();
      expect(r.riskScore).toBeGreaterThan(0.3);
    });

    it('high days since login adds login factor', async () => {
      (chain as any).model = { invoke: async () => { throw new Error('err'); } };
      const r = await chain.predictChurnRisk({ ...baseInput, daysSinceLastLogin: 60 });
      const f = r.topRiskFactors.find((x: any) => x.factor === 'days_since_last_login');
      expect(f).toBeDefined();
      expect(f!.impact).toBe('high');
    });

    it('low NPS adds nps factor', async () => {
      (chain as any).model = { invoke: async () => { throw new Error('err'); } };
      const r = await chain.predictChurnRisk({ ...baseInput, npsScore: 3 });
      const f = r.topRiskFactors.find((x: any) => x.factor === 'nps_score');
      expect(f).toBeDefined();
    });

    it('combined factors clamp to 1.0', async () => {
      (chain as any).model = { invoke: async () => { throw new Error('err'); } };
      const r = await chain.predictChurnRisk({ ...baseInput, daysSinceLastLogin: 90, npsScore: 2, supportTickets30d: 15, usageTrendSlope: -1.0 });
      expect(r.riskScore).toBeLessThanOrEqual(1.0);
      expect(r.riskScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('input schema validation', () => {
    it('rejects invalid entityType', () => {
      expect(() => churnRiskInputSchema.parse({ entityType: 'invalid', entityId: '550e8400-e29b-41d4-a716-446655440000' })).toThrow();
    });
    it('rejects invalid uuid', () => {
      expect(() => churnRiskInputSchema.parse({ entityType: 'lead', entityId: 'not-a-uuid' })).toThrow();
    });
    it('rejects featureUsageScore > 100', () => {
      expect(() => churnRiskInputSchema.parse({ entityType: 'lead', entityId: '550e8400-e29b-41d4-a716-446655440000', featureUsageScore: 101 })).toThrow();
    });
  });
});
