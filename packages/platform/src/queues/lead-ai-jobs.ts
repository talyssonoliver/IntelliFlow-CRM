/**
 * The AI jobs one lead gets: scoring, qualification and (with an owner) the next best action.
 *
 * The API (lead create/update, booking, COA sync, portal) and the events-worker's lead.created
 * backstop both plan from here (AI agents epic, PR 1a).
 *
 * Dedupe: a lead is queued only when what the agents read has changed since the lead was last
 * queued. claimLeadAiRun atomically swaps the lead's last queued fingerprint in Redis (kept for
 * LEAD_AI_DEDUPE_DAYS) and says whether it changed, so a re-sync or an update that changes none
 * of those fields queues nothing, and when both producers see the same lead only one queues it.
 * Comparing with the LAST fingerprint (not every fingerprint ever queued) means a lead that goes
 * A -> B -> A is queued again on the return to A, instead of keeping B's results (codex).
 */
import { createHash } from 'node:crypto';
import type { QUEUE_NAMES } from './types';

/** Keys of QUEUE_NAMES the lead jobs go to (QUEUE_NAMES[key] is the BullMQ queue name). */
export type LeadAiQueueKey = Extract<keyof typeof QUEUE_NAMES, 'AI_SCORING' | 'AI_PREDICTION'>;

export interface LeadAiJob {
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
  /**
   * The lead's owner. The next-best-action agent needs a user to recommend actions for, so it
   * is queued only when an owner is known; scoring and qualification run either way.
   */
  ownerId?: string;
}

/** How long a lead's last queued fingerprint is kept: an unchanged lead is not re-run within it. */
export const LEAD_AI_DEDUPE_DAYS = 30;
const DAY_SECONDS = 24 * 60 * 60;

export type LeadAiJobKind = 'SCORE' | 'QUALIFICATION' | 'NEXT_BEST_ACTION';

export interface LeadAiJobOptions {
  jobId: string;
  removeOnComplete: { age: number };
  removeOnFail: { age: number };
  attempts?: number;
  backoff?: { type: 'exponential'; delay: number };
}

export interface PlannedLeadAiJob {
  queue: LeadAiQueueKey;
  name: string;
  data: Record<string, unknown>;
  options: LeadAiJobOptions;
}

/** A lead row as stored (Prisma nulls), with the fields the agents read. */
export interface StoredLeadForAi {
  email: string;
  source: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  phone: string | null;
  ownerId: string | null;
}

/** The Prisma `select` that reads exactly {@link StoredLeadForAi}. */
export const STORED_LEAD_FOR_AI_SELECT = {
  email: true,
  source: true,
  firstName: true,
  lastName: true,
  company: true,
  title: true,
  phone: true,
  ownerId: true,
} as const;

/**
 * A stored lead as a job. Every producer that starts from the database row goes through here,
 * so its hash matches an in-app create or update of the same lead.
 */
export function leadAiJobFromStoredLead(
  ref: { leadId: string; tenantId: string; correlationId: string },
  lead: StoredLeadForAi
): LeadAiJob {
  return {
    leadId: ref.leadId,
    tenantId: ref.tenantId,
    lead: {
      email: lead.email,
      source: lead.source,
      firstName: lead.firstName ?? undefined,
      lastName: lead.lastName ?? undefined,
      company: lead.company ?? undefined,
      title: lead.title ?? undefined,
      phone: lead.phone ?? undefined,
    },
    correlationId: ref.correlationId,
    ...(lead.ownerId ? { ownerId: lead.ownerId } : {}),
  };
}

/** A short hash of what the lead agents read. Same lead data, same hash. */
export function leadAiFingerprint(job: LeadAiJob): string {
  const { email, source, firstName, lastName, company, title, phone } = job.lead;
  const fields = [
    email.trim().toLowerCase(),
    source,
    firstName ?? '',
    lastName ?? '',
    company ?? '',
    title ?? '',
    phone ?? '',
    job.ownerId ?? '',
  ];
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex').slice(0, 16);
}

/**
 * Dot-separated: BullMQ refuses a custom jobId with ':' unless it splits into exactly three
 * parts (its repeatable-job format), so ':' is never used here. `runId` makes each queued run's
 * ids unique, so finished jobs from an earlier run never block a later one.
 */
export function leadAiJobId(
  kind: LeadAiJobKind,
  leadId: string,
  hash: string,
  runId: string
): string {
  return `lead-ai.${kind}.${leadId}.${hash}.${runId}`;
}

/** A new run id: unique per queued run, and readable in Bull Board as a time. */
export function newLeadAiRunId(now: Date = new Date()): string {
  return now.getTime().toString(36);
}

function jobOptions(jobId: string, retries: boolean): LeadAiJobOptions {
  return {
    jobId,
    removeOnComplete: { age: 7 * DAY_SECONDS },
    removeOnFail: { age: 7 * DAY_SECONDS },
    ...(retries ? { attempts: 3, backoff: { type: 'exponential' as const, delay: 30_000 } } : {}),
  };
}

/** The jobs one lead gets for one run, in the order they should be added. */
export function plannedLeadAiJobs(job: LeadAiJob, runId: string): PlannedLeadAiJob[] {
  const hash = leadAiFingerprint(job);
  const prediction = (predictionType: 'QUALIFICATION' | 'NEXT_BEST_ACTION'): PlannedLeadAiJob => ({
    queue: 'AI_PREDICTION',
    name: 'predict',
    data: {
      entityType: 'lead',
      entityId: job.leadId,
      predictionType,
      tenantId: job.tenantId,
      // The worker sends the queued context to the model as it is, after checking the address
      // still belongs to this lead (PG-203 #1002), so it names the person just checked.
      context: {
        ...job.lead,
        ...(job.ownerId ? { userId: job.ownerId } : {}),
      },
      correlationId: job.correlationId,
    },
    options: jobOptions(leadAiJobId(predictionType, job.leadId, hash, runId), true),
  });
  const jobs: PlannedLeadAiJob[] = [
    {
      queue: 'AI_SCORING',
      name: 'score-lead',
      data: { ...job },
      // Scoring keeps its own failure handling (an inconclusive answer fails once).
      options: jobOptions(leadAiJobId('SCORE', job.leadId, hash, runId), false),
    },
    prediction('QUALIFICATION'),
  ];
  if (job.ownerId) jobs.push(prediction('NEXT_BEST_ACTION'));
  return jobs;
}

// ─── Last-queued fingerprint (Redis) ────────────────────────────────────────

/** The Redis client surface the claim needs (ioredis `eval`, as BullMQ's `queue.client`). */
export interface LeadAiClaimStore {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

/** The part of BullMQ's Redis client (`queue.client`, IRedisClient) the claim uses. */
export interface LeadAiScriptRunner {
  defineCommand(name: string, definition: { numberOfKeys: number; lua: string }): void;
  runCommand(name: string, args: unknown[]): Promise<unknown>;
}

const definedScripts = new WeakMap<object, Set<string>>();

/**
 * Adapt BullMQ's Redis client to the claim store. BullMQ 5 exposes no raw `eval`; Lua runs as a
 * named command, so each script is registered once per client and then run by name.
 */
export function claimStoreFromRedis(client: LeadAiScriptRunner): LeadAiClaimStore {
  return {
    eval: async (script, numKeys, ...args) => {
      const name = `leadAi${createHash('sha1').update(script).digest('hex').slice(0, 12)}`;
      const defined = definedScripts.get(client) ?? new Set<string>();
      if (!defined.has(name)) {
        client.defineCommand(name, { numberOfKeys: numKeys, lua: script });
        defined.add(name);
        definedScripts.set(client, defined);
      }
      return client.runCommand(name, args);
    },
  };
}
/** Where a lead's last queued fingerprint lives. A Redis key, not a jobId, so ':' is fine. */
export function leadAiClaimKey(job: Pick<LeadAiJob, 'tenantId' | 'leadId'>): string {
  return `lead-ai:last:${job.tenantId}:${job.leadId}`;
}

// Atomic swap: set the new fingerprint (refreshing its TTL) and return 1 when it differs from
// the previous one, 0 when the lead was last queued with this exact fingerprint.
const CLAIM_SCRIPT =
  "local prev = redis.call('GET', KEYS[1]) " +
  "redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2])) " +
  'if prev == ARGV[1] then return 0 end return 1';

// Undo a claim, only if it is still ours (a later run may have claimed since).
const RELEASE_SCRIPT =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0";

/**
 * Claim a run for this lead: true when what the agents read changed since it was last queued
 * (or it never was), so the caller should queue the jobs now. False means another run already
 * queued exactly this data. Throws when Redis is unreachable; the caller treats that as "not
 * queued", like a failed add.
 */
export async function claimLeadAiRun(store: LeadAiClaimStore, job: LeadAiJob): Promise<boolean> {
  const result = await store.eval(
    CLAIM_SCRIPT,
    1,
    leadAiClaimKey(job),
    leadAiFingerprint(job),
    LEAD_AI_DEDUPE_DAYS * DAY_SECONDS
  );
  return Number(result) === 1;
}

/**
 * Give a claim back when its jobs could not all be queued, so the next sync of the same data
 * tries again instead of being treated as done. Never throws.
 */
export async function releaseLeadAiRun(store: LeadAiClaimStore, job: LeadAiJob): Promise<void> {
  try {
    await store.eval(RELEASE_SCRIPT, 1, leadAiClaimKey(job), leadAiFingerprint(job));
  } catch {
    // The claim expires with its TTL; nothing more to do.
  }
}
export type LeadAiRunOutcome = 'queued' | 'unchanged' | 'partial';

export interface LeadAiRunDeps {
  store: LeadAiClaimStore;
  /** Add one planned job to its queue (QUEUE_NAMES[planned.queue]). */
  addJob(planned: PlannedLeadAiJob): Promise<void>;
  /** Told about each add that failed; the other jobs are still added. */
  onAddError(planned: PlannedLeadAiJob, error: unknown): void;
}

/**
 * The one way a lead's AI work is queued, shared by every producer: claim the run, add each job
 * on its own (one failure does not stop the others), and give the claim back if any add failed
 * so a later sync of the same data retries. 'unchanged' means this exact data was already
 * queued. Throws only when the claim itself cannot be made (Redis unreachable).
 */
export async function queueLeadAiRun(
  job: LeadAiJob,
  deps: LeadAiRunDeps,
  runId: string = newLeadAiRunId()
): Promise<LeadAiRunOutcome> {
  let claimed: boolean;
  try {
    claimed = await claimLeadAiRun(deps.store, job);
  } catch (error) {
    // A claim that failed on our side (a client timeout) may still have run on the server and
    // stored the fingerprint with no jobs behind it. Redis runs one connection's commands in
    // order, so this release lands after that swap and clears it (codex).
    await releaseLeadAiRun(deps.store, job);
    throw error;
  }
  if (!claimed) return 'unchanged';
  let failed = false;
  for (const planned of plannedLeadAiJobs(job, runId)) {
    try {
      await deps.addJob(planned);
    } catch (error) {
      failed = true;
      deps.onAddError(planned, error);
    }
  }
  if (!failed) return 'queued';
  await releaseLeadAiRun(deps.store, job);
  return 'partial';
}
