import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddingChain, embeddingInputSchema } from './embedding.chain';

describe('EmbeddingChain', () => {
  let embeddingChain: EmbeddingChain;

  beforeEach(() => {
    // Mock environment variables
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.EMBEDDING_MODEL = 'text-embedding-3-small';
    process.env.EMBEDDING_DIMENSIONS = '1536';

    embeddingChain = new EmbeddingChain();
  });

  describe('embeddingInputSchema', () => {
    it('should validate valid input', () => {
      const validInput = {
        text: 'This is a test document for embedding generation',
        metadata: { source: 'test' },
      };

      expect(() => embeddingInputSchema.parse(validInput)).not.toThrow();
    });

    it('should reject empty text', () => {
      const invalidInput = {
        text: '',
      };

      expect(() => embeddingInputSchema.parse(invalidInput)).toThrow();
    });

    it('should reject text that is too long', () => {
      const invalidInput = {
        text: 'a'.repeat(10000),
      };

      expect(() => embeddingInputSchema.parse(invalidInput)).toThrow();
    });

    it('should allow optional metadata', () => {
      const validInput = {
        text: 'Test document',
      };

      expect(() => embeddingInputSchema.parse(validInput)).not.toThrow();
    });
  });

  describe('calculateSimilarity', () => {
    it('should calculate cosine similarity correctly', () => {
      const vector1 = [1, 0, 0];
      const vector2 = [1, 0, 0];

      const similarity = embeddingChain.calculateSimilarity(vector1, vector2);

      expect(similarity).toBe(1); // Identical vectors
    });

    it('should return 0 for orthogonal vectors', () => {
      const vector1 = [1, 0, 0];
      const vector2 = [0, 1, 0];

      const similarity = embeddingChain.calculateSimilarity(vector1, vector2);

      expect(similarity).toBeCloseTo(0);
    });

    it('should return -1 for opposite vectors', () => {
      const vector1 = [1, 0, 0];
      const vector2 = [-1, 0, 0];

      const similarity = embeddingChain.calculateSimilarity(vector1, vector2);

      expect(similarity).toBeCloseTo(-1);
    });

    it('should throw error for vectors of different dimensions', () => {
      const vector1 = [1, 0, 0];
      const vector2 = [1, 0];

      expect(() => embeddingChain.calculateSimilarity(vector1, vector2)).toThrow(
        'Vectors must have the same dimensions'
      );
    });

    it('should handle normalized vectors', () => {
      const vector1 = [0.6, 0.8, 0];
      const vector2 = [0.8, 0.6, 0];

      const similarity = embeddingChain.calculateSimilarity(vector1, vector2);

      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });
  });

  describe('chunkText', () => {
    it('should chunk text correctly without overlap', () => {
      const text = 'a'.repeat(100);
      const chunks = (embeddingChain as any).chunkText(text, 30, 0);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].length).toBe(30);
    });

    it('should handle text smaller than chunk size', () => {
      const text = 'Small text';
      const chunks = (embeddingChain as any).chunkText(text, 100, 0);

      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe(text);
    });

    it('should create overlapping chunks', () => {
      const text = 'a'.repeat(100);
      const chunkSize = 30;
      const overlap = 10;
      const chunks = (embeddingChain as any).chunkText(text, chunkSize, overlap);

      expect(chunks.length).toBeGreaterThan(0);
      // Each chunk should be the specified size (except possibly the last one)
      expect(chunks[0].length).toBe(chunkSize);
    });
  });

  describe('formatForPgvector', () => {
    it('should format vector array as pgvector string', () => {
      const vector = [0.1, 0.2, 0.3, 0.4];
      const formatted = embeddingChain.formatForPgvector(vector);

      expect(formatted).toBe('[0.1,0.2,0.3,0.4]');
    });

    it('should handle negative values', () => {
      const vector = [-0.1, 0.2, -0.3, 0.4];
      const formatted = embeddingChain.formatForPgvector(vector);

      expect(formatted).toBe('[-0.1,0.2,-0.3,0.4]');
    });

    it('should handle large vectors', () => {
      const vector = new Array(1536).fill(0.1);
      const formatted = embeddingChain.formatForPgvector(vector);

      expect(formatted).toContain('[');
      expect(formatted).toContain(']');
      expect(formatted.split(',').length).toBe(1536);
    });
  });

  describe('parseFromPgvector', () => {
    it('should parse pgvector string to array', () => {
      const pgvectorString = '[0.1,0.2,0.3,0.4]';
      const parsed = embeddingChain.parseFromPgvector(pgvectorString);

      expect(parsed).toEqual([0.1, 0.2, 0.3, 0.4]);
    });

    it('should handle negative values', () => {
      const pgvectorString = '[-0.1,0.2,-0.3,0.4]';
      const parsed = embeddingChain.parseFromPgvector(pgvectorString);

      expect(parsed).toEqual([-0.1, 0.2, -0.3, 0.4]);
    });

    it('should handle spaces in pgvector string', () => {
      const pgvectorString = '[0.1, 0.2, 0.3, 0.4]';
      const parsed = embeddingChain.parseFromPgvector(pgvectorString);

      expect(parsed).toEqual([0.1, 0.2, 0.3, 0.4]);
    });
  });

  describe('getStats', () => {
    it('should return embedding configuration', () => {
      const stats = embeddingChain.getStats();

      expect(stats).toHaveProperty('model');
      expect(stats).toHaveProperty('dimensions');
      expect(stats.model).toBe('text-embedding-3-small');
      expect(stats.dimensions).toBe(1536);
    });
  });

  describe('Integration scenarios', () => {
    it('should round-trip pgvector formatting', () => {
      const originalVector = [0.1, 0.2, 0.3, 0.4, 0.5];
      const formatted = embeddingChain.formatForPgvector(originalVector);
      const parsed = embeddingChain.parseFromPgvector(formatted);

      expect(parsed).toEqual(originalVector);
    });

    it('should maintain vector properties after formatting', () => {
      const vector = [0.6, 0.8];
      const formatted = embeddingChain.formatForPgvector(vector);
      const parsed = embeddingChain.parseFromPgvector(formatted);

      // Check magnitude is preserved
      const originalMagnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
      const parsedMagnitude = Math.sqrt(parsed.reduce((sum, val) => sum + val * val, 0));

      expect(parsedMagnitude).toBeCloseTo(originalMagnitude);
    });
  });
});
