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

import { Job, Worker, Queue, QueueEvents } from 'bullmq';
import { PrismaClient } from '@intelliflow/db';
import { z } from 'zod';

export const CONTACT_EMBED_QUEUE_NAME = 'intelliflow-contact-embed';

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

export interface UpdateContactEmbeddingFn {
  (
    prisma: PrismaClient,
    contactId: string,
    tenantId: string,
    embedding: number[],
  ): Promise<void>;
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
  private worker: Worker<ContactEmbedJobData, ContactEmbedJobResult> | null =
    null;
  private queue: Queue<ContactEmbedJobData, ContactEmbedJobResult> | null =
    null;
  private queueEvents: QueueEvents | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redisConnection: { host: string; port: number; password?: string },
    private readonly embeddingChain: EmbeddingChainLike,
    private readonly updateContactEmbedding: UpdateContactEmbeddingFn,
  ) {}

  async start(): Promise<void> {
    this.queue = new Queue<ContactEmbedJobData, ContactEmbedJobResult>(
      CONTACT_EMBED_QUEUE_NAME,
      {
        connection: this.redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 86400, count: 200 },
          removeOnFail: { age: 604800, count: 1000 },
        },
      },
    );

    this.queueEvents = new QueueEvents(CONTACT_EMBED_QUEUE_NAME, {
      connection: this.redisConnection,
    });

    this.worker = new Worker<ContactEmbedJobData, ContactEmbedJobResult>(
      CONTACT_EMBED_QUEUE_NAME,
      async (job) => this.process(job),
      {
        connection: this.redisConnection,
        concurrency: 5,
      },
    );

    this.worker.on('failed', (job, error) => {
      console.warn(
        `[contact-embed-worker] job ${job?.id} failed:`,
        error?.message,
      );
    });
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queueEvents?.close();
    await this.queue?.close();
  }

  async process(
    job: Job<ContactEmbedJobData>,
  ): Promise<ContactEmbedJobResult> {
    const start = Date.now();
    const data = ContactEmbedJobDataSchema.parse(job.data);

    const contact = await (
      this.prisma as unknown as {
        contact: {
          findFirst: (args: {
            where: { id: string; tenantId: string };
            select: Record<string, true>;
          }) => Promise<
            | {
                id: string;
                firstName: string | null;
                lastName: string | null;
                email: string | null;
                company: string | null;
              }
            | null
          >;
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

    if (!contact) {
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

    const embedding = await this.embeddingChain.generateEmbedding(text);
    if (!embedding || embedding.length === 0) {
      return {
        contactId: data.contactId,
        embedded: false,
        reason: data.reason,
        elapsedMs: Date.now() - start,
        completedAt: new Date().toISOString(),
      };
    }

    await this.updateContactEmbedding(
      this.prisma,
      data.contactId,
      data.tenantId,
      embedding,
    );

    return {
      contactId: data.contactId,
      embedded: true,
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
  updateContactEmbedding: UpdateContactEmbeddingFn,
): ContactEmbedWorker {
  return new ContactEmbedWorker(
    prisma,
    redisConnection,
    embeddingChain,
    updateContactEmbedding,
  );
}
