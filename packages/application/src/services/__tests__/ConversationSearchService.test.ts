/**
 * ConversationSearchService Tests
 *
 * Tests the ConversationSearchService application service which provides
 * search capabilities for conversation records including text-based search,
 * semantic search, and GDPR-compliant data export.
 *
 * Coverage target: >90% for application layer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConversationSearchService,
  ConversationRepositoryPort,
  EmbeddingServicePort,
  ConversationWithDetails,
  ConversationSearchResult,
} from '../ConversationSearchService';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockConversationRepo(): Record<string, any> {
  return {
    findById: vi.fn(),
    findBySessionId: vi.fn(),
    search: vi.fn(),
    searchByEmbedding: vi.fn(),
    findByContext: vi.fn(),
    exportUserConversations: vi.fn(),
  };
}

function createMockEmbeddingService(): Record<string, any> {
  return {
    generateEmbedding: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConversationDetails(overrides: Partial<ConversationWithDetails> = {}): ConversationWithDetails {
  return {
    id: 'conv-1',
    sessionId: 'session-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    userName: 'Test User',
    agentId: 'agent-1',
    agentName: 'Test Agent',
    agentModel: 'gpt-4',
    title: 'Test Conversation',
    summary: 'A test conversation',
    contextType: 'lead',
    contextId: 'lead-1',
    contextName: 'Test Lead',
    channel: 'WEB_CHAT',
    status: 'ENDED',
    messageCount: 5,
    toolCallCount: 1,
    tokenCountInput: 500,
    tokenCountOutput: 300,
    estimatedCost: 0.01,
    userRating: 4,
    feedbackText: 'Good',
    wasEscalated: false,
    escalatedTo: null,
    escalatedAt: null,
    startedAt: new Date('2025-01-01'),
    lastMessageAt: new Date('2025-01-01T01:00:00'),
    endedAt: new Date('2025-01-01T01:05:00'),
    messages: [],
    toolCalls: [],
    ...overrides,
  };
}

function makeSearchResult(overrides: Partial<ConversationSearchResult> = {}): ConversationSearchResult {
  return {
    conversationId: 'conv-1',
    sessionId: 'session-1',
    title: 'Test Conversation',
    summary: 'A test conversation',
    userId: 'user-1',
    userName: 'Test User',
    agentId: 'agent-1',
    agentName: 'Test Agent',
    contextType: 'lead',
    contextId: 'lead-1',
    contextName: 'Test Lead',
    channel: 'WEB_CHAT',
    status: 'ENDED',
    startedAt: new Date('2025-01-01'),
    endedAt: new Date('2025-01-01T01:05:00'),
    messageCount: 5,
    toolCallCount: 1,
    userRating: 4,
    wasEscalated: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConversationSearchService', () => {
  let service: ConversationSearchService;
  let conversationRepo: Record<string, any>;
  let embeddingService: Record<string, any>;

  beforeEach(() => {
    conversationRepo = createMockConversationRepo();
    embeddingService = createMockEmbeddingService();

    service = new ConversationSearchService(
      conversationRepo as ConversationRepositoryPort,
      embeddingService as EmbeddingServicePort,
    );
  });

  // =========================================================================
  // getConversationById
  // =========================================================================

  describe('getConversationById', () => {
    it('should return conversation when found', async () => {
      const conv = makeConversationDetails();
      conversationRepo.findById.mockResolvedValue(conv);

      const result = await service.getConversationById('conv-1', 'tenant-1');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toEqual(conv);
      expect(conversationRepo.findById).toHaveBeenCalledWith('conv-1', 'tenant-1');
    });

    it('should return failure when conversation not found', async () => {
      conversationRepo.findById.mockResolvedValue(null);

      const result = await service.getConversationById('missing', 'tenant-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Conversation not found');
    });

    it('should return failure when conversationId is empty', async () => {
      const result = await service.getConversationById('', 'tenant-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('conversationId and tenantId are required');
    });

    it('should return failure when tenantId is empty', async () => {
      const result = await service.getConversationById('conv-1', '');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('conversationId and tenantId are required');
    });
  });

  // =========================================================================
  // getConversationBySessionId
  // =========================================================================

  describe('getConversationBySessionId', () => {
    it('should return conversation when found by session id', async () => {
      const conv = makeConversationDetails();
      conversationRepo.findBySessionId.mockResolvedValue(conv);

      const result = await service.getConversationBySessionId('session-1', 'tenant-1');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toEqual(conv);
      expect(conversationRepo.findBySessionId).toHaveBeenCalledWith('session-1', 'tenant-1');
    });

    it('should return failure when not found', async () => {
      conversationRepo.findBySessionId.mockResolvedValue(null);

      const result = await service.getConversationBySessionId('missing', 'tenant-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Conversation not found with session');
    });

    it('should return failure when sessionId is empty', async () => {
      const result = await service.getConversationBySessionId('', 'tenant-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('sessionId and tenantId are required');
    });

    it('should return failure when tenantId is empty', async () => {
      const result = await service.getConversationBySessionId('session-1', '');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('sessionId and tenantId are required');
    });
  });

  // =========================================================================
  // searchConversations
  // =========================================================================

  describe('searchConversations', () => {
    it('should search conversations with default pagination', async () => {
      const searchResults = [makeSearchResult()];
      conversationRepo.search.mockResolvedValue({ conversations: searchResults, total: 1 });

      const result = await service.searchConversations({ tenantId: 'tenant-1' });

      expect(result.isSuccess).toBe(true);
      expect(result.value.results).toEqual(searchResults);
      expect(result.value.total).toBe(1);
      expect(result.value.limit).toBe(20);
      expect(result.value.offset).toBe(0);
      expect(result.value.hasMore).toBe(false);
      expect(typeof result.value.durationMs).toBe('number');
    });

    it('should cap limit at 100', async () => {
      conversationRepo.search.mockResolvedValue({ conversations: [], total: 0 });

      await service.searchConversations({ tenantId: 'tenant-1', limit: 500 });

      const searchParams = conversationRepo.search.mock.calls[0][0];
      expect(searchParams.limit).toBe(100);
    });

    it('should detect hasMore correctly', async () => {
      const searchResults = Array.from({ length: 20 }, (_, i) =>
        makeSearchResult({ conversationId: `conv-${i}` }),
      );
      conversationRepo.search.mockResolvedValue({ conversations: searchResults, total: 50 });

      const result = await service.searchConversations({ tenantId: 'tenant-1', limit: 20, offset: 0 });

      expect(result.value.hasMore).toBe(true);
    });

    it('should return failure when tenantId is missing', async () => {
      const result = await service.searchConversations({ tenantId: '' });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('tenantId is required');
    });

    it('should handle repository errors gracefully', async () => {
      conversationRepo.search.mockRejectedValue(new Error('DB error'));

      const result = await service.searchConversations({ tenantId: 'tenant-1' });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('DB error');
    });

    it('should handle non-Error throws', async () => {
      conversationRepo.search.mockRejectedValue('string error');

      const result = await service.searchConversations({ tenantId: 'tenant-1' });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Search failed');
    });

    it('should pass all filter parameters through', async () => {
      conversationRepo.search.mockResolvedValue({ conversations: [], total: 0 });

      await service.searchConversations({
        tenantId: 'tenant-1',
        query: 'test',
        userId: 'user-1',
        agentId: 'agent-1',
        contextType: 'lead',
        contextId: 'lead-1',
        channel: 'WEB_CHAT',
        status: 'ENDED',
        hasToolCalls: true,
        wasEscalated: false,
        minRating: 3,
      });

      const params = conversationRepo.search.mock.calls[0][0];
      expect(params.query).toBe('test');
      expect(params.userId).toBe('user-1');
      expect(params.agentId).toBe('agent-1');
      expect(params.contextType).toBe('lead');
      expect(params.channel).toBe('WEB_CHAT');
      expect(params.status).toBe('ENDED');
      expect(params.hasToolCalls).toBe(true);
      expect(params.wasEscalated).toBe(false);
      expect(params.minRating).toBe(3);
    });
  });

  // =========================================================================
  // semanticSearch
  // =========================================================================

  describe('semanticSearch', () => {
    it('should perform semantic search with embedding', async () => {
      const embedding = [0.1, 0.2, 0.3];
      embeddingService.generateEmbedding.mockResolvedValue(embedding);

      const searchResults = [makeSearchResult({ relevanceScore: 0.95 })];
      conversationRepo.searchByEmbedding.mockResolvedValue(searchResults);

      const result = await service.semanticSearch('test query', 'tenant-1');

      expect(result.isSuccess).toBe(true);
      expect(result.value.results).toEqual(searchResults);
      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith('test query');
      expect(conversationRepo.searchByEmbedding).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          queryEmbedding: embedding,
          limit: 20,
          offset: 0,
          minSimilarity: 0.5,
        }),
      );
    });

    it('should pass custom options', async () => {
      embeddingService.generateEmbedding.mockResolvedValue([0.1]);
      conversationRepo.searchByEmbedding.mockResolvedValue([]);

      await service.semanticSearch('query', 'tenant-1', {
        limit: 10,
        offset: 5,
        minSimilarity: 0.8,
      });

      expect(conversationRepo.searchByEmbedding).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 5,
          minSimilarity: 0.8,
        }),
      );
    });

    it('should return failure when embedding service is not configured', async () => {
      const serviceWithoutEmbedding = new ConversationSearchService(
        conversationRepo as ConversationRepositoryPort,
        // no embedding service
      );

      const result = await serviceWithoutEmbedding.semanticSearch('query', 'tenant-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Semantic search not configured');
    });

    it('should return failure when query is empty', async () => {
      const result = await service.semanticSearch('', 'tenant-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('query and tenantId are required');
    });

    it('should return failure when tenantId is empty', async () => {
      const result = await service.semanticSearch('query', '');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('query and tenantId are required');
    });

    it('should handle embedding service errors', async () => {
      embeddingService.generateEmbedding.mockRejectedValue(new Error('Embedding failed'));

      const result = await service.semanticSearch('query', 'tenant-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Embedding failed');
    });

    it('should handle non-Error throws in semantic search', async () => {
      embeddingService.generateEmbedding.mockRejectedValue('unknown error');

      const result = await service.semanticSearch('query', 'tenant-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Semantic search failed');
    });

    it('should detect hasMore when results equal limit', async () => {
      embeddingService.generateEmbedding.mockResolvedValue([0.1]);
      const results = Array.from({ length: 10 }, (_, i) =>
        makeSearchResult({ conversationId: `conv-${i}` }),
      );
      conversationRepo.searchByEmbedding.mockResolvedValue(results);

      const result = await service.semanticSearch('query', 'tenant-1', { limit: 10 });

      expect(result.value.hasMore).toBe(true);
    });

    it('should detect hasMore=false when results less than limit', async () => {
      embeddingService.generateEmbedding.mockResolvedValue([0.1]);
      conversationRepo.searchByEmbedding.mockResolvedValue([makeSearchResult()]);

      const result = await service.semanticSearch('query', 'tenant-1', { limit: 10 });

      expect(result.value.hasMore).toBe(false);
    });
  });

  // =========================================================================
  // findByContext
  // =========================================================================

  describe('findByContext', () => {
    it('should find conversations by context', async () => {
      const results = [makeSearchResult()];
      conversationRepo.findByContext.mockResolvedValue(results);

      const result = await service.findByContext('lead', 'lead-1', 'tenant-1');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toEqual(results);
      expect(conversationRepo.findByContext).toHaveBeenCalledWith('lead', 'lead-1', 'tenant-1');
    });

    it('should return failure when contextType is empty', async () => {
      const result = await service.findByContext('', 'lead-1', 'tenant-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('contextType, contextId, and tenantId are required');
    });

    it('should return failure when contextId is empty', async () => {
      const result = await service.findByContext('lead', '', 'tenant-1');

      expect(result.isFailure).toBe(true);
    });

    it('should return failure when tenantId is empty', async () => {
      const result = await service.findByContext('lead', 'lead-1', '');

      expect(result.isFailure).toBe(true);
    });

    it('should handle repository errors', async () => {
      conversationRepo.findByContext.mockRejectedValue(new Error('DB error'));

      const result = await service.findByContext('lead', 'lead-1', 'tenant-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('DB error');
    });

    it('should handle non-Error throws', async () => {
      conversationRepo.findByContext.mockRejectedValue('oops');

      const result = await service.findByContext('lead', 'lead-1', 'tenant-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Context search failed');
    });
  });

  // =========================================================================
  // exportUserConversations
  // =========================================================================

  describe('exportUserConversations', () => {
    it('should export all conversations for a user', async () => {
      const conversations = [makeConversationDetails()];
      conversationRepo.exportUserConversations.mockResolvedValue(conversations);

      const result = await service.exportUserConversations('user-1', 'tenant-1');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toEqual(conversations);
      expect(conversationRepo.exportUserConversations).toHaveBeenCalledWith('user-1', 'tenant-1');
    });

    it('should return failure when userId is empty', async () => {
      const result = await service.exportUserConversations('', 'tenant-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('userId and tenantId are required');
    });

    it('should return failure when tenantId is empty', async () => {
      const result = await service.exportUserConversations('user-1', '');

      expect(result.isFailure).toBe(true);
    });

    it('should handle repository errors', async () => {
      conversationRepo.exportUserConversations.mockRejectedValue(new Error('Export DB error'));

      const result = await service.exportUserConversations('user-1', 'tenant-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Export DB error');
    });

    it('should handle non-Error throws', async () => {
      conversationRepo.exportUserConversations.mockRejectedValue(42);

      const result = await service.exportUserConversations('user-1', 'tenant-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Export failed');
    });
  });

  // =========================================================================
  // getConversationStats
  // =========================================================================

  describe('getConversationStats', () => {
    it('should return failure (stub implementation)', async () => {
      const result = await service.getConversationStats('tenant-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Statistics endpoint should be implemented in repository');
    });

    it('should accept optional options', async () => {
      const result = await service.getConversationStats('tenant-1', {
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-02-01'),
      });

      expect(result.isFailure).toBe(true);
    });
  });
});
