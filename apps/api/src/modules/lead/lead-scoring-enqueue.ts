/**
 * Queue AI lead scoring for a newly created lead (best-effort).
 *
 * Extracted from lead.router `create` (PG-203) so the public booking flow scores
 * the leads it creates exactly like an in-app lead (owner rulings Q8/Q9: AI
 * scoring is never off for booking leads). Never throws: a missing Redis or
 * BullMQ only costs the score, never the lead.
 */
import { context as otelContext, propagation } from '@opentelemetry/api';
import { requiredProdEnv } from '@intelliflow/validators/required-url';
import { loadBullMQ } from '../../lib/load-bullmq';

export interface LeadScoringJob {
  leadId: string;
  tenantId: string;
  lead: {
    email: string;
    source: string;
    firstName?: string;
    lastName?: string;
    company?: string;
    title?: string;
    phone?: string;
  };
  correlationId: string;
}

export async function enqueueLeadScoring(job: LeadScoringJob): Promise<void> {
  try {
    const { Queue } = await loadBullMQ();
    const { QUEUE_NAMES } = await import('@intelliflow/platform/queues/types');
    const queue = new Queue(QUEUE_NAMES.AI_SCORING, {
      connection: {
        host: requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost'),
        port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    });
    const otelCarrier: Record<string, string> = {};
    propagation.inject(otelContext.active(), otelCarrier);
    await queue.add('score-lead', { ...job, _otelCarrier: otelCarrier });
    await queue.close();
  } catch (error) {
    // Ids only — never the lead's email or name.
    console.warn('[lead-scoring] Failed to enqueue AI scoring', {
      leadId: job.leadId,
      correlationId: job.correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
