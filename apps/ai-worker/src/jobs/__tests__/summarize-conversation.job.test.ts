/**
 * Summarize Conversation Job Tests
 *
 * Test cases:
 * 1. Below threshold (few messages, few tokens) → shouldSummarizeConversation returns false
 * 2. Message count >= 20 → returns true
 * 3. Token count >= 6000 → returns true
 * 4. Existing fresh summary (< 1 hour old) → returns false (no re-summarization)
 * 5. processSummarizeJob happy path — writes summary to ConversationRecord
 * 6. LLM failure → fallback digest still written to ConversationRecord
 * 7. Tenant isolation — conversation belonging to a different tenant is never loaded
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks (must be declared before any imports)
// ---------------------------------------------------------------------------

const mockLLMInvoke = vi.hoisted(() => vi.fn());
const mockConversationRecordFindFirst = vi.hoisted(() => vi.fn());
const mockConversationRecordUpdate = vi.hoisted(() => vi.fn());
const mockMessageRecordFindMany = vi.hoisted(() => vi.fn());
const mockMessageRecordAggregate = vi.hoisted(() => vi.fn());

vi.mock('@intelliflow/db', () => ({
  prisma: {
    conversationRecord: {
      findFirst: (...args: any[]) => mockConversationRecordFindFirst(...args),
      update: (...args: any[]) => mockConversationRecordUpdate(...args),
      // updateMany is the defense-in-depth write path (tenantId in where clause)
      updateMany: (...args: any[]) => mockConversationRecordUpdate(...args),
    },
    messageRecord: {
      findMany: (...args: any[]) => mockMessageRecordFindMany(...args),
      aggregate: (...args: any[]) => mockMessageRecordAggregate(...args),
    },
  },
}));

vi.mock('../../lib/llm-factory.js', () => ({
  createLLM: vi.fn(() => ({
    invoke: mockLLMInvoke,
  })),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  shouldSummarizeConversation,
  processSummarizeJob,
  SUMMARIZATION_MESSAGE_THRESHOLD,
  SUMMARIZATION_TOKEN_THRESHOLD,
  enqueueSummarizationIfNeeded,
} from '../summarize-conversation.job';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_A = '00000000-0000-4000-a000-000000000001';
const TENANT_B = '00000000-0000-4000-b000-000000000002';
const CONV_ID = 'conv-001';
const SESSION_ID = 'session-001';

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    summary: null,
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago — stale
    messageCount: 0,
    tokenCountInput: 0,
    tokenCountOutput: 0,
    ...overrides,
  };
}

function makeMessages(count: number, contentPrefix = 'Message') {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? 'USER' : 'ASSISTANT',
    content: `${contentPrefix} ${i + 1}`,
    createdAt: new Date(Date.now() - (count - i) * 1000),
  }));
}

function makeMockJob(data: { tenantId: string; sessionId: string; conversationId: string }) {
  return {
    id: 'job-test-001',
    data,
    token: 'test-token',
    extendLock: vi.fn().mockResolvedValue(undefined),
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockConversationRecordUpdate.mockResolvedValue({});
  mockMessageRecordAggregate.mockResolvedValue({ _sum: { tokenCount: 0 } });
});

// ---------------------------------------------------------------------------
// shouldSummarizeConversation
// ---------------------------------------------------------------------------

describe('shouldSummarizeConversation', () => {
  it('1. returns false when below both thresholds', async () => {
    mockConversationRecordFindFirst.mockResolvedValueOnce(makeConversation({ messageCount: 5 }));
    mockMessageRecordAggregate.mockResolvedValueOnce({ _sum: { tokenCount: 100 } });

    const result = await shouldSummarizeConversation(CONV_ID, TENANT_A);

    expect(result).toBe(false);
  });

  it('2. returns true when message count >= SUMMARIZATION_MESSAGE_THRESHOLD', async () => {
    mockConversationRecordFindFirst.mockResolvedValueOnce(
      makeConversation({ messageCount: SUMMARIZATION_MESSAGE_THRESHOLD })
    );

    const result = await shouldSummarizeConversation(CONV_ID, TENANT_A);

    expect(result).toBe(true);
  });

  it('2b. returns true when message count exceeds threshold', async () => {
    mockConversationRecordFindFirst.mockResolvedValueOnce(makeConversation({ messageCount: 25 }));

    const result = await shouldSummarizeConversation(CONV_ID, TENANT_A);

    expect(result).toBe(true);
    // aggregate should NOT have been called once message threshold triggers
    expect(mockMessageRecordAggregate).not.toHaveBeenCalled();
  });

  it('3. returns true when token count >= SUMMARIZATION_TOKEN_THRESHOLD', async () => {
    mockConversationRecordFindFirst.mockResolvedValueOnce(
      makeConversation({ messageCount: 5 }) // below message threshold
    );
    mockMessageRecordAggregate.mockResolvedValueOnce({
      _sum: { tokenCount: SUMMARIZATION_TOKEN_THRESHOLD },
    });

    const result = await shouldSummarizeConversation(CONV_ID, TENANT_A);

    expect(result).toBe(true);
  });

  it('3b. returns true when conversation-level tokens exceed threshold', async () => {
    mockConversationRecordFindFirst.mockResolvedValueOnce(
      makeConversation({
        messageCount: 5,
        tokenCountInput: 4000,
        tokenCountOutput: 2500, // combined: 6500 >= 6000
      })
    );
    mockMessageRecordAggregate.mockResolvedValueOnce({ _sum: { tokenCount: 0 } });

    const result = await shouldSummarizeConversation(CONV_ID, TENANT_A);

    expect(result).toBe(true);
  });

  it('4. returns false when a fresh summary exists (updated < 1 hour ago)', async () => {
    mockConversationRecordFindFirst.mockResolvedValueOnce(
      makeConversation({
        messageCount: 25, // above threshold
        summary: 'This is a fresh summary.',
        updatedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      })
    );

    const result = await shouldSummarizeConversation(CONV_ID, TENANT_A);

    expect(result).toBe(false);
    // Should short-circuit before hitting the aggregate query
    expect(mockMessageRecordAggregate).not.toHaveBeenCalled();
  });

  it('4b. returns true when summary exists but is stale (> 1 hour old)', async () => {
    mockConversationRecordFindFirst.mockResolvedValueOnce(
      makeConversation({
        messageCount: 25,
        summary: 'An old summary.',
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      })
    );

    const result = await shouldSummarizeConversation(CONV_ID, TENANT_A);

    expect(result).toBe(true);
  });

  it('returns false when conversation is not found', async () => {
    mockConversationRecordFindFirst.mockResolvedValueOnce(null);

    const result = await shouldSummarizeConversation(CONV_ID, TENANT_A);

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// processSummarizeJob
// ---------------------------------------------------------------------------

describe('processSummarizeJob', () => {
  it('5. happy path — calls LLM and writes summary to ConversationRecord', async () => {
    const expectedSummary =
      'This conversation covered pricing. Key facts: [price $5k; Q3 close; VP involved]';

    mockConversationRecordFindFirst.mockResolvedValueOnce({ id: CONV_ID });
    mockMessageRecordFindMany.mockResolvedValueOnce(makeMessages(5));
    mockLLMInvoke.mockResolvedValueOnce({ content: expectedSummary });

    const job = makeMockJob({ tenantId: TENANT_A, sessionId: SESSION_ID, conversationId: CONV_ID });
    const result = await processSummarizeJob(job);

    expect(result.conversationId).toBe(CONV_ID);
    expect(result.usedFallback).toBe(false);
    expect(result.summaryLength).toBe(expectedSummary.length);
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);

    expect(mockConversationRecordUpdate).toHaveBeenCalledWith({
      where: { id: CONV_ID, tenantId: TENANT_A },
      data: { summary: expectedSummary },
    });
  });

  it('6. LLM failure → fallback digest is still written to ConversationRecord', async () => {
    mockConversationRecordFindFirst.mockResolvedValueOnce({ id: CONV_ID });
    mockMessageRecordFindMany.mockResolvedValueOnce(makeMessages(5, 'Turn'));
    mockLLMInvoke.mockRejectedValueOnce(new Error('LLM provider unreachable'));

    const job = makeMockJob({ tenantId: TENANT_A, sessionId: SESSION_ID, conversationId: CONV_ID });
    const result = await processSummarizeJob(job);

    expect(result.usedFallback).toBe(true);
    expect(result.summaryLength).toBeGreaterThan(0);

    // Fallback must still write — verify update was called with non-empty content
    expect(mockConversationRecordUpdate).toHaveBeenCalledOnce();
    const updateCall = mockConversationRecordUpdate.mock.calls[0][0];
    expect(updateCall.data.summary).toContain('[Digest');
  });

  it('7. tenant isolation — conversation for different tenant is not loaded', async () => {
    // findFirst with TENANT_B query returns null (correct tenant-scoped behaviour)
    mockConversationRecordFindFirst.mockImplementation((args: { where: { tenantId: string } }) => {
      if (args.where.tenantId === TENANT_B) return Promise.resolve(null);
      return Promise.resolve({ id: CONV_ID });
    });

    const job = makeMockJob({
      tenantId: TENANT_B,
      sessionId: SESSION_ID,
      conversationId: CONV_ID,
    });
    const result = await processSummarizeJob(job);

    // Summary write must NOT be attempted when tenant does not own the conversation
    expect(mockConversationRecordUpdate).not.toHaveBeenCalled();
    expect(mockMessageRecordFindMany).not.toHaveBeenCalled();
    expect(result.summaryLength).toBe(0);
  });

  it('returns early without error when the conversation has no messages', async () => {
    mockConversationRecordFindFirst.mockResolvedValueOnce({ id: CONV_ID });
    mockMessageRecordFindMany.mockResolvedValueOnce([]); // empty

    const job = makeMockJob({ tenantId: TENANT_A, sessionId: SESSION_ID, conversationId: CONV_ID });
    const result = await processSummarizeJob(job);

    expect(result.summaryLength).toBe(0);
    expect(result.usedFallback).toBe(false);
    expect(mockConversationRecordUpdate).not.toHaveBeenCalled();
    expect(mockLLMInvoke).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// enqueueSummarizationIfNeeded
// ---------------------------------------------------------------------------

describe('enqueueSummarizationIfNeeded', () => {
  it('adds job to queue when threshold is met', async () => {
    mockConversationRecordFindFirst.mockResolvedValueOnce(makeConversation({ messageCount: 25 }));

    const mockQueue = { add: vi.fn().mockResolvedValue(undefined) } as any;

    await enqueueSummarizationIfNeeded(CONV_ID, SESSION_ID, TENANT_A, mockQueue);

    expect(mockQueue.add).toHaveBeenCalledOnce();
    const [jobName, payload] = mockQueue.add.mock.calls[0];
    expect(jobName).toBe('summarize');
    expect(payload).toMatchObject({
      conversationId: CONV_ID,
      sessionId: SESSION_ID,
      tenantId: TENANT_A,
    });
  });

  it('does not add job when below threshold', async () => {
    mockConversationRecordFindFirst.mockResolvedValueOnce(makeConversation({ messageCount: 3 }));
    mockMessageRecordAggregate.mockResolvedValueOnce({ _sum: { tokenCount: 50 } });

    const mockQueue = { add: vi.fn() } as any;

    await enqueueSummarizationIfNeeded(CONV_ID, SESSION_ID, TENANT_A, mockQueue);

    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('swallows queue errors so the message-append path is never blocked', async () => {
    mockConversationRecordFindFirst.mockResolvedValueOnce(makeConversation({ messageCount: 25 }));

    const mockQueue = { add: vi.fn().mockRejectedValue(new Error('Redis down')) } as any;

    // Must not throw
    await expect(
      enqueueSummarizationIfNeeded(CONV_ID, SESSION_ID, TENANT_A, mockQueue)
    ).resolves.toBeUndefined();
  });
});
