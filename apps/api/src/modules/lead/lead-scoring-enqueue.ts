/**
 * Queue the AI work for a lead (best-effort): scoring, qualification and the next best action.
 *
 * Extracted from lead.router `create` (PG-203) so every path that creates or changes a lead
 * (in-app create and update, public booking, COA pipeline sync, the portal form) runs the same
 * AI agents (owner rulings Q8/Q9: AI scoring is never off for booking leads; owner complaint
 * 2026-11-12: "previously we had 14 agents running and now just the score one runs"). Never
 * throws: a missing Redis or BullMQ only costs the AI result, never the lead.
 *
 * PG-203 (owner Q18): a person with an active processing restriction is never sent to an AI
 * agent. The reader is a required argument so no caller can skip the check, and a failed check
 * skips the jobs (not processing is the safe direction). The workers check again, which also
 * covers jobs queued before a restriction became active.
 *
 * Which jobs, and their deterministic jobIds, come from `plannedLeadAiJobs` in
 * @intelliflow/platform/queues, shared with the events-worker's lead.created backstop: an
 * unchanged lead re-queued by either producer is a no-op (see lead-ai-jobs.ts).
 *
 * Budget: AI_MONTHLY_BUDGET_USD is enforced by the workers before every paid model call; a job
 * that hits it fails once without retries (prediction and scoring map it to UnrecoverableError).
 */
import { context as otelContext, propagation } from '@opentelemetry/api';
import type { ProcessingRestrictionPort } from '@intelliflow/application';
import type { PrismaClient } from '@intelliflow/db';
import {
  QUEUE_NAMES,
  STORED_LEAD_FOR_AI_SELECT,
  getDefaultConnectionConfig,
  leadAiJobFromStoredLead,
  queueLeadAiRun,
  claimStoreFromRedis,
  type LeadAiScriptRunner,
  type LeadAiJob,
  type LeadAiJobOptions,
  type LeadAiQueueKey,
  type PlannedLeadAiJob,
} from '@intelliflow/platform/queues';
import { loadBullMQ } from '../../lib/load-bullmq';

export type RestrictionReader = Pick<ProcessingRestrictionPort, 'status'>;

/** The lead the agents are queued for (planned in @intelliflow/platform/queues). */
export type LeadScoringJob = LeadAiJob;

/** Longest a detached enqueue may wait on Redis before giving up. */
const ENQUEUE_TIMEOUT_MS = 5_000;
/**
 * Most enqueue calls that may still be unsettled at once. A timed-out add keeps running until
 * Redis answers, so during an outage new calls are refused here instead of piling up payloads.
 */
const MAX_IN_FLIGHT = 50;
const ERROR_LOG_INTERVAL_MS = 60_000;

let inFlight = 0;

interface LeadQueue {
  add(name: string, data: unknown, options: LeadAiJobOptions): Promise<unknown>;
  /** BullMQ's own Redis connection (ioredis), used for the per-lead claim. */
  client: Promise<LeadAiScriptRunner>;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

const queuePromises = new Map<LeadAiQueueKey, Promise<LeadQueue>>();

/**
 * One process-wide queue per queue name, created on first use and reused: a call never opens
 * its own Redis connection, so traffic while Redis is down cannot pile up reconnecting clients.
 */
function leadQueue(key: LeadAiQueueKey): Promise<LeadQueue> {
  const existing = queuePromises.get(key);
  if (existing) return existing;
  const created = (async () => {
    const { Queue } = await loadBullMQ();
    // The workers' own settings (host, password, db, TLS), so jobs reach the consumer. A
    // producer, not a blocking worker: commands fail fast while Redis is unreachable instead of
    // retrying or queueing offline without limit.
    const redis = getDefaultConnectionConfig();
    const queue: LeadQueue = new Queue(QUEUE_NAMES[key], {
      connection: {
        host: redis.host,
        port: redis.port,
        password: redis.password,
        db: redis.db,
        ...(redis.tls ? { tls: {} } : {}),
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
    });
    let lastLogged = 0;
    queue.on('error', (error) => {
      const now = Date.now();
      if (now - lastLogged < ERROR_LOG_INTERVAL_MS) return;
      lastLogged = now;
      console.warn('[lead-ai] queue connection error', { queue: key, error: error.name });
    });
    return queue;
  })().catch((error: unknown) => {
    // Loading failed (no BullMQ): try again on the next call.
    queuePromises.delete(key);
    throw error;
  });
  queuePromises.set(key, created);
  return created;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`enqueue timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function isRestricted(job: LeadScoringJob, restrictions: RestrictionReader) {
  try {
    return (await restrictions.status(job.tenantId, job.lead.email)).restricted;
  } catch (error) {
    console.warn('[lead-ai] Restriction check failed; not queuing AI work', {
      leadId: job.leadId,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return true;
  }
}

async function addJob(planned: PlannedLeadAiJob): Promise<void> {
  if (inFlight >= MAX_IN_FLIGHT) {
    throw new Error(`enqueue skipped: ${MAX_IN_FLIGHT} calls still waiting on Redis`);
  }
  inFlight += 1;
  // Released when the add itself settles, not when we stop waiting for it.
  const work = (async () => {
    const queue = await leadQueue(planned.queue);
    const otelCarrier: Record<string, string> = {};
    propagation.inject(otelContext.active(), otelCarrier);
    return queue.add(planned.name, { ...planned.data, _otelCarrier: otelCarrier }, planned.options);
  })().finally(() => {
    inFlight -= 1;
  });
  await withTimeout(work, ENQUEUE_TIMEOUT_MS);
}

/** Reads the lead the agents will see (one tenant-scoped query). */
type StoredLeadReader = Pick<PrismaClient, 'lead'>;

/**
 * Queue the lead's AI work from the lead as stored: for paths that create or touch a lead
 * without holding the domain object (COA pipeline sync, the portal form, call booking). Reading
 * the stored row keeps the dedupe hash identical to an in-app update of the same lead, so a
 * re-sync of an unchanged lead queues nothing. Tenant-scoped; never throws.
 */
export async function enqueueLeadAiById(
  prisma: StoredLeadReader,
  restrictions: RestrictionReader,
  ref: { leadId: string; tenantId: string; correlationId: string }
): Promise<void> {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: ref.leadId, tenantId: ref.tenantId },
      select: STORED_LEAD_FOR_AI_SELECT,
    });
    if (!lead) return;
    await enqueueLeadAi(leadAiJobFromStoredLead(ref, lead), restrictions);
  } catch (error) {
    console.warn('[lead-ai] Could not read the lead to queue its AI work', {
      leadId: ref.leadId,
      correlationId: ref.correlationId,
      error: error instanceof Error ? error.name : 'unknown',
    });
  }
}

/**
 * Queue scoring, qualification and (with an owner) the next best action for one lead, unless
 * the agents already ran on exactly this data (queueLeadAiRun). Each job is added on its own, so
 * one failing add does not stop the others. Never throws.
 */
export async function enqueueLeadAi(
  job: LeadScoringJob,
  restrictions: RestrictionReader
): Promise<void> {
  if (await isRestricted(job, restrictions)) {
    console.info('[lead-ai] Not queued: processing is restricted', { leadId: job.leadId });
    return;
  }
  try {
    // The claim lives in the workers' Redis, reached through the scoring queue's connection.
    const store = await withTimeout(
      leadQueue('AI_SCORING').then(async (queue) => claimStoreFromRedis(await queue.client)),
      ENQUEUE_TIMEOUT_MS
    );
    const outcome = await queueLeadAiRun(job, {
      store: {
        eval: (...args) => withTimeout(store.eval(...args), ENQUEUE_TIMEOUT_MS),
      },
      addJob,
      onAddError: (planned, error) => {
        // Ids only — never the lead's email or name.
        console.warn('[lead-ai] Failed to enqueue AI job', {
          leadId: job.leadId,
          job: planned.options.jobId.split('.')[1],
          correlationId: job.correlationId,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    });
    if (outcome === 'unchanged') {
      console.info('[lead-ai] Not queued: unchanged since last queued', { leadId: job.leadId });
    }
  } catch (error) {
    console.warn('[lead-ai] Could not queue AI work', {
      leadId: job.leadId,
      correlationId: job.correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
