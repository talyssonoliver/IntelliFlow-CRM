/**
 * Queue Admin Router
 *
 * Admin-only endpoints for managing BullMQ queues.
 * Provides health monitoring, pause/resume, and dashboard access.
 */

import { z } from 'zod';
import { createTRPCRouter, adminProcedure } from '../../trpc';
import {
  getQueueHealth,
  pauseQueue,
  resumeQueue,
  QUEUE_NAMES,
  getBullBoardInstance,
  setupBullBoard,
  getDashboardInfo,
} from '@intelliflow/platform/queues';

const queueNameSchema = z.string().refine(
  (name) => Object.values(QUEUE_NAMES).includes(name as any),
  { message: 'Unknown queue name' }
);

export const queuesAdminRouter = createTRPCRouter({
  /**
   * Get health status for a specific queue
   */
  health: adminProcedure
    .input(z.object({ queueName: queueNameSchema }))
    .query(async ({ input }) => {
      const health = await getQueueHealth(input.queueName);
      return { queueName: input.queueName, ...health };
    }),

  /**
   * Pause a queue
   */
  pause: adminProcedure
    .input(z.object({ queueName: queueNameSchema }))
    .mutation(async ({ input }) => {
      await pauseQueue(input.queueName);
      return { success: true, queueName: input.queueName, action: 'paused' };
    }),

  /**
   * Resume a paused queue
   */
  resume: adminProcedure
    .input(z.object({ queueName: queueNameSchema }))
    .mutation(async ({ input }) => {
      await resumeQueue(input.queueName);
      return { success: true, queueName: input.queueName, action: 'resumed' };
    }),

  /**
   * Get Bull Board dashboard info
   */
  dashboard: adminProcedure.query(() => {
    // Ensure Bull Board is initialized
    if (!getBullBoardInstance()) {
      setupBullBoard();
    }
    return getDashboardInfo();
  }),
});
