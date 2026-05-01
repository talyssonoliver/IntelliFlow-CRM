/**
 * PG-190 — Case deadline monitor BullMQ job.
 *
 * Scans active cases whose deadline is approaching or past and takes two
 * actions per tenant-level toggle:
 *   - `notifyOnDeadlineApproaching` — emits `case_deadline_approaching`
 *     notification when deadline is within 24h and case is not CLOSED/CANCELLED.
 *   - `autoEscalateOverdue` — bumps priority by one level and emits
 *     `case_escalated` when deadline is past and case is not CLOSED/CANCELLED.
 *
 * Queue: intelliflow-case-deadline-monitor (repeatable, every 15 min).
 * Self-managed worker — not added to AI_WORKER_QUEUES since it has its own
 * Queue + Worker pair (mirrors TicketSlaMonitorWorker).
 */

import { Job, Worker, Queue, QueueEvents } from 'bullmq';
import { PrismaClient } from '@intelliflow/db';
import { z } from 'zod';

export const CASE_DEADLINE_MONITOR_QUEUE_NAME = 'intelliflow-case-deadline-monitor';

export const CaseDeadlineMonitorJobDataSchema = z.object({
  tenantId: z.string().min(1).optional(),
  sweepAll: z.boolean().default(true),
  approachingThresholdMs: z
    .number()
    .int()
    .min(60_000)
    .default(24 * 60 * 60 * 1000),
});

export type CaseDeadlineMonitorJobData = z.infer<typeof CaseDeadlineMonitorJobDataSchema>;

export interface CaseDeadlineMonitorJobResult {
  tenantsScanned: number;
  casesScanned: number;
  approachingNotificationsWritten: number;
  escalationsApplied: number;
  elapsedMs: number;
  completedAt: string;
}

export interface CaseMonitorFlags {
  notifyOnDeadlineApproaching: boolean;
  autoEscalateOverdue: boolean;
}

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

const PRIORITY_ORDER: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

function bumpPriority(current: Priority): Priority {
  const i = PRIORITY_ORDER.indexOf(current);
  if (i === -1 || i === PRIORITY_ORDER.length - 1) return current;
  return PRIORITY_ORDER[i + 1];
}

export interface CaseMonitorDeps {
  createNotification(params: {
    tenantId: string;
    userId: string;
    type: 'case_deadline_approaching' | 'case_escalated';
    title: string;
    body: string;
    priority: 'high' | 'normal';
    entityType: 'case';
    entityId: string;
    entityName?: string;
    actionUrl: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export class CaseDeadlineMonitorWorker {
  private worker: Worker<CaseDeadlineMonitorJobData, CaseDeadlineMonitorJobResult> | null = null;
  private queue: Queue<CaseDeadlineMonitorJobData, CaseDeadlineMonitorJobResult> | null = null;
  private queueEvents: QueueEvents | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redisConnection: { host: string; port: number; password?: string },
    private readonly deps: CaseMonitorDeps
  ) {}

  async start(): Promise<void> {
    this.queue = new Queue<CaseDeadlineMonitorJobData, CaseDeadlineMonitorJobResult>(
      CASE_DEADLINE_MONITOR_QUEUE_NAME,
      { connection: this.redisConnection }
    );
    this.queueEvents = new QueueEvents(CASE_DEADLINE_MONITOR_QUEUE_NAME, {
      connection: this.redisConnection,
    });
    this.worker = new Worker<CaseDeadlineMonitorJobData, CaseDeadlineMonitorJobResult>(
      CASE_DEADLINE_MONITOR_QUEUE_NAME,
      async (job) => this.process(job),
      { connection: this.redisConnection, concurrency: 1 }
    );
    this.worker.on('failed', (job, error) =>
      console.warn(`[case-deadline-monitor] job ${job?.id} failed:`, error?.message)
    );
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queueEvents?.close();
    await this.queue?.close();
  }

  getQueue(): Queue<CaseDeadlineMonitorJobData, CaseDeadlineMonitorJobResult> | null {
    return this.queue;
  }

  async process(job: Job<CaseDeadlineMonitorJobData>): Promise<CaseDeadlineMonitorJobResult> {
    const start = Date.now();
    const data = CaseDeadlineMonitorJobDataSchema.parse(
      job.data ?? { sweepAll: true, approachingThresholdMs: 24 * 60 * 60 * 1000 }
    );

    const prismaShim = this.prisma as unknown as {
      caseAutomationSetting: {
        findMany: (args: {
          where?: Record<string, unknown>;
          select?: Record<string, boolean>;
        }) => Promise<
          Array<{
            tenantId: string;
            notifyOnDeadlineApproaching: boolean;
            autoEscalateOverdue: boolean;
          }>
        >;
      };
      case: {
        findMany: (args: Record<string, unknown>) => Promise<
          Array<{
            id: string;
            tenantId: string;
            title: string;
            status: string;
            priority: Priority;
            deadline: Date | null;
            assignedTo: string;
          }>
        >;
        update: (args: { where: { id: string }; data: { priority: Priority } }) => Promise<unknown>;
      };
    };

    const tenantFilter = data.tenantId ? { tenantId: data.tenantId } : {};
    const settings = await prismaShim.caseAutomationSetting.findMany({
      where: tenantFilter,
      select: { tenantId: true, notifyOnDeadlineApproaching: true, autoEscalateOverdue: true },
    });

    let casesScanned = 0;
    let approachingCount = 0;
    let escalationCount = 0;

    const now = Date.now();
    const approachingCutoff = now + data.approachingThresholdMs;

    for (const s of settings) {
      if (!s.notifyOnDeadlineApproaching && !s.autoEscalateOverdue) continue;

      const cases = await prismaShim.case.findMany({
        where: {
          tenantId: s.tenantId,
          status: { notIn: ['CLOSED', 'CANCELLED'] },
          deadline: { not: null },
        },
        take: 500,
      });
      casesScanned += cases.length;

      for (const c of cases) {
        if (!c.deadline) continue;
        const deadlineMs = c.deadline.getTime();

        const overdue = now > deadlineMs;
        const approaching = !overdue && deadlineMs <= approachingCutoff;

        if (overdue && s.autoEscalateOverdue) {
          const next = bumpPriority(c.priority);
          if (next !== c.priority) {
            await prismaShim.case.update({ where: { id: c.id }, data: { priority: next } });
          }
          await this.deps.createNotification({
            tenantId: c.tenantId,
            userId: c.assignedTo,
            type: 'case_escalated',
            title: `Case overdue: ${c.title}`,
            body: `Case "${c.title}" is past its deadline. Priority bumped to ${next}.`,
            priority: 'high',
            entityType: 'case',
            entityId: c.id,
            entityName: c.title,
            actionUrl: `/cases/${c.id}`,
            metadata: {
              reason: 'auto_escalate_overdue',
              deadline: c.deadline.toISOString(),
              previousPriority: c.priority,
              newPriority: next,
            },
          });
          escalationCount++;
        } else if (approaching && s.notifyOnDeadlineApproaching) {
          await this.deps.createNotification({
            tenantId: c.tenantId,
            userId: c.assignedTo,
            type: 'case_deadline_approaching',
            title: `Case deadline approaching: ${c.title}`,
            body: `Case "${c.title}" is due within 24 hours.`,
            priority: 'normal',
            entityType: 'case',
            entityId: c.id,
            entityName: c.title,
            actionUrl: `/cases/${c.id}`,
            metadata: {
              reason: 'deadline_approaching',
              deadline: c.deadline.toISOString(),
            },
          });
          approachingCount++;
        }
      }
    }

    return {
      tenantsScanned: settings.length,
      casesScanned,
      approachingNotificationsWritten: approachingCount,
      escalationsApplied: escalationCount,
      elapsedMs: Date.now() - start,
      completedAt: new Date().toISOString(),
    };
  }
}

export function createCaseDeadlineMonitorWorker(
  prisma: PrismaClient,
  redisConnection: { host: string; port: number; password?: string },
  deps: CaseMonitorDeps
): CaseDeadlineMonitorWorker {
  return new CaseDeadlineMonitorWorker(prisma, redisConnection, deps);
}
