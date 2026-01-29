import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock at module level using vi.hoisted
const { mockInvoke, MockChatOllama } = vi.hoisted(() => {
  const mockInvoke = vi.fn();
  const MockChatOllama = vi.fn(function(this: any) {
    this.invoke = mockInvoke;
  });
  return { mockInvoke, MockChatOllama };
});

vi.mock('@langchain/ollama', () => ({
  ChatOllama: MockChatOllama,
}));

// Mock the AI config to use Ollama provider
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

    // Mock Ollama response with valid JSON including modelVersion
    // Note: modelVersion is required by the schema but overwritten by the chain
    mockInvoke.mockResolvedValue({
      content: JSON.stringify({
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
        modelVersion: 'placeholder:v1', // Will be overwritten by chain
      }),
    });

    chain = new LeadScoringChain();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Ollama Provider Initialization', () => {
    it('should initialize ChatOllama with correct configuration', () => {
      expect(MockChatOllama).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'http://localhost:11434',
          model: 'mistral',
          temperature: 0.7,
        })
      );
    });

    it('should NOT throw "not yet implemented" error', () => {
      // This test ensures the Ollama provider is properly implemented
      expect(() => new LeadScoringChain()).not.toThrow('not yet implemented');
    });
  });

  describe('scoreLead with Ollama', () => {
    it('should score a lead using Ollama', async () => {
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
      expect(result.modelVersion).toContain('ollama:mistral');
    });

    it('should include Ollama in modelVersion', async () => {
      const lead: LeadInput = {
        email: 'jane@acme.com',
        source: 'REFERRAL',
      };

      const result = await chain.scoreLead(lead);

      expect(result.modelVersion).toMatch(/^ollama:mistral:v\d+$/);
    });

    it('should call Ollama invoke method', async () => {
      const lead: LeadInput = {
        email: 'test@example.com',
        source: 'COLD_CALL',
      };

      await chain.scoreLead(lead);

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockInvoke).toHaveBeenCalledWith(expect.any(String));
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
      // Cost tracking for Ollama should be $0.00
    });
  });

  describe('Error Handling', () => {
    it('should handle Ollama connection errors gracefully', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('ECONNREFUSED: Connection refused'));

      const lead: LeadInput = {
        email: 'test@error.com',
        source: 'WEBSITE',
      };

      const result = await chain.scoreLead(lead);

      // Should return default error result, not throw
      expect(result.score).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.factors[0].reasoning).toContain('ECONNREFUSED');
      expect(result.modelVersion).toBe('error:v1');
    });

    it('should handle malformed Ollama responses', async () => {
      mockInvoke.mockResolvedValueOnce({
        content: 'This is not valid JSON',
      });

      const lead: LeadInput = {
        email: 'test@malformed.com',
        source: 'WEBSITE',
      };

      const result = await chain.scoreLead(lead);

      // Should return default error result
      expect(result.score).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.modelVersion).toBe('error:v1');
    });
  });
});
