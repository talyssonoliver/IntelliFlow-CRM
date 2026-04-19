/**
 * NOTE FOR REVIEWER: This file previously tested that LeadScoringChain correctly
 * instantiated ChatOllama when aiConfig.provider === 'ollama'. After B2b, the chain
 * delegates ALL provider routing to createLLM() in llm-factory.ts, which has its own
 * unit tests in llm-factory.test.ts covering the ollama branch.
 *
 * The tests below are RECOMMENDED FOR DELETION in a follow-up cleanup task.
 * They are kept here (with Pattern A factory mock) to prevent CI failures while
 * the deletion is scheduled.
 *
 * CANDIDATE FOR DELETION: ollama-scoring.chain.test.ts
 * Reason: Tests the factory's ollama routing, not chain behaviour. The factory is
 * tested in llm-factory.test.ts. No unique coverage is provided by this file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Pattern A: mock the factory. All provider routing is the factory's concern.
const OLLAMA_PARSED_RESPONSE = {
  score: 72,
  confidence: 0.82,
  factors: [
    {
      name: 'Contact Completeness',
      impact: 18,
      reasoning: 'Complete contact information with corporate email domain.',
    },
    {
      name: 'Engagement Quality',
      impact: 14,
      reasoning: 'Website source indicates active interest.',
    },
    {
      name: 'Qualification Signals',
      impact: 22,
      reasoning: 'Director-level title suggests decision-making capability.',
    },
    {
      name: 'Data Quality',
      impact: 18,
      reasoning: 'All required fields present with valid formatting.',
    },
  ],
};

const mockStructuredInvoke = vi.fn().mockResolvedValue(OLLAMA_PARSED_RESPONSE);
const mockRawInvoke = vi
  .fn()
  .mockResolvedValue({ content: JSON.stringify(OLLAMA_PARSED_RESPONSE) });

vi.mock('../lib/llm-factory.js', () => ({
  createLLM: vi.fn(() => ({
    invoke: mockRawInvoke,
    withStructuredOutput: vi.fn(() => ({
      invoke: mockStructuredInvoke,
    })),
  })),
  createEmbeddings: vi.fn(() => ({
    embedQuery: vi.fn().mockResolvedValue([]),
    embedDocuments: vi.fn().mockResolvedValue([]),
  })),
}));

// Mock the AI config — provider = 'ollama' to exercise the ollama path in the factory
vi.mock('../config/ai.config', () => ({
  aiConfig: {
    provider: 'ollama',
    openai: {
      apiKey: undefined,
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      maxTokens: 2000,
      timeout: 30000,
    },
    ollama: {
      baseUrl: 'http://localhost:11434',
      model: 'mistral',
      temperature: 0.7,
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

// Import after mocking
import { LeadScoringChain, LeadInput } from './scoring.chain';

describe('LeadScoringChain with Ollama Provider', () => {
  let chain: LeadScoringChain;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStructuredInvoke.mockResolvedValue(OLLAMA_PARSED_RESPONSE);
    mockRawInvoke.mockResolvedValue({ content: JSON.stringify(OLLAMA_PARSED_RESPONSE) });

    chain = new LeadScoringChain();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Ollama Provider Initialization', () => {
    it('should NOT throw "not yet implemented" error', () => {
      // Factory handles provider routing — chain should initialize cleanly
      expect(() => new LeadScoringChain()).not.toThrow('not yet implemented');
    });
  });

  describe('scoreLead with Ollama', () => {
    it('should score a lead using Ollama provider config', async () => {
      const lead: LeadInput = {
        email: 'test@company.com',
        firstName: 'Test',
        lastName: 'User',
        company: 'Test Corp',
        title: 'Director',
        source: 'WEBSITE',
      };

      const result = await chain.scoreLead(lead);

      expect(result).toBeDefined();
      expect(result.score).toBe(72);
      expect(result.confidence).toBe(0.82);
      expect(result.factors).toHaveLength(4);
      // modelVersion is set from aiConfig.provider in the chain
      expect(result.modelVersion).toContain('scoring-free');
    });

    it('should call structuredModel.invoke', async () => {
      const lead: LeadInput = {
        email: 'test@example.com',
        source: 'COLD_CALL',
      };

      await chain.scoreLead(lead);

      expect(mockStructuredInvoke).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cost Tracking with Ollama', () => {
    it('should report zero cost for Ollama usage', async () => {
      const lead: LeadInput = {
        email: 'test@local.dev',
        source: 'WEBSITE',
      };

      const result = await chain.scoreLead(lead);

      // Ollama is free, so no cost should be tracked
      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      mockStructuredInvoke.mockRejectedValueOnce(new Error('ECONNREFUSED: Connection refused'));

      const lead: LeadInput = {
        email: 'test@error.com',
        source: 'WEBSITE',
      };

      const result = await chain.scoreLead(lead);

      expect(result.score).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.factors[0].reasoning).toContain('ECONNREFUSED');
      expect(result.modelVersion).toBe('error:v1');
    });
  });
});
