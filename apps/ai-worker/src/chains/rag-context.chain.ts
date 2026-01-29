/**
 * RAG Context Retrieval Chain (IFC-039)
 *
 * Provides Retrieval-Augmented Generation for contextual AI responses.
 * Integrates with RetrievalService for real pgvector semantic search.
 *
 * Features:
 * - Semantic document retrieval from pgvector via RetrievalService
 * - Hybrid search (FTS + semantic) with RRF ranking
 * - Context window management
 * - Source citation tracking
 * - Confidence scoring for retrieved context
 * - ACL-enforced permissioned search
 *
 * @module chains/rag-context
 */

import { z } from 'zod';
import { EmbeddingChain, embeddingChain } from './embedding.chain';
import pino from 'pino';

const logger = pino({
  name: 'rag-context-chain',
  level: process.env.LOG_LEVEL || 'info',
});

// =============================================================================
// Types & Schemas
// =============================================================================

/**
 * Valid source types for RAG retrieval
 */
export const RAG_SOURCES = [
  'leads',
  'contacts',
  'accounts',
  'opportunities',
  'documents',
  'notes',
  'conversations',
] as const;

export type RAGSource = (typeof RAG_SOURCES)[number];

/**
 * RAG context input schema
 */
export const ragContextInputSchema = z.object({
  query: z.string().min(1).max(4000),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  userRoles: z.array(z.string()).optional().default([]),
  sources: z.array(z.enum(RAG_SOURCES)).optional().default(['documents', 'notes']),
  maxResults: z.number().min(1).max(20).optional().default(5),
  minRelevance: z.number().min(0).max(1).optional().default(0.7),
  contextWindow: z.enum(['24h', '7d', '30d', 'all']).optional().default('7d'),
  searchType: z.enum(['fulltext', 'semantic', 'hybrid']).optional().default('hybrid'),
});

export type RAGContextInput = z.infer<typeof ragContextInputSchema>;

/**
 * Retrieved context item
 */
export const contextItemSchema = z.object({
  id: z.string(),
  source: z.string(),
  title: z.string(),
  content: z.string(),
  snippet: z.string().optional(),
  relevanceScore: z.number().min(0).max(1),
  metadata: z.record(z.unknown()),
  citation: z.string(),
  retrievedAt: z.string().datetime(),
});

export type ContextItem = z.infer<typeof contextItemSchema>;

/**
 * RAG context result
 */
export const ragContextResultSchema = z.object({
  query: z.string(),
  context: z.array(contextItemSchema),
  totalRetrieved: z.number(),
  avgRelevance: z.number(),
  contextTokens: z.number(),
  sources: z.array(z.string()),
  searchType: z.enum(['fulltext', 'semantic', 'hybrid']),
  executionTimeMs: z.number(),
  success: z.boolean(),
  error: z.string().optional(),
});

export type RAGContextResult = z.infer<typeof ragContextResultSchema>;

/**
 * RetrievalService interface for dependency injection
 * Matches the actual RetrievalService.search() signature
 */
export interface IRetrievalService {
  search(config: {
    tenantId: string;
    userId: string;
    userRoles?: string[];
    query: string;
    sources?: string[];
    searchType?: 'fulltext' | 'semantic' | 'hybrid';
    limit?: number;
    offset?: number;
    semanticThreshold?: number;
    minRelevanceScore?: number;
  }): Promise<{
    results: Array<{
      id: string;
      source: string;
      title: string;
      content: string;
      snippet: string;
      relevanceScore: number;
      metadata: Record<string, unknown>;
      createdAt: Date;
      updatedAt: Date;
    }>;
    total: number;
    query: string;
    searchType: 'fulltext' | 'semantic' | 'hybrid';
    executionTimeMs: number;
  }>;
}

// =============================================================================
// RAG Context Chain
// =============================================================================

/**
 * RAG Context Retrieval Chain
 *
 * Retrieves relevant context from the knowledge base for AI-augmented responses.
 * Uses RetrievalService for real pgvector semantic search with ACL enforcement.
 */
export class RAGContextChain {
  private embeddingChain: EmbeddingChain;
  private retrievalService: IRetrievalService | null;
  private useMockFallback: boolean;

  constructor(
    customEmbeddingChain?: EmbeddingChain,
    retrievalService?: IRetrievalService,
    options?: { useMockFallback?: boolean }
  ) {
    this.embeddingChain = customEmbeddingChain || embeddingChain;
    this.retrievalService = retrievalService || null;
    this.useMockFallback = options?.useMockFallback ?? (process.env.NODE_ENV === 'test');

    logger.info(
      {
        hasRetrievalService: !!this.retrievalService,
        useMockFallback: this.useMockFallback,
      },
      'RAG Context Chain initialized'
    );
  }

  /**
   * Set the retrieval service (for lazy initialization)
   */
  setRetrievalService(service: IRetrievalService): void {
    this.retrievalService = service;
    logger.info('RetrievalService connected to RAG chain');
  }

  /**
   * Retrieve relevant context for a query
   */
  async retrieveContext(input: RAGContextInput): Promise<RAGContextResult> {
    const startTime = Date.now();

    try {
      logger.info(
        {
          query: input.query.slice(0, 100),
          sources: input.sources,
          maxResults: input.maxResults,
          searchType: input.searchType,
        },
        'Starting context retrieval'
      );

      // Validate input
      const validatedInput = ragContextInputSchema.parse(input);

      // Perform retrieval
      const context = await this.performRetrieval(validatedInput);

      // Calculate aggregate metrics
      const avgRelevance = context.length > 0
        ? context.reduce((sum, c) => sum + c.relevanceScore, 0) / context.length
        : 0;

      const contextTokens = this.estimateTokens(context);

      const result: RAGContextResult = {
        query: validatedInput.query,
        context,
        totalRetrieved: context.length,
        avgRelevance,
        contextTokens,
        sources: [...new Set(context.map(c => c.source))],
        searchType: validatedInput.searchType,
        executionTimeMs: Date.now() - startTime,
        success: true,
      };

      logger.info(
        {
          totalRetrieved: result.totalRetrieved,
          avgRelevance: result.avgRelevance.toFixed(2),
          searchType: result.searchType,
          executionTimeMs: result.executionTimeMs,
        },
        'Context retrieval completed'
      );

      return result;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Context retrieval failed'
      );

      return {
        query: input.query,
        context: [],
        totalRetrieved: 0,
        avgRelevance: 0,
        contextTokens: 0,
        sources: [],
        searchType: input.searchType || 'hybrid',
        executionTimeMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Perform the actual retrieval using RetrievalService
   */
  private async performRetrieval(input: RAGContextInput): Promise<ContextItem[]> {
    // Use real RetrievalService if available
    if (this.retrievalService) {
      return this.performRealRetrieval(input);
    }

    // Fall back to mock only in test mode or if explicitly enabled
    if (this.useMockFallback) {
      logger.warn('Using mock retrieval - RetrievalService not configured');
      return this.performMockRetrieval(input);
    }

    // In production without RetrievalService, throw error
    throw new Error(
      'RetrievalService not configured. Call setRetrievalService() or provide in constructor.'
    );
  }

  /**
   * Perform real retrieval using RetrievalService with pgvector
   */
  private async performRealRetrieval(input: RAGContextInput): Promise<ContextItem[]> {
    if (!this.retrievalService) {
      throw new Error('RetrievalService not available');
    }

    logger.debug(
      {
        query: input.query.slice(0, 50),
        sources: input.sources,
        searchType: input.searchType,
      },
      'Executing real retrieval via RetrievalService'
    );

    // Call RetrievalService.search()
    const searchResult = await this.retrievalService.search({
      tenantId: input.tenantId,
      userId: input.userId,
      userRoles: input.userRoles,
      query: input.query,
      sources: input.sources,
      searchType: input.searchType,
      limit: input.maxResults,
      offset: 0,
      semanticThreshold: input.minRelevance,
      minRelevanceScore: input.minRelevance,
    });

    // Map RetrievalService results to ContextItem format
    const contextItems: ContextItem[] = searchResult.results
      .filter(r => r.relevanceScore >= input.minRelevance)
      .map(result => ({
        id: result.id,
        source: result.source,
        title: result.title,
        content: result.content,
        snippet: result.snippet,
        relevanceScore: result.relevanceScore,
        metadata: result.metadata,
        citation: this.buildCitation(result),
        retrievedAt: new Date().toISOString(),
      }));

    logger.debug(
      {
        resultsReturned: searchResult.results.length,
        resultsAfterFilter: contextItems.length,
        executionTimeMs: searchResult.executionTimeMs,
      },
      'Real retrieval completed'
    );

    return contextItems;
  }

  /**
   * Build citation string from search result
   */
  private buildCitation(result: {
    title: string;
    source: string;
    createdAt: Date;
    metadata: Record<string, unknown>;
  }): string {
    const date = result.createdAt.toISOString().split('T')[0];
    const sourceLabel = result.source.charAt(0).toUpperCase() + result.source.slice(1);

    // Add context from metadata if available
    const context = result.metadata.accountName
      ? `, ${result.metadata.accountName}`
      : result.metadata.contactName
        ? `, ${result.metadata.contactName}`
        : '';

    return `[${result.title}${context}, ${sourceLabel}, ${date}]`;
  }

  /**
   * Mock retrieval for testing only
   * @deprecated Use real RetrievalService in production
   */
  private async performMockRetrieval(input: RAGContextInput): Promise<ContextItem[]> {
    // Simulate database query delay
    await new Promise(resolve => setTimeout(resolve, 50));

    // Mock context items for testing
    const mockItems: ContextItem[] = [
      {
        id: 'mock-doc-001',
        source: 'documents',
        title: 'CRM Best Practices Guide',
        content: 'Effective CRM usage requires consistent data entry, regular follow-ups, and pipeline management...',
        snippet: '...consistent data entry, regular <b>follow-ups</b>, and pipeline management...',
        relevanceScore: 0.92,
        metadata: { type: 'guide', category: 'best-practices', isMock: true },
        citation: '[CRM Best Practices Guide, Documents, 2026-01-20]',
        retrievedAt: new Date().toISOString(),
      },
      {
        id: 'mock-note-042',
        source: 'notes',
        title: 'Customer meeting notes - Acme Corp',
        content: 'Discussed budget constraints and timeline. Decision maker is CFO. Follow up needed by Friday.',
        snippet: '...budget constraints and <b>timeline</b>. Decision maker is CFO...',
        relevanceScore: 0.85,
        metadata: { contactId: 'contact-123', accountId: 'account-456', isMock: true },
        citation: '[Customer meeting notes - Acme Corp, Notes, 2026-01-20]',
        retrievedAt: new Date().toISOString(),
      },
    ];

    // Filter by requested sources and relevance threshold
    return mockItems
      .filter(item => input.sources.includes(item.source as RAGSource))
      .filter(item => item.relevanceScore >= input.minRelevance)
      .slice(0, input.maxResults);
  }

  /**
   * Estimate token count for context (rough approximation)
   * ~4 chars per token for English text
   */
  private estimateTokens(context: ContextItem[]): number {
    const totalChars = context.reduce(
      (sum, item) => sum + item.content.length + item.title.length,
      0
    );
    return Math.ceil(totalChars / 4);
  }

  /**
   * Format context for LLM prompt injection
   */
  formatContextForPrompt(context: ContextItem[]): string {
    if (context.length === 0) {
      return 'No relevant context found.';
    }

    const formatted = context.map((item, index) => {
      const snippetLine = item.snippet ? `Snippet: ${item.snippet}\n` : '';
      return `[${index + 1}] ${item.title}
Source: ${item.source}
Relevance: ${(item.relevanceScore * 100).toFixed(0)}%
${snippetLine}${item.content}
Citation: ${item.citation}`;
    });

    return `RETRIEVED CONTEXT (${context.length} items):\n\n${formatted.join('\n\n---\n\n')}`;
  }

  /**
   * Get chain statistics
   */
  getStats(): {
    embeddingModel: string;
    embeddingDimensions: number;
    hasRetrievalService: boolean;
    useMockFallback: boolean;
  } {
    const embedStats = this.embeddingChain.getStats();
    return {
      embeddingModel: embedStats.model,
      embeddingDimensions: embedStats.dimensions,
      hasRetrievalService: !!this.retrievalService,
      useMockFallback: this.useMockFallback,
    };
  }
}

// =============================================================================
// Factory & Singleton Export
// =============================================================================

/**
 * Create a RAG context chain with optional dependencies
 */
export function createRAGContextChain(
  retrievalService?: IRetrievalService,
  embeddingChain?: EmbeddingChain,
  options?: { useMockFallback?: boolean }
): RAGContextChain {
  return new RAGContextChain(embeddingChain, retrievalService, options);
}

/**
 * Global RAG context chain instance (without RetrievalService - must be configured)
 * @deprecated Prefer createRAGContextChain() with explicit dependencies
 */
export const ragContextChain = new RAGContextChain(undefined, undefined, {
  useMockFallback: process.env.NODE_ENV === 'test',
});
