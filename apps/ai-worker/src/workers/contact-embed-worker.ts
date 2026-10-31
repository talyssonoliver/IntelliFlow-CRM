/**
 * IFC-310 — Contact Embedding Worker.
 *
 * Consumes `intelliflow-contact-embed` jobs dispatched by
 * ContactDuplicateDetectionService post-commit. Generates a pgvector
 * embedding for the contact and persists it via `updateContactEmbedding`.
 *
 * Mirrors the shape of `reindex-worker.ts` (same queue conventions, same
 * retry config, shared Redis connection).
 *
 * Queue: intelliflow-contact-embed
 */

import { DelayedError, Job, Worker, Queue, QueueEvents } from 'bullmq';
import { getDrainDelaySeconds } from '@intelliflow/platform/queues/connection';
import { PrismaClient } from '@intelliflow/db';
import { z } from 'zod';
import { tenantContextStore } from '../tracing/tenant-context';
import { isPurposeCeilingReached } from '../lib/purpose-ceiling';
import {
  isRestrictedOrErased,
  writeContactIfStillEligible,
  type GuardPrisma,
} from '../lib/data-request-guard';

export const CONTACT_EMBED_QUEUE_NAME = 'intelliflow-contact-embed';

/**
 * PG-199 (owner Q8): when the tenant's rag purpose has reached its monthly ceiling the job
 * is moved back to delayed and re-checked after this interval (raising the ceiling
 * mid-month resumes it). Never failed, so it never burns retries or dead-letters.
 */
export const CEILING_RETRY_DELAY_MS = 15 * 60_000;

export const ContactEmbedJobDataSchema = z.object({
  contactId: z.string().min(1),
  tenantId: z.string().min(1),
  reason: z.enum(['create', 'update', 'merge']),
});

export type ContactEmbedJobData = z.infer<typeof ContactEmbedJobDataSchema>;

export interface ContactEmbedJobResult {
  contactId: string;
  embedded: boolean;
  reason: string;
  elapsedMs: number;
  completedAt: string;
}

export interface EmbeddingChainLike {
  generateEmbedding(text: string): Promise<number[] | null>;
}

/**
 * Writes the embedding through the client it is given. The worker passes the transaction that
 * holds the contact row lock (PG-203), so the write must not use any other client.
 */
export interface UpdateContactEmbeddingFn {
  (db: PrismaClient, contactId: string, tenantId: string, embedding: number[]): Promise<void>;
}

export function contactToEmbeddableText(c: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  company?: string | null;
}): string {
  return [c.firstName, c.lastName, c.email, c.company]
    .filter((v): v is string => Boolean(v && typeof v === 'string'))
    .join(' ')
    .trim();
}

export class ContactEmbedWorker {
  private worker: Worker<ContactEmbedJobData, ContactEmbedJobResult> | null = null;
  private queue: Queue<ContactEmbedJobData, ContactEmbedJobResult> | null = null;
  private queueEvents: QueueEvents | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redisConnection: { host: string; port: number; password?: string },
    private readonly embeddingChain: EmbeddingChainLike,
    private readonly updateContactEmbedding: UpdateContactEmbeddingFn
  ) {}

  async start(): Promise<void> {
    this.queue = new Queue<ContactEmbedJobData, ContactEmbedJobResult>(CONTACT_EMBED_QUEUE_NAME, {
      connection: this.redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400, count: 200 },
        removeOnFail: { age: 604800, count: 1000 },
      },
    });

    this.queueEvents = new QueueEvents(CONTACT_EMBED_QUEUE_NAME, {
      connection: this.redisConnection,
    });

    this.worker = new Worker<ContactEmbedJobData, ContactEmbedJobResult>(
      CONTACT_EMBED_QUEUE_NAME,
      async (job, token) => this.process(job, token),
      {
        connection: this.redisConnection,
        concurrency: 5,
        drainDelay: getDrainDelaySeconds(),
      }
    );

    this.worker.on('failed', (job, error) => {
      console.warn(`[contact-embed-worker] job ${job?.id} failed:`, error?.message);
    });
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queueEvents?.close();
    await this.queue?.close();
  }

  async process(job: Job<ContactEmbedJobData>, token?: string): Promise<ContactEmbedJobResult> {
    const data = ContactEmbedJobDataSchema.parse(job.data);
    // PG-199: the embedding is metered and capped for this job's tenant.
    return tenantContextStore.run({ tenantId: data.tenantId }, () =>
      this.processForTenant(job, data, token)
    );
  }

  private async processForTenant(
    job: Job<ContactEmbedJobData>,
    data: ContactEmbedJobData,
    token: string | undefined
  ): Promise<ContactEmbedJobResult> {
    const start = Date.now();

    const contact = await (
      this.prisma as unknown as {
        contact: {
          findFirst: (args: {
            where: { id: string; tenantId: string };
            select: Record<string, true>;
          }) => Promise<{
            id: string;
            firstName: string | null;
            lastName: string | null;
            email: string | null;
            company: string | null;
          } | null>;
        };
      }
    ).contact.findFirst({
      where: { id: data.contactId, tenantId: data.tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        company: true,
      },
    });

    // PG-203 (owner Q18): an erased or restricted person is not sent to the embedding model.
    // Checked here, not only when queued, so jobs queued before the restriction are caught.
    if (
      !contact ||
      (contact.email &&
        (await isRestrictedOrErased(
          this.prisma as unknown as GuardPrisma,
          data.tenantId,
          contact.email
        )))
    ) {
      return {
        contactId: data.contactId,
        embedded: false,
        reason: data.reason,
        elapsedMs: Date.now() - start,
        completedAt: new Date().toISOString(),
      };
    }

    const text = contactToEmbeddableText(contact);
    if (!text) {
      return {
        contactId: data.contactId,
        embedded: false,
        reason: data.reason,
        elapsedMs: Date.now() - start,
        completedAt: new Date().toISOString(),
      };
    }

    let embedding: number[] | null;
    try {
      embedding = await this.embeddingChain.generateEmbedding(text);
    } catch (error) {
      if (!isPurposeCeilingReached(error) || !token) throw error;
      await job.moveToDelayed(Date.now() + CEILING_RETRY_DELAY_MS, token);
      throw new DelayedError();
    }
    if (!embedding || embedding.length === 0) {
      return {
        contactId: data.contactId,
        embedded: false,
        reason: data.reason,
        elapsedMs: Date.now() - start,
        completedAt: new Date().toISOString(),
      };
    }

    // PG-203 (codex): the person may have been erased or restricted during the embedding call.
    // Write only under the contact row lock, after re-checking, so the erasure always wins.
    const outcome = await writeContactIfStillEligible(
      this.prisma as never,
      { contactId: data.contactId, tenantId: data.tenantId, email: contact.email ?? '' },
      (tx) =>
        this.updateContactEmbedding(
          tx as unknown as PrismaClient,
          data.contactId,
          data.tenantId,
          embedding
        )
    );

    return {
      contactId: data.contactId,
      embedded: outcome.written,
      reason: data.reason,
      elapsedMs: Date.now() - start,
      completedAt: new Date().toISOString(),
    };
  }
}

/**
 * Factory for bootstrap / main.ts registration.
 * Mirrors `createReindexWorker` shape.
 */
export function createContactEmbedWorker(
  prisma: PrismaClient,
  redisConnection: { host: string; port: number; password?: string },
  embeddingChain: EmbeddingChainLike,
  updateContactEmbedding: UpdateContactEmbeddingFn
): ContactEmbedWorker {
  return new ContactEmbedWorker(prisma, redisConnection, embeddingChain, updateContactEmbedding);
}
