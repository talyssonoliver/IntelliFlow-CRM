/**
 * RAG Context Chain Tests (IFC-039)
 *
 * Tests for the Retrieval-Augmented Generation context chain.
 * Tests both mock fallback mode and real RetrievalService integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RAGContextChain,
  createRAGContextChain,
  ragContextInputSchema,
  ragContextResultSchema,
  type RAGContextInput,
  type IRetrievalService,
} from './rag-context.chain';

// Mock the embedding chain
vi.mock('./embedding.chain', () => ({
  embeddingChain: {
    generateEmbedding: vi.fn().mockResolvedValue({
      vector: new Array(1536).fill(0.1),
      dimensions: 1536,
      model: 'text-embedding-3-small',
      text: 'test query',
    }),
    getStats: vi.fn().mockReturnValue({
      model: 'text-embedding-3-small',
      dimensions: 1536,
    }),
  },
  EmbeddingChain: vi.fn(),
}));

describe('RAGContextChain', () => {
  let chain: RAGContextChain;

  beforeEach(() => {
    // Use mock fallback for unit tests
    chain = new RAGContextChain(undefined, undefined, { useMockFallback: true });
  });

  describe('Input Validation', () => {
    it('should validate valid input', () => {
      const input: RAGContextInput = {
        query: 'How to handle objection about pricing?',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        userRoles: [],
        sources: ['documents', 'notes'],
        maxResults: 5,
        minRelevance: 0.7,
        searchType: 'hybrid',
      };

      const result = ragContextInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty query', () => {
      const input = {
        query: '',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = ragContextInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should apply defaults for optional fields', () => {
      const input = {
        query: 'test query',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = ragContextInputSchema.parse(input);
      expect(result.sources).toEqual(['documents', 'notes']);
      expect(result.maxResults).toBe(5);
      expect(result.minRelevance).toBe(0.7);
      expect(result.contextWindow).toBe('7d');
      expect(result.searchType).toBe('hybrid');
      expect(result.userRoles).toEqual([]);
    });

    it('should reject invalid UUID for tenantId', () => {
      const input = {
        query: 'test query',
        tenantId: 'invalid-uuid',
        userId: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = ragContextInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should accept all valid search types', () => {
      const searchTypes = ['fulltext', 'semantic', 'hybrid'] as const;

      for (const searchType of searchTypes) {
        const input = {
          query: 'test query',
          tenantId: '550e8400-e29b-41d4-a716-446655440000',
          userId: '550e8400-e29b-41d4-a716-446655440001',
          searchType,
        };

        const result = ragContextInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Context Retrieval (Mock Mode)', () => {
    it('should retrieve context successfully', async () => {
      const input: RAGContextInput = {
        query: 'How to close a deal?',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        userRoles: [],
        sources: ['documents', 'notes'],
        maxResults: 5,
        minRelevance: 0.7,
        contextWindow: '7d',
        searchType: 'hybrid',
      };

      const result = await chain.retrieveContext(input);

      expect(result.success).toBe(true);
      expect(result.query).toBe(input.query);
      expect(Array.isArray(result.context)).toBe(true);
      expect(result.executionTimeMs).toBeGreaterThan(0);
      expect(result.searchType).toBe('hybrid');
    });

    it('should return context items with required fields', async () => {
      const input: RAGContextInput = {
        query: 'Sales best practices',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        userRoles: [],
        sources: ['documents', 'notes'],
        maxResults: 5,
        minRelevance: 0.5, // Lower threshold to get results
        contextWindow: '7d',
        searchType: 'hybrid',
      };

      const result = await chain.retrieveContext(input);

      if (result.context.length > 0) {
        const item = result.context[0];
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('source');
        expect(item).toHaveProperty('title');
        expect(item).toHaveProperty('content');
        expect(item).toHaveProperty('relevanceScore');
        expect(item).toHaveProperty('citation');
        expect(item).toHaveProperty('metadata');
        expect(item.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(item.relevanceScore).toBeLessThanOrEqual(1);
      }
    });

    it('should filter by minimum relevance', async () => {
      const input: RAGContextInput = {
        query: 'test query',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        userRoles: [],
        sources: ['documents', 'notes'],
        maxResults: 5,
        minRelevance: 0.9, // High threshold
        contextWindow: '7d',
        searchType: 'hybrid',
      };

      const result = await chain.retrieveContext(input);

      result.context.forEach(item => {
        expect(item.relevanceScore).toBeGreaterThanOrEqual(0.9);
      });
    });

    it('should respect maxResults limit', async () => {
      const input: RAGContextInput = {
        query: 'test query',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        userRoles: [],
        sources: ['documents', 'notes'],
        maxResults: 1,
        minRelevance: 0.5,
        contextWindow: '7d',
        searchType: 'hybrid',
      };

      const result = await chain.retrieveContext(input);

      expect(result.context.length).toBeLessThanOrEqual(1);
    });

    it('should mark mock items with isMock metadata', async () => {
      const input: RAGContextInput = {
        query: 'test query',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        userRoles: [],
        sources: ['documents', 'notes'],
        maxResults: 5,
        minRelevance: 0.5,
        contextWindow: '7d',
        searchType: 'hybrid',
      };

      const result = await chain.retrieveContext(input);

      if (result.context.length > 0) {
        expect(result.context[0].metadata).toHaveProperty('isMock', true);
      }
    });
  });

  describe('RetrievalService Integration', () => {
    it('should use real RetrievalService when provided', async () => {
      const mockRetrievalService: IRetrievalService = {
        search: vi.fn().mockResolvedValue({
          results: [
            {
              id: 'real-doc-001',
              source: 'documents',
              title: 'Real Document',
              content: 'Real content from pgvector search',
              snippet: 'Real <b>content</b> from pgvector',
              relevanceScore: 0.95,
              metadata: { realData: true },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          total: 1,
          query: 'test query',
          searchType: 'hybrid',
          executionTimeMs: 45,
        }),
      };

      const chainWithService = createRAGContextChain(mockRetrievalService);

      const input: RAGContextInput = {
        query: 'test query',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        userRoles: ['sales'],
        sources: ['documents'],
        maxResults: 5,
        minRelevance: 0.7,
        contextWindow: '7d',
        searchType: 'hybrid',
      };

      const result = await chainWithService.retrieveContext(input);

      expect(mockRetrievalService.search).toHaveBeenCalledWith({
        tenantId: input.tenantId,
        userId: input.userId,
        userRoles: ['sales'],
        query: input.query,
        sources: ['documents'],
        searchType: 'hybrid',
        limit: 5,
        offset: 0,
        semanticThreshold: 0.7,
        minRelevanceScore: 0.7,
      });

      expect(result.success).toBe(true);
      expect(result.context.length).toBe(1);
      expect(result.context[0].id).toBe('real-doc-001');
      expect(result.context[0].metadata).toHaveProperty('realData', true);
    });

    it('should throw error in production mode without RetrievalService', async () => {
      const chainNoMock = new RAGContextChain(undefined, undefined, { useMockFallback: false });

      const input: RAGContextInput = {
        query: 'test query',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        userRoles: [],
        sources: ['documents'],
        maxResults: 5,
        minRelevance: 0.7,
        contextWindow: '7d',
        searchType: 'hybrid',
      };

      const result = await chainNoMock.retrieveContext(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('RetrievalService not configured');
    });

    it('should allow lazy setting of RetrievalService', async () => {
      const chainLazy = new RAGContextChain(undefined, undefined, { useMockFallback: false });

      const mockRetrievalService: IRetrievalService = {
        search: vi.fn().mockResolvedValue({
          results: [],
          total: 0,
          query: 'test',
          searchType: 'hybrid',
          executionTimeMs: 10,
        }),
      };

      chainLazy.setRetrievalService(mockRetrievalService);

      const input: RAGContextInput = {
        query: 'test query',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        userRoles: [],
        sources: ['documents'],
        maxResults: 5,
        minRelevance: 0.7,
        contextWindow: '7d',
        searchType: 'hybrid',
      };

      const result = await chainLazy.retrieveContext(input);

      expect(result.success).toBe(true);
      expect(mockRetrievalService.search).toHaveBeenCalled();
    });
  });

  describe('Output Validation', () => {
    it('should return valid result schema', async () => {
      const input: RAGContextInput = {
        query: 'test query',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        userRoles: [],
        sources: ['documents', 'notes'],
        maxResults: 5,
        minRelevance: 0.7,
        contextWindow: '7d',
        searchType: 'hybrid',
      };

      const result = await chain.retrieveContext(input);
      const validation = ragContextResultSchema.safeParse(result);

      expect(validation.success).toBe(true);
    });

    it('should calculate average relevance correctly', async () => {
      const input: RAGContextInput = {
        query: 'test query',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        userRoles: [],
        sources: ['documents', 'notes'],
        maxResults: 5,
        minRelevance: 0.5,
        contextWindow: '7d',
        searchType: 'hybrid',
      };

      const result = await chain.retrieveContext(input);

      if (result.context.length > 0) {
        const manualAvg = result.context.reduce((sum, c) => sum + c.relevanceScore, 0) / result.context.length;
        expect(result.avgRelevance).toBeCloseTo(manualAvg, 2);
      }
    });

    it('should include searchType in result', async () => {
      const searchTypes = ['fulltext', 'semantic', 'hybrid'] as const;

      for (const searchType of searchTypes) {
        const input: RAGContextInput = {
          query: 'test query',
          tenantId: '550e8400-e29b-41d4-a716-446655440000',
          userId: '550e8400-e29b-41d4-a716-446655440001',
          userRoles: [],
          sources: ['documents', 'notes'],
          maxResults: 5,
          minRelevance: 0.5,
          contextWindow: '7d',
          searchType,
        };

        const result = await chain.retrieveContext(input);
        expect(result.searchType).toBe(searchType);
      }
    });
  });

  describe('Context Formatting', () => {
    it('should format context for prompt injection', () => {
      const mockContext = [
        {
          id: 'doc-1',
          source: 'documents',
          title: 'Sales Guide',
          content: 'Always qualify leads before presenting.',
          snippet: 'Always <b>qualify</b> leads before presenting.',
          relevanceScore: 0.9,
          metadata: {},
          citation: '[Sales Guide, Documents, 2026-01-20]',
          retrievedAt: new Date().toISOString(),
        },
      ];

      const formatted = chain.formatContextForPrompt(mockContext);

      expect(formatted).toContain('RETRIEVED CONTEXT');
      expect(formatted).toContain('Sales Guide');
      expect(formatted).toContain('Always qualify leads');
      expect(formatted).toContain('[Sales Guide, Documents, 2026-01-20]');
      expect(formatted).toContain('90%'); // Relevance percentage
    });

    it('should include snippet in formatted output when available', () => {
      const mockContext = [
        {
          id: 'doc-1',
          source: 'documents',
          title: 'Sales Guide',
          content: 'Full content here.',
          snippet: 'Highlighted <b>snippet</b> here.',
          relevanceScore: 0.9,
          metadata: {},
          citation: '[Sales Guide]',
          retrievedAt: new Date().toISOString(),
        },
      ];

      const formatted = chain.formatContextForPrompt(mockContext);

      expect(formatted).toContain('Snippet: Highlighted <b>snippet</b> here.');
    });

    it('should handle empty context', () => {
      const formatted = chain.formatContextForPrompt([]);
      expect(formatted).toBe('No relevant context found.');
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', async () => {
      const input = {
        query: 'test',
        tenantId: 'invalid', // Invalid UUID will cause validation error
        userId: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = await chain.retrieveContext(input as any);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.context).toEqual([]);
    });

    it('should handle RetrievalService errors gracefully', async () => {
      const failingService: IRetrievalService = {
        search: vi.fn().mockRejectedValue(new Error('Database connection failed')),
      };

      const chainWithFailingService = createRAGContextChain(failingService);

      const input: RAGContextInput = {
        query: 'test query',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        userRoles: [],
        sources: ['documents'],
        maxResults: 5,
        minRelevance: 0.7,
        contextWindow: '7d',
        searchType: 'hybrid',
      };

      const result = await chainWithFailingService.retrieveContext(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
    });
  });

  describe('Statistics', () => {
    it('should return chain statistics', () => {
      const stats = chain.getStats();

      expect(stats).toHaveProperty('embeddingModel');
      expect(stats).toHaveProperty('embeddingDimensions');
      expect(stats).toHaveProperty('hasRetrievalService');
      expect(stats).toHaveProperty('useMockFallback');
      expect(stats.embeddingDimensions).toBe(1536);
      expect(stats.hasRetrievalService).toBe(false);
      expect(stats.useMockFallback).toBe(true);
    });

    it('should reflect RetrievalService status in stats', () => {
      const mockService: IRetrievalService = {
        search: vi.fn(),
      };

      const chainWithService = createRAGContextChain(mockService);
      const stats = chainWithService.getStats();

      expect(stats.hasRetrievalService).toBe(true);
    });
  });

  describe('Factory Function', () => {
    it('should create chain with createRAGContextChain', () => {
      const chain = createRAGContextChain(undefined, undefined, { useMockFallback: true });
      expect(chain).toBeInstanceOf(RAGContextChain);
    });

    it('should create chain with all dependencies', () => {
      const mockService: IRetrievalService = { search: vi.fn() };
      const chain = createRAGContextChain(mockService, undefined, { useMockFallback: false });

      const stats = chain.getStats();
      expect(stats.hasRetrievalService).toBe(true);
      expect(stats.useMockFallback).toBe(false);
    });
  });
});
