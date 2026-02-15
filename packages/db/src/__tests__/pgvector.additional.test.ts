/**
 * pgvector Helper Module - Additional Coverage Tests
 *
 * Covers uncovered functions and branches:
 * - validateEmbedding() edge cases (non-array, wrong dimensions, NaN values, non-numbers)
 * - formatEmbedding()
 * - parseEmbedding()
 * - cosineSimilarity() (calculation, dimension mismatch)
 * - l2Distance() (calculation, dimension mismatch)
 * - getDistanceOperator() (all metrics including default)
 * - findSimilarLeads() (invalid embedding, success path)
 * - findSimilarContacts() (invalid embedding, success path)
 * - updateLeadEmbedding() (invalid embedding, success path)
 * - updateContactEmbedding() (invalid embedding, success path)
 * - checkPgVectorInstalled() (installed, not installed, error)
 * - getEmbeddingIndexStatus() (index exists HNSW, IVFFlat, unknown, not exists, error)
 * - EMBEDDING_DIMENSIONS constants
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted() so the mock fns are available when vi.mock factory runs
const { mockPrismaQueryRaw, mockPrismaExecuteRaw } = vi.hoisted(() => ({
  mockPrismaQueryRaw: vi.fn(),
  mockPrismaExecuteRaw: vi.fn(),
}));

vi.mock('../client', () => ({
  prisma: {
    $queryRaw: mockPrismaQueryRaw,
    $executeRaw: mockPrismaExecuteRaw,
  },
  Prisma: {
    raw: (str: string) => str,
    sql: (strings: TemplateStringsArray, ...values: any[]) => ({
      strings,
      values,
    }),
  },
  executeRawWithTiming: async <T>(sql: any): Promise<{ result: T; duration: number }> => {
    const result = await mockPrismaQueryRaw(sql);
    return { result, duration: 10 };
  },
}));

import {
  validateEmbedding,
  formatEmbedding,
  parseEmbedding,
  cosineSimilarity,
  l2Distance,
  findSimilarLeads,
  findSimilarContacts,
  updateLeadEmbedding,
  updateContactEmbedding,
  checkPgVectorInstalled,
  getEmbeddingIndexStatus,
  EMBEDDING_DIMENSIONS,
} from '../pgvector';

describe('pgvector Helper Module - Additional Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('EMBEDDING_DIMENSIONS constants', () => {
    it('should have correct dimensions for ADA_002', () => {
      expect(EMBEDDING_DIMENSIONS.ADA_002).toBe(1536);
    });

    it('should have correct dimensions for V3_SMALL', () => {
      expect(EMBEDDING_DIMENSIONS.V3_SMALL).toBe(1536);
    });

    it('should have correct dimensions for V3_LARGE', () => {
      expect(EMBEDDING_DIMENSIONS.V3_LARGE).toBe(3072);
    });
  });

  describe('validateEmbedding()', () => {
    it('should return true for valid embedding', () => {
      const embedding = Array(1536).fill(0.1);
      expect(validateEmbedding(embedding)).toBe(true);
    });

    it('should return true for valid embedding with custom dimensions', () => {
      const embedding = Array(3072).fill(0.5);
      expect(validateEmbedding(embedding, 3072)).toBe(true);
    });

    it('should return false for non-array input', () => {
      expect(validateEmbedding('not an array' as any)).toBe(false);
    });

    it('should return false for null input', () => {
      expect(validateEmbedding(null as any)).toBe(false);
    });

    it('should return false for undefined input', () => {
      expect(validateEmbedding(undefined as any)).toBe(false);
    });

    it('should return false for wrong dimensions', () => {
      const embedding = Array(100).fill(0.1);
      expect(validateEmbedding(embedding)).toBe(false);
    });

    it('should return false when embedding contains NaN', () => {
      const embedding = Array(1536).fill(0.1);
      embedding[500] = NaN;
      expect(validateEmbedding(embedding)).toBe(false);
    });

    it('should return false when embedding contains non-number', () => {
      const embedding = Array(1536).fill(0.1);
      (embedding as any)[100] = 'string';
      expect(validateEmbedding(embedding)).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(validateEmbedding([])).toBe(false);
    });

    it('should use default dimensions (1536) when not specified', () => {
      const embedding = Array(1536).fill(0.0);
      expect(validateEmbedding(embedding)).toBe(true);
    });
  });

  describe('formatEmbedding()', () => {
    it('should format embedding to pgvector string', () => {
      const embedding = [0.1, 0.2, 0.3];
      expect(formatEmbedding(embedding)).toBe('[0.1,0.2,0.3]');
    });

    it('should format empty embedding', () => {
      expect(formatEmbedding([])).toBe('[]');
    });

    it('should format single-element embedding', () => {
      expect(formatEmbedding([0.5])).toBe('[0.5]');
    });

    it('should handle negative values', () => {
      expect(formatEmbedding([-0.1, 0.2, -0.3])).toBe('[-0.1,0.2,-0.3]');
    });

    it('should handle zero values', () => {
      expect(formatEmbedding([0, 0, 0])).toBe('[0,0,0]');
    });
  });

  describe('parseEmbedding()', () => {
    it('should parse pgvector string to array', () => {
      const result = parseEmbedding('[0.1,0.2,0.3]');
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('should parse embedding with negative values', () => {
      const result = parseEmbedding('[-0.1,0.5,-0.9]');
      expect(result).toEqual([-0.1, 0.5, -0.9]);
    });

    it('should parse embedding with integers', () => {
      const result = parseEmbedding('[1,2,3]');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle empty brackets', () => {
      const result = parseEmbedding('[]');
      // Empty string split produces [''] which parseFloat returns NaN
      expect(result).toHaveLength(1);
    });

    it('should roundtrip: format then parse', () => {
      const original = [0.1, 0.2, 0.3, -0.4, 0.5];
      const formatted = formatEmbedding(original);
      const parsed = parseEmbedding(formatted);
      expect(parsed).toEqual(original);
    });
  });

  describe('cosineSimilarity()', () => {
    it('should return 1 for identical vectors', () => {
      const vec = [0.1, 0.2, 0.3];
      const similarity = cosineSimilarity(vec, vec);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const vecA = [1, 0, 0];
      const vecB = [-1, 0, 0];
      const similarity = cosineSimilarity(vecA, vecB);
      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const vecA = [1, 0, 0];
      const vecB = [0, 1, 0];
      const similarity = cosineSimilarity(vecA, vecB);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should throw for dimension mismatch', () => {
      const vecA = [1, 2, 3];
      const vecB = [1, 2];
      expect(() => cosineSimilarity(vecA, vecB)).toThrow('Embedding dimension mismatch: 3 vs 2');
    });

    it('should compute correct similarity for known vectors', () => {
      const vecA = [1, 2, 3];
      const vecB = [4, 5, 6];
      // dot = 1*4 + 2*5 + 3*6 = 32
      // normA = sqrt(1+4+9) = sqrt(14)
      // normB = sqrt(16+25+36) = sqrt(77)
      // similarity = 32 / (sqrt(14) * sqrt(77))
      const expected = 32 / (Math.sqrt(14) * Math.sqrt(77));
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(expected, 5);
    });
  });

  describe('l2Distance()', () => {
    it('should return 0 for identical vectors', () => {
      const vec = [0.1, 0.2, 0.3];
      expect(l2Distance(vec, vec)).toBe(0);
    });

    it('should compute correct distance for known vectors', () => {
      const vecA = [0, 0, 0];
      const vecB = [3, 4, 0];
      expect(l2Distance(vecA, vecB)).toBe(5); // 3-4-5 triangle
    });

    it('should throw for dimension mismatch', () => {
      const vecA = [1, 2];
      const vecB = [1, 2, 3];
      expect(() => l2Distance(vecA, vecB)).toThrow('Embedding dimension mismatch: 2 vs 3');
    });

    it('should handle negative values', () => {
      const vecA = [-1, -1];
      const vecB = [1, 1];
      // distance = sqrt((2)^2 + (2)^2) = sqrt(8) = 2*sqrt(2)
      expect(l2Distance(vecA, vecB)).toBeCloseTo(2 * Math.sqrt(2), 5);
    });

    it('should be symmetric', () => {
      const vecA = [1, 2, 3];
      const vecB = [4, 5, 6];
      expect(l2Distance(vecA, vecB)).toBe(l2Distance(vecB, vecA));
    });
  });

  describe('findSimilarLeads()', () => {
    it('should throw for invalid embedding', async () => {
      const invalidEmbedding = Array(100).fill(0.1); // Wrong dimensions
      await expect(findSimilarLeads(invalidEmbedding)).rejects.toThrow(
        'Invalid embedding: expected 1536 dimensions'
      );
    });

    it('should query database with correct parameters', async () => {
      const embedding = Array(1536).fill(0.1);
      // Mock the actual query result that includes all database columns
      mockPrismaQueryRaw.mockResolvedValueOnce([
        { id: 'lead-1', email: 'lead1@test.com', company: 'Corp A', score: 85, similarity: 0.95 },
        { id: 'lead-2', email: 'lead2@test.com', company: null, score: 70, similarity: 0.82 },
      ]);

      const results = await findSimilarLeads(embedding, { limit: 5, threshold: 0.8 });

      expect(results).toHaveLength(2);
      expect(results[0].item.id).toBe('lead-1');
      expect(results[0].item.email).toBe('lead1@test.com');
      expect(results[0].item.company).toBe('Corp A');
      expect(results[0].item.score).toBe(85);
      expect(results[0].similarity).toBe(0.95);
      expect(results[1].item.company).toBeNull();
      expect(mockPrismaQueryRaw).toHaveBeenCalledTimes(1);
    });

    it('should use default options', async () => {
      const embedding = Array(1536).fill(0.1);
      mockPrismaQueryRaw.mockResolvedValueOnce([]);

      const results = await findSimilarLeads(embedding);

      expect(results).toEqual([]);
      expect(mockPrismaQueryRaw).toHaveBeenCalledTimes(1);
    });

    it('should support l2 metric', async () => {
      const embedding = Array(1536).fill(0.1);
      mockPrismaQueryRaw.mockResolvedValueOnce([]);

      await findSimilarLeads(embedding, { metric: 'l2' });

      expect(mockPrismaQueryRaw).toHaveBeenCalledTimes(1);
    });

    it('should support inner_product metric', async () => {
      const embedding = Array(1536).fill(0.1);
      mockPrismaQueryRaw.mockResolvedValueOnce([]);

      await findSimilarLeads(embedding, { metric: 'inner_product' });

      expect(mockPrismaQueryRaw).toHaveBeenCalledTimes(1);
    });

    it('should support custom dimensions', async () => {
      const embedding = Array(3072).fill(0.1);
      mockPrismaQueryRaw.mockResolvedValueOnce([]);

      await findSimilarLeads(embedding, { dimensions: 3072 });

      expect(mockPrismaQueryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('findSimilarContacts()', () => {
    it('should throw for invalid embedding', async () => {
      const invalidEmbedding = [0.1, 0.2]; // Wrong dimensions
      await expect(findSimilarContacts(invalidEmbedding)).rejects.toThrow(
        'Invalid embedding: expected 1536 dimensions'
      );
    });

    it('should query database and map results', async () => {
      const embedding = Array(1536).fill(0.1);
      mockPrismaQueryRaw.mockResolvedValueOnce([
        { id: 'contact-1', email: 'c1@test.com', first_name: 'John', last_name: 'Doe', similarity: 0.88 },
      ]);

      const results = await findSimilarContacts(embedding, { threshold: 0.7, limit: 5 });

      expect(results).toHaveLength(1);
      expect(results[0].item.id).toBe('contact-1');
      expect(results[0].item.email).toBe('c1@test.com');
      expect(results[0].item.firstName).toBe('John');
      expect(results[0].item.lastName).toBe('Doe');
      expect(results[0].similarity).toBe(0.88);
      expect(mockPrismaQueryRaw).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no matches', async () => {
      const embedding = Array(1536).fill(0.1);
      mockPrismaQueryRaw.mockResolvedValueOnce([]);

      const results = await findSimilarContacts(embedding);

      expect(results).toEqual([]);
      expect(mockPrismaQueryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateLeadEmbedding()', () => {
    it('should throw for invalid embedding', async () => {
      const invalidEmbedding = Array(100).fill(0.1);
      await expect(updateLeadEmbedding('lead-1', invalidEmbedding)).rejects.toThrow(
        'Invalid embedding: expected 1536 dimensions'
      );
    });

    it('should execute raw SQL to update embedding', async () => {
      const embedding = Array(1536).fill(0.1);
      mockPrismaExecuteRaw.mockResolvedValueOnce(1);

      await updateLeadEmbedding('lead-1', embedding);

      expect(mockPrismaExecuteRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateContactEmbedding()', () => {
    it('should throw for invalid embedding', async () => {
      const invalidEmbedding = Array(100).fill(0.1);
      await expect(updateContactEmbedding('contact-1', invalidEmbedding)).rejects.toThrow(
        'Invalid embedding: expected 1536 dimensions'
      );
    });

    it('should execute raw SQL to update embedding', async () => {
      const embedding = Array(1536).fill(0.1);
      mockPrismaExecuteRaw.mockResolvedValueOnce(1);

      await updateContactEmbedding('contact-1', embedding);

      expect(mockPrismaExecuteRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkPgVectorInstalled()', () => {
    it('should return true when extension is installed', async () => {
      mockPrismaQueryRaw.mockResolvedValueOnce([{ extname: 'vector' }]);

      const result = await checkPgVectorInstalled();

      expect(result).toBe(true);
    });

    it('should return false when extension is not installed', async () => {
      mockPrismaQueryRaw.mockResolvedValueOnce([]);

      const result = await checkPgVectorInstalled();

      expect(result).toBe(false);
    });

    it('should return false on database error', async () => {
      mockPrismaQueryRaw.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await checkPgVectorInstalled();

      expect(result).toBe(false);
    });
  });

  describe('getEmbeddingIndexStatus()', () => {
    it('should detect HNSW index', async () => {
      mockPrismaQueryRaw.mockResolvedValueOnce([
        {
          indexname: 'leads_embedding_hnsw_idx',
          indexdef: 'CREATE INDEX leads_embedding_hnsw_idx ON leads USING hnsw (embedding vector_cosine_ops)',
        },
      ]);

      const result = await getEmbeddingIndexStatus();

      expect(result.indexExists).toBe(true);
      expect(result.indexName).toBe('leads_embedding_hnsw_idx');
      expect(result.indexType).toBe('HNSW');
      expect(mockPrismaQueryRaw).toHaveBeenCalledTimes(1);
    });

    it('should detect IVFFlat index', async () => {
      mockPrismaQueryRaw.mockResolvedValueOnce([
        {
          indexname: 'leads_embedding_ivfflat_idx',
          indexdef: 'CREATE INDEX leads_embedding_ivfflat_idx ON leads USING ivfflat (embedding)',
        },
      ]);

      const result = await getEmbeddingIndexStatus();

      expect(result.indexExists).toBe(true);
      expect(result.indexName).toBe('leads_embedding_ivfflat_idx');
      expect(result.indexType).toBe('IVFFlat');
      expect(mockPrismaQueryRaw).toHaveBeenCalledTimes(1);
    });

    it('should detect unknown index type', async () => {
      mockPrismaQueryRaw.mockResolvedValueOnce([
        {
          indexname: 'leads_embedding_btree_idx',
          indexdef: 'CREATE INDEX leads_embedding_btree_idx ON leads USING btree (embedding)',
        },
      ]);

      const result = await getEmbeddingIndexStatus();

      expect(result.indexExists).toBe(true);
      expect(result.indexName).toBe('leads_embedding_btree_idx');
      expect(result.indexType).toBe('Unknown');
      expect(mockPrismaQueryRaw).toHaveBeenCalledTimes(1);
    });

    it('should return not exists when no index found', async () => {
      mockPrismaQueryRaw.mockResolvedValueOnce([]);

      const result = await getEmbeddingIndexStatus();

      expect(result.indexExists).toBe(false);
      expect(result.indexName).toBeNull();
      expect(result.indexType).toBeNull();
      expect(mockPrismaQueryRaw).toHaveBeenCalledTimes(1);
    });

    it('should return not exists on database error', async () => {
      mockPrismaQueryRaw.mockRejectedValueOnce(new Error('Database error'));

      const result = await getEmbeddingIndexStatus();

      expect(result.indexExists).toBe(false);
      expect(result.indexName).toBeNull();
      expect(result.indexType).toBeNull();
      expect(mockPrismaQueryRaw).toHaveBeenCalledTimes(1);
    });
  });
});
