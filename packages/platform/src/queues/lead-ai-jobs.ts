/**
 * The AI jobs one lead gets: scoring, qualification and (with an owner) the next best action.
 *
 * Pure planning, no Redis: the API (lead create/update, booking, COA sync, portal) and the
 * events-worker's lead.created backstop both plan from here, so the same lead always produces
 * the same jobIds and whichever producer runs second queues nothing (AI agents epic, PR 1a).
 *
 * Dedupe: every jobId is built from the lead id and a hash of the fields the agents read. BullMQ
 * ignores an add whose jobId it still holds, and completed jobs are kept for LEAD_AI_DEDUPE_DAYS,
 * so a re-sync or an update that changes none of those fields queues nothing new. A real change
 * (new company, title, email, owner...) gives a new hash and runs.
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

/** How long a finished job keeps its jobId, so an unchanged lead is not re-run. */
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

/** A short hash of what the lead agents read. Same lead data, same hash, same jobIds. */
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
 * parts (its repeatable-job format), so ':' is never used here.
 */
export function leadAiJobId(kind: LeadAiJobKind, leadId: string, hash: string): string {
  return `lead-ai.${kind}.${leadId}.${hash}`;
}

function jobOptions(jobId: string, retries: boolean): LeadAiJobOptions {
  return {
    jobId,
    removeOnComplete: { age: LEAD_AI_DEDUPE_DAYS * DAY_SECONDS },
    removeOnFail: { age: 7 * DAY_SECONDS },
    ...(retries ? { attempts: 3, backoff: { type: 'exponential' as const, delay: 30_000 } } : {}),
  };
}

/** The jobs one lead gets, in the order they should be added. */
export function plannedLeadAiJobs(job: LeadAiJob): PlannedLeadAiJob[] {
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
    options: jobOptions(leadAiJobId(predictionType, job.leadId, hash), true),
  });
  const jobs: PlannedLeadAiJob[] = [
    {
      queue: 'AI_SCORING',
      name: 'score-lead',
      data: { ...job },
      // Scoring keeps its own failure handling (an inconclusive answer fails once).
      options: jobOptions(leadAiJobId('SCORE', job.leadId, hash), false),
    },
    prediction('QUALIFICATION'),
  ];
  if (job.ownerId) jobs.push(prediction('NEXT_BEST_ACTION'));
  return jobs;
}
