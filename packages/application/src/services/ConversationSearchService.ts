/**
 * Conversation Search Service (IFC-148)
 *
 * Provides search capabilities for conversation records:
 * - Text-based search with filters
 * - Semantic search using pgvector embeddings
 * - Context-based lookups (by case, lead, contact, etc.)
 * - GDPR-compliant data export
 *
 * Security: All operations enforce tenant isolation
 */

import { Result } from '@intelliflow/domain';
import { NotFoundError, ValidationError } from '../errors';

// ============================================
// TYPES & INTERFACES
// ============================================

/**
 * Search parameters for conversation queries
 */
export interface ConversationSearchParams {
  tenantId: string;
  query?: string;
  userId?: string;
  agentId?: string;
  contextType?: 'lead' | 'contact' | 'deal' | 'ticket' | 'case' | 'general';
  contextId?: string;
  channel?: 'WEB_CHAT' | 'MOBILE_APP' | 'API' | 'SLACK' | 'TEAMS' | 'EMAIL' | 'VOICE';
  status?: 'ACTIVE' | 'PAUSED' | 'ENDED' | 'ARCHIVED';
  startDate?: Date;
  endDate?: Date;
  hasToolCalls?: boolean;
  wasEscalated?: boolean;
  minRating?: number;
  limit?: number;
  offset?: number;
}

/**
 * Individual search result
 */
export interface ConversationSearchResult {
  conversationId: string;
  sessionId: string;
  title: string | null;
  summary: string | null;
  userId: string;
  userName: string | null;
  agentId: string | null;
  agentName: string | null;
  contextType: string | null;
  contextId: string | null;
  contextName: string | null;
  channel: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  messageCount: number;
  toolCallCount: number;
  userRating: number | null;
  wasEscalated: boolean;
  relevanceScore?: number;
}

/**
 * Paginated search response
 */
export interface ConversationSearchResponse {
  results: ConversationSearchResult[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  durationMs: number;
}

/**
 * Conversation with full details (messages and tool calls)
 */
export interface ConversationWithDetails {
  id: string;
  sessionId: string;
  tenantId: string;
  userId: string;
  userName: string | null;
  agentId: string | null;
  agentName: string | null;
  agentModel: string | null;
  title: string | null;
  summary: string | null;
  contextType: string | null;
  contextId: string | null;
  contextName: string | null;
  channel: string;
  status: string;
  messageCount: number;
  toolCallCount: number;
  tokenCountInput: number;
  tokenCountOutput: number;
  estimatedCost: number | null;
  userRating: number | null;
  feedbackText: string | null;
  wasEscalated: boolean;
  escalatedTo: string | null;
  escalatedAt: Date | null;
  startedAt: Date;
  lastMessageAt: Date | null;
  endedAt: Date | null;
  messages: MessageDetails[];
  toolCalls: ToolCallDetails[];
}

export interface MessageDetails {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  contentType: string;
  modelUsed: string | null;
  tokenCount: number | null;
  confidence: number | null;
  createdAt: Date;
  isEdited: boolean;
  attachments: unknown[] | null;
}

export interface ToolCallDetails {
  id: string;
  toolName: string;
  toolType: string;
  status: string;
  inputParameters: Record<string, unknown>;
  outputResult: Record<string, unknown> | null;
  errorMessage: string | null;
  durationMs: number | null;
  requiresApproval: boolean;
  approvalStatus: string | null;
  affectedEntity: string | null;
  changeDescription: string | null;
  isReversible: boolean;
  wasRolledBack: boolean;
  startedAt: Date;
  completedAt: Date | null;
}

/**
 * Semantic search parameters
 */
export interface SemanticSearchParams {
  tenantId: string;
  queryEmbedding: number[];
  limit?: number;
  offset?: number;
  minSimilarity?: number;
}

/**
 * Repository port for conversation data access
 */
export interface ConversationRepositoryPort {
  findById(id: string, tenantId: string): Promise<ConversationWithDetails | null>;
  findBySessionId(sessionId: string, tenantId: string): Promise<ConversationWithDetails | null>;
  search(params: ConversationSearchParams): Promise<{ conversations: ConversationSearchResult[]; total: number }>;
  searchByEmbedding(params: SemanticSearchParams): Promise<ConversationSearchResult[]>;
  findByContext(contextType: string, contextId: string, tenantId: string): Promise<ConversationSearchResult[]>;
  exportUserConversations(userId: string, tenantId: string): Promise<ConversationWithDetails[]>;
}

/**
 * Embedding service port for semantic search
 */
export interface EmbeddingServicePort {
  generateEmbedding(text: string): Promise<number[]>;
}

// ============================================
// SERVICE IMPLEMENTATION
// ============================================

/**
 * Conversation Search Service
 *
 * Provides comprehensive search and retrieval capabilities
 * for AI conversation records with tenant isolation.
 */
export class ConversationSearchService {
  constructor(
    private readonly conversationRepository: ConversationRepositoryPort,
    private readonly embeddingService?: EmbeddingServicePort
  ) {}

  /**
   * Get a conversation by ID with full details
   */
  async getConversationById(
    conversationId: string,
    tenantId: string
  ): Promise<Result<ConversationWithDetails, Error>> {
    if (!conversationId || !tenantId) {
      return Result.fail(new ValidationError('conversationId and tenantId are required'));
    }

    const conversation = await this.conversationRepository.findById(conversationId, tenantId);

    if (!conversation) {
      return Result.fail(new NotFoundError(`Conversation not found: ${conversationId}`));
    }

    return Result.ok(conversation);
  }

  /**
   * Get a conversation by session ID
   */
  async getConversationBySessionId(
    sessionId: string,
    tenantId: string
  ): Promise<Result<ConversationWithDetails, Error>> {
    if (!sessionId || !tenantId) {
      return Result.fail(new ValidationError('sessionId and tenantId are required'));
    }

    const conversation = await this.conversationRepository.findBySessionId(sessionId, tenantId);

    if (!conversation) {
      return Result.fail(new NotFoundError(`Conversation not found with session: ${sessionId}`));
    }

    return Result.ok(conversation);
  }

  /**
   * Search conversations with filters (text-based)
   */
  async searchConversations(
    params: ConversationSearchParams
  ): Promise<Result<ConversationSearchResponse, Error>> {
    const startTime = Date.now();

    if (!params.tenantId) {
      return Result.fail(new ValidationError('tenantId is required'));
    }

    // Set defaults
    const searchParams: ConversationSearchParams = {
      ...params,
      limit: Math.min(params.limit || 20, 100),
      offset: params.offset || 0,
    };

    try {
      const { conversations, total } = await this.conversationRepository.search(searchParams);

      const durationMs = Date.now() - startTime;

      return Result.ok({
        results: conversations,
        total,
        limit: searchParams.limit!,
        offset: searchParams.offset!,
        hasMore: searchParams.offset! + conversations.length < total,
        durationMs,
      });
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error('Search failed')
      );
    }
  }

  /**
   * Semantic search using vector embeddings
   * Requires embedding service to be configured
   */
  async semanticSearch(
    query: string,
    tenantId: string,
    options?: { limit?: number; offset?: number; minSimilarity?: number }
  ): Promise<Result<ConversationSearchResponse, Error>> {
    const startTime = Date.now();

    if (!this.embeddingService) {
      return Result.fail(new ValidationError('Semantic search not configured: embedding service required'));
    }

    if (!query || !tenantId) {
      return Result.fail(new ValidationError('query and tenantId are required'));
    }

    try {
      // Generate embedding for query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // Search by embedding
      const results = await this.conversationRepository.searchByEmbedding({
        tenantId,
        queryEmbedding,
        limit: options?.limit || 20,
        offset: options?.offset || 0,
        minSimilarity: options?.minSimilarity || 0.5,
      });

      const durationMs = Date.now() - startTime;

      return Result.ok({
        results,
        total: results.length, // Semantic search doesn't provide exact total
        limit: options?.limit || 20,
        offset: options?.offset || 0,
        hasMore: results.length === (options?.limit || 20),
        durationMs,
      });
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error('Semantic search failed')
      );
    }
  }

  /**
   * Find conversations by context (case, lead, contact, etc.)
   */
  async findByContext(
    contextType: string,
    contextId: string,
    tenantId: string
  ): Promise<Result<ConversationSearchResult[], Error>> {
    if (!contextType || !contextId || !tenantId) {
      return Result.fail(new ValidationError('contextType, contextId, and tenantId are required'));
    }

    try {
      const conversations = await this.conversationRepository.findByContext(
        contextType,
        contextId,
        tenantId
      );

      return Result.ok(conversations);
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error('Context search failed')
      );
    }
  }

  /**
   * Export all conversations for a user (DSAR access request)
   */
  async exportUserConversations(
    userId: string,
    tenantId: string
  ): Promise<Result<ConversationWithDetails[], Error>> {
    if (!userId || !tenantId) {
      return Result.fail(new ValidationError('userId and tenantId are required'));
    }

    try {
      const conversations = await this.conversationRepository.exportUserConversations(
        userId,
        tenantId
      );

      return Result.ok(conversations);
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error('Export failed')
      );
    }
  }

  /**
   * Get conversation statistics for analytics
   */
  async getConversationStats(
    tenantId: string,
    options?: { startDate?: Date; endDate?: Date }
  ): Promise<
    Result<
      {
        totalConversations: number;
        activeConversations: number;
        avgMessagesPerConversation: number;
        avgRating: number | null;
        escalationRate: number;
        topAgents: Array<{ agentId: string; agentName: string; count: number }>;
        byChannel: Array<{ channel: string; count: number }>;
        byContextType: Array<{ contextType: string; count: number }>;
      },
      Error
    >
  > {
    // This would typically be implemented in the repository
    // For now, return a stub that the repository would implement
    return Result.fail(new Error('Statistics endpoint should be implemented in repository'));
  }
}
