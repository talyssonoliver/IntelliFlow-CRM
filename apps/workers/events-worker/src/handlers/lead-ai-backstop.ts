/**
 * lead.created backstop (AI agents epic, PR 1a): queue the lead's AI work from the outbox event.
 *
 * The API queues scoring, qualification and the next best action when it creates a lead. This
 * handler plans the same jobs with the same deterministic jobIds (plannedLeadAiJobs in
 * @intelliflow/platform/queues), so when the API's enqueue went through, every add here is a
 * no-op; when it was lost (Redis down, process killed between commit and enqueue) the lead
 * still gets its agents. Safe to replay: a replayed event adds nothing new.
 *
 * Processing restrictions (PG-203 Q18) are not read here: the scoring and prediction workers
 * check them again before any model call, which is the check that covers queued jobs anyway.
 *
 * Never throws: the event's other effects must not be retried because an AI job was not queued.
 */
import {
  leadAiJobFromStoredLead,
  plannedLeadAiJobs,
  type PlannedLeadAiJob,
  type StoredLeadForAi,
} from '@intelliflow/platform';
import type { OutboxEvent } from '../outbox/event-dispatcher';

export interface LeadAiBackstopDeps {
  /** The lead as stored, read tenant-scoped; null when it no longer exists. */
  readLead(leadId: string, tenantId: string): Promise<StoredLeadForAi | null>;
  /** Add one planned job to its queue (QUEUE_NAMES[planned.queue]). */
  addJob(planned: PlannedLeadAiJob): Promise<void>;
  logger: {
    info(obj: object, msg: string): void;
    warn(obj: object, msg: string): void;
  };
}

export type LeadAiBackstopOutcome = 'queued' | 'no-tenant' | 'lead-missing' | 'read-failed';

export async function queueLeadAiForCreatedLead(
  event: Pick<OutboxEvent, 'aggregateId' | 'payload' | 'metadata'>,
  deps: LeadAiBackstopDeps
): Promise<LeadAiBackstopOutcome> {
  const leadId = event.aggregateId;
  const payloadTenant = event.payload['tenantId'];
  const tenantId =
    event.metadata.tenantId ?? (typeof payloadTenant === 'string' ? payloadTenant : undefined);
  if (!tenantId) {
    // The read is tenant-scoped, so without a tenant there is nothing safe to read.
    deps.logger.warn({ leadId }, 'lead.created has no tenant; AI backstop skipped');
    return 'no-tenant';
  }

  let lead: StoredLeadForAi | null;
  try {
    lead = await deps.readLead(leadId, tenantId);
  } catch (error) {
    deps.logger.warn(
      { leadId, error: error instanceof Error ? error.name : 'unknown' },
      'Could not read the lead; AI backstop skipped'
    );
    return 'read-failed';
  }
  if (!lead) return 'lead-missing';

  const job = leadAiJobFromStoredLead(
    { leadId, tenantId, correlationId: event.metadata.correlationId },
    lead
  );
  for (const planned of plannedLeadAiJobs(job)) {
    try {
      await deps.addJob(planned);
    } catch (error) {
      // Ids only — never the lead's email or name.
      deps.logger.warn(
        {
          leadId,
          job: planned.options.jobId.split('.')[1],
          error: error instanceof Error ? error.message : String(error),
        },
        'AI backstop could not queue a job'
      );
    }
  }
  deps.logger.info({ leadId }, 'AI backstop queued the lead agents (no-op if already queued)');
  return 'queued';
}
