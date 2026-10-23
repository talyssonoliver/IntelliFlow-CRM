/**
 * Queue AI lead scoring for a newly created lead (best-effort).
 *
 * Extracted from lead.router `create` (PG-203) so the public booking flow scores
 * the leads it creates exactly like an in-app lead (owner rulings Q8/Q9: AI
 * scoring is never off for booking leads). Never throws: a missing Redis or
 * BullMQ only costs the score, never the lead.
 *
 * PG-203 (owner Q18): a person with an active processing restriction is never sent for AI
 * scoring. The reader is a required argument so no caller can skip the check, and a failed
 * check skips the job (not scoring is the safe direction). The worker checks again, which
 * also covers jobs queued before a restriction became active.
 */
import { context as otelContext, propagation } from '@opentelemetry/api';
import type { ProcessingRestrictionPort } from '@intelliflow/application';
import { requiredProdEnv } from '@intelliflow/validators/required-url';
import { loadBullMQ } from '../../lib/load-bullmq';

export type RestrictionReader = Pick<ProcessingRestrictionPort, 'status'>;

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

async function isRestricted(job: LeadScoringJob, restrictions: RestrictionReader) {
  try {
    return (await restrictions.status(job.tenantId, job.lead.email)).restricted;
  } catch (error) {
    console.warn('[lead-scoring] Restriction check failed; not scoring', {
      leadId: job.leadId,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return true;
  }
}

export async function enqueueLeadScoring(
  job: LeadScoringJob,
  restrictions: RestrictionReader
): Promise<void> {
  if (await isRestricted(job, restrictions)) {
    console.info('[lead-scoring] Not queued: processing is restricted', { leadId: job.leadId });
    return;
  }
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
