/**
 * Summarize Conversation Job Handler
 *
 * BullMQ job handler that produces a 3–5 sentence summary of a ConversationRecord
 * once it reaches 20+ messages OR 6 000+ total tokens. The summary (with embedded
 * key facts) is persisted to ConversationRecord.summary so downstream views and
 * search can consume a compact representation without replaying the full transcript.
 *
 * Trigger: called from the message-append hot path via
 * `enqueueSummarizationIfNeeded()` after every MessageRecord write.
 *
 * @module ai-worker/jobs/summarize-conversation
 */

import type { Job, Queue } from 'bullmq';
import { z } from 'zod';
import pino from 'pino';
import { context as otelContext, propagation } from '@opentelemetry/api';
import { createLLM } from '../lib/llm-factory.js';

const logger = pino({
  name: 'summarize-conversation-job',
  level: process.env.LOG_LEVEL || 'info',
});

// ============================================================================
// Constants
// ============================================================================

/** Queue name for conversation summarization jobs */
export const SUMMARIZE_QUEUE = 'ai-summarize-conversation';

/** Trigger: enqueue summarization when message count exceeds this value */
export const SUMMARIZATION_MESSAGE_THRESHOLD = 20;

/** Trigger: enqueue summarization when total token count exceeds this value */
export const SUMMARIZATION_TOKEN_THRESHOLD = 6000;

/** Freshness window: skip re-summarization if summary updated within this duration */
const FRESHNESS_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** LLM inference timeout before falling back to digest strategy */
const LLM_TIMEOUT_MS = 60_000; // 1 minute

/** Number of recent messages used in fallback digest */
const FALLBACK_MESSAGE_COUNT = 3;

// ============================================================================
// Schema
// ============================================================================

/** Schema for summarize conversation job data */
export const SummarizeConversationJobSchema = z.object({
  tenantId: z.string().uuid('tenantId must be a valid UUID'),
  sessionId: z.string().min(1, 'sessionId is required'),
  conversationId: z.string().min(1, 'conversationId is required'),
  /** W3C traceparent carrier injected by enqueue-side for distributed trace propagation */
  _otelCarrier: z.record(z.string(), z.string()).optional(),
});

export type SummarizeConversationJobData = z.infer<typeof SummarizeConversationJobSchema>;

/** Schema for job result */
export const SummarizeConversationJobResultSchema = z.object({
  conversationId: z.string(),
  summaryLength: z.number(),
  usedFallback: z.boolean(),
  processingTimeMs: z.number(),
  processedAt: z.string(),
});

export type SummarizeConversationJobResult = z.infer<typeof SummarizeConversationJobResultSchema>;

// ============================================================================
// Threshold helper
// ============================================================================

/**
 * Query the database to determine whether this conversation has hit either
 * summarization threshold AND does not already have a fresh summary.
 *
 * Returns true when EITHER:
 *  (a) message count >= SUMMARIZATION_MESSAGE_THRESHOLD
 *  (b) total tokenCount sum >= SUMMARIZATION_TOKEN_THRESHOLD
 *
 * AND the existing summary is null, empty, or was last updated more than
 * FRESHNESS_WINDOW_MS ago.
 */
export async function shouldSummarizeConversation(
  conversationId: string,
  tenantId: string
): Promise<boolean> {
  const { prisma } = await import('@intelliflow/db');

  const conversation = await prisma.conversationRecord.findFirst({
    where: { id: conversationId, tenantId },
    select: {
      summary: true,
      updatedAt: true,
      messageCount: true,
      tokenCountInput: true,
      tokenCountOutput: true,
    },
  });

  if (!conversation) return false;

  // Freshness check — avoid re-summarizing a recently-updated conversation
  const hasFreshSummary =
    conversation.summary != null &&
    conversation.summary.trim().length > 0 &&
    Date.now() - conversation.updatedAt.getTime() < FRESHNESS_WINDOW_MS;

  if (hasFreshSummary) return false;

  // Threshold check 1: message count
  if (conversation.messageCount >= SUMMARIZATION_MESSAGE_THRESHOLD) return true;

  // Threshold check 2: token aggregate from MessageRecord rows
  const tokenAggregate = await prisma.messageRecord.aggregate({
    where: { conversationId, tenantId },
    _sum: { tokenCount: true },
  });

  const totalTokens = tokenAggregate._sum.tokenCount ?? 0;

  // Also consider top-level tokenCountInput/Output on the conversation itself
  const conversationTokens =
    (conversation.tokenCountInput ?? 0) + (conversation.tokenCountOutput ?? 0);
  const effectiveTotalTokens = Math.max(totalTokens, conversationTokens);

  return effectiveTotalTokens >= SUMMARIZATION_TOKEN_THRESHOLD;
}

/**
 * Enqueue a summarization job if the conversation has hit either threshold.
 *
 * Fire-and-forget: awaits the threshold check but swallows errors so the
 * hot message-append path is never blocked or broken by summarization logic.
 */
export async function enqueueSummarizationIfNeeded(
  conversationId: string,
  sessionId: string,
  tenantId: string,
  queue: Queue
): Promise<void> {
  try {
    const needed = await shouldSummarizeConversation(conversationId, tenantId);
    if (!needed) return;

    const _otelCarrierSummarize: Record<string, string> = {};
    propagation.inject(otelContext.active(), _otelCarrierSummarize);
    await queue.add(
      'summarize',
      {
        conversationId,
        sessionId,
        tenantId,
        _otelCarrier: _otelCarrierSummarize,
      } satisfies SummarizeConversationJobData,
      {
        // De-duplicate: only one pending summarization per conversation at a time.
        jobId: `summarize:${conversationId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { age: 3 * 24 * 60 * 60 },
      }
    );

    logger.info({ conversationId, tenantId }, 'Enqueued conversation summarization job');
  } catch (error) {
    // Non-blocking — log and continue; the message write already succeeded.
    logger.warn(
      {
        conversationId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to enqueue summarization job — non-fatal, message write succeeded'
    );
  }
}

// ============================================================================
// Job handler helpers
// ============================================================================

interface MessageRow {
  role: string;
  content: string;
  createdAt: Date;
}

/** Load all messages for the conversation, tenant-filtered, ordered by creation time. */
async function loadMessages(
  prisma: any,
  conversationId: string,
  tenantId: string
): Promise<MessageRow[]> {
  return prisma.messageRecord.findMany({
    where: { conversationId, tenantId },
    select: { role: true, content: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** Build a compact transcript string suitable for LLM summarization prompt. */
function buildTranscript(messages: MessageRow[]): string {
  return messages.map((m) => `[${m.role.toUpperCase()}]: ${m.content.slice(0, 1000)}`).join('\n');
}

/** Produce a fallback digest from the most recent FALLBACK_MESSAGE_COUNT messages. */
function buildFallbackDigest(messages: MessageRow[]): string {
  const recent = messages.slice(-FALLBACK_MESSAGE_COUNT);
  const digest = recent.map((m) => m.content.slice(0, 300)).join(' | ');
  return `[Digest — LLM unavailable] Recent context: ${digest}`;
}

/** Invoke the LLM to produce a 3–5 sentence summary with embedded key facts. */
async function generateSummaryWithLLM(transcript: string): Promise<string> {
  const llm = createLLM('reasoning', 'free');

  const prompt = [
    'You are an AI assistant that summarizes CRM conversation transcripts.',
    'Write a 3-5 sentence summary of the following conversation. After the summary, append a "Key facts:" line listing 3-5 semicolon-separated facts extracted from the conversation (e.g. Key facts: [user asked about pricing; demo scheduled for Friday; contact is VP of Sales]).',
    '',
    'Conversation:',
    transcript,
    '',
    'Summary:',
  ].join('\n');

  const result = await llm.invoke(prompt);

  const content = typeof result === 'string' ? result : (result as { content: string }).content;
  return String(content).trim();
}

// ============================================================================
// Job handler
// ============================================================================

/**
 * Process a conversation summarization job.
 *
 * 1. Validates job data
 * 2. Loads all messages (tenant-filtered)
 * 3. Calls LLM with a timeout + Promise.race fallback
 * 4. Persists summary to ConversationRecord.summary
 *
 * On LLM failure the handler writes a short digest (most recent 3 messages)
 * so the field is never left null after a threshold breach.
 */
export async function processSummarizeJob(
  job: Job<SummarizeConversationJobData>
): Promise<SummarizeConversationJobResult> {
  const startTime = Date.now();

  const validatedData = SummarizeConversationJobSchema.parse(job.data);
  const { conversationId, sessionId, tenantId } = validatedData;

  logger.info(
    { jobId: job.id, tenantId, conversationId },
    'Processing conversation summarization job'
  );

  const { prisma } = await import('@intelliflow/db');

  // Verify the conversation belongs to the specified tenant (isolation guard)
  const conversation = await prisma.conversationRecord.findFirst({
    where: { id: conversationId, tenantId },
    select: { id: true },
  });

  if (!conversation) {
    logger.warn(
      { jobId: job.id, tenantId, conversationId },
      'ConversationRecord not found for this tenant — skipping (tenant isolation)'
    );
    return {
      conversationId,
      summaryLength: 0,
      usedFallback: false,
      processingTimeMs: Date.now() - startTime,
      processedAt: new Date().toISOString(),
    };
  }

  const messages = await loadMessages(prisma, conversationId, tenantId);

  if (messages.length === 0) {
    logger.info(
      { jobId: job.id, tenantId, conversationId },
      'No messages found — skipping summarization'
    );
    return {
      conversationId,
      summaryLength: 0,
      usedFallback: false,
      processingTimeMs: Date.now() - startTime,
      processedAt: new Date().toISOString(),
    };
  }

  // Extend lock before LLM call to prevent stall detection from killing the job
  await job.extendLock(job.token!, 120_000);

  const transcript = buildTranscript(messages);

  let summary: string;
  let usedFallback = false;

  try {
    summary = await Promise.race([
      generateSummaryWithLLM(transcript),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`LLM inference timed out after ${LLM_TIMEOUT_MS}ms`)),
          LLM_TIMEOUT_MS
        )
      ),
    ]);
  } catch (error) {
    logger.warn(
      {
        jobId: job.id,
        tenantId,
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      },
      'LLM inference failed or timed out — using fallback digest'
    );
    summary = buildFallbackDigest(messages);
    usedFallback = true;
  }

  // Persist summary to ConversationRecord.summary.
  // Defense-in-depth: tenantId in where clause even though RLS + pre-check guard this path.
  // Use updateMany because composite (id, tenantId) is not a declared unique.
  await prisma.conversationRecord.updateMany({
    where: { id: conversationId, tenantId },
    data: { summary },
  });

  const processingTimeMs = Date.now() - startTime;

  logger.info(
    {
      jobId: job.id,
      tenantId,
      conversationId,
      sessionId,
      summaryLength: summary.length,
      usedFallback,
      processingTimeMs,
    },
    'Conversation summarization job completed'
  );

  return {
    conversationId,
    summaryLength: summary.length,
    usedFallback,
    processingTimeMs,
    processedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Job options
// ============================================================================

/** Default job options for conversation summarization jobs */
export const DEFAULT_SUMMARIZE_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
  removeOnComplete: {
    count: 50,
  },
  removeOnFail: {
    age: 3 * 24 * 60 * 60, // 3 days
  },
};
