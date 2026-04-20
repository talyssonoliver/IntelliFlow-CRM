/**
 * PrismaConversationSearchRepository (IFC-148)
 *
 * Replaces the stub ConversationRepositoryPort that was wired in container.ts.
 * All queries enforce tenantId isolation — every WHERE clause includes tenantId.
 *
 * Deferred (MVP scope):
 *   searchByEmbedding — returns [] with a TODO comment.
 *   Embedding search requires a separate ingestion pipeline to store
 *   conversation embeddings in pgvector; out of scope for Sprint 17 MVP.
 */

import { type PrismaClient, Prisma } from '@intelliflow/db';
import type {
  ConversationRepositoryPort,
  ConversationWithDetails,
  ConversationSearchParams,
  ConversationSearchResult,
  SemanticSearchParams,
  MessageDetails,
  ToolCallDetails,
} from '@intelliflow/application';

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

/**
 * Coerce an unknown DB/mock value into a Date. Returns a new Date() when the
 * value is missing — used for required datetime columns (startedAt etc.).
 */
function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value == null) return new Date();
  return new Date(value as string);
}

/**
 * Coerce an unknown DB/mock value into a Date or null when absent. Used for
 * optional datetime columns (endedAt, completedAt, lastMessageAt, escalatedAt).
 */
function toOptionalDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  return new Date(value as string);
}

/**
 * Map a raw Prisma ConversationRecord row (with includes) to
 * ConversationWithDetails.  The `row` parameter is typed as `any` because
 * Prisma's generated `include` types are not stable across client regenerations
 * and the test suite mocks them with plain objects.
 */
function toConversationWithDetails(row: Record<string, unknown>): ConversationWithDetails {
  const messages: MessageDetails[] = Array.isArray(row.messages)
    ? (row.messages as Record<string, unknown>[]).map((m) => ({
        id: m.id as string,
        role: m.role as 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL',
        content: m.content as string,
        contentType: (m.contentType as string) ?? 'text',
        modelUsed: (m.modelUsed as string | null) ?? null,
        tokenCount: (m.tokenCount as number | null) ?? null,
        confidence: (m.confidence as number | null) ?? null,
        createdAt: m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt as string),
        isEdited: (m.isEdited as boolean) ?? false,
        attachments: (m.attachments as unknown[] | null) ?? null,
      }))
    : [];

  const toolCalls: ToolCallDetails[] = Array.isArray(row.toolCalls)
    ? (row.toolCalls as Record<string, unknown>[]).map((tc) => ({
        id: tc.id as string,
        toolName: tc.toolName as string,
        toolType: (tc.toolType as string) ?? 'unknown',
        status: tc.status as string,
        inputParameters:
          (tc.inputParameters as Record<string, unknown>) ??
          (tc.toolInput as Record<string, unknown>) ??
          {},
        outputResult:
          (tc.outputResult as Record<string, unknown> | null) ??
          (tc.toolOutput as Record<string, unknown> | null) ??
          null,
        errorMessage: (tc.errorMessage as string | null) ?? null,
        durationMs: (tc.durationMs as number | null) ?? (tc.duration as number | null) ?? null,
        requiresApproval: (tc.requiresApproval as boolean) ?? false,
        approvalStatus: (tc.approvalStatus as string | null) ?? null,
        affectedEntity: (tc.affectedEntity as string | null) ?? null,
        changeDescription: (tc.changeDescription as string | null) ?? null,
        isReversible: (tc.isReversible as boolean) ?? false,
        wasRolledBack: (tc.wasRolledBack as boolean) ?? false,
        startedAt: toDate(tc.startedAt),
        completedAt: toOptionalDate(tc.completedAt),
      }))
    : [];

  return {
    id: row.id as string,
    sessionId: row.sessionId as string,
    tenantId: row.tenantId as string,
    userId: row.userId as string,
    userName: (row.userName as string | null) ?? null,
    agentId: (row.agentId as string | null) ?? null,
    agentName: (row.agentName as string | null) ?? null,
    agentModel: (row.agentModel as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    summary: (row.summary as string | null) ?? null,
    contextType: (row.contextType as string | null) ?? null,
    contextId: (row.contextId as string | null) ?? null,
    contextName: (row.contextName as string | null) ?? null,
    channel: (row.channel as string) ?? 'web',
    status: row.status as string,
    messageCount: (row.messageCount as number) ?? 0,
    toolCallCount: (row.toolCallCount as number) ?? 0,
    tokenCountInput: (row.tokenCountInput as number) ?? 0,
    tokenCountOutput: (row.tokenCountOutput as number) ?? 0,
    estimatedCost: (row.estimatedCost as number | null) ?? null,
    userRating: (row.userRating as number | null) ?? null,
    feedbackText: (row.feedbackText as string | null) ?? null,
    wasEscalated: (row.wasEscalated as boolean) ?? false,
    escalatedTo: (row.escalatedTo as string | null) ?? null,
    escalatedAt: toOptionalDate(row.escalatedAt),
    startedAt: toDate(row.startedAt),
    lastMessageAt: toOptionalDate(row.lastMessageAt),
    endedAt: toOptionalDate(row.endedAt),
    messages,
    toolCalls,
  };
}

function toConversationSearchResult(row: Record<string, unknown>): ConversationSearchResult {
  return {
    conversationId: row.id as string,
    sessionId: row.sessionId as string,
    title: (row.title as string | null) ?? null,
    summary: (row.summary as string | null) ?? null,
    userId: row.userId as string,
    userName: (row.userName as string | null) ?? null,
    agentId: (row.agentId as string | null) ?? null,
    agentName: (row.agentName as string | null) ?? null,
    contextType: (row.contextType as string | null) ?? null,
    contextId: (row.contextId as string | null) ?? null,
    contextName: (row.contextName as string | null) ?? null,
    channel: (row.channel as string) ?? 'web',
    status: row.status as string,
    startedAt: toDate(row.startedAt),
    endedAt: toOptionalDate(row.endedAt),
    messageCount: (row.messageCount as number) ?? 0,
    toolCallCount: (row.toolCallCount as number) ?? 0,
    userRating: (row.userRating as number | null) ?? null,
    wasEscalated: (row.wasEscalated as boolean) ?? false,
  };
}

// ---------------------------------------------------------------------------
// Repository implementation
// ---------------------------------------------------------------------------

export class PrismaConversationSearchRepository implements ConversationRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  async findById(id: string, tenantId: string): Promise<ConversationWithDetails | null> {
    const row = await this.prisma.conversationRecord.findFirst({
      where: {
        id,
        tenantId, // tenant isolation guard
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        toolCalls: {
          orderBy: { startedAt: 'asc' },
        },
      },
    });

    if (!row) return null;
    return toConversationWithDetails(row as unknown as Record<string, unknown>);
  }

  // -------------------------------------------------------------------------
  // findBySessionId
  // -------------------------------------------------------------------------

  async findBySessionId(
    sessionId: string,
    tenantId: string
  ): Promise<ConversationWithDetails | null> {
    const row = await this.prisma.conversationRecord.findFirst({
      where: {
        sessionId,
        tenantId, // tenant isolation guard
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        toolCalls: {
          orderBy: { startedAt: 'asc' },
        },
      },
    });

    if (!row) return null;
    return toConversationWithDetails(row as unknown as Record<string, unknown>);
  }

  // -------------------------------------------------------------------------
  // search
  // -------------------------------------------------------------------------

  /**
   * Build the base WHERE clause from scalar filter params. Extracted from
   * search() to keep its cognitive complexity under the sonar threshold.
   */
  private buildBaseWhere(params: ConversationSearchParams): Prisma.ConversationRecordWhereInput {
    const {
      tenantId,
      userId,
      agentId,
      contextType,
      contextId,
      channel,
      status,
      startDate,
      endDate,
      hasToolCalls,
      wasEscalated,
      minRating,
    } = params;

    const where: Prisma.ConversationRecordWhereInput = { tenantId };

    if (userId) where.userId = userId;
    if (agentId) where.agentId = agentId;
    if (contextType) where.contextType = contextType;
    if (contextId) where.contextId = contextId;
    if (channel) where.channel = channel;
    if (status) where.status = status as Prisma.EnumConversationStatusFilter;
    if (startDate || endDate) {
      where.startedAt = {};
      if (startDate) where.startedAt.gte = startDate;
      if (endDate) where.startedAt.lte = endDate;
    }
    if (wasEscalated !== undefined) where.wasEscalated = wasEscalated;
    if (minRating !== undefined) where.userRating = { gte: minRating };
    if (hasToolCalls === true) where.toolCallCount = { gt: 0 };
    if (hasToolCalls === false) where.toolCallCount = { equals: 0 };

    return where;
  }

  async search(
    params: ConversationSearchParams
  ): Promise<{ conversations: ConversationSearchResult[]; total: number }> {
    const { tenantId, query, limit = 20, offset = 0 } = params;

    const where = this.buildBaseWhere(params);

    // Full-text / ILIKE search on title + summary + message content.
    //
    // For message content we use a GIN tsvector index (added in migration
    // 20260422000000_add_message_content_gin_index) via a raw sub-query so that
    // Postgres can use the index instead of doing a full-table ILIKE scan.
    //
    // Title + summary still use Prisma's mode: 'insensitive' (ILIKE) because they
    // are short fields without a GIN index and the query planner handles them fine.
    //
    // The raw sub-query embeds a parameterised plainto_tsquery call and also
    // enforces tenantId isolation on the message_records table.
    let conversationIdsFromContent: string[] | null;

    if (query && query.trim().length > 0) {
      const trimmed = query.trim();

      // Fetch conversation IDs whose messages match via the GIN tsvector index.
      // Using Prisma.$queryRaw with Prisma.sql tagged template prevents SQL injection.
      const contentMatches = await this.prisma.$queryRaw<{ conversationId: string }[]>(
        Prisma.sql`
          SELECT DISTINCT "conversationId"
          FROM   "message_records"
          WHERE  "tenantId" = ${tenantId}
            AND  to_tsvector('english', "content") @@ plainto_tsquery('english', ${trimmed})
        `
      );
      conversationIdsFromContent = contentMatches.map((r) => r.conversationId);

      where.OR = [
        { title: { contains: trimmed, mode: 'insensitive' } },
        { summary: { contains: trimmed, mode: 'insensitive' } },
        // Tenant isolation is already baked into the raw query above.
        ...(conversationIdsFromContent.length > 0
          ? [{ id: { in: conversationIdsFromContent } }]
          : []),
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.conversationRecord.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.conversationRecord.count({ where }),
    ]);

    return {
      conversations: (rows as unknown as Record<string, unknown>[]).map(toConversationSearchResult),
      total,
    };
  }

  // -------------------------------------------------------------------------
  // searchByEmbedding
  //
  // TODO (IFC-148 / pgvector phase): Implement pgvector cosine similarity
  // search once a conversation embedding ingestion pipeline exists.
  // This requires:
  //   1. An `embedding vector(1536)` column on ConversationRecord (migration)
  //   2. A background job that embeds conversation summaries/messages on create
  //   3. A raw SQL query using `<=> operator` with tenantId filter
  // Returning [] in the interim so that the service layer's null-check for
  // embeddingService handles the "not configured" path before reaching here.
  // -------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async searchByEmbedding(_params: SemanticSearchParams): Promise<ConversationSearchResult[]> {
    // TODO: pgvector embedding search — deferred pending ingestion pipeline.
    // See ConversationSearchService.semanticSearch() — it guards on
    // embeddingService being present before calling this method.
    return [];
  }

  // -------------------------------------------------------------------------
  // findByContext
  // -------------------------------------------------------------------------

  async findByContext(
    contextType: string,
    contextId: string,
    tenantId: string
  ): Promise<ConversationSearchResult[]> {
    const rows = await this.prisma.conversationRecord.findMany({
      where: {
        tenantId, // tenant isolation guard
        contextType,
        contextId,
      },
      orderBy: { startedAt: 'desc' },
    });

    return (rows as unknown as Record<string, unknown>[]).map(toConversationSearchResult);
  }

  // -------------------------------------------------------------------------
  // exportUserConversations (GDPR / DSAR)
  // -------------------------------------------------------------------------

  async exportUserConversations(
    userId: string,
    tenantId: string
  ): Promise<ConversationWithDetails[]> {
    const rows = await this.prisma.conversationRecord.findMany({
      where: {
        tenantId, // tenant isolation guard
        userId,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        toolCalls: {
          orderBy: { startedAt: 'asc' },
        },
      },
      orderBy: { startedAt: 'asc' },
    });

    return (rows as unknown as Record<string, unknown>[]).map(toConversationWithDetails);
  }
}
