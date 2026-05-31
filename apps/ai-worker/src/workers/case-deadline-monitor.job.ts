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

type CaseRow = {
  id: string;
  tenantId: string;
  title: string;
  status: string;
  priority: Priority;
  deadline: Date | null;
  assignedTo: string;
};

type OverdueCaseBump = CaseRow & { deadline: Date; newPriority: Priority };

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
        updateMany: (args: {
          where: { id: { in: string[] } };
          data: { priority: Priority };
        }) => Promise<unknown>;
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

    const nowMs = Date.now();
    const approachingCutoff = nowMs + data.approachingThresholdMs;

    // Collect tenant ids that actually need scanning (at least one toggle on).
    const activeSettings = settings.filter(
      (s) => s.notifyOnDeadlineApproaching || s.autoEscalateOverdue
    );

    // --- NP-010 fix: ONE findMany across all active tenants instead of one per tenant ---
    const activeTenantIds = [...new Set(activeSettings.map((s) => s.tenantId))];

    // Build a per-tenant case map after a single query.
    // We honour the 500-row cap per tenant in memory after the batch fetch.
    const allCases =
      activeTenantIds.length > 0
        ? await prismaShim.case.findMany({
            where: {
              tenantId: { in: activeTenantIds },
              status: { notIn: ['CLOSED', 'CANCELLED'] },
              deadline: { not: null },
            },
            // Fetch up to 500*N rows; we trim per-tenant below.
            take: 500 * activeTenantIds.length,
          })
        : [];

    // Group cases by tenantId, honouring the 500/tenant cap.
    const casesByTenant = new Map<
      string,
      Array<{
        id: string;
        tenantId: string;
        title: string;
        status: string;
        priority: Priority;
        deadline: Date | null;
        assignedTo: string;
      }>
    >();
    for (const c of allCases) {
      const bucket = casesByTenant.get(c.tenantId);
      if (!bucket) {
        casesByTenant.set(c.tenantId, [c]);
      } else if (bucket.length < 500) {
        bucket.push(c);
      }
    }

    for (const s of settings) {
      if (!s.notifyOnDeadlineApproaching && !s.autoEscalateOverdue) continue;

      const cases = casesByTenant.get(s.tenantId) ?? [];
      casesScanned += cases.length;

      const { approaching, escalations } = await this.processCasesForTenant(
        cases,
        s,
        prismaShim,
        nowMs,
        approachingCutoff
      );
      approachingCount += approaching;
      escalationCount += escalations;
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

  private async processCasesForTenant(
    cases: Array<{
      id: string;
      tenantId: string;
      title: string;
      status: string;
      priority: Priority;
      deadline: Date | null;
      assignedTo: string;
    }>,
    flags: CaseMonitorFlags & { tenantId: string },
    prismaShim: {
      case: {
        update: (args: { where: { id: string }; data: { priority: Priority } }) => Promise<unknown>;
        updateMany: (args: {
          where: { id: { in: string[] } };
          data: { priority: Priority };
        }) => Promise<unknown>;
      };
    },
    nowMs: number,
    approachingCutoff: number
  ): Promise<{ approaching: number; escalations: number }> {
    let approaching = 0;
    let escalations = 0;

    // Accumulate overdue cases that need a priority bump, keyed by new priority.
    // This lets us issue at most 4 updateMany calls (one per priority level)
    // instead of one update per case — NP-011 fix for the write side.
    const bumpGroups = new Map<
      Priority,
      Array<(typeof cases)[number] & { deadline: Date; newPriority: Priority }>
    >();

    for (const c of cases) {
      if (!c.deadline) continue;
      const deadlineMs = c.deadline.getTime();
      const overdue = nowMs > deadlineMs;
      const isApproaching = !overdue && deadlineMs <= approachingCutoff;

      const cWithDeadline = c as typeof c & { deadline: Date };

      if (overdue && flags.autoEscalateOverdue) {
        const next = bumpPriority(c.priority);
        const entry = { ...cWithDeadline, newPriority: next };
        if (!bumpGroups.has(next)) {
          bumpGroups.set(next, []);
        }
        bumpGroups.get(next)!.push(entry);
        escalations++;
      } else if (isApproaching && flags.notifyOnDeadlineApproaching) {
        await this.handleApproachingCase(cWithDeadline);
        approaching++;
      }
    }

    // Flush priority bumps: one updateMany per distinct new priority value.
    await this.flushPriorityBumps(bumpGroups, prismaShim);

    return { approaching, escalations };
  }

  /**
   * Flush accumulated priority bumps: one updateMany per distinct target
   * priority, then per-case escalation notifications (createNotification is a
   * single-item interface). Extracted to keep processCasesForTenant within the
   * sonar cognitive-complexity budget; behaviour is identical.
   */
  private async flushPriorityBumps(
    bumpGroups: Map<Priority, OverdueCaseBump[]>,
    prismaShim: {
      case: {
        updateMany: (args: {
          where: { id: { in: string[] } };
          data: { priority: Priority };
        }) => Promise<unknown>;
      };
    }
  ): Promise<void> {
    for (const [newPriority, overdueGroup] of bumpGroups) {
      const idsToUpdate = overdueGroup.filter((c) => c.newPriority !== c.priority).map((c) => c.id);

      if (idsToUpdate.length > 0) {
        await prismaShim.case.updateMany({
          where: { id: { in: idsToUpdate } },
          data: { priority: newPriority },
        });
      }

      // Emit per-case notifications (createNotification interface is single-item only).
      for (const c of overdueGroup) {
        await this.handleOverdueCaseNotification(c, c.newPriority);
      }
    }
  }

  private async handleOverdueCaseNotification(
    c: {
      id: string;
      tenantId: string;
      title: string;
      priority: Priority;
      deadline: Date;
      assignedTo: string;
    },
    next: Priority
  ): Promise<void> {
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
  }

  private async handleApproachingCase(c: {
    id: string;
    tenantId: string;
    title: string;
    deadline: Date;
    assignedTo: string;
  }): Promise<void> {
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
  }
}

export function createCaseDeadlineMonitorWorker(
  prisma: PrismaClient,
  redisConnection: { host: string; port: number; password?: string },
  deps: CaseMonitorDeps
): CaseDeadlineMonitorWorker {
  return new CaseDeadlineMonitorWorker(prisma, redisConnection, deps);
}
