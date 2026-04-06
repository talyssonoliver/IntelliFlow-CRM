/**
 * Queue Administration Router — IFC-296
 *
 * Live BullMQ stats and scheduler CRUD for the 3 AI queues.
 * Replaces the stub router that returned empty arrays.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { getBullMQConnectionOptions } from '@intelliflow/platform/queues';

// ---------------------------------------------------------------------------
// Constants & Schemas
// ---------------------------------------------------------------------------

const AI_QUEUE_NAMES = ['ai-scoring', 'ai-prediction', 'ai-insights'] as const;

const QueueNameSchema = z.enum(AI_QUEUE_NAMES);

// ---------------------------------------------------------------------------
// Helper: withQueue — cleanup-safe BullMQ Queue wrapper (AC-015, NF-003)
// ---------------------------------------------------------------------------

async function withQueue<T>(
  name: string,
  fn: (q: InstanceType<typeof import('bullmq').Queue>) => Promise<T>
): Promise<T> {
  const { Queue } = await import('bullmq');
  const q = new Queue(name, { connection: getBullMQConnectionOptions() });
  try {
    return await fn(q);
  } finally {
    await q.close();
  }
}

// ---------------------------------------------------------------------------
// Helper: fetch stats for a single queue (given a pre-resolved Queue class)
// ---------------------------------------------------------------------------

function formatQueueStats(
  name: string,
  counts: Record<string, number>,
  paused: boolean,
  schedulers: unknown[],
) {
  return {
    name,
    isPaused: paused,
    counts: {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
    },
    schedulers: (schedulers as Record<string, unknown>[]).map((s) => ({
      id: (s.id ?? s.key ?? '') as string,
      name: (s.name ?? '') as string,
      pattern: (s.pattern ?? undefined) as string | undefined,
      every: (s.every ?? undefined) as number | undefined,
      next: (s.next ?? undefined) as number | undefined,
    })),
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const queuesAdminRouter = createTRPCRouter({
  /** List all 3 AI queues with job counts, isPaused, and schedulers (AC-001) */
  list: protectedProcedure.query(async () => {
    try {
      // Single import, then create all 3 queues from the same constructor
      const { Queue } = await import('bullmq');
      const connection = getBullMQConnectionOptions();

      // Timeout guard: BullMQ hangs forever if Redis is unreachable
      // (maxRetriesPerRequest: null required by BullMQ = infinite retries).
      const REDIS_TIMEOUT_MS = 5_000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis connection timeout')), REDIS_TIMEOUT_MS)
      );

      const fetchQueues = async () => {
        const queues = await Promise.all(
          AI_QUEUE_NAMES.map(async (name) => {
            const q = new Queue(name, { connection });
            try {
              const [counts, paused, schedulers] = await Promise.all([
                q.getJobCounts(),
                q.isPaused(),
                q.getJobSchedulers(),
              ]);
              return formatQueueStats(name, counts, paused, schedulers);
            } finally {
              await q.close();
            }
          })
        );
        return { queues };
      };

      return await Promise.race([fetchQueues(), timeoutPromise]);
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve queue stats from BullMQ',
        cause: error,
      });
    }
  }),

  /** Get single queue stats + schedulers (AC-002) */
  getByName: protectedProcedure
    .input(z.object({ name: QueueNameSchema }))
    .query(async ({ input }) => {
      try {
        return await withQueue(input.name, async (q) => {
          const [counts, paused, schedulers] = await Promise.all([
            q.getJobCounts(),
            q.isPaused(),
            q.getJobSchedulers(),
          ]);
          return formatQueueStats(input.name, counts, paused, schedulers);
        });
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to retrieve stats for queue ${input.name}`,
          cause: error,
        });
      }
    }),

  /** Pause a queue — stops new job processing (AC-003) */
  pause: protectedProcedure
    .input(z.object({ name: QueueNameSchema }))
    .mutation(async ({ input }) => {
      try {
        await withQueue(input.name, (q) => q.pause());
        return { success: true, message: `Queue ${input.name} paused` };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to pause queue ${input.name}`,
          cause: error,
        });
      }
    }),

  /** Resume a paused queue (AC-004) */
  resume: protectedProcedure
    .input(z.object({ name: QueueNameSchema }))
    .mutation(async ({ input }) => {
      try {
        await withQueue(input.name, (q) => q.resume());
        return { success: true, message: `Queue ${input.name} resumed` };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to resume queue ${input.name}`,
          cause: error,
        });
      }
    }),

  /** Retry failed jobs — capped at 100 (AC-005, NF-005) */
  retryFailed: protectedProcedure
    .input(
      z.object({
        name: QueueNameSchema,
        count: z.number().int().min(1).max(100).default(10),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await withQueue(input.name, (q) =>
          q.retryJobs({ state: 'failed', count: input.count })
        );
        return { retriedCount: input.count };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to retry jobs in queue ${input.name}`,
          cause: error,
        });
      }
    }),

  /** Remove a registered job scheduler (AC-006) */
  deleteScheduler: protectedProcedure
    .input(
      z.object({
        name: QueueNameSchema,
        schedulerId: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const removed = await withQueue(input.name, (q) =>
          q.removeJobScheduler(input.schedulerId)
        );
        if (!removed) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Scheduler ${input.schedulerId} not found in queue ${input.name}`,
          });
        }
        return { success: true, message: `Scheduler ${input.schedulerId} removed` };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to delete scheduler from queue ${input.name}`,
          cause: error,
        });
      }
    }),
});
