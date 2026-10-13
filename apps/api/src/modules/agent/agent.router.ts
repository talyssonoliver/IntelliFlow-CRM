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
import {
  createTRPCRouter,
  protectedProcedure as baseProtectedProcedure,
  requireModule,
} from '../../trpc';
import {
  getAvailableToolNames,
  getAgentTool,
  getForTenant,
  getToolsRequiringApproval,
  getToolsNotRequiringApproval,
  toolMetadata,
  ToolDisabledError,
} from '../../agent/tools';
import { approvalWorkflowService, pendingActionsStore } from '../../agent/approval-workflow';
import { loadApprovalPolicy, resolveAgentToolExpiry } from '../../agent/approval-policy-loader';
import { canReview, evaluateAutoApproval, SYSTEM_APPROVAL_ACTOR } from '@intelliflow/domain';
import { agentAuthorizationService, buildAuthContext } from '../../agent/authorization';
import { agentLogger } from '../../agent/logger';
import { hasPermission } from '../../lib/rbac';
import type { Context } from '../../context';
import { assertQuota } from '../../shared/quota-guard';
import type { AgentAuthContext, ExecutionStatus, PendingAction } from '../../agent/types';

// ADR-070: server-side AI_INTELLIGENCE entitlement (plan gate, not role gate).
const protectedProcedure = baseProtectedProcedure.use(requireModule('AI_INTELLIGENCE'));

/**
 * Fetch a pending action and assert it belongs to the caller's tenant.
 *
 * Returns NOT_FOUND (never FORBIDDEN) for a missing OR cross-tenant action so the
 * response can't be used to probe whether an `actionId` exists in another tenant.
 * The action's `tenantId` is stamped at creation (executeTool) and persisted on
 * the row, so this holds for the tRPC request path. Background processors call the
 * approval service directly (no tRPC ctx) and are intentionally unaffected.
 */
async function requireTenantOwnedAction(ctx: Context, actionId: string): Promise<PendingAction> {
  const callerTenant = ctx.user?.tenantId;
  const action = await approvalWorkflowService.getPendingAction(actionId);
  if (!action || !callerTenant || action.tenantId !== callerTenant) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Pending action not found: ${actionId}` });
  }
  return action;
}

/**
 * Read model for the approval queue (PG-198): real confidence as a percent or
 * null (RF-2 — never derived from impact), impact separately, escalation, and
 * the execution status of an approved-but-interrupted action.
 */
function toActionView(action: PendingAction & { executionStatus?: ExecutionStatus }) {
  return {
    id: action.id,
    toolName: action.toolName,
    actionType: action.actionType,
    entityType: action.entityType,
    preview: action.preview,
    createdAt: action.createdAt,
    expiresAt: action.expiresAt,
    status: action.status,
    // Stored as a whole percent (floored once at write time); round to undo the /100.
    confidence: action.confidence === undefined ? null : Math.round(action.confidence * 100),
    estimatedImpact: action.preview.estimatedImpact ?? null,
    escalatedAt: action.escalatedAt ?? null,
    escalatedTo: action.escalatedTo ?? null,
    executionStatus: action.executionStatus ?? null,
  };
}

/**
 * PG-198 (AC-010): enforce the effective policy's minimum reviewer role. The policy
 * is read fresh (no cache) and a read failure propagates, so the check fails closed.
 */
async function assertPolicyReviewer(ctx: Context, action: PendingAction): Promise<void> {
  const resolved = await loadApprovalPolicy(
    ctx.prisma,
    // requireTenantOwnedAction has already proven this is the caller's tenant.
    String(action.tenantId),
    'AGENT_TOOL',
    action.toolName,
    action.actionType,
    { fresh: true }
  );
  if (canReview(ctx.user?.role, resolved.rule)) return;
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: `This action needs a reviewer with the ${resolved.rule.minReviewerRole} role or above.`,
  });
}

/**
 * PG-198 (AC-013): auto-approve a just-queued action when the tenant's policy allows
 * it. Fail closed: any policy-read error leaves the action pending. The requester
 * must be able to approve it themselves (BR-6); the decision is audit-logged and the
 * action runs through the same executor as a human approval.
 */
async function tryAutoApprove(
  ctx: Context,
  agentContext: AgentAuthContext,
  action: PendingAction,
  tenantId: string
) {
  let resolved;
  try {
    resolved = await loadApprovalPolicy(
      ctx.prisma,
      tenantId,
      'AGENT_TOOL',
      action.toolName,
      action.actionType,
      { fresh: true }
    );
  } catch {
    return null;
  }
  if (!resolved.rule.autoApproveEnabled) return null;

  const verdict = evaluateAutoApproval({
    scope: 'AGENT_TOOL',
    rule: resolved.rule,
    confidence: action.confidence,
    impact: action.preview.estimatedImpact,
    agentKey: action.toolName,
    actionType: action.actionType,
    messageType: typeof action.input.type === 'string' ? action.input.type : undefined,
    requesterRole: ctx.user?.role,
    requesterCanApprove: await hasPermission(ctx, 'agent:tool-approval', 'approve'),
    hasSessionRequester: Boolean(ctx.user?.userId),
  });

  await agentLogger.log({
    userId: agentContext.userId,
    agentSessionId: agentContext.agentSessionId,
    toolName: action.toolName,
    actionType: action.actionType,
    entityType: action.entityType,
    input: action.input,
    success: verdict.approve,
    durationMs: 0,
    approvalRequired: true,
    approvalStatus: verdict.approve ? 'APPROVED' : 'PENDING',
    approvedBy: verdict.approve ? SYSTEM_APPROVAL_ACTOR : undefined,
    metadata: {
      autoApproval: {
        decision: verdict.approve ? 'APPROVED' : 'LEFT_FOR_REVIEW',
        reason: verdict.reason,
        policyId: resolved.policyId,
        policyName: resolved.policyName,
        threshold: resolved.rule.autoApproveMinConfidence,
        confidence: action.confidence ?? null,
        requester: agentContext.userId,
      },
    },
  });
  if (!verdict.approve) return null;

  let executed;
  try {
    executed = await approvalWorkflowService.approveAction(
      {
        actionId: action.id,
        decision: 'APPROVE',
        decidedBy: SYSTEM_APPROVAL_ACTOR,
        decidedAt: new Date(),
        reason: `Auto-approved by policy "${String(resolved.policyName)}": ${verdict.reason}`,
      },
      agentContext,
      ctx
    );
  } catch {
    // Refused before the claim (e.g. invalid input): it stays pending for a person.
    return null;
  }
  return {
    requiresApproval: false as const,
    autoApproved: true as const,
    actionId: executed.id,
    policyId: resolved.policyId,
    executionStatus: executed.executionStatus,
    result: executed.executionResult,
    error: executed.executionError,
  };
}

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
   * Tenant-gated: returns FORBIDDEN if the tool is disabled for this tenant.
   */
  getTool: protectedProcedure
    .input(z.object({ toolName: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user?.tenantId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Tenant context missing' });
      }

      let tool;
      try {
        tool = await getForTenant({
          name: input.toolName,
          tenantId: ctx.user.tenantId,
          prisma: ctx.prisma,
        });
      } catch (err) {
        if (err instanceof ToolDisabledError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: err.message });
        }
        throw err;
      }

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
        input: z.record(z.string(), z.unknown()),
        /** PG-198 (RF-2): the calling agent's own confidence, 0..1, when it has one. */
        confidence: z.number().min(0).max(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.tenantId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Tenant context missing' });
      }

      // Per-tenant metering: agent runs are AI spend. Assert only; cost is recorded elsewhere.
      await assertQuota(ctx, ctx.user.tenantId, 'aiSpendCentsPerMonth');

      // Gate: check tool is enabled for this tenant BEFORE building approval prompt
      let tool;
      try {
        tool = await getForTenant({
          name: input.toolName,
          tenantId: ctx.user.tenantId,
          prisma: ctx.prisma,
        });
      } catch (err) {
        if (err instanceof ToolDisabledError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: err.message });
        }
        throw err;
      }

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
          // Stamp the requesting tenant so reads/approvals can enforce ownership
          // (and so background processors can read the real tenant back off the row).
          tenantId: ctx.user.tenantId,
          toolName: tool.name,
          actionType: tool.actionType,
          entityType: tool.entityTypes[0],
          input: input.input,
          preview,
          status: 'PENDING' as const,
          createdAt: new Date(),
          // PG-198 (AC-008): the tenant's approval policy decides how long this waits.
          expiresAt: await resolveAgentToolExpiry(
            ctx.prisma,
            ctx.user.tenantId,
            tool.name,
            tool.actionType
          ),
          createdBy: agentContext.userId,
          agentSessionId: agentContext.agentSessionId,
          confidence: input.confidence,
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

        const autoApproved = await tryAutoApprove(
          ctx,
          agentContext,
          pendingAction,
          ctx.user.tenantId
        );
        if (autoApproved) return autoApproved;

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
    const [pendingActions, interrupted] = await Promise.all([
      approvalWorkflowService.getPendingActions(agentContext.userId, ctx.user?.tenantId),
      approvalWorkflowService.getInterruptedActions(agentContext.userId, ctx.user?.tenantId),
    ]);

    return [...pendingActions, ...interrupted].map(toActionView);
  }),

  /**
   * Get a specific pending action by ID
   */
  getPendingAction: protectedProcedure
    .input(z.object({ actionId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Tenant ownership guard: only the owning tenant may read an action by id.
      const action = await requireTenantOwnedAction(ctx, input.actionId);

      return { ...toActionView(action), input: action.input, metadata: action.metadata };
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
        modifiedInput: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // RBAC gate: caller must hold the 'agent:tool-approval' / 'approve' permission.
      // ADMIN role is short-circuited inside hasPermission; other roles need an
      // active role-level or user-level grant in the permission graph.
      if (!(await hasPermission(ctx, 'agent:tool-approval', 'approve'))) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to approve agent actions.',
        });
      }

      // Tenant ownership guard: an approver can only act on their own tenant's actions.
      const action = await requireTenantOwnedAction(ctx, input.actionId);
      // PG-198 (AC-010): the policy's minimum reviewer role, on top of the permission.
      await assertPolicyReviewer(ctx, action);

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
        agentContext,
        ctx
      );

      return {
        success: executedAction.executionStatus === 'SUCCEEDED',
        executionStatus: executedAction.executionStatus,
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
      // RBAC gate: caller must hold the 'agent:tool-approval' / 'reject' permission.
      // ADMIN role is short-circuited inside hasPermission; other roles need an
      // active role-level or user-level grant in the permission graph.
      if (!(await hasPermission(ctx, 'agent:tool-approval', 'reject'))) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to reject agent actions.',
        });
      }

      // Tenant ownership guard: a reviewer can only act on their own tenant's actions.
      const action = await requireTenantOwnedAction(ctx, input.actionId);
      // PG-198 (AC-010): the policy's minimum reviewer role, on top of the permission.
      await assertPolicyReviewer(ctx, action);

      const agentContext = buildAgentContext(ctx);

      const decision = {
        actionId: input.actionId,
        decision: 'REJECT' as const,
        decidedBy: agentContext.userId,
        decidedAt: new Date(),
        reason: input.reason,
      };

      const rejectedAction = await approvalWorkflowService.rejectAction(decision, agentContext);

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
      agentContext.userId,
      ctx.user?.tenantId
    );

    return {
      count: pendingActions.length,
      userId: agentContext.userId,
    };
  }),
});
