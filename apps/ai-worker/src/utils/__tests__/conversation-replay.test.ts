/**
 * Tests for conversation-replay utility (M6 — conversation-history gap fix)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

// ---------------------------------------------------------------------------
// Hoist mock references so they are available inside vi.mock() factory bodies.
// vi.mock() is statically hoisted to the top of the file by Vitest; any
// variable it references must also be hoisted via vi.hoisted().
// ---------------------------------------------------------------------------
const { mockFindFirst } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
}));

vi.mock('@intelliflow/db', () => ({
  prisma: {
    conversationRecord: {
      findFirst: mockFindFirst,
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock token-counter to keep tests deterministic (no tiktoken WASM required).
// Each message costs exactly 10 tokens in this mock.
// ---------------------------------------------------------------------------
vi.mock('../token-counter.js', () => ({
  countMessagesTokens: (messages: unknown[]) => messages.length * 10,
}));

import { replayConversation } from '../conversation-replay.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeMessage(
  id: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  createdAt: Date = new Date()
) {
  return { id, role, content, createdAt, tenantId: 'tenant-1', conversationId: 'conv-1' };
}

const TENANT = 'tenant-1';
const SESSION = 'session-abc';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('replayConversation', () => {
  it('returns empty result when sessionId is empty string', async () => {
    const result = await replayConversation({ tenantId: TENANT, sessionId: '' });

    expect(result.messages).toHaveLength(0);
    expect(result.tokenCount).toBe(0);
    expect(result.truncated).toBe(false);
    // Should not even query the DB
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it('returns empty result when conversation is not found (unknown sessionId)', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await replayConversation({ tenantId: TENANT, sessionId: 'unknown-session' });

    expect(result.messages).toHaveLength(0);
    expect(result.tokenCount).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('returns empty result when tenantId does not match (tenant isolation)', async () => {
    // Simulate DB returning null because tenantId filter excluded the record
    mockFindFirst.mockResolvedValue(null);

    const result = await replayConversation({ tenantId: 'wrong-tenant', sessionId: SESSION });

    expect(result.messages).toHaveLength(0);
    expect(result.truncated).toBe(false);

    // Verify the query included the wrong tenantId (so isolation is tested end-to-end)
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'wrong-tenant', sessionId: SESSION }),
      })
    );
  });

  it('returns 5 messages in chronological order when 5 messages exist', async () => {
    const now = Date.now();
    // DB returns newest-first (DESC order)
    const dbMessages = [
      makeMessage('m5', 'assistant', 'reply 5', new Date(now + 4000)),
      makeMessage('m4', 'user', 'msg 4', new Date(now + 3000)),
      makeMessage('m3', 'assistant', 'reply 3', new Date(now + 2000)),
      makeMessage('m2', 'user', 'msg 2', new Date(now + 1000)),
      makeMessage('m1', 'user', 'msg 1', new Date(now)),
    ];

    mockFindFirst.mockResolvedValue({
      id: 'conv-1',
      sessionId: SESSION,
      tenantId: TENANT,
      messages: dbMessages,
    });

    const result = await replayConversation({ tenantId: TENANT, sessionId: SESSION });

    expect(result.messages).toHaveLength(5);
    expect(result.truncated).toBe(false);

    // After reversing, oldest (m1) should come first
    expect(result.messages[0]).toBeInstanceOf(HumanMessage);
    expect((result.messages[0] as HumanMessage).content).toBe('msg 1');

    // Last message (m5) should be an AIMessage
    expect(result.messages[4]).toBeInstanceOf(AIMessage);
    expect((result.messages[4] as AIMessage).content).toBe('reply 5');
  });

  it('truncates oldest messages when token budget exceeded (20 messages, maxTokens=50)', async () => {
    // Mock: each message = 10 tokens. Budget = 50 tokens = 5 messages max.
    // Build 20 messages (DB returns newest-first)
    const dbMessages = Array.from({ length: 20 }, (_, i) =>
      makeMessage(`m${20 - i}`, i % 2 === 0 ? 'user' : 'assistant', `content ${20 - i}`)
    );

    mockFindFirst.mockResolvedValue({
      id: 'conv-1',
      sessionId: SESSION,
      tenantId: TENANT,
      messages: dbMessages,
    });

    const result = await replayConversation({
      tenantId: TENANT,
      sessionId: SESSION,
      limit: 20,
      maxTokens: 50,
    });

    // With budget of 50 and cost of 10/message, at most 5 messages remain
    expect(result.messages.length).toBeLessThanOrEqual(5);
    expect(result.truncated).toBe(true);
    expect(result.tokenCount).toBeLessThanOrEqual(50);
  });

  describe('role mapping', () => {
    it('maps "user" role to HumanMessage', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'conv-1',
        sessionId: SESSION,
        tenantId: TENANT,
        messages: [makeMessage('m1', 'user', 'hello')],
      });

      const { messages } = await replayConversation({ tenantId: TENANT, sessionId: SESSION });

      expect(messages[0]).toBeInstanceOf(HumanMessage);
    });

    it('maps "assistant" role to AIMessage', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'conv-1',
        sessionId: SESSION,
        tenantId: TENANT,
        messages: [makeMessage('m1', 'assistant', 'I can help')],
      });

      const { messages } = await replayConversation({ tenantId: TENANT, sessionId: SESSION });

      expect(messages[0]).toBeInstanceOf(AIMessage);
    });

    it('maps "system" role to SystemMessage', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'conv-1',
        sessionId: SESSION,
        tenantId: TENANT,
        messages: [makeMessage('m1', 'system', 'You are an assistant')],
      });

      const { messages } = await replayConversation({ tenantId: TENANT, sessionId: SESSION });

      expect(messages[0]).toBeInstanceOf(SystemMessage);
    });
  });

  it('throws when tenantId is missing (empty string)', async () => {
    await expect(replayConversation({ tenantId: '', sessionId: SESSION })).rejects.toThrow(
      'replayConversation: tenantId is required'
    );
  });

  it('passes limit and tenantId/sessionId filters through to Prisma', async () => {
    mockFindFirst.mockResolvedValue(null);

    await replayConversation({ tenantId: TENANT, sessionId: SESSION, limit: 7 });

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: SESSION, tenantId: TENANT },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 7,
          },
        },
      })
    );
  });

  it('returns empty result when conversation exists but has no messages', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'conv-1',
      sessionId: SESSION,
      tenantId: TENANT,
      messages: [],
    });

    const result = await replayConversation({ tenantId: TENANT, sessionId: SESSION });

    expect(result.messages).toHaveLength(0);
    expect(result.tokenCount).toBe(0);
    expect(result.truncated).toBe(false);
  });
});
