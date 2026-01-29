/**
 * Agent Router
 *
 * IFC-139: tRPC endpoints for AI agent tools and approval workflow
 *
 * This router exposes agent functionality to the API:
 * - Tool discovery and listing
 * - Tool execution with approval workflow integration
 * - Approval management (approve/reject pending actions)
 * - Action history and rollback
 *
 * KPIs (from IFC-139):
 * - 100% tool actions authorized
 * - Zero unauthorized writes
 * - User approval latency <30s
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
import {
  getAvailableToolNames,
  getAgentTool,
  getToolsRequiringApproval,
  getToolsNotRequiringApproval,
  toolMetadata,
} from '../../agent/tools';
import {
  approvalWorkflowService,
  pendingActionsStore,
} from '../../agent/approval-workflow';
import {
  agentAuthorizationService,
  buildAuthContext,
} from '../../agent/authorization';
import { agentLogger } from '../../agent/logger';
import type { Context } from '../../context';
import type { AgentAuthContext } from '../../agent/types';

/**
 * Helper to build agent auth context from tRPC context
 */
function buildAgentContext(ctx: Context): AgentAuthContext {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  // Generate session ID from user ID (in production, use actual session tracking)
  const agentSessionId = `session-${ctx.user.userId}`;

  return buildAuthContext(
    {
      userId: ctx.user.userId,
      role: ctx.user.role,
    },
    agentSessionId
  );
}

/**
 * Agent Router
 *
 * Provides endpoints for AI agent interaction with CRM:
 * - agent.listTools - Discover available tools
 * - agent.executeTool - Execute a tool (with approval workflow if required)
 * - agent.getPendingApprovals - Get actions awaiting approval
 * - agent.approveAction - Approve a pending action
 * - agent.rejectAction - Reject a pending action
 * - agent.getActionHistory - Get execution history
 */
export const agentRouter = createTRPCRouter({
  /**
   * List all available agent tools
   *
   * Returns tools grouped by approval requirement:
   * - all: All tool names
   * - requiringApproval: Tools that need human approval
   * - noApproval: Tools that execute immediately (read-only operations)
   * - metadata: Tool categories and descriptions
   */
  listTools: protectedProcedure.query(() => {
    return {
      all: getAvailableToolNames(),
      requiringApproval: getToolsRequiringApproval().map((t) => ({
        name: t.name,
        description: t.description,
        actionType: t.actionType,
        entityTypes: t.entityTypes,
      })),
      noApproval: getToolsNotRequiringApproval().map((t) => ({
        name: t.name,
        description: t.description,
        actionType: t.actionType,
        entityTypes: t.entityTypes,
      })),
      metadata: toolMetadata,
    };
  }),

  /**
   * Get details of a specific tool
   */
  getTool: protectedProcedure
    .input(z.object({ toolName: z.string() }))
    .query(({ input }) => {
      const tool = getAgentTool(input.toolName);

      if (!tool) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Tool not found: ${input.toolName}`,
        });
      }

      return {
        name: tool.name,
        description: tool.description,
        actionType: tool.actionType,
        entityTypes: tool.entityTypes,
        requiresApproval: tool.requiresApproval,
      };
    }),

  /**
   * Execute an agent tool
   *
   * Workflow:
   * 1. If tool requires approval: Create pending action and return actionId
   * 2. If tool doesn't require approval: Execute immediately and return result
   * 3. All executions are logged and authorized
   */
  executeTool: protectedProcedure
    .input(
      z.object({
        toolName: z.string(),
        input: z.record(z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tool = getAgentTool(input.toolName);

      if (!tool) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Tool not found: ${input.toolName}`,
        });
      }

      // Build agent context
      const agentContext = buildAgentContext(ctx);

      // Authorize action
      const authResult = await agentAuthorizationService.authorizeToolExecution(
        tool,
        input.input,
        agentContext
      );

      if (!authResult.authorized) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: authResult.reason || 'Action not authorized',
        });
      }

      // If tool requires approval, create pending action
      if (tool.requiresApproval) {
        const preview = await tool.generatePreview(input.input, agentContext);

        const pendingAction = {
          id: crypto.randomUUID(),
          toolName: tool.name,
          actionType: tool.actionType,
          entityType: tool.entityTypes[0],
          input: input.input,
          preview,
          status: 'PENDING' as const,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
          createdBy: agentContext.userId,
          agentSessionId: agentContext.agentSessionId,
        };

        await pendingActionsStore.add(pendingAction);

        // Log pending action
        await agentLogger.log({
          userId: agentContext.userId,
          agentSessionId: agentContext.agentSessionId,
          toolName: tool.name,
          actionType: tool.actionType,
          entityType: tool.entityTypes[0],
          input: input.input,
          success: true,
          durationMs: 0,
          approvalRequired: true,
          approvalStatus: 'PENDING',
        });

        return {
          requiresApproval: true,
          actionId: pendingAction.id,
          preview,
          expiresAt: pendingAction.expiresAt,
        };
      }

      // Execute immediately (no approval required)
      const startTime = Date.now();
      const result = await tool.execute(input.input, agentContext);
      const durationMs = Date.now() - startTime;

      // Log execution
      await agentLogger.log({
        userId: agentContext.userId,
        agentSessionId: agentContext.agentSessionId,
        toolName: tool.name,
        actionType: tool.actionType,
        entityType: tool.entityTypes[0],
        input: input.input,
        output: result.data,
        success: result.success,
        error: result.error,
        durationMs,
        approvalRequired: false,
      });

      return result;
    }),

  /**
   * Get pending actions awaiting approval
   *
   * Returns all pending actions for the authenticated user.
   */
  getPendingApprovals: protectedProcedure.query(async ({ ctx }) => {
    const agentContext = buildAgentContext(ctx);
    const pendingActions = await approvalWorkflowService.getPendingActions(
      agentContext.userId
    );

    return pendingActions.map((action) => ({
      id: action.id,
      toolName: action.toolName,
      actionType: action.actionType,
      entityType: action.entityType,
      preview: action.preview,
      createdAt: action.createdAt,
      expiresAt: action.expiresAt,
      status: action.status,
    }));
  }),

  /**
   * Get a specific pending action by ID
   */
  getPendingAction: protectedProcedure
    .input(z.object({ actionId: z.string() }))
    .query(async ({ input }) => {
      const action = await approvalWorkflowService.getPendingAction(input.actionId);

      if (!action) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Pending action not found: ${input.actionId}`,
        });
      }

      return {
        id: action.id,
        toolName: action.toolName,
        actionType: action.actionType,
        entityType: action.entityType,
        input: action.input,
        preview: action.preview,
        createdAt: action.createdAt,
        expiresAt: action.expiresAt,
        status: action.status,
        metadata: action.metadata,
      };
    }),

  /**
   * Approve a pending action
   *
   * Approves and executes the action.
   * Optionally allows modifying the input before execution.
   */
  approveAction: protectedProcedure
    .input(
      z.object({
        actionId: z.string(),
        reason: z.string().optional(),
        modifiedInput: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const agentContext = buildAgentContext(ctx);

      const decision = {
        actionId: input.actionId,
        decision: 'APPROVE' as const,
        decidedBy: agentContext.userId,
        decidedAt: new Date(),
        reason: input.reason,
        modifiedInput: input.modifiedInput,
      };

      const executedAction = await approvalWorkflowService.approveAction(
        decision,
        agentContext
      );

      return {
        success: !executedAction.executionError,
        actionId: executedAction.id,
        executedAt: executedAction.executedAt,
        result: executedAction.executionResult,
        error: executedAction.executionError,
        rollbackAvailable: executedAction.rollbackAvailable,
        rollbackToken: executedAction.rollbackToken,
      };
    }),

  /**
   * Reject a pending action
   *
   * Rejects the action without executing it.
   */
  rejectAction: protectedProcedure
    .input(
      z.object({
        actionId: z.string(),
        reason: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const agentContext = buildAgentContext(ctx);

      const decision = {
        actionId: input.actionId,
        decision: 'REJECT' as const,
        decidedBy: agentContext.userId,
        decidedAt: new Date(),
        reason: input.reason,
      };

      const rejectedAction = await approvalWorkflowService.rejectAction(
        decision,
        agentContext
      );

      return {
        success: true,
        actionId: rejectedAction.id,
        status: rejectedAction.status,
        rejectedAt: new Date(),
      };
    }),

  /**
   * Get pending actions count
   *
   * Returns the count of pending actions for the authenticated user.
   * Useful for badge indicators in the UI.
   */
  getPendingCount: protectedProcedure.query(async ({ ctx }) => {
    const agentContext = buildAgentContext(ctx);
    const pendingActions = await approvalWorkflowService.getPendingActions(
      agentContext.userId
    );

    return {
      count: pendingActions.length,
      userId: agentContext.userId,
    };
  }),
});
