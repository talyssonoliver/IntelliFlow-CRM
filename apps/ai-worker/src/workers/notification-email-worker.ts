/**
 * Notification Email Queue Consumer (#230 fold)
 *
 * Boots a BullMQ worker inside ai-worker that consumes
 * `intelliflow-notifications-email` (QUEUE_NAMES.EMAIL_NOTIFICATIONS in
 * packages/platform/src/queues/types.ts).
 *
 * Why this exists: apps/workers/notifications-worker has no
 * working consumer for this queue (#230 — no railway.json, not in the
 * build/deploy matrix), so it has had no effective consumers since it started
 * being produced. The one real producer,
 * apps/api/src/modules/ticket/ticket.router.ts's notifyAssignee(), enqueues
 *   { type, recipientUserId, tenantId, subject, body, entityType, entityId }
 * — a shape that does NOT match notifications-worker's own
 * NotificationJobSchema (which required notificationId/channel/recipient.email
 * as UUIDs). So even a deploy of the old worker would have thrown on every
 * job; the contract was broken independently of the deployment gap. This
 * module is a fresh consumer written against the real payload instead of a
 * port of the old (never-exercised) schema.
 *
 * Email sending reuses the adapter already wired for production email in
 * apps/api/src/container.ts (createNotificationServiceAdapter →
 * RealNotificationServiceAdapter → EmailServiceAdapter → Resend/SendGrid),
 * rather than re-implementing notifications-worker's own Nodemailer/SMTP
 * channel — avoiding a second, divergent email-sending code path. Only the
 * brand HTML template (notification-email-template.ts) was ported as-is.
 *
 * Dependency-cycle note: mirrors the bootIngestionWorkers (D5 / #259) shape —
 * dependencies (user-email lookup, notification service) are injected so the
 * processor is unit-testable without Redis, Prisma, or a real email provider.
 *
 * @module workers/notification-email-worker
 * @task IFC-163 / #230
 */

import { Job, Worker, Queue } from 'bullmq';
import pino from 'pino';
import { z } from 'zod';
import { renderNotificationEmail } from './notification-email-template.js';
import type { Result, DomainError } from '@intelliflow/domain';
import type { NotificationResult } from '@intelliflow/application';

// ============================================================================
// Queue name (must match the producer in apps/api/.../ticket.router.ts, which
// reads it from QUEUE_NAMES.EMAIL_NOTIFICATIONS)
// ============================================================================

export const EMAIL_NOTIFICATIONS_QUEUE = 'intelliflow-notifications-email';

// ============================================================================
// Job data schema — mirrors the literal object ticket.router.ts's
// notifyAssignee() enqueues via `queue.add('notification:email', {...})`.
// Permissive on purpose: `recipientEmail` is accepted too so a future
// producer can skip the user-id lookup, but no current caller sends it.
// ============================================================================

export const NotificationEmailJobDataSchema = z.object({
  type: z.string(),
  recipientUserId: z.string().optional(),
  recipientEmail: z.string().email().optional(),
  tenantId: z.string(),
  subject: z.string(),
  body: z.string(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});

export type NotificationEmailJobData = z.infer<typeof NotificationEmailJobDataSchema>;

export interface NotificationEmailJobResult {
  delivered: boolean;
  reason?: string;
  messageId?: string;
}

// ============================================================================
// Dependency ports (kept minimal/local so this module never needs
// @intelliflow/adapters or @intelliflow/db at import time — only the real
// boot path in ai-worker.ts constructs and injects them).
// ============================================================================

export interface UserEmailLookup {
  findUserEmail(userId: string): Promise<string | null>;
}

export interface NotificationServiceLike {
  sendEmail(options: {
    to: string[];
    subject: string;
    textBody?: string;
    htmlBody?: string;
  }): Promise<Result<NotificationResult, DomainError>>;
}

interface ProcessDeps {
  users: UserEmailLookup;
  notificationService: NotificationServiceLike;
  logger: pino.Logger;
}

// ============================================================================
// Processor
// ============================================================================

export async function processNotificationEmailJob(
  job: Job<NotificationEmailJobData>,
  deps: ProcessDeps
): Promise<NotificationEmailJobResult> {
  const input = NotificationEmailJobDataSchema.parse(job.data);

  const jobLogger = deps.logger.child({
    jobId: job.id,
    type: input.type,
    tenantId: input.tenantId,
  });

  let toEmail = input.recipientEmail;
  if (!toEmail && input.recipientUserId) {
    toEmail = (await deps.users.findUserEmail(input.recipientUserId)) ?? undefined;
  }

  if (!toEmail) {
    jobLogger.warn(
      { recipientUserId: input.recipientUserId },
      'No resolvable recipient email — skipping delivery'
    );
    return { delivered: false, reason: 'no-recipient-email' };
  }

  const htmlBody = renderNotificationEmail({ subject: input.subject, body: input.body });

  const result = await deps.notificationService.sendEmail({
    to: [toEmail],
    subject: input.subject,
    textBody: input.body,
    htmlBody,
  });

  if (result.isFailure) {
    const reason = result.error?.message ?? 'send-failed';
    jobLogger.warn({ error: reason }, 'Notification email delivery failed — retrying via BullMQ');
    // Throw (not return) so BullMQ applies the queue's attempts/backoff policy
    // instead of recording a provider rejection as a completed job (codex-review
    // finding failed-email-completes-job): a resolved { delivered: false } looks
    // like success to BullMQ and the job is never retried or sent to the DLQ.
    throw new Error(reason);
  }

  jobLogger.info({ messageId: result.value.providerMessageId }, 'Notification email delivered');
  return { delivered: true, messageId: result.value.providerMessageId };
}

// ============================================================================
// Worker handle (returned from bootNotificationEmailWorker for graceful
// shutdown — mirrors IngestionWorkersHandle)
// ============================================================================

export interface NotificationEmailWorkerHandle {
  stop(): Promise<void>;
}

// ============================================================================
// Boot function — mirrors bootIngestionWorkers in ingestion-workers.ts
// ============================================================================

/**
 * Boot a BullMQ worker that consumes the notification-email queue.
 *
 * Must be called after Prisma + a NotificationServicePort are available
 * (same call-site as bootContactEmbedWorker/bootIngestionWorkers — inside
 * initPrismaDependentServices). Shutdown is handled by the returned handle.
 */
export async function bootNotificationEmailWorker(
  redisConnection: { host: string; port: number; password?: string; username?: string },
  deps: { users: UserEmailLookup; notificationService: NotificationServiceLike },
  logger: pino.Logger
): Promise<NotificationEmailWorkerHandle> {
  const workerLogger = logger.child({ component: 'notification-email-worker' });

  const defaultJobOptions = {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 2000 },
    removeOnComplete: { age: 3_600, count: 500 },
    removeOnFail: { age: 259_200, count: 1_000 },
  };

  const worker = new Worker<NotificationEmailJobData, NotificationEmailJobResult>(
    EMAIL_NOTIFICATIONS_QUEUE,
    (job) =>
      processNotificationEmailJob(job, {
        users: deps.users,
        notificationService: deps.notificationService,
        logger: workerLogger,
      }),
    {
      connection: redisConnection,
      concurrency: 3,
    }
  );
  worker.on('failed', (job, error) => {
    workerLogger.warn({ jobId: job?.id, err: error?.message }, 'notification-email job failed');
  });

  // Queue instance owns default-job-options only; the worker above owns consumption.
  const queue = new Queue<NotificationEmailJobData, NotificationEmailJobResult>(
    EMAIL_NOTIFICATIONS_QUEUE,
    {
      connection: redisConnection,
      defaultJobOptions,
    }
  );

  workerLogger.info(
    { queue: EMAIL_NOTIFICATIONS_QUEUE },
    'Notification email worker started — intelliflow-notifications-email queue now consumed'
  );

  return {
    async stop(): Promise<void> {
      await Promise.all([worker.close(), queue.close()]);
      workerLogger.info('Notification email worker stopped');
    },
  };
}

// ============================================================================
// Prisma-backed UserEmailLookup — used by the real boot path in ai-worker.ts
// ============================================================================

export function createPrismaUserEmailLookup(prisma: {
  user: { findUnique(args: unknown): Promise<{ email: string } | null> };
}): UserEmailLookup {
  return {
    async findUserEmail(userId: string): Promise<string | null> {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      return user?.email ?? null;
    },
  };
}
