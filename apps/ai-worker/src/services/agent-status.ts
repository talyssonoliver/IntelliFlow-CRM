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
  type ScoringJobData,
  type PredictionJobData,
  type InsightJobData,
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

type AIJobData = ScoringJobData | PredictionJobData | InsightJobData;

// ============================================================================
// Helpers
// ============================================================================

function getModelName(): string {
  if (aiConfig.provider === 'ollama') return `ollama/${aiConfig.ollama.model}`;
  if (aiConfig.provider === 'openai') return aiConfig.openai.model;
  return 'mock';
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
      // Scoring jobs may optionally carry tenantId/userId
      tenantId = (d as Record<string, unknown>).tenantId as string | undefined;
      userId = (d as Record<string, unknown>).userId as string | undefined;
      agentType = 'scoring';
      const name =
        [d.lead.firstName, d.lead.lastName].filter(Boolean).join(' ') || d.lead.email;
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
    default:
      return null;
  }

  if (!tenantId || !userId) return null;

  return { tenantId, userId, agentType, taskDescription };
}

// ============================================================================
// Status transitions
// ============================================================================

/**
 * Mark agent as ACTIVE when a job starts processing.
 * Creates the conversation_record if it doesn't exist yet.
 */
export async function markAgentActive(ctx: AgentStatusContext): Promise<void> {
  try {
    const prisma = await getPrisma();
    const sessionId = `agent-status:${ctx.tenantId}:${ctx.agentType}`;
    const now = new Date();
    const model = getModelName();

    await prisma.conversationRecord.upsert({
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
    });
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
 */
export async function markAgentIdle(
  ctx: AgentStatusContext,
  resultSummary?: string
): Promise<void> {
  try {
    const prisma = await getPrisma();
    const sessionId = `agent-status:${ctx.tenantId}:${ctx.agentType}`;
    const now = new Date();

    await prisma.conversationRecord.update({
      where: { sessionId },
      data: {
        status: 'IDLE',
        contextName: resultSummary || `${ctx.taskDescription} — completed`,
        lastMessageAt: now,
      },
    });
    logger.debug({ agentType: ctx.agentType }, 'Agent marked IDLE');
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), agentType: ctx.agentType },
      'Failed to mark agent idle'
    );
  }
}

/**
 * Mark agent as ERROR when a job fails.
 */
export async function markAgentError(
  ctx: AgentStatusContext,
  errorMessage: string
): Promise<void> {
  try {
    const prisma = await getPrisma();
    const sessionId = `agent-status:${ctx.tenantId}:${ctx.agentType}`;
    const now = new Date();

    await prisma.conversationRecord.update({
      where: { sessionId },
      data: {
        status: 'ERROR',
        contextName: `${ctx.agentType} failed — ${errorMessage}`.slice(0, 500),
        endReason: 'JOB_FAILED',
        summary: `Error: ${errorMessage}`.slice(0, 2000),
        lastMessageAt: now,
        endedAt: now,
      },
    });
    logger.debug({ agentType: ctx.agentType, errorMessage }, 'Agent marked ERROR');
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), agentType: ctx.agentType },
      'Failed to mark agent error'
    );
  }
}
