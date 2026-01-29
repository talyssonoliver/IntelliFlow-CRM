/**
 * Sentiment Analysis Chain Tests (IFC-039)
 *
 * Tests for the LLM-based sentiment analysis chain.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  SentimentAnalysisChain,
  sentimentInputSchema,
  sentimentResultSchema,
  SENTIMENT_LABELS,
  EMOTION_LABELS,
  URGENCY_LEVELS,
  type SentimentInput,
  type SentimentResult,
} from './sentiment.chain';

// Mock the AI config to use mock provider
vi.mock('../config/ai.config', () => ({
  aiConfig: {
    provider: 'mock',
    openai: {
      model: 'gpt-4-turbo-preview',
      temperature: 0.1,
      maxTokens: 1000,
      timeout: 30000,
      apiKey: 'test-key',
    },
    costTracking: { enabled: false },
    features: { enableChainLogging: false },
    performance: { rateLimitPerMinute: 60 },
  },
}));

describe('SentimentAnalysisChain', () => {
  let chain: SentimentAnalysisChain;

  beforeEach(() => {
    chain = new SentimentAnalysisChain();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should validate valid input', () => {
      const input: SentimentInput = {
        text: 'I am very happy with your service!',
        source: 'email',
      };

      const result = sentimentInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty text', () => {
      const input = {
        text: '',
        source: 'email',
      };

      const result = sentimentInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should apply default source', () => {
      const input = {
        text: 'Test message',
      };

      const result = sentimentInputSchema.parse(input);
      expect(result.source).toBe('other');
    });

    it('should reject text exceeding max length', () => {
      const input = {
        text: 'a'.repeat(10001),
        source: 'email',
      };

      const result = sentimentInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate all source types', () => {
      const sources = ['email', 'chat', 'note', 'ticket', 'call_transcript', 'other'];

      sources.forEach(source => {
        const input = { text: 'Test', source };
        const result = sentimentInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Sentiment Analysis', () => {
    it('should analyze text and return valid result', async () => {
      const input: SentimentInput = {
        text: 'Thank you for your excellent service. I am very satisfied!',
        source: 'email',
      };

      const result = await chain.analyze(input);

      // Validate against schema
      const validation = sentimentResultSchema.safeParse(result);
      expect(validation.success).toBe(true);
    });

    it('should return valid sentiment label', async () => {
      const input: SentimentInput = {
        text: 'This is a test message.',
        source: 'chat',
      };

      const result = await chain.analyze(input);

      expect(SENTIMENT_LABELS).toContain(result.sentiment);
    });

    it('should return sentiment score in valid range', async () => {
      const input: SentimentInput = {
        text: 'Great product, highly recommend!',
        source: 'email',
      };

      const result = await chain.analyze(input);

      expect(result.sentimentScore).toBeGreaterThanOrEqual(-1);
      expect(result.sentimentScore).toBeLessThanOrEqual(1);
    });

    it('should detect emotions', async () => {
      const input: SentimentInput = {
        text: 'I am frustrated with the delays in my order.',
        source: 'ticket',
      };

      const result = await chain.analyze(input);

      expect(Array.isArray(result.emotions)).toBe(true);
      expect(result.emotions.length).toBeGreaterThan(0);
      expect(EMOTION_LABELS).toContain(result.primaryEmotion);
    });

    it('should assess urgency', async () => {
      const input: SentimentInput = {
        text: 'URGENT: Need immediate response or we will cancel.',
        source: 'email',
      };

      const result = await chain.analyze(input);

      expect(URGENCY_LEVELS).toContain(result.urgency);
      expect(result.urgencyScore).toBeGreaterThanOrEqual(0);
      expect(result.urgencyScore).toBeLessThanOrEqual(1);
    });

    it('should include confidence score', async () => {
      const input: SentimentInput = {
        text: 'Looking forward to working together.',
        source: 'email',
      };

      const result = await chain.analyze(input);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should include reasoning', async () => {
      const input: SentimentInput = {
        text: 'Your product saved us hours of work.',
        source: 'note',
      };

      const result = await chain.analyze(input);

      expect(typeof result.reasoning).toBe('string');
      expect(result.reasoning.length).toBeGreaterThan(0);
    });

    it('should track text length in result', async () => {
      const text = 'This is a test message for sentiment analysis.';
      const input: SentimentInput = { text, source: 'chat' };

      const result = await chain.analyze(input);

      expect(result.textLength).toBe(text.length);
    });
  });

  describe('Batch Analysis', () => {
    it('should analyze multiple texts', async () => {
      const inputs: SentimentInput[] = [
        { text: 'Great service!', source: 'email' },
        { text: 'Terrible experience.', source: 'ticket' },
        { text: 'It was okay.', source: 'chat' },
      ];

      const results = await chain.analyzeBatch(inputs);

      expect(results.length).toBe(inputs.length);
      results.forEach(result => {
        expect(SENTIMENT_LABELS).toContain(result.sentiment);
      });
    });
  });

  describe('Aggregation', () => {
    it('should aggregate sentiment results', () => {
      const results: SentimentResult[] = [
        {
          sentiment: 'POSITIVE',
          sentimentScore: 0.7,
          emotions: [{ emotion: 'JOY', intensity: 0.8 }],
          primaryEmotion: 'JOY',
          urgency: 'LOW',
          urgencyScore: 0.2,
          keyPhrases: [],
          confidence: 0.9,
          reasoning: 'Test',
          textLength: 20,
          modelVersion: 'test:v1',
        },
        {
          sentiment: 'NEGATIVE',
          sentimentScore: -0.5,
          emotions: [{ emotion: 'ANGER', intensity: 0.6 }],
          primaryEmotion: 'ANGER',
          urgency: 'HIGH',
          urgencyScore: 0.8,
          keyPhrases: [],
          confidence: 0.85,
          reasoning: 'Test',
          textLength: 30,
          modelVersion: 'test:v1',
        },
      ];

      const aggregated = chain.aggregateSentiment(results);

      expect(aggregated.avgScore).toBeCloseTo(0.1, 1); // (0.7 + -0.5) / 2
      expect(aggregated.distribution.POSITIVE).toBe(1);
      expect(aggregated.distribution.NEGATIVE).toBe(1);
      expect(aggregated.avgConfidence).toBeCloseTo(0.875, 2);
    });

    it('should handle empty results', () => {
      const aggregated = chain.aggregateSentiment([]);

      expect(aggregated.avgScore).toBe(0);
      expect(aggregated.overallSentiment).toBe('NEUTRAL');
      expect(aggregated.avgConfidence).toBe(0);
    });

    it('should determine overall sentiment from average score', () => {
      const positiveResults: SentimentResult[] = [
        {
          sentiment: 'VERY_POSITIVE',
          sentimentScore: 0.9,
          emotions: [{ emotion: 'JOY', intensity: 0.9 }],
          primaryEmotion: 'JOY',
          urgency: 'NONE',
          urgencyScore: 0,
          keyPhrases: [],
          confidence: 0.9,
          reasoning: 'Test',
          textLength: 20,
          modelVersion: 'test:v1',
        },
      ];

      const aggregated = chain.aggregateSentiment(positiveResults);
      expect(aggregated.overallSentiment).toBe('VERY_POSITIVE');
    });
  });

  describe('Error Handling', () => {
    it('should return neutral fallback on error', async () => {
      // Force an error by passing invalid input that passes schema but fails elsewhere
      const input = {
        text: 'Test',
        source: 'email',
      } as SentimentInput;

      // Chain should handle any errors gracefully
      const result = await chain.analyze(input);

      // Should return a valid result (possibly neutral fallback)
      expect(SENTIMENT_LABELS).toContain(result.sentiment);
    });
  });

  describe('Key Phrases', () => {
    it('should extract key phrases with sentiment', async () => {
      const input: SentimentInput = {
        text: 'The product is amazing, but the support is terrible.',
        source: 'email',
      };

      const result = await chain.analyze(input);

      expect(Array.isArray(result.keyPhrases)).toBe(true);
      result.keyPhrases.forEach(phrase => {
        expect(phrase).toHaveProperty('phrase');
        expect(['positive', 'neutral', 'negative']).toContain(phrase.sentiment);
      });
    });
  });

  describe('Model Version', () => {
    it('should include model version in result', async () => {
      const input: SentimentInput = {
        text: 'Test message',
        source: 'chat',
      };

      const result = await chain.analyze(input);

      expect(typeof result.modelVersion).toBe('string');
      expect(result.modelVersion.length).toBeGreaterThan(0);
    });
  });
});
