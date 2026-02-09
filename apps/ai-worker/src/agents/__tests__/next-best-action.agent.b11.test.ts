/**
 * Next Best Action Agent - B11 coverage tests
 *
 * Targets uncovered branches:
 * - executeTask: RAG context retrieval failure, sentiment analysis failure
 * - buildContextQuery: opportunity type, lead type, no context
 * - generateRecommendations: LLM failure -> fallback
 * - parseRecommendations: no JSON found, parse error, missing fields
 * - generateFallbackRecommendations: urgent/negative, cold lead, low score, late stage, default
 * - validateActionType: invalid type, null/undefined
 * - validatePriority: invalid priority, null/undefined
 * - buildEntitySummary: all fields, no fields
 * - calculateConfidence: various data quality levels
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRagRetrieveContext = vi.hoisted(() => vi.fn());
const mockRagFormatContext = vi.hoisted(() => vi.fn());
const mockSentimentAnalyze = vi.hoisted(() => vi.fn());

vi.mock('../../chains/rag-context.chain', () => ({
  RAGContextChain: vi.fn(),
  ragContextChain: {
    retrieveContext: mockRagRetrieveContext,
    formatContextForPrompt: mockRagFormatContext,
  },
}));

vi.mock('../../chains/sentiment.chain', () => ({
  SentimentAnalysisChain: vi.fn(),
  getSentimentChain: () => ({
    analyze: mockSentimentAnalyze,
  }),
}));

vi.mock('../../config/ai.config', () => ({
  aiConfig: {
    provider: 'mock',
    openai: {
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 4096,
      timeout: 30000,
      apiKey: 'test-key',
    },
    ollama: { baseUrl: 'http://localhost:11434', model: 'llama2' },
    features: { enableChainLogging: false },
    costTracking: { enabled: false },
  },
}));

vi.mock('../../utils/cost-tracker', () => ({
  costTracker: { recordUsage: vi.fn() },
}));

vi.mock('../../utils/token-counter', () => ({
  countMessagesTokens: vi.fn().mockReturnValue(100),
  countTokens: vi.fn().mockReturnValue(50),
}));

import {
  NextBestActionAgent,
  createNBAAgent,
  type NBAContext,
} from '../next-best-action.agent';

function createContext(overrides: Partial<NBAContext> = {}): NBAContext {
  return {
    entityType: 'lead',
    entityId: '00000000-0000-0000-0000-000000000001',
    tenantId: '00000000-0000-0000-0000-000000000002',
    userId: '00000000-0000-0000-0000-000000000003',
    ...overrides,
  };
}

describe('NextBestActionAgent - b11 coverage', () => {
  beforeEach(() => {
    mockRagRetrieveContext.mockReset();
    mockRagFormatContext.mockReset();
    mockSentimentAnalyze.mockReset();

    mockRagRetrieveContext.mockResolvedValue({
      success: false,
      context: [],
    });
    mockRagFormatContext.mockReturnValue('');
    mockSentimentAnalyze.mockResolvedValue({
      sentiment: 'NEUTRAL',
      urgency: 'MEDIUM',
      primaryEmotion: 'calm',
    });
  });

  describe('createNBAAgent', () => {
    it('should create an agent instance', () => {
      const agent = createNBAAgent();
      expect(agent).toBeInstanceOf(NextBestActionAgent);
    });
  });

  describe('execute - fallback recommendations', () => {
    it('should generate default follow-up when no specific signals', async () => {
      const agent = createNBAAgent();
      const result = await agent.execute({
        id: 'nba-test-1',
        description: 'Test NBA',
        input: createContext({
          daysSinceLastContact: 5,
          score: 60,
        }),
      });

      expect(result.success).toBe(true);
      expect(result.output!.recommendations.length).toBeGreaterThan(0);
      expect(result.output!.recommendations[0].action).toBe('FOLLOW_UP');
    });

    it('should recommend CALL for high urgency override', async () => {
      const agent = createNBAAgent();
      const result = await agent.execute({
        id: 'nba-test-2',
        description: 'Test NBA urgent',
        input: createContext({
          urgencyOverride: 'HIGH',
          daysSinceLastContact: 5,
          score: 60,
        }),
      });

      expect(result.success).toBe(true);
      const actions = result.output!.recommendations.map((r) => r.action);
      expect(actions).toContain('CALL');
    });

    it('should recommend RE_ENGAGE for cold lead (>14 days)', async () => {
      const agent = createNBAAgent();
      const result = await agent.execute({
        id: 'nba-test-3',
        description: 'Test NBA cold',
        input: createContext({
          daysSinceLastContact: 35,
          score: 60,
        }),
      });

      expect(result.success).toBe(true);
      const actions = result.output!.recommendations.map((r) => r.action);
      expect(actions).toContain('RE_ENGAGE');
    });

    it('should recommend NURTURE for low score lead (<40)', async () => {
      const agent = createNBAAgent();
      const result = await agent.execute({
        id: 'nba-test-4',
        description: 'Test NBA low score',
        input: createContext({
          score: 20,
          daysSinceLastContact: 5,
        }),
      });

      expect(result.success).toBe(true);
      const actions = result.output!.recommendations.map((r) => r.action);
      expect(actions).toContain('NURTURE');
    });

    it('should recommend CLOSE_DEAL for late-stage opportunity', async () => {
      const agent = createNBAAgent();
      const result = await agent.execute({
        id: 'nba-test-5',
        description: 'Test NBA close deal',
        input: createContext({
          entityType: 'opportunity',
          stage: 'NEGOTIATION',
          daysSinceLastContact: 5,
          score: 60,
        }),
      });

      expect(result.success).toBe(true);
      const actions = result.output!.recommendations.map((r) => r.action);
      expect(actions).toContain('CLOSE_DEAL');
    });

    it('should build context query for opportunity', async () => {
      const agent = createNBAAgent();
      const result = await agent.execute({
        id: 'nba-test-6',
        description: 'Test NBA opportunity query',
        input: createContext({
          entityType: 'opportunity',
          company: 'Acme Corp',
          stage: 'PROPOSAL',
        }),
      });

      expect(result.success).toBe(true);
    });

    it('should handle RAG context retrieval success', async () => {
      mockRagRetrieveContext.mockResolvedValue({
        success: true,
        context: [{ text: 'relevant info' }],
      });
      mockRagFormatContext.mockReturnValue('RAG context here');

      const agent = createNBAAgent();
      const result = await agent.execute({
        id: 'nba-test-7',
        description: 'Test NBA with RAG',
        input: createContext({ company: 'BigCo' }),
      });

      expect(result.success).toBe(true);
      expect(result.output!.ragContextUsed).toBe(true);
    });

    it('should handle RAG context retrieval failure gracefully', async () => {
      mockRagRetrieveContext.mockRejectedValue(new Error('RAG down'));

      const agent = createNBAAgent();
      const result = await agent.execute({
        id: 'nba-test-8',
        description: 'Test NBA RAG failure',
        input: createContext(),
      });

      expect(result.success).toBe(true);
      expect(result.output!.ragContextUsed).toBe(false);
    });

    it('should include sentiment analysis when recent messages provided', async () => {
      const agent = createNBAAgent();
      const result = await agent.execute({
        id: 'nba-test-9',
        description: 'Test NBA with sentiment',
        input: createContext({
          recentMessages: [
            {
              content: 'Very unhappy with the service',
              direction: 'inbound',
              timestamp: new Date().toISOString(),
              channel: 'email',
            },
          ],
        }),
      });

      expect(result.success).toBe(true);
      expect(result.output!.sentimentAnalysis).toBeDefined();
    });

    it('should handle sentiment analysis failure', async () => {
      mockSentimentAnalyze.mockRejectedValue(new Error('Sentiment error'));

      const agent = createNBAAgent();
      const result = await agent.execute({
        id: 'nba-test-10',
        description: 'Test NBA sentiment fail',
        input: createContext({
          recentMessages: [
            {
              content: 'test message',
              direction: 'outbound',
              timestamp: new Date().toISOString(),
              channel: 'chat',
            },
          ],
        }),
      });

      expect(result.success).toBe(true);
      expect(result.output!.sentimentAnalysis).toBeUndefined();
    });

    it('should build entity summary with all fields', async () => {
      const agent = createNBAAgent();
      const result = await agent.execute({
        id: 'nba-test-11',
        description: 'Test full summary',
        input: createContext({
          name: 'John Doe',
          company: 'Acme',
          title: 'CTO',
          stage: 'QUALIFICATION',
          value: 50000,
          score: 75,
        }),
      });

      expect(result.success).toBe(true);
      expect(result.output!.entitySummary).toContain('John Doe');
      expect(result.output!.entitySummary).toContain('Acme');
    });

    it('should build entity summary with no fields', async () => {
      const agent = createNBAAgent();
      const result = await agent.execute({
        id: 'nba-test-12',
        description: 'Test minimal summary',
        input: createContext(),
      });

      expect(result.success).toBe(true);
      expect(result.output!.entitySummary).toContain('lead');
    });
  });

  describe('calculateConfidence', () => {
    it('should have higher confidence with more data', async () => {
      const agent = createNBAAgent();

      const minResult = await agent.execute({
        id: 'nba-min',
        description: 'Minimal data',
        input: createContext(),
      });

      const maxResult = await agent.execute({
        id: 'nba-max',
        description: 'Full data',
        input: createContext({
          name: 'John',
          company: 'Acme',
          email: 'john@acme.com',
          score: 80,
          recentMessages: [
            {
              content: 'hello',
              direction: 'inbound',
              timestamp: new Date().toISOString(),
              channel: 'email',
            },
          ],
        }),
      });

      expect(maxResult.confidence).toBeGreaterThan(minResult.confidence);
    });
  });
});
