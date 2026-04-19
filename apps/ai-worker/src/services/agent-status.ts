/**
 * Agent Status Service
 *
 * Upserts conversation_records to reflect real-time BullMQ job status
 * on the Active Agents dashboard (/agent-approvals/agents).
 *
 * Each agent type per tenant gets exactly one row (keyed by sessionId).
 * Status transitions: ACTIVE (job started) -> IDLE (completed) / ERROR (failed).
 *
 * @module ai-worker/services/agent-status
 */

import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { aiConfig } from '../config/ai.config';
import {
  SCORING_QUEUE,
  PREDICTION_QUEUE,
  INSIGHT_QUEUE,
  SUMMARIZE_QUEUE,
  FEEDBACK_ANALYTICS_QUEUE,
  type ScoringJobData,
  type PredictionJobData,
  type InsightJobData,
  type SummarizeConversationJobData,
  type FeedbackAnalyticsJobData,
} from '../jobs';

const logger = pino({ name: 'agent-status', level: process.env.LOG_LEVEL || 'info' });

// ============================================================================
// Types
// ============================================================================

export interface AgentStatusContext {
  tenantId: string;
  userId: string;
  agentType: string;
  taskDescription: string;
}

type AIJobData =
  | ScoringJobData
  | PredictionJobData
  | InsightJobData
  | SummarizeConversationJobData
  | FeedbackAnalyticsJobData;

// ============================================================================
// Helpers
// ============================================================================

function getModelName(): string {
  // Factory owns provider selection; return a stable placeholder derived from provider
  if (aiConfig.provider === 'ollama') return `ollama/${aiConfig.ollama.model}`;
  if (aiConfig.provider === 'mock') return 'mock';
  // litellm / openai / any future provider — factory routes to litellm proxy
  return `litellm/${aiConfig.provider}`;
}

let prismaPromise: Promise<any> | null = null;

async function getPrisma() {
  prismaPromise ??= import('@intelliflow/db').then((m) => m.prisma);
  return prismaPromise;
}

// ============================================================================
// Context extraction
// ============================================================================

/**
 * Extract agent status context from a BullMQ job.
 * Returns null when tenantId or userId are unavailable (agent tracking skipped).
 */
export function extractJobContext(
  queueName: string,
  jobData: AIJobData
): AgentStatusContext | null {
  let tenantId: string | undefined;
  let userId: string | undefined;
  let agentType: string;
  let taskDescription: string;

  switch (queueName) {
    case SCORING_QUEUE: {
      const d = jobData as ScoringJobData;
      const raw = d as Record<string, unknown>;
      tenantId = raw.tenantId as string | undefined;
      userId = raw.userId as string | undefined;
      agentType = 'scoring';
      const name = [d.lead.firstName, d.lead.lastName].filter(Boolean).join(' ') || d.lead.email;
      taskDescription = `Scoring lead ${name}`;
      break;
    }
    case PREDICTION_QUEUE: {
      const d = jobData as PredictionJobData;
      tenantId = d.context?.tenantId as string | undefined;
      userId = d.context?.userId as string | undefined;
      const typeMap: Record<string, string> = {
        CHURN_RISK: 'churn',
        NEXT_BEST_ACTION: 'nba',
        QUALIFICATION: 'qualification',
      };
      agentType = typeMap[d.predictionType] || 'prediction';
      taskDescription = `${d.predictionType} analysis for ${d.entityType}`;
      break;
    }
    case INSIGHT_QUEUE: {
      const d = jobData as InsightJobData;
      tenantId = d.tenantId;
      userId = d.userId;
      agentType = 'insights';
      taskDescription = `Generating insights (${d.dealsAtRisk.length} deals, ${d.hotLeads.length} leads)`;
      break;
    }
    case SUMMARIZE_QUEUE: {
      const d = jobData as SummarizeConversationJobData;
      tenantId = d.tenantId;
      // Summarization jobs have no userId — use system sentinel so agent tracking
      // skips the active-agent record for this job type (null is returned below).
      userId = undefined;
      agentType = 'summarization';
      taskDescription = `Summarizing conversation ${d.conversationId}`;
      break;
    }
    case FEEDBACK_ANALYTICS_QUEUE: {
      const d = jobData as FeedbackAnalyticsJobData;
      // Feedback analytics cron runs without a specific tenant context.
      // Return null so the agent-status layer is a no-op for this job type.
      tenantId = d.tenantId;
      userId = undefined;
      agentType = 'feedback-analytics';
      taskDescription = `Analysing feedback (period: ${d.periodDays}d)`;
      break;
    }
    default:
      return null;
  }

  if (!tenantId || !userId) return null;

  return { tenantId, userId, agentType, taskDescription };
}

// ============================================================================
// Message logging
// ============================================================================

/** Options for job completion logging. */
export interface JobCompletionMeta {
  durationMs: number;
  result?: Record<string, unknown>;
}

/**
 * Create a message_record for a conversation and increment messageCount.
 * This populates the Agent Logs transcript view.
 */
async function addLogMessage(
  prisma: any,
  conversationId: string,
  tenantId: string,
  content: string,
  model?: string
): Promise<void> {
  await prisma.messageRecord.create({
    data: {
      id: randomUUID(),
      conversationId,
      tenantId,
      role: 'ASSISTANT',
      content,
      contentType: 'text',
      modelUsed: model ?? null,
    },
  });
  await prisma.conversationRecord.update({
    where: { id: conversationId },
    data: { messageCount: { increment: 1 } },
  });
}

/** Format milliseconds into a human-readable duration. */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

/**
 * Build a rich completion message from job result data.
 * Extracts key metrics like score, tier, insights count, confidence.
 */
function buildCompletionSummary(meta: JobCompletionMeta): string {
  const duration = formatDuration(meta.durationMs);
  const model = getModelName();
  const r = meta.result as Record<string, unknown> | undefined;

  // Scoring results: score, tier, confidence
  if (r && 'score' in r && 'tier' in r) {
    return `Completed in ${duration} — score: ${r.score}/100, tier: ${r.tier}, confidence: ${((r.confidence as number) * 100).toFixed(0)}% (${model})`;
  }

  // Insight results: insightsCreated
  if (r && 'insightsCreated' in r) {
    return `Completed in ${duration} — ${r.insightsCreated} insights generated (${model})`;
  }

  // Prediction results: prediction value + confidence
  if (r && 'prediction' in r) {
    const pred = r.prediction as Record<string, unknown>;
    return `Completed in ${duration} — prediction: ${pred.value}, confidence: ${((pred.confidence as number) * 100).toFixed(0)}% (${model})`;
  }

  return `Completed in ${duration} (${model})`;
}

// ============================================================================
// Status transitions
// ============================================================================

/**
 * Mark agent as ACTIVE when a job starts processing.
 * Creates the conversation_record if it doesn't exist yet.
 * Also creates a SYSTEM message so the Agent Logs page shows the event.
 */
export async function markAgentActive(ctx: AgentStatusContext): Promise<void> {
  try {
    const prisma = await getPrisma();
    const sessionId = `agent-status:${ctx.tenantId}:${ctx.agentType}`;
    const now = new Date();
    const model = getModelName();

    const record = await prisma.conversationRecord.upsert({
      where: { sessionId },
      create: {
        id: randomUUID(),
        sessionId,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        agentId: `ai-${ctx.agentType}-v1`,
        agentName: ctx.agentType,
        agentModel: model,
        contextType: 'job',
        contextName: ctx.taskDescription,
        status: 'ACTIVE',
        startedAt: now,
        lastMessageAt: now,
      },
      update: {
        agentModel: model,
        contextName: ctx.taskDescription,
        status: 'ACTIVE',
        lastMessageAt: now,
      },
      select: { id: true },
    });

    await addLogMessage(
      prisma,
      record.id,
      ctx.tenantId,
      `Processing: ${ctx.taskDescription} [model: ${model}]`,
      model
    );

    logger.debug({ agentType: ctx.agentType, tenantId: ctx.tenantId }, 'Agent marked ACTIVE');
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), agentType: ctx.agentType },
      'Failed to mark agent active'
    );
  }
}

/**
 * Mark agent as IDLE when a job completes successfully.
 * Also creates a log message with duration, model, and result metrics.
 */
export async function markAgentIdle(
  ctx: AgentStatusContext,
  resultSummary?: string,
  meta?: JobCompletionMeta
): Promise<void> {
  try {
    const prisma = await getPrisma();
    const sessionId = `agent-status:${ctx.tenantId}:${ctx.agentType}`;
    const now = new Date();

    const logContent = meta
      ? buildCompletionSummary(meta)
      : resultSummary || `${ctx.taskDescription} — completed`;

    const displayName = resultSummary || logContent;

    const record = await prisma.conversationRecord.update({
      where: { sessionId },
      data: {
        status: 'IDLE',
        contextName: displayName,
        lastMessageAt: now,
      },
      select: { id: true },
    });

    await addLogMessage(prisma, record.id, ctx.tenantId, logContent);

    logger.debug({ agentType: ctx.agentType }, 'Agent marked IDLE');
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), agentType: ctx.agentType },
      'Failed to mark agent idle'
    );
  }
}

/**
 * Record a tool call for an agent's conversation.
 * Creates a ToolCallRecord row so the Agent Logs page shows tool invocations.
 */
export async function recordToolCall(
  ctx: AgentStatusContext,
  toolName: string,
  input: unknown,
  output: unknown,
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED',
  durationMs?: number
): Promise<void> {
  try {
    const prisma = await getPrisma();
    const sessionId = `agent-status:${ctx.tenantId}:${ctx.agentType}`;

    const record = await prisma.conversationRecord.findUnique({
      where: { sessionId },
      select: { id: true },
    });

    if (!record) {
      logger.debug(
        { agentType: ctx.agentType },
        'No conversation record found for tool call — skipping'
      );
      return;
    }

    const now = new Date();
    const startedAt = durationMs != null ? new Date(now.getTime() - durationMs) : now;

    await prisma.toolCallRecord.create({
      data: {
        id: randomUUID(),
        conversationId: record.id,
        tenantId: ctx.tenantId,
        toolName,
        toolInput: input as any,
        toolOutput: output as any,
        status,
        startedAt,
        completedAt: status === 'PENDING' || status === 'RUNNING' ? null : now,
        durationMs: durationMs ?? null,
      },
    });

    await prisma.conversationRecord.update({
      where: { id: record.id },
      data: { toolCallCount: { increment: 1 } },
    });

    logger.debug({ agentType: ctx.agentType, toolName, status }, 'Tool call recorded');
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        agentType: ctx.agentType,
        toolName,
      },
      'Failed to record tool call'
    );
  }
}

/**
 * Mark agent as ERROR when a job fails.
 * Also creates a log message with the error details and duration.
 */
export async function markAgentError(
  ctx: AgentStatusContext,
  errorMessage: string,
  durationMs?: number
): Promise<void> {
  try {
    const prisma = await getPrisma();
    const sessionId = `agent-status:${ctx.tenantId}:${ctx.agentType}`;
    const now = new Date();

    const record = await prisma.conversationRecord.update({
      where: { sessionId },
      data: {
        status: 'ERROR',
        contextName: `${ctx.agentType} failed — ${errorMessage}`.slice(0, 500),
        endReason: 'JOB_FAILED',
        summary: `Error: ${errorMessage}`.slice(0, 2000),
        lastMessageAt: now,
        endedAt: now,
      },
      select: { id: true },
    });

    const durationSuffix = durationMs != null ? ` after ${formatDuration(durationMs)}` : '';
    await addLogMessage(
      prisma,
      record.id,
      ctx.tenantId,
      `Failed${durationSuffix}: ${errorMessage}`.slice(0, 2000)
    );

    logger.debug({ agentType: ctx.agentType, errorMessage }, 'Agent marked ERROR');
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), agentType: ctx.agentType },
      'Failed to mark agent error'
    );
  }
}
