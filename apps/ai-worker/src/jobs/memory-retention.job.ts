/**
 * Memory Retention Job Handler
 *
 * BullMQ cron job that runs daily at 03:00 UTC on the `ai-memory-retention`
 * queue. It reads every `TenantMemoryPolicy` row and, per tenant, prunes
 * (or scrubs) stale memory artifacts according to the tenant's policy:
 *
 *   - `conversationRetentionDays`      → ConversationRecord + MessageRecord
 *   - `chainVersionRetentionDays`      → ChainVersion archived >= N days
 *   - `monitoringEventRetentionDays`   → AIMonitoringEvent older than N days
 *
 * When `scrubRatherThanDelete` is true, conversation content is PII-scrubbed
 * (body replaced with `[scrubbed:<reason>]`) instead of DELETEd — preserves
 * audit trail while removing personal data. Non-conversation retention
 * (chain versions, monitoring events) always DELETEs because they hold no PII.
 *
 * Absent policy row ⇒ tenant is skipped (platform-default = keep forever).
 *
 * Fails gracefully: per-tenant errors are logged but do not abort the sweep.
 *
 * @module ai-worker/jobs/memory-retention
 */

import type { Job } from 'bullmq';
import { z } from 'zod';
import pino from 'pino';

const logger = pino({
  name: 'memory-retention-job',
  level: process.env.LOG_LEVEL || 'info',
});

// ============================================================================
// Constants
// ============================================================================

/** Queue name for memory retention cron jobs */
export const MEMORY_RETENTION_QUEUE = 'ai-memory-retention';

/** Daily at 03:00 UTC (offset from feedback-analytics 02:00 to spread load) */
export const MEMORY_RETENTION_CRON = '0 3 * * *';

/** BullMQ default job options — attempts matches AI_JOB_DEFAULT_MAX_ATTEMPTS. */
export const DEFAULT_MEMORY_RETENTION_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: { age: 7 * 24 * 60 * 60, count: 30 },
  removeOnFail: { age: 30 * 24 * 60 * 60 },
} as const;

// ============================================================================
// Schemas
// ============================================================================

export const MemoryRetentionJobDataSchema = z.object({
  /** Restrict sweep to a single tenant (omit for global sweep) */
  tenantId: z.string().uuid().optional(),
  /** Dry-run: count rows that would be affected, without mutating the DB. */
  dryRun: z.boolean().default(false),
  correlationId: z.string().optional(),
  /** W3C traceparent carrier injected by enqueue-side for distributed trace propagation */
  _otelCarrier: z.record(z.string(), z.string()).optional(),
});

export type MemoryRetentionJobData = z.infer<typeof MemoryRetentionJobDataSchema>;

const PerTenantStatsSchema = z.object({
  tenantId: z.string(),
  conversationsRemoved: z.number(),
  messagesRemoved: z.number(),
  conversationsScrubbed: z.number(),
  chainVersionsRemoved: z.number(),
  monitoringEventsRemoved: z.number(),
  errors: z.number(),
});

export const MemoryRetentionJobResultSchema = z.object({
  tenantsProcessed: z.number(),
  tenantsSkipped: z.number(),
  perTenant: z.array(PerTenantStatsSchema),
  processingTimeMs: z.number(),
  processedAt: z.string(),
  dryRun: z.boolean(),
});

export type MemoryRetentionJobResult = z.infer<typeof MemoryRetentionJobResultSchema>;

type PerTenantStats = z.infer<typeof PerTenantStatsSchema>;

// ============================================================================
// Job Handler
// ============================================================================

/**
 * Process the memory-retention sweep.
 *
 * 1. Load TenantMemoryPolicy rows (filtered by tenantId if provided).
 * 2. For each policy, apply its retention days + scrub flag against the
 *    Conversation/Message/ChainVersion/AIMonitoringEvent tables.
 * 3. Aggregate stats and return them.
 */
export async function processMemoryRetentionJob(
  job: Job<MemoryRetentionJobData>
): Promise<MemoryRetentionJobResult> {
  const startTime = Date.now();
  const validatedData = MemoryRetentionJobDataSchema.parse(job.data);
  const { tenantId, dryRun } = validatedData;

  logger.info(
    { jobId: job.id, tenantId: tenantId ?? 'ALL', dryRun },
    'Processing memory retention sweep'
  );

  let prisma: any = null;
  try {
    const db = await import('@intelliflow/db');
    prisma = db.prisma;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'Memory retention: Prisma unavailable — aborting'
    );
    return {
      tenantsProcessed: 0,
      tenantsSkipped: 0,
      perTenant: [],
      processingTimeMs: Date.now() - startTime,
      processedAt: new Date().toISOString(),
      dryRun,
    };
  }

  // Load policies
  const policies: Array<{
    tenantId: string;
    conversationRetentionDays: number | null;
    chainVersionRetentionDays: number | null;
    monitoringEventRetentionDays: number | null;
    scrubRatherThanDelete: boolean;
  }> = await prisma.tenantMemoryPolicy.findMany({
    where: tenantId ? { tenantId } : {},
    select: {
      tenantId: true,
      conversationRetentionDays: true,
      chainVersionRetentionDays: true,
      monitoringEventRetentionDays: true,
      scrubRatherThanDelete: true,
    },
  });

  if (policies.length === 0) {
    logger.info(
      { tenantId: tenantId ?? 'ALL' },
      'Memory retention: no tenants have an active policy — nothing to do'
    );
    return {
      tenantsProcessed: 0,
      tenantsSkipped: 0,
      perTenant: [],
      processingTimeMs: Date.now() - startTime,
      processedAt: new Date().toISOString(),
      dryRun,
    };
  }

  const perTenant: PerTenantStats[] = [];
  let tenantsProcessed = 0;
  let tenantsSkipped = 0;

  for (const policy of policies) {
    // Skip tenants with every retention field null (nothing to do).
    if (
      policy.conversationRetentionDays == null &&
      policy.chainVersionRetentionDays == null &&
      policy.monitoringEventRetentionDays == null
    ) {
      tenantsSkipped++;
      continue;
    }

    const stats: PerTenantStats = {
      tenantId: policy.tenantId,
      conversationsRemoved: 0,
      messagesRemoved: 0,
      conversationsScrubbed: 0,
      chainVersionsRemoved: 0,
      monitoringEventsRemoved: 0,
      errors: 0,
    };

    // --- Conversations + Messages ----------------------------------------
    if (policy.conversationRetentionDays != null) {
      const cutoff = new Date(Date.now() - policy.conversationRetentionDays * 24 * 60 * 60 * 1000);
      try {
        if (policy.scrubRatherThanDelete) {
          // Scrub: null out content on messages + mark conversation with scrub reason.
          if (!dryRun) {
            const scrubbedMsgs = await prisma.messageRecord.updateMany({
              where: {
                tenantId: policy.tenantId,
                createdAt: { lt: cutoff },
                NOT: { content: { startsWith: '[scrubbed' } },
              },
              data: { content: '[scrubbed:retention-policy]' },
            });
            stats.messagesRemoved = scrubbedMsgs.count;
            const scrubbedConvs = await prisma.conversationRecord.updateMany({
              where: { tenantId: policy.tenantId, createdAt: { lt: cutoff } },
              data: { summary: '[scrubbed:retention-policy]' },
            });
            stats.conversationsScrubbed = scrubbedConvs.count;
          } else {
            stats.messagesRemoved = await prisma.messageRecord.count({
              where: { tenantId: policy.tenantId, createdAt: { lt: cutoff } },
            });
            stats.conversationsScrubbed = await prisma.conversationRecord.count({
              where: { tenantId: policy.tenantId, createdAt: { lt: cutoff } },
            });
          }
        } else {
          // Delete: messages first (FK), then parent conversations.
          if (!dryRun) {
            const delMsgs = await prisma.messageRecord.deleteMany({
              where: { tenantId: policy.tenantId, createdAt: { lt: cutoff } },
            });
            stats.messagesRemoved = delMsgs.count;
            const delConvs = await prisma.conversationRecord.deleteMany({
              where: { tenantId: policy.tenantId, createdAt: { lt: cutoff } },
            });
            stats.conversationsRemoved = delConvs.count;
          } else {
            stats.messagesRemoved = await prisma.messageRecord.count({
              where: { tenantId: policy.tenantId, createdAt: { lt: cutoff } },
            });
            stats.conversationsRemoved = await prisma.conversationRecord.count({
              where: { tenantId: policy.tenantId, createdAt: { lt: cutoff } },
            });
          }
        }
      } catch (err) {
        stats.errors++;
        logger.warn(
          {
            tenantId: policy.tenantId,
            error: err instanceof Error ? err.message : String(err),
          },
          'Memory retention: conversation prune failed'
        );
      }
    }

    // --- Chain versions (archived) ---------------------------------------
    if (policy.chainVersionRetentionDays != null) {
      const cutoff = new Date(Date.now() - policy.chainVersionRetentionDays * 24 * 60 * 60 * 1000);
      try {
        if (!dryRun) {
          const del = await prisma.chainVersion.deleteMany({
            where: {
              tenantId: policy.tenantId,
              status: 'ARCHIVED',
              archivedAt: { lt: cutoff },
            },
          });
          stats.chainVersionsRemoved = del.count;
        } else {
          stats.chainVersionsRemoved = await prisma.chainVersion.count({
            where: {
              tenantId: policy.tenantId,
              status: 'ARCHIVED',
              archivedAt: { lt: cutoff },
            },
          });
        }
      } catch (err) {
        stats.errors++;
        logger.warn(
          {
            tenantId: policy.tenantId,
            error: err instanceof Error ? err.message : String(err),
          },
          'Memory retention: chain version prune failed'
        );
      }
    }

    // --- Monitoring events -----------------------------------------------
    if (policy.monitoringEventRetentionDays != null) {
      const cutoff = new Date(
        Date.now() - policy.monitoringEventRetentionDays * 24 * 60 * 60 * 1000
      );
      try {
        if (!dryRun) {
          const del = await prisma.aIMonitoringEvent.deleteMany({
            where: { tenantId: policy.tenantId, recordedAt: { lt: cutoff } },
          });
          stats.monitoringEventsRemoved = del.count;
        } else {
          stats.monitoringEventsRemoved = await prisma.aIMonitoringEvent.count({
            where: { tenantId: policy.tenantId, recordedAt: { lt: cutoff } },
          });
        }
      } catch (err) {
        stats.errors++;
        logger.warn(
          {
            tenantId: policy.tenantId,
            error: err instanceof Error ? err.message : String(err),
          },
          'Memory retention: monitoring event prune failed'
        );
      }
    }

    perTenant.push(stats);
    tenantsProcessed++;

    logger.info(
      { tenantId: policy.tenantId, dryRun, ...stats },
      'Memory retention: tenant processed'
    );
  }

  const result: MemoryRetentionJobResult = {
    tenantsProcessed,
    tenantsSkipped,
    perTenant,
    processingTimeMs: Date.now() - startTime,
    processedAt: new Date().toISOString(),
    dryRun,
  };

  logger.info(
    {
      tenantsProcessed,
      tenantsSkipped,
      totalPolicies: policies.length,
      dryRun,
      processingTimeMs: result.processingTimeMs,
    },
    'Memory retention sweep complete'
  );

  return result;
}
