/**
 * Workflow Automation Router
 *
 * Provides type-safe tRPC endpoints for workflow engine management.
 *
 * Task: IFC-028 - Workflow Engine
 */

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

export const workflowRouter = createTRPCRouter({
  /** List all workflow definitions */
  list: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      return {
        items: [] as Array<{
          id: string;
          name: string;
          status: string;
          createdAt: string;
        }>,
        nextCursor: null as string | null,
      };
    }),

  /** Get a single workflow by ID */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return null;
    }),
});
