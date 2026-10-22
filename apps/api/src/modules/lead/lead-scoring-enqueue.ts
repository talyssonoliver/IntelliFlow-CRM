/**
 * Queue AI lead scoring for a newly created lead (best-effort).
 *
 * Extracted from lead.router `create` (PG-203) so the public booking flow scores
 * the leads it creates exactly like an in-app lead (owner rulings Q8/Q9: AI
 * scoring is never off for booking leads). Never throws: a missing Redis or
 * BullMQ only costs the score, never the lead.
 */
import { context as otelContext, propagation } from '@opentelemetry/api';
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

/** Longest a booking's detached scoring call may wait on Redis before giving up. */
const ENQUEUE_TIMEOUT_MS = 5_000;
/**
 * Most enqueue calls that may still be unsettled at once. A timed-out add keeps running until
 * Redis answers, so during an outage new calls are refused here instead of piling up payloads.
 */
const MAX_IN_FLIGHT = 50;
const ERROR_LOG_INTERVAL_MS = 60_000;

let inFlight = 0;

interface ScoringQueue {
  add(name: string, data: unknown): Promise<unknown>;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

let queuePromise: Promise<ScoringQueue> | null = null;

/**
 * One process-wide queue, created on first use and reused: a call never opens its own Redis
 * connection, so traffic while Redis is down cannot pile up reconnecting clients.
 */
function scoringQueue(): Promise<ScoringQueue> {
  queuePromise ??= (async () => {
    const { Queue } = await loadBullMQ();
    const { QUEUE_NAMES } = await import('@intelliflow/platform/queues/types');
    const { getDefaultConnectionConfig } = await import('@intelliflow/platform/queues/connection');
    // The workers' own settings (host, password, db, TLS), so jobs reach the consumer. A
    // producer, not a blocking worker: commands fail fast while Redis is unreachable instead of
    // retrying or queueing offline without limit.
    const redis = getDefaultConnectionConfig();
    const queue: ScoringQueue = new Queue(QUEUE_NAMES.AI_SCORING, {
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
      console.warn('[lead-scoring] queue connection error', { error: error.name });
    });
    return queue;
  })().catch((error: unknown) => {
    // Loading failed (no BullMQ/platform): try again on the next call.
    queuePromise = null;
    throw error;
  });
  return queuePromise;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`enqueue timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export async function enqueueLeadScoring(job: LeadScoringJob): Promise<void> {
  try {
    if (inFlight >= MAX_IN_FLIGHT) {
      throw new Error(`enqueue skipped: ${MAX_IN_FLIGHT} calls still waiting on Redis`);
    }
    inFlight += 1;
    // Released when the add itself settles, not when we stop waiting for it.
    const work = (async () => {
      const queue = await scoringQueue();
      const otelCarrier: Record<string, string> = {};
      propagation.inject(otelContext.active(), otelCarrier);
      return queue.add('score-lead', { ...job, _otelCarrier: otelCarrier });
    })().finally(() => {
      inFlight -= 1;
    });
    await withTimeout(work, ENQUEUE_TIMEOUT_MS);
  } catch (error) {
    // Ids only — never the lead's email or name.
    console.warn('[lead-scoring] Failed to enqueue AI scoring', {
      leadId: job.leadId,
      correlationId: job.correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
