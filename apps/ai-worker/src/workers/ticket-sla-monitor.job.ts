/**
 * PG-185 Cat-2 + IFC-310 follow-through:
 *
 * Ticket SLA monitor BullMQ job. Scans active tickets whose slaPolicyId
 * resolves to a deadline and writes:
 *   - ticket_escalated (or 'ticket_sla_breached' mapped through) when deadline
 *     has passed AND `notifyOnSlaBreach=true`,
 *   - ticket_escalated (warning) when ≥80% of SLA elapsed AND
 *     `notifyOnSlaWarning=true`.
 *
 * Gated by the `shouldWriteSlaBreachNotification` / `shouldWriteSlaWarningNotification`
 * predicates that PG-185 shipped in ticket-automation.ts. Consumes the
 * TicketAutomationSetting row per tenant so the toggles are now live.
 *
 * Queue: intelliflow-ticket-sla-monitor (repeatable, every 5 min)
 */

import { Job, Worker, Queue, QueueEvents } from 'bullmq';
import { PrismaClient } from '@intelliflow/db';
import { z } from 'zod';

export const TICKET_SLA_MONITOR_QUEUE_NAME = 'intelliflow-ticket-sla-monitor';

export const TicketSlaMonitorJobDataSchema = z.object({
  tenantId: z.string().min(1).optional(),
  sweepAll: z.boolean().default(true),
});

export type TicketSlaMonitorJobData = z.infer<typeof TicketSlaMonitorJobDataSchema>;

export interface TicketSlaMonitorJobResult {
  tenantsScanned: number;
  ticketsScanned: number;
  breachNotificationsWritten: number;
  warningNotificationsWritten: number;
  elapsedMs: number;
  completedAt: string;
}

export interface SlaAutomationFlagsShape {
  notifyOnSlaBreach: boolean;
  notifyOnSlaWarning: boolean;
}

export interface SlaMonitorDeps {
  shouldWriteBreach(flags: SlaAutomationFlagsShape): boolean;
  shouldWriteWarning(flags: SlaAutomationFlagsShape): boolean;
  createNotification(params: {
    tenantId: string;
    userId: string;
    type: 'ticket_escalated';
    title: string;
    body: string;
    priority: 'high' | 'normal';
    entityType: 'ticket';
    entityId: string;
    actionUrl: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export class TicketSlaMonitorWorker {
  private worker: Worker<TicketSlaMonitorJobData, TicketSlaMonitorJobResult> | null = null;
  private queue: Queue<TicketSlaMonitorJobData, TicketSlaMonitorJobResult> | null = null;
  private queueEvents: QueueEvents | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redisConnection: { host: string; port: number; password?: string },
    private readonly deps: SlaMonitorDeps
  ) {}

  async start(): Promise<void> {
    this.queue = new Queue<TicketSlaMonitorJobData, TicketSlaMonitorJobResult>(
      TICKET_SLA_MONITOR_QUEUE_NAME,
      { connection: this.redisConnection }
    );
    this.queueEvents = new QueueEvents(TICKET_SLA_MONITOR_QUEUE_NAME, {
      connection: this.redisConnection,
    });
    this.worker = new Worker<TicketSlaMonitorJobData, TicketSlaMonitorJobResult>(
      TICKET_SLA_MONITOR_QUEUE_NAME,
      async (job) => this.process(job),
      { connection: this.redisConnection, concurrency: 1 }
    );
    this.worker.on('failed', (job, error) =>
      console.warn(`[ticket-sla-monitor] job ${job?.id} failed:`, error?.message)
    );
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queueEvents?.close();
    await this.queue?.close();
  }

  async process(job: Job<TicketSlaMonitorJobData>): Promise<TicketSlaMonitorJobResult> {
    const start = Date.now();
    const data = TicketSlaMonitorJobDataSchema.parse(job.data ?? { sweepAll: true });
    const prisma = this.prisma as unknown as {
      ticketAutomationSetting: {
        findMany: (args: {
          where?: Record<string, unknown>;
          select?: Record<string, boolean>;
        }) => Promise<
          Array<{ tenantId: string; notifyOnSlaBreach: boolean; notifyOnSlaWarning: boolean }>
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
            slaDeadline: Date | null;
            slaBreachedAt: Date | null;
            assigneeId: string | null;
            createdAt: Date;
          }>
        >;
      };
    };

    const tenantFilter = data.tenantId ? { tenantId: data.tenantId } : {};
    const settings = await prisma.ticketAutomationSetting.findMany({
      where: tenantFilter,
      select: { tenantId: true, notifyOnSlaBreach: true, notifyOnSlaWarning: true },
    });

    let ticketsScanned = 0;
    let breachCount = 0;
    let warningCount = 0;

    for (const s of settings) {
      const tickets = await prisma.ticket.findMany({
        where: {
          tenantId: s.tenantId,
          status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER'] },
          slaDeadline: { not: null },
        },
        take: 500,
      });
      ticketsScanned += tickets.length;

      const now = Date.now();
      for (const t of tickets) {
        if (!t.slaDeadline) continue;
        const deadlineMs = t.slaDeadline.getTime();
        const elapsedPct = (now - t.createdAt.getTime()) / (deadlineMs - t.createdAt.getTime());

        const breached = now >= deadlineMs && t.slaBreachedAt == null;
        const warning = !breached && elapsedPct >= 0.8;

        if (breached && this.deps.shouldWriteBreach(s) && t.assigneeId) {
          await this.deps.createNotification({
            tenantId: t.tenantId,
            userId: t.assigneeId,
            type: 'ticket_escalated',
            title: `SLA breached: ${t.ticketNumber}`,
            body: `Ticket "${t.subject}" missed its SLA deadline.`,
            priority: 'high',
            entityType: 'ticket',
            entityId: t.id,
            actionUrl: `/tickets/${t.id}`,
            metadata: { reason: 'sla_breach', deadline: t.slaDeadline.toISOString() },
          });
          breachCount++;
        } else if (warning && this.deps.shouldWriteWarning(s) && t.assigneeId) {
          await this.deps.createNotification({
            tenantId: t.tenantId,
            userId: t.assigneeId,
            type: 'ticket_escalated',
            title: `SLA warning: ${t.ticketNumber}`,
            body: `Ticket "${t.subject}" is approaching its SLA deadline.`,
            priority: 'normal',
            entityType: 'ticket',
            entityId: t.id,
            actionUrl: `/tickets/${t.id}`,
            metadata: { reason: 'sla_warning', elapsedPct },
          });
          warningCount++;
        }
      }
    }

    return {
      tenantsScanned: settings.length,
      ticketsScanned,
      breachNotificationsWritten: breachCount,
      warningNotificationsWritten: warningCount,
      elapsedMs: Date.now() - start,
      completedAt: new Date().toISOString(),
    };
  }
}

export function createTicketSlaMonitorWorker(
  prisma: PrismaClient,
  redisConnection: { host: string; port: number; password?: string },
  deps: SlaMonitorDeps
): TicketSlaMonitorWorker {
  return new TicketSlaMonitorWorker(prisma, redisConnection, deps);
}
