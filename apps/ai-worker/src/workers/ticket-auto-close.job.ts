/**
 * PG-185 Cat-2: Ticket auto-close BullMQ job.
 *
 * Daily sweeper that reads TicketAutomationSetting flags per tenant:
 *   - autoCloseIdleDays (how many idle days until auto-close)
 *   - autoCloseAppliesToWaitingCustomer (whether WAITING_ON_CUSTOMER tickets are eligible)
 *   - autoCloseAppliesToResolved (whether RESOLVED tickets are eligible)
 *   - autoCloseNotifyCustomer (whether to emit ticket_auto_closed notification)
 *
 * Tickets that match the eligibility rules AND have been idle for ≥
 * autoCloseIdleDays transition to CLOSED. When autoCloseNotifyCustomer=true
 * and a reporter user is on file, a `ticket_auto_closed` notification fires.
 *
 * Queue: intelliflow-ticket-auto-close (repeatable, daily)
 */

import { Job, Worker, Queue, QueueEvents } from 'bullmq';
import { PrismaClient } from '@intelliflow/db';
import { z } from 'zod';

export const TICKET_AUTO_CLOSE_QUEUE_NAME = 'intelliflow-ticket-auto-close';

export const TicketAutoCloseJobDataSchema = z.object({
  tenantId: z.string().min(1).optional(),
  sweepAll: z.boolean().default(true),
  dryRun: z.boolean().default(false),
});

export type TicketAutoCloseJobData = z.infer<typeof TicketAutoCloseJobDataSchema>;

export interface TicketAutoCloseJobResult {
  tenantsScanned: number;
  ticketsScanned: number;
  ticketsClosed: number;
  notificationsWritten: number;
  dryRun: boolean;
  elapsedMs: number;
  completedAt: string;
}

export interface AutoCloseDeps {
  createNotification(params: {
    tenantId: string;
    userId: string;
    type: 'ticket_auto_closed';
    title: string;
    body: string;
    priority: 'normal';
    entityType: 'ticket';
    entityId: string;
    actionUrl: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  now?: () => Date;
}

export class TicketAutoCloseWorker {
  private worker: Worker<TicketAutoCloseJobData, TicketAutoCloseJobResult> | null = null;
  private queue: Queue<TicketAutoCloseJobData, TicketAutoCloseJobResult> | null = null;
  private queueEvents: QueueEvents | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redisConnection: { host: string; port: number; password?: string },
    private readonly deps: AutoCloseDeps,
  ) {}

  async start(): Promise<void> {
    this.queue = new Queue<TicketAutoCloseJobData, TicketAutoCloseJobResult>(
      TICKET_AUTO_CLOSE_QUEUE_NAME,
      { connection: this.redisConnection },
    );
    this.queueEvents = new QueueEvents(TICKET_AUTO_CLOSE_QUEUE_NAME, {
      connection: this.redisConnection,
    });
    this.worker = new Worker<TicketAutoCloseJobData, TicketAutoCloseJobResult>(
      TICKET_AUTO_CLOSE_QUEUE_NAME,
      async (job) => this.process(job),
      { connection: this.redisConnection, concurrency: 1 },
    );
    this.worker.on('failed', (job, error) =>
      console.warn(`[ticket-auto-close] job ${job?.id} failed:`, error?.message),
    );
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queueEvents?.close();
    await this.queue?.close();
  }

  async process(job: Job<TicketAutoCloseJobData>): Promise<TicketAutoCloseJobResult> {
    const start = Date.now();
    const data = TicketAutoCloseJobDataSchema.parse(job.data ?? { sweepAll: true });
    const now = this.deps.now?.() ?? new Date();

    const prisma = this.prisma as unknown as {
      ticketAutomationSetting: {
        findMany: (args: {
          where?: Record<string, unknown>;
        }) => Promise<
          Array<{
            tenantId: string;
            autoCloseIdleDays: number;
            autoCloseAppliesToWaitingCustomer: boolean;
            autoCloseAppliesToResolved: boolean;
            autoCloseNotifyCustomer: boolean;
          }>
        >;
      };
      ticket: {
        findMany: (args: Record<string, unknown>) => Promise<
          Array<{
            id: string;
            tenantId: string;
            ticketNumber: string;
            subject: string;
            status: string;
            reporterId: string | null;
            reporterUserId: string | null;
            contactEmail: string | null;
            updatedAt: Date;
            lastActivityAt: Date | null;
          }>
        >;
        updateMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
      };
    };

    const tenantFilter = data.tenantId ? { tenantId: data.tenantId } : {};
    const settings = await prisma.ticketAutomationSetting.findMany({ where: tenantFilter });

    let ticketsScanned = 0;
    let ticketsClosed = 0;
    let notificationsWritten = 0;

    for (const s of settings) {
      if (!s.autoCloseAppliesToWaitingCustomer && !s.autoCloseAppliesToResolved) continue;

      const eligibleStatuses: string[] = [];
      if (s.autoCloseAppliesToWaitingCustomer) eligibleStatuses.push('WAITING_ON_CUSTOMER');
      if (s.autoCloseAppliesToResolved) eligibleStatuses.push('RESOLVED');
      if (eligibleStatuses.length === 0) continue;

      const cutoff = new Date(now.getTime() - s.autoCloseIdleDays * 24 * 60 * 60 * 1000);

      const tickets = await prisma.ticket.findMany({
        where: {
          tenantId: s.tenantId,
          status: { in: eligibleStatuses },
          OR: [
            { lastActivityAt: { lte: cutoff } },
            { AND: [{ lastActivityAt: null }, { updatedAt: { lte: cutoff } }] },
          ],
        },
        take: 500,
      });
      ticketsScanned += tickets.length;

      if (tickets.length === 0) continue;

      const ids = tickets.map((t) => t.id);

      if (!data.dryRun) {
        const updated = await prisma.ticket.updateMany({
          where: { id: { in: ids }, tenantId: s.tenantId },
          data: {
            status: 'CLOSED',
            closedAt: now,
          },
        });
        ticketsClosed += updated.count;
      } else {
        ticketsClosed += tickets.length;
      }

      if (s.autoCloseNotifyCustomer) {
        for (const t of tickets) {
          const recipient = t.reporterUserId ?? t.reporterId;
          if (!recipient) continue;
          try {
            await this.deps.createNotification({
              tenantId: t.tenantId,
              userId: recipient,
              type: 'ticket_auto_closed',
              title: `Ticket auto-closed: ${t.ticketNumber}`,
              body: `Ticket "${t.subject}" was automatically closed after ${s.autoCloseIdleDays} idle day(s). Reply to reopen.`,
              priority: 'normal',
              entityType: 'ticket',
              entityId: t.id,
              actionUrl: `/tickets/${t.id}`,
              metadata: {
                previousStatus: t.status,
                idleDays: s.autoCloseIdleDays,
              },
            });
            notificationsWritten++;
          } catch (err) {
            console.warn(
              '[ticket-auto-close] notification failed (fire-and-forget):',
              err,
            );
          }
        }
      }
    }

    return {
      tenantsScanned: settings.length,
      ticketsScanned,
      ticketsClosed,
      notificationsWritten,
      dryRun: data.dryRun,
      elapsedMs: Date.now() - start,
      completedAt: now.toISOString(),
    };
  }
}

export function createTicketAutoCloseWorker(
  prisma: PrismaClient,
  redisConnection: { host: string; port: number; password?: string },
  deps: AutoCloseDeps,
): TicketAutoCloseWorker {
  return new TicketAutoCloseWorker(prisma, redisConnection, deps);
}
