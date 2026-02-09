/**
 * Queue Administration Router
 *
 * Provides type-safe tRPC endpoints for background job queue management.
 */

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

export const queuesAdminRouter = createTRPCRouter({
  /** List all queues with their status */
  list: protectedProcedure.query(async () => {
    return {
      queues: [] as Array<{
        name: string;
        active: number;
        waiting: number;
        completed: number;
        failed: number;
      }>,
    };
  }),

  /** Get queue details by name */
  getByName: protectedProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ input }) => {
      return null;
    }),
});
