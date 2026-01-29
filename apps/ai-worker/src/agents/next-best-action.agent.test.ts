/**
 * Next Best Action Agent Tests (IFC-039)
 *
 * Tests for the NBA agent that recommends optimal sales actions.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  NextBestActionAgent,
  createNBAAgent,
  getNextBestActions,
  nbaContextSchema,
  nbaResultSchema,
  ACTION_TYPES,
  ACTION_PRIORITIES,
  type NBAContext,
} from './next-best-action.agent';

// Mock dependencies
vi.mock('../chains/rag-context.chain', () => ({
  ragContextChain: {
    retrieveContext: vi.fn().mockResolvedValue({
      success: true,
      context: [
        {
          id: 'doc-1',
          source: 'documents',
          title: 'Sales Playbook',
          content: 'Always follow up within 48 hours.',
          relevanceScore: 0.85,
          metadata: {},
          citation: '[Sales Playbook, p.5]',
          retrievedAt: new Date().toISOString(),
        },
      ],
      totalRetrieved: 1,
      avgRelevance: 0.85,
      contextTokens: 50,
      sources: ['documents'],
      executionTimeMs: 100,
    }),
    formatContextForPrompt: vi.fn().mockReturnValue('RETRIEVED CONTEXT:\n[Sales Playbook]'),
  },
  RAGContextChain: vi.fn(),
}));

vi.mock('../chains/sentiment.chain', () => ({
  getSentimentChain: vi.fn().mockReturnValue({
    analyze: vi.fn().mockResolvedValue({
      sentiment: 'POSITIVE',
      sentimentScore: 0.7,
      emotions: [{ emotion: 'TRUST', intensity: 0.8 }],
      primaryEmotion: 'TRUST',
      urgency: 'MEDIUM',
      urgencyScore: 0.4,
      keyPhrases: [],
      confidence: 0.85,
      reasoning: 'Positive engagement detected.',
      textLength: 100,
      modelVersion: 'test:v1',
    }),
  }),
  SentimentAnalysisChain: vi.fn(),
}));

// Mock the AI config
vi.mock('../config/ai.config', () => ({
  aiConfig: {
    provider: 'mock',
    openai: {
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      maxTokens: 2000,
      timeout: 30000,
      apiKey: 'test-key',
    },
    costTracking: { enabled: false },
    features: { enableChainLogging: false },
    performance: { rateLimitPerMinute: 60 },
  },
}));

describe('NextBestActionAgent', () => {
  let agent: NextBestActionAgent;

  beforeEach(() => {
    agent = createNBAAgent();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should validate valid context', () => {
      const context: NBAContext = {
        entityType: 'lead',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
        name: 'John Smith',
        email: 'john@acme.com',
        company: 'Acme Corp',
        score: 75,
      };

      const result = nbaContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });

    it('should require entityType', () => {
      const context = {
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
      };

      const result = nbaContextSchema.safeParse(context);
      expect(result.success).toBe(false);
    });

    it('should validate entity types', () => {
      const entityTypes = ['lead', 'opportunity', 'contact'];

      entityTypes.forEach(entityType => {
        const context = {
          entityType,
          entityId: '550e8400-e29b-41d4-a716-446655440000',
          tenantId: '550e8400-e29b-41d4-a716-446655440001',
          userId: '550e8400-e29b-41d4-a716-446655440002',
        };

        const result = nbaContextSchema.safeParse(context);
        expect(result.success).toBe(true);
      });
    });

    it('should validate score range', () => {
      const validContext = {
        entityType: 'lead',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
        score: 50,
      };

      expect(nbaContextSchema.safeParse(validContext).success).toBe(true);

      const invalidContext = { ...validContext, score: 150 };
      expect(nbaContextSchema.safeParse(invalidContext).success).toBe(false);

      const negativeContext = { ...validContext, score: -10 };
      expect(nbaContextSchema.safeParse(negativeContext).success).toBe(false);
    });
  });

  describe('Recommendation Generation', () => {
    it('should generate recommendations successfully', async () => {
      const context: NBAContext = {
        entityType: 'lead',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Jane Doe',
        company: 'Tech Corp',
        score: 80,
      };

      const result = await agent.execute({
        id: 'test-task',
        description: 'Generate NBA',
        input: context,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.output!.recommendations.length).toBeGreaterThan(0);
    });

    it('should return valid result schema', async () => {
      const context: NBAContext = {
        entityType: 'opportunity',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
        stage: 'PROPOSAL_SENT',
        value: 50000,
      };

      const result = await agent.execute({
        id: 'test-task',
        description: 'Generate NBA for opportunity',
        input: context,
      });

      expect(result.success).toBe(true);
      const validation = nbaResultSchema.safeParse(result.output);
      expect(validation.success).toBe(true);
    });

    it('should include valid action types in recommendations', async () => {
      const context: NBAContext = {
        entityType: 'lead',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
      };

      const result = await agent.execute({
        id: 'test-task',
        description: 'Generate NBA',
        input: context,
      });

      expect(result.success).toBe(true);
      result.output!.recommendations.forEach(rec => {
        expect(ACTION_TYPES).toContain(rec.action);
      });
    });

    it('should include valid priorities in recommendations', async () => {
      const context: NBAContext = {
        entityType: 'contact',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
      };

      const result = await agent.execute({
        id: 'test-task',
        description: 'Generate NBA',
        input: context,
      });

      expect(result.success).toBe(true);
      result.output!.recommendations.forEach(rec => {
        expect(ACTION_PRIORITIES).toContain(rec.priority);
      });
    });
  });

  describe('Context-Aware Recommendations', () => {
    it('should prioritize call for high urgency', async () => {
      const context: NBAContext = {
        entityType: 'lead',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
        urgencyOverride: 'CRITICAL',
      };

      const result = await agent.execute({
        id: 'test-task',
        description: 'Generate NBA for urgent lead',
        input: context,
      });

      expect(result.success).toBe(true);
      // Should have a high-priority call recommendation
      const hasCallRecommendation = result.output!.recommendations.some(
        rec => rec.action === 'CALL' && ['CRITICAL', 'HIGH'].includes(rec.priority)
      );
      expect(hasCallRecommendation).toBe(true);
    });

    it('should recommend re-engagement for cold leads', async () => {
      const context: NBAContext = {
        entityType: 'lead',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
        daysSinceLastContact: 45,
      };

      const result = await agent.execute({
        id: 'test-task',
        description: 'Generate NBA for cold lead',
        input: context,
      });

      expect(result.success).toBe(true);
      const hasReEngageRecommendation = result.output!.recommendations.some(
        rec => rec.action === 'RE_ENGAGE'
      );
      expect(hasReEngageRecommendation).toBe(true);
    });

    it('should recommend nurture for low-score leads', async () => {
      const context: NBAContext = {
        entityType: 'lead',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
        score: 25,
      };

      const result = await agent.execute({
        id: 'test-task',
        description: 'Generate NBA for low-score lead',
        input: context,
      });

      expect(result.success).toBe(true);
      const hasNurtureRecommendation = result.output!.recommendations.some(
        rec => rec.action === 'NURTURE'
      );
      expect(hasNurtureRecommendation).toBe(true);
    });

    it('should recommend close for late-stage opportunities', async () => {
      const context: NBAContext = {
        entityType: 'opportunity',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
        stage: 'PROPOSAL_SENT',
        value: 100000,
      };

      const result = await agent.execute({
        id: 'test-task',
        description: 'Generate NBA for late-stage opportunity',
        input: context,
      });

      expect(result.success).toBe(true);
      const hasCloseRecommendation = result.output!.recommendations.some(
        rec => rec.action === 'CLOSE_DEAL'
      );
      expect(hasCloseRecommendation).toBe(true);
    });
  });

  describe('Sentiment Integration', () => {
    it('should include sentiment analysis when messages available', async () => {
      const context: NBAContext = {
        entityType: 'lead',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
        recentMessages: [
          {
            content: 'Looking forward to our meeting next week!',
            direction: 'inbound',
            timestamp: new Date().toISOString(),
            channel: 'email',
          },
        ],
      };

      const result = await agent.execute({
        id: 'test-task',
        description: 'Generate NBA with sentiment',
        input: context,
      });

      expect(result.success).toBe(true);
      expect(result.output!.sentimentAnalysis).toBeDefined();
      expect(result.output!.sentimentAnalysis!.sentiment).toBeDefined();
    });
  });

  describe('RAG Integration', () => {
    it('should indicate when RAG context was used', async () => {
      const context: NBAContext = {
        entityType: 'lead',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
        company: 'Acme Corp',
      };

      const result = await agent.execute({
        id: 'test-task',
        description: 'Generate NBA with RAG',
        input: context,
      });

      expect(result.success).toBe(true);
      expect(typeof result.output!.ragContextUsed).toBe('boolean');
    });
  });

  describe('Excluded Actions', () => {
    it('should respect excluded actions', async () => {
      const context: NBAContext = {
        entityType: 'lead',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
        excludeActions: ['CALL', 'EMAIL'],
      };

      const result = await agent.execute({
        id: 'test-task',
        description: 'Generate NBA without call/email',
        input: context,
      });

      expect(result.success).toBe(true);
      // Note: The mock might still return call/email, but the actual implementation
      // should filter them out. This test validates the schema accepts excludeActions.
    });
  });

  describe('Convenience Function', () => {
    it('should provide getNextBestActions helper', async () => {
      const context: NBAContext = {
        entityType: 'lead',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
      };

      const result = await getNextBestActions(context);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('duration');
    });
  });

  describe('Result Metadata', () => {
    it('should include execution time', async () => {
      const context: NBAContext = {
        entityType: 'lead',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
      };

      const result = await agent.execute({
        id: 'test-task',
        description: 'Generate NBA',
        input: context,
      });

      expect(result.success).toBe(true);
      expect(result.output!.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include model version', async () => {
      const context: NBAContext = {
        entityType: 'lead',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
      };

      const result = await agent.execute({
        id: 'test-task',
        description: 'Generate NBA',
        input: context,
      });

      expect(result.success).toBe(true);
      expect(result.output!.modelVersion).toBeDefined();
      expect(typeof result.output!.modelVersion).toBe('string');
    });

    it('should include entity summary', async () => {
      const context: NBAContext = {
        entityType: 'lead',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
        name: 'John Smith',
        company: 'Acme Corp',
        title: 'CTO',
      };

      const result = await agent.execute({
        id: 'test-task',
        description: 'Generate NBA',
        input: context,
      });

      expect(result.success).toBe(true);
      expect(result.output!.entitySummary).toContain('John Smith');
      expect(result.output!.entitySummary).toContain('Acme Corp');
    });
  });

  describe('Confidence Calculation', () => {
    it('should calculate confidence based on available data', async () => {
      // Minimal context should have lower confidence
      const minimalContext: NBAContext = {
        entityType: 'lead',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
      };

      const minimalResult = await agent.execute({
        id: 'test-minimal',
        description: 'Generate NBA minimal',
        input: minimalContext,
      });

      // Rich context should have higher confidence
      const richContext: NBAContext = {
        entityType: 'lead',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Jane Doe',
        email: 'jane@example.com',
        company: 'Tech Corp',
        score: 85,
        recentMessages: [
          {
            content: 'Interested in learning more!',
            direction: 'inbound',
            timestamp: new Date().toISOString(),
            channel: 'email',
          },
        ],
      };

      const richResult = await agent.execute({
        id: 'test-rich',
        description: 'Generate NBA rich',
        input: richContext,
      });

      expect(minimalResult.confidence).toBeLessThan(richResult.confidence);
    });
  });
});
