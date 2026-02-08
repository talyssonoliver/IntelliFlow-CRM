/**
 * Workflow Router
 *
 * Exposes the LangGraph-inspired workflow engine (IFC-028) via tRPC.
 * Supports listing, querying, and managing workflow instances.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '../../trpc';
import {
  workflowEngine,
  humanDecisionSchema,
  workflowQuerySchema,
} from '../../workflow';

export const workflowRouter = createTRPCRouter({
  /**
   * List workflows with optional filters
   */
  list: protectedProcedure
    .input(workflowQuerySchema)
    .query(async ({ input }) => {
      const workflows = await workflowEngine.listWorkflows(input);
      return workflows;
    }),

  /**
   * Get a single workflow's current state
   */
  getState: protectedProcedure
    .input(z.object({ workflowId: z.string().uuid() }))
    .query(async ({ input }) => {
      const state = await workflowEngine.getState(input.workflowId);
      if (!state) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Workflow ${input.workflowId} not found`,
        });
      }
      return state;
    }),

  /**
   * Submit a human decision (approve/reject/modify)
   */
  submitDecision: protectedProcedure
    .input(humanDecisionSchema)
    .mutation(async ({ input }) => {
      const result = await workflowEngine.processHumanDecision(input);
      return result;
    }),

  /**
   * Pause a running workflow
   */
  pause: adminProcedure
    .input(z.object({ workflowId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await workflowEngine.pauseWorkflow(input.workflowId);
      return { success: true, workflowId: input.workflowId };
    }),

  /**
   * Resume a paused workflow
   */
  resume: adminProcedure
    .input(z.object({ workflowId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await workflowEngine.resumeWorkflow(input.workflowId);
      return { success: true, workflowId: input.workflowId };
    }),

  /**
   * Cancel a workflow
   */
  cancel: adminProcedure
    .input(z.object({ workflowId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await workflowEngine.cancelWorkflow(input.workflowId);
      return { success: true, workflowId: input.workflowId };
    }),
});
