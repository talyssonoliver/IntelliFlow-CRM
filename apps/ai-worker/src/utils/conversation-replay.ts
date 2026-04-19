/**
 * Conversation History Replay (M6 — conversation-history gap fix)
 *
 * Loads prior-turn MessageRecord rows from the database and converts them
 * into LangChain BaseMessage instances so agents can prepend real history
 * to their prompts instead of re-deriving state from scratch each turn.
 *
 * @module utils/conversation-replay
 */

import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { prisma } from '@intelliflow/db';
import { countMessagesTokens } from './token-counter.js';

export interface ReplayOptions {
  /** Tenant identifier — REQUIRED for multi-tenancy isolation */
  tenantId: string;
  /** Session identifier for the conversation to replay */
  sessionId: string;
  /** Maximum number of messages to fetch (most-recent N, oldest-first after reversal) */
  limit?: number;
  /** Token budget; messages exceeding this are trimmed oldest-first */
  maxTokens?: number;
}

export interface ReplayResult {
  /** LangChain BaseMessage instances in chronological order */
  messages: BaseMessage[];
  /** Approximate token count of the returned messages */
  tokenCount: number;
  /** True if the history was trimmed due to the token budget */
  truncated: boolean;
}

/**
 * Map a MessageRecord role string to the appropriate LangChain BaseMessage subclass.
 */
function toBaseMessage(role: string, content: string): BaseMessage {
  if (role === 'assistant') return new AIMessage(content);
  if (role === 'system') return new SystemMessage(content);
  // 'user', 'tool', or any unknown role → treat as human turn
  return new HumanMessage(content);
}

/**
 * Load and replay conversation history for a given session.
 *
 * - Filters by both `tenantId` and `sessionId` to enforce tenant isolation.
 * - Fetches at most `limit` messages (default 10), ordered newest-first from DB,
 *   then reversed to chronological order.
 * - Trims oldest messages first when the total token count exceeds `maxTokens`
 *   (default 4000).
 */
export async function replayConversation(options: ReplayOptions): Promise<ReplayResult> {
  const { tenantId, sessionId, limit = 10, maxTokens = 4000 } = options;

  if (!tenantId) {
    throw new Error('replayConversation: tenantId is required');
  }

  if (!sessionId) {
    return { messages: [], tokenCount: 0, truncated: false };
  }

  // ConversationRecord.sessionId is @unique, so findFirst is safe.
  // We still filter by tenantId to prevent cross-tenant leakage.
  const conversation = await prisma.conversationRecord.findFirst({
    where: { sessionId, tenantId },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: limit,
      },
    },
  });

  if (!conversation || conversation.messages.length === 0) {
    return { messages: [], tokenCount: 0, truncated: false };
  }

  // Reverse to chronological order (oldest → newest)
  const chronological = [...conversation.messages].reverse();

  // Map to LangChain message types
  const mapped: BaseMessage[] = chronological.map((m) => toBaseMessage(m.role, m.content));

  // Token-aware truncation — shed oldest messages first
  let tokens = countMessagesTokens(mapped);
  let truncated = false;

  while (tokens > maxTokens && mapped.length > 1) {
    mapped.shift();
    tokens = countMessagesTokens(mapped);
    truncated = true;
  }

  return { messages: mapped, tokenCount: tokens, truncated };
}
