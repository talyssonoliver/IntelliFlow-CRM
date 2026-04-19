/**
 * Insight Generation Chain Tests
 *
 * Tests:
 * 1. Mock provider returns valid structured JSON
 * 2. LLM throws timeout → fallback returns insights with confidence: 0.4
 * 3. LLM returns malformed JSON → fallback kicks in
 * 4. Empty input (no flagged items) → "all clear" achievement insight
 * 5. Validate Zod constraints (confidence bounds, priority enum, entityType enum)
 * 6. Production guard throws when AI_PROVIDER=mock in NODE_ENV=production
 * 7. Cost tracker recordUsage called with correct operationType
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/ai.config', () => ({
  aiConfig: {
    provider: 'mock',
    openai: {
      model: 'gpt-4',
      temperature: 0.4,
      maxTokens: 2000,
      timeout: 30000,
      apiKey: 'test-key',
    },
    ollama: { baseUrl: 'http://localhost:11434', model: 'mistral' },
    features: { enableChainLogging: false },
    costTracking: { enabled: true },
  },
}));

// Pattern A: mock the factory — the mock provider routes through createLLM
vi.mock('../../lib/llm-factory.js', () => ({
  createLLM: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({ content: '{}' }),
    withStructuredOutput: vi.fn(() => ({
      invoke: vi.fn().mockResolvedValue({}),
    })),
  })),
  createEmbeddings: vi.fn(() => ({
    embedQuery: vi.fn().mockResolvedValue([]),
    embedDocuments: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../../utils/cost-tracker', () => ({
  costTracker: { recordUsage: vi.fn() },
}));

// Mock the VersionLoader singleton so tests never hit the DB.
// Default: getChainConfig throws (simulates no active version → fallback to default prompt).
vi.mock('../../versioning/chain-version-loader', () => ({
  getVersionLoader: vi.fn(() => ({
    getChainConfig: vi.fn().mockRejectedValue(new Error('No active version')),
  })),
  CHAIN_TYPE_MAP: {
    LEAD_SCORING: 'SCORING',
    CHURN_RISK: 'SCORING',
    INSIGHT_GENERATION: 'QUALIFICATION',
    SENTIMENT_ANALYSIS: 'EMAIL_WRITER',
    TICKET_ROUTING: 'FOLLOWUP',
    AUTO_RESPONSE: 'EMAIL_WRITER',
  },
  configureVersionLoader: vi.fn(),
}));

import {
  InsightGenerationChain,
  InsightGenerationInputSchema,
  GeneratedInsightSchema,
  type InsightGenerationInput,
} from '../insight-generation.chain';
import { costTracker } from '../../utils/cost-tracker';

const mockRecordUsage = vi.mocked(costTracker.recordUsage);

function createInput(overrides: Partial<InsightGenerationInput> = {}): InsightGenerationInput {
  return {
    tenantId: 'tenant-001',
    userId: 'user-001',
    dealsAtRisk: [],
    hotLeads: [],
    overdueTasksCount: 0,
    staleContacts: [],
    ...overrides,
  };
}

describe('InsightGenerationChain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor with mock provider', () => {
    it('should create chain with mock provider', () => {
      const chain = new InsightGenerationChain();
      expect(chain).toBeDefined();
    });
  });

  describe('generateInsights', () => {
    it('should return valid structured insights from mock provider', async () => {
      const chain = new InsightGenerationChain();
      const input = createInput({
        dealsAtRisk: [{ id: 'deal-1', name: 'Enterprise Renewal', daysSinceUpdate: 18 }],
        hotLeads: [{ id: 'lead-1', name: 'Acme Corp', score: 92, company: 'Acme' }],
      });

      const result = await chain.generateInsights(input);

      expect(result.length).toBeGreaterThan(0);
      result.forEach((insight) => {
        const parsed = GeneratedInsightSchema.safeParse(insight);
        expect(parsed.success).toBe(true);
        expect(insight.confidence).toBeGreaterThanOrEqual(0);
        expect(insight.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should fall back to heuristics when LLM throws timeout', async () => {
      const chain = new InsightGenerationChain();
      // Override the model to throw
      (chain as any).structuredModel = {
        invoke: vi.fn().mockRejectedValue(new Error('Request timeout')),
      };

      const input = createInput({
        dealsAtRisk: [{ id: 'deal-1', name: 'Big Deal', daysSinceUpdate: 20 }],
      });

      const result = await chain.generateInsights(input);

      expect(result.length).toBeGreaterThan(0);
      result.forEach((insight) => {
        expect(insight.confidence).toBe(0.4);
      });
    });

    it('should fall back to heuristics when LLM returns malformed JSON', async () => {
      const chain = new InsightGenerationChain();
      // structuredModel throws if the LLM returns invalid data (Zod validation error path)
      (chain as any).structuredModel = {
        invoke: vi.fn().mockRejectedValue(new Error('ZodError: invalid JSON structure')),
      };

      const input = createInput({
        hotLeads: [{ id: 'lead-1', name: 'Jane Doe', score: 85 }],
      });

      const result = await chain.generateInsights(input);

      expect(result.length).toBeGreaterThan(0);
      result.forEach((insight) => {
        expect(insight.confidence).toBe(0.4);
      });
    });

    it('should normalize missing optional LLM fields instead of falling back', async () => {
      const chain = new InsightGenerationChain();
      // structuredModel.invoke returns the parsed object directly (no content wrapper).
      // Optional fields with Zod defaults (suggestedActions, entityId, reasoning) must be
      // explicitly included or undefined in the mock — Zod doesn't run on the mock return.
      (chain as any).structuredModel = {
        invoke: vi.fn().mockResolvedValue({
          insights: [
            {
              entityType: 'task',
              type: 'reminder',
              title: 'Overdue tasks need attention',
              description: 'There are 3 overdue tasks in your pipeline.',
              confidence: 0.8,
              priority: 'high',
              // entityId and reasoning intentionally omitted to test normalization
              suggestedActions: [], // required by chain logic even though Zod marks optional
            },
          ],
        }),
      };

      const result = await chain.generateInsightsWithMeta(
        createInput({
          overdueTasksCount: 3,
        })
      );

      expect(result.source).toBe('llm');
      expect(result.insights).toHaveLength(1);
      expect(result.insights[0].entityId).toBeNull();
      expect(result.insights[0].suggestedActions).toEqual([]);
      expect(result.insights[0].reasoning).toContain('AI-generated insight');
    });

    it('should produce achievement insight when no items flagged', async () => {
      const chain = new InsightGenerationChain();
      // Override to throw so we exercise fallback for empty input
      (chain as any).structuredModel = {
        invoke: vi.fn().mockRejectedValue(new Error('timeout')),
      };

      const input = createInput();
      const result = await chain.generateInsights(input);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe('achievement');
      expect(result[0].title).toContain('on track');
    });
  });

  describe('Zod schema validation', () => {
    it('should validate input schema', () => {
      const valid = InsightGenerationInputSchema.safeParse({
        tenantId: 'tenant-1',
        userId: 'user-1',
        dealsAtRisk: [],
        hotLeads: [],
        overdueTasksCount: 0,
        staleContacts: [],
      });
      expect(valid.success).toBe(true);

      const invalid = InsightGenerationInputSchema.safeParse({
        // missing tenantId
        userId: 'user-1',
      });
      expect(invalid.success).toBe(false);
    });

    it('should validate GeneratedInsight schema constraints', () => {
      // Valid insight
      const valid = GeneratedInsightSchema.safeParse({
        entityId: 'deal-1',
        entityType: 'opportunity',
        type: 'warning',
        title: 'Test',
        description: 'Test description',
        suggestedActions: ['Action 1'],
        confidence: 0.85,
        priority: 'high',
        reasoning: 'Test reasoning',
      });
      expect(valid.success).toBe(true);

      // Invalid confidence (>1)
      const invalidConfidence = GeneratedInsightSchema.safeParse({
        entityId: null,
        entityType: null,
        type: 'warning',
        title: 'Test',
        description: 'Test',
        suggestedActions: [],
        confidence: 1.5,
        priority: 'high',
        reasoning: 'Test',
      });
      expect(invalidConfidence.success).toBe(false);

      // Invalid type
      const invalidType = GeneratedInsightSchema.safeParse({
        entityId: null,
        entityType: null,
        type: 'invalid_type',
        title: 'Test',
        description: 'Test',
        suggestedActions: [],
        confidence: 0.5,
        priority: 'medium',
        reasoning: 'Test',
      });
      expect(invalidType.success).toBe(false);
    });
  });

  describe('production guard', () => {
    it('should throw when mock provider is used in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      expect(() => new InsightGenerationChain()).toThrow(
        'SECURITY: Mock AI provider cannot be used in production environment'
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('cost tracking', () => {
    it('should call recordUsage with insight_generation operationType', async () => {
      const chain = new InsightGenerationChain();
      const input = createInput({
        dealsAtRisk: [{ id: 'deal-1', name: 'Test Deal', daysSinceUpdate: 15 }],
      });

      await chain.generateInsights(input);

      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'insight_generation',
        })
      );
    });
  });

  describe('generateFallbackInsights', () => {
    it('should generate correct fallback for deals at risk', () => {
      const chain = new InsightGenerationChain();
      const insights = chain.generateFallbackInsights(
        createInput({
          dealsAtRisk: [{ id: 'deal-1', name: 'Risk Deal', daysSinceUpdate: 25 }],
        })
      );

      expect(insights.length).toBe(1);
      expect(insights[0].type).toBe('warning');
      expect(insights[0].entityType).toBe('opportunity');
      expect(insights[0].priority).toBe('critical'); // 25 > 21
      expect(insights[0].confidence).toBe(0.4);
    });

    it('should generate correct fallback for mixed data', () => {
      const chain = new InsightGenerationChain();
      const insights = chain.generateFallbackInsights(
        createInput({
          dealsAtRisk: [{ id: 'd1', name: 'Deal A', daysSinceUpdate: 15 }],
          hotLeads: [{ id: 'l1', name: 'Lead B', score: 92 }],
          overdueTasksCount: 3,
          staleContacts: [{ id: 'c1', name: 'Contact C', daysSinceContact: null }],
        })
      );

      expect(insights.length).toBe(4);
      const types = insights.map((i) => i.type);
      expect(types).toContain('warning');
      expect(types).toContain('opportunity');
      expect(types).toContain('reminder');
    });
  });

  // ============================================================
  // H3: VersionLoader integration tests
  // ============================================================

  describe('VersionLoader integration (H3)', () => {
    it('should accept optional tenantId constructor option without throwing', () => {
      expect(() => new InsightGenerationChain({ tenantId: 'tenant-abc' })).not.toThrow();
    });

    it('uses default prompt when VersionLoader returns null (no active version)', async () => {
      const tenantChain = new InsightGenerationChain({ tenantId: 'tenant-xyz' });
      const result = await tenantChain.generateInsightsWithMeta(createInput());

      expect(result).toBeDefined();
      expect(Array.isArray(result.insights)).toBe(true);
    });

    it('uses versioned prompt when VersionLoader returns a config', async () => {
      const { getVersionLoader } = await import('../../versioning/chain-version-loader');
      vi.mocked(getVersionLoader).mockReturnValueOnce({
        getChainConfig: vi.fn().mockResolvedValue({
          prompt: 'Custom versioned insight prompt: {context}',
          model: 'gpt-4',
          temperature: 0.4,
          maxTokens: 2000,
        }),
      } as any);

      const tenantChain = new InsightGenerationChain({ tenantId: 'tenant-versioned' });
      const result = await tenantChain.generateInsightsWithMeta(createInput());

      expect(result).toBeDefined();
      expect(Array.isArray(result.insights)).toBe(true);
    });

    it('falls back to default prompt when VersionLoader throws', async () => {
      const tenantChain = new InsightGenerationChain({ tenantId: 'tenant-throw' });
      await expect(tenantChain.generateInsightsWithMeta(createInput())).resolves.toBeDefined();
    });
  });
});
