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
    // Kept as long as a run's claim can stay open (LEAD_AI_DEDUPE_DAYS, never extended), so a
    // retry of an open run always finds its landed jobs and BullMQ dedupes them (codex).
    removeOnComplete: { age: LEAD_AI_DEDUPE_DAYS * DAY_SECONDS },
    removeOnFail: { age: LEAD_AI_DEDUPE_DAYS * DAY_SECONDS },
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

// ─── Per-lead run claim (Redis) ─────────────────────────────────────────────
//
// One key per lead holds `<fingerprint>|<runId>|<state>`, state `open` or `done`:
// - new data (another fingerprint, or no key): a new run is claimed `open` with a fresh runId;
// - the same data `done`: nothing to do;
// - the same data still `open` (an earlier run failed part-way, timed out, or is in flight in
//   the other producer): the SAME runId is handed back, so re-adding its jobs is deduped by
//   their stable job ids and only the ones that never landed are added.
// Nothing is ever released, so a claim can never undo or clobber another run (codex rounds).

/** What the run flow needs from the claim store. */
export interface LeadAiClaimStore {
  /** The runId to queue under, or null when this exact data is already done. */
  claim(
    key: string,
    fingerprint: string,
    newRunId: string,
    ttlSeconds: number
  ): Promise<string | null>;
  /** Mark the run done, only if the key still holds this run. */
  complete(key: string, fingerprint: string, runId: string, ttlSeconds: number): Promise<void>;
}

/** Where a lead's run claim lives. A Redis key, not a jobId, so ':' is fine. */
export function leadAiClaimKey(job: Pick<LeadAiJob, 'tenantId' | 'leadId'>): string {
  return `lead-ai:last:${job.tenantId}:${job.leadId}`;
}

const CLAIM_LUA = [
  "local prev = redis.call('GET', KEYS[1])",
  'if prev then',
  "  local fp, run, state = string.match(prev, '^([^|]*)|([^|]*)|([^|]*)$')",
  '  if fp == ARGV[1] then',
  "    if state == 'done' then return '' end",
  // An open run keeps its original expiry: it must not outlive the jobs it relies on.
  '    return run',
  '  end',
  'end',
  "redis.call('SET', KEYS[1], ARGV[1] .. '|' .. ARGV[2] .. '|open', 'EX', tonumber(ARGV[3]))",
  'return ARGV[2]',
].join('\n');

const COMPLETE_LUA = [
  "if redis.call('GET', KEYS[1]) == ARGV[1] .. '|' .. ARGV[2] .. '|open' then",
  "  redis.call('SET', KEYS[1], ARGV[1] .. '|' .. ARGV[2] .. '|done', 'EX', tonumber(ARGV[3]))",
  'end',
  'return 0',
].join('\n');

/** The part of BullMQ's Redis client (`queue.client`, IRedisClient) the claim uses. */
export interface LeadAiScriptRunner {
  defineCommand(name: string, definition: { numberOfKeys: number; lua: string }): void;
  runCommand(name: string, args: unknown[]): Promise<unknown>;
}

const definedScripts = new WeakMap<object, Set<string>>();

async function runScript(client: LeadAiScriptRunner, name: string, lua: string, args: unknown[]) {
  const defined = definedScripts.get(client) ?? new Set<string>();
  if (!defined.has(name)) {
    client.defineCommand(name, { numberOfKeys: 1, lua });
    defined.add(name);
    definedScripts.set(client, defined);
  }
  return client.runCommand(name, args);
}

/**
 * The claim store on BullMQ's Redis client. BullMQ 5 exposes no raw `eval`; Lua runs as a named
 * command, so each script is registered once per client and then run by name.
 */
export function claimStoreFromRedis(client: LeadAiScriptRunner): LeadAiClaimStore {
  return {
    claim: async (key, fingerprint, newRunId, ttlSeconds) => {
      const run = await runScript(client, 'leadAiClaimRun', CLAIM_LUA, [
        key,
        fingerprint,
        newRunId,
        ttlSeconds,
      ]);
      return typeof run === 'string' && run !== '' ? run : null;
    },
    complete: async (key, fingerprint, runId, ttlSeconds) => {
      await runScript(client, 'leadAiCompleteRun', COMPLETE_LUA, [
        key,
        fingerprint,
        runId,
        ttlSeconds,
      ]);
    },
  };
}

/**
 * The same semantics in memory, for tests and for a single process without Redis. Not shared
 * across processes.
 */
export function inMemoryLeadAiClaimStore(): LeadAiClaimStore & {
  peek(key: string): string | undefined;
} {
  const values = new Map<string, string>();
  return {
    claim: async (key, fingerprint, newRunId) => {
      const prev = values.get(key);
      if (prev) {
        const [fp, run, state] = prev.split('|');
        if (fp === fingerprint) return state === 'done' ? null : (run ?? newRunId);
      }
      values.set(key, `${fingerprint}|${newRunId}|open`);
      return newRunId;
    },
    complete: async (key, fingerprint, runId) => {
      if (values.get(key) === `${fingerprint}|${runId}|open`) {
        values.set(key, `${fingerprint}|${runId}|done`);
      }
    },
    peek: (key) => values.get(key),
  };
}

const CLAIM_TTL_SECONDS = LEAD_AI_DEDUPE_DAYS * DAY_SECONDS;

/**
 * Claim a run for this lead: the runId to queue under, or null when exactly this data was
 * already queued in full. Throws when Redis is unreachable; nothing is left that needs undoing,
 * because an `open` claim is simply retried by the next sync.
 */
export function claimLeadAiRun(
  store: LeadAiClaimStore,
  job: LeadAiJob,
  newRunId: string = newLeadAiRunId()
): Promise<string | null> {
  return store.claim(leadAiClaimKey(job), leadAiFingerprint(job), newRunId, CLAIM_TTL_SECONDS);
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
 * on its own (one failure does not stop the others), and mark the run done only when every add
 * went through. A partial run stays open, so the next sync of the same data retries it under the
 * same runId and only the missing jobs are added. 'unchanged' means this exact data was already
 * queued in full. Throws only when the claim itself cannot be made (Redis unreachable).
 */
export async function queueLeadAiRun(
  job: LeadAiJob,
  deps: LeadAiRunDeps,
  newRunId: string = newLeadAiRunId()
): Promise<LeadAiRunOutcome> {
  const runId = await claimLeadAiRun(deps.store, job, newRunId);
  if (runId === null) return 'unchanged';
  let failed = false;
  for (const planned of plannedLeadAiJobs(job, runId)) {
    try {
      await deps.addJob(planned);
    } catch (error) {
      failed = true;
      deps.onAddError(planned, error);
    }
  }
  if (failed) return 'partial';
  await deps.store.complete(leadAiClaimKey(job), leadAiFingerprint(job), runId, CLAIM_TTL_SECONDS);
  return 'queued';
}
