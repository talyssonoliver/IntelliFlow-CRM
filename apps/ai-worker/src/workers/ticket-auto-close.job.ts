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
    private readonly deps: AutoCloseDeps
  ) {}

  async start(): Promise<void> {
    this.queue = new Queue<TicketAutoCloseJobData, TicketAutoCloseJobResult>(
      TICKET_AUTO_CLOSE_QUEUE_NAME,
      { connection: this.redisConnection }
    );
    this.queueEvents = new QueueEvents(TICKET_AUTO_CLOSE_QUEUE_NAME, {
      connection: this.redisConnection,
    });
    this.worker = new Worker<TicketAutoCloseJobData, TicketAutoCloseJobResult>(
      TICKET_AUTO_CLOSE_QUEUE_NAME,
      async (job) => this.process(job),
      { connection: this.redisConnection, concurrency: 1 }
    );
    this.worker.on('failed', (job, error) =>
      console.warn(`[ticket-auto-close] job ${job?.id} failed:`, error?.message)
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
        findMany: (args: { where?: Record<string, unknown> }) => Promise<
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
      const counts = await this.processTenantSetting(s, prisma, data.dryRun, now);
      if (counts === null) continue;
      ticketsScanned += counts.scanned;
      ticketsClosed += counts.closed;
      notificationsWritten += counts.notified;
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

  private async processTenantSetting(
    s: {
      tenantId: string;
      autoCloseIdleDays: number;
      autoCloseAppliesToWaitingCustomer: boolean;
      autoCloseAppliesToResolved: boolean;
      autoCloseNotifyCustomer: boolean;
    },
    prisma: {
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
    },
    dryRun: boolean,
    now: Date
  ): Promise<{ scanned: number; closed: number; notified: number } | null> {
    const eligibleStatuses = buildEligibleStatuses(s);
    if (eligibleStatuses.length === 0) return null;

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

    if (tickets.length === 0) return { scanned: 0, closed: 0, notified: 0 };

    const ids = tickets.map((t) => t.id);
    let closed: number;
    if (!dryRun) {
      const updated = await prisma.ticket.updateMany({
        where: { id: { in: ids }, tenantId: s.tenantId },
        data: { status: 'CLOSED', closedAt: now },
      });
      closed = updated.count;
    } else {
      closed = tickets.length;
    }

    const notified = s.autoCloseNotifyCustomer
      ? await this.sendAutoCloseNotifications(tickets, s.autoCloseIdleDays)
      : 0;

    return { scanned: tickets.length, closed, notified };
  }

  private async sendAutoCloseNotifications(
    tickets: Array<{
      id: string;
      tenantId: string;
      ticketNumber: string;
      subject: string;
      status: string;
      reporterId: string | null;
      reporterUserId: string | null;
    }>,
    autoCloseIdleDays: number
  ): Promise<number> {
    let count = 0;
    for (const t of tickets) {
      const recipient = t.reporterUserId ?? t.reporterId;
      if (!recipient) continue;
      try {
        await this.deps.createNotification({
          tenantId: t.tenantId,
          userId: recipient,
          type: 'ticket_auto_closed',
          title: `Ticket auto-closed: ${t.ticketNumber}`,
          body: `Ticket "${t.subject}" was automatically closed after ${autoCloseIdleDays} idle day(s). Reply to reopen.`,
          priority: 'normal',
          entityType: 'ticket',
          entityId: t.id,
          actionUrl: `/tickets/${t.id}`,
          metadata: {
            previousStatus: t.status,
            idleDays: autoCloseIdleDays,
          },
        });
        count++;
      } catch (err) {
        console.warn('[ticket-auto-close] notification failed (fire-and-forget):', err);
      }
    }
    return count;
  }
}

function buildEligibleStatuses(s: {
  autoCloseAppliesToWaitingCustomer: boolean;
  autoCloseAppliesToResolved: boolean;
}): string[] {
  const statuses: string[] = [];
  if (s.autoCloseAppliesToWaitingCustomer) statuses.push('WAITING_ON_CUSTOMER');
  if (s.autoCloseAppliesToResolved) statuses.push('RESOLVED');
  return statuses;
}

export function createTicketAutoCloseWorker(
  prisma: PrismaClient,
  redisConnection: { host: string; port: number; password?: string },
  deps: AutoCloseDeps
): TicketAutoCloseWorker {
  return new TicketAutoCloseWorker(prisma, redisConnection, deps);
}
