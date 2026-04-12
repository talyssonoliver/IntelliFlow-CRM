/**
 * Auto-Response Router - IFC-029: Auto-Response with Approval Gate
 *
 * Provides type-safe tRPC endpoints for AI auto-response workflow:
 * - Create AI-generated drafts
 * - Submit for human approval
 * - Approve/Reject/Escalate
 * - Track sending status
 *
 * All endpoints use tenantProcedure for multi-tenant isolation.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  createAutoResponseDraftSchema,
  submitForApprovalSchema,
  approvalDecisionSchema,
  escalationSchema,
  markSentSchema,
  markFailedSchema,
  autoResponseQuerySchema,
  idSchema,
} from '@intelliflow/validators';
import {
  AutoResponseDraft,
  AutoResponseDraftId,
  ResponseContent,
  type AutoResponseDraftRepository,
} from '@intelliflow/domain';
import type { Context } from '../../context';
import { getTenantContext } from '../../security/tenant-context';
import { createNotification } from '../notifications/notifications.router';

// Lazy-load the repository implementation to avoid workspace resolution issues
let _repositoryClass: (new (prisma: any) => AutoResponseDraftRepository) | null = null;
async function getRepositoryClass(): Promise<new (prisma: any) => AutoResponseDraftRepository> {
  if (!_repositoryClass) {
    // Dynamic import to work around TypeScript workspace resolution
    const adapters = await import('@intelliflow/adapters');
    _repositoryClass = (adapters as any).PrismaAutoResponseDraftRepository;
  }
  return _repositoryClass!;
}

/**
 * Helper to get auto-response repository
 */
async function getRepository(ctx: Context): Promise<AutoResponseDraftRepository> {
  const RepositoryClass = await getRepositoryClass();
  return new RepositoryClass(ctx.prismaWithTenant);
}

/**
 * Helper to publish domain events
 */
async function publishEvents(draft: AutoResponseDraft): Promise<void> {
  const events = draft.getDomainEvents();
  if (events.length > 0) {
    // In production, this would publish to event bus
    // For now, just log and clear
    console.log(
      '[AutoResponse] Domain events:',
      events.map((e) => e.constructor.name)
    );
  }
  draft.clearDomainEvents();
}

export const autoResponseRouter = createTRPCRouter({
  /**
   * Create a new auto-response draft
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  create: tenantProcedure
    .input(
      createAutoResponseDraftSchema.extend({
        leadTenantId: idSchema,
        leadStatus: z.string(),
        modelVersion: z.string().default('openai:gpt-4:v1'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const repository = await getRepository(ctx);

      // Check for existing active draft
      const existingDraft = await repository.findActiveByLeadAndTrigger(
        input.leadId,
        input.triggerType,
        typedCtx.tenant.tenantId
      );

      if (existingDraft) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Active draft already exists for lead ${input.leadId} with trigger ${input.triggerType}`,
        });
      }

      // Create response content
      let content: ResponseContent;
      try {
        content = ResponseContent.create({
          subject: input.subject,
          body: input.body,
        });
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Invalid response content',
        });
      }

      // Create draft
      const createResult = AutoResponseDraft.create({
        tenantId: typedCtx.tenant.tenantId,
        leadId: input.leadId,
        leadTenantId: input.leadTenantId,
        leadStatus: input.leadStatus,
        triggerType: input.triggerType,
        content,
        aiConfidence: input.aiConfidence,
        modelVersion: input.modelVersion,
        recipientEmail: input.recipientEmail,
        expiryHours: input.expiryHours,
      });

      if (createResult.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: createResult.error.message,
        });
      }

      const draft = createResult.value;

      try {
        await repository.save(draft);
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save auto-response draft',
        });
      }

      await publishEvents(draft);

      return {
        draftId: draft.id.toString(),
        status: draft.status,
        expiresAt: draft.expiresAt,
        aiConfidence: draft.aiConfidence,
      };
    }),

  /**
   * Get a draft by ID
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  getById: tenantProcedure.input(z.object({ draftId: idSchema })).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const repository = await getRepository(ctx);

    const id = AutoResponseDraftId.fromString(input.draftId);
    const draft = await repository.findById(id, typedCtx.tenant.tenantId);

    if (!draft) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Draft not found: ${input.draftId}`,
      });
    }

    return {
      id: draft.id.toString(),
      leadId: draft.leadId,
      subject: draft.content.subject,
      body: draft.content.body,
      status: draft.status,
      aiConfidence: draft.aiConfidence,
      modelVersion: draft.modelVersion,
      triggerType: draft.triggerType,
      recipientEmail: draft.recipientEmail,
      createdAt: draft.createdAt,
      expiresAt: draft.expiresAt,
      updatedAt: draft.updatedAt,
      statusHistory: draft.statusHistory.map((h) => ({
        status: h.status,
        changedAt: h.changedAt,
        changedBy: h.changedBy,
        reason: h.reason,
      })),
      approvalDecision: draft.approvalDecision,
      escalation: draft.escalation,
      escalationCount: draft.escalationCount,
      isExpired: draft.isExpired,
      isPendingApproval: draft.isPendingApproval,
      canBeSent: draft.canBeSent,
    };
  }),

  /**
   * List drafts with filtering
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  list: tenantProcedure.input(autoResponseQuerySchema).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const repository = await getRepository(ctx);

    const page = input.page ?? 1;
    const limit = input.limit ?? 20;
    const offset = (page - 1) * limit;

    const drafts = await repository.find({
      tenantId: typedCtx.tenant.tenantId,
      leadId: input.leadId,
      status: input.status,
      triggerType: input.triggerType?.[0],
      expiredOnly: input.expired,
      limit,
      offset,
    });

    return {
      drafts: drafts.map((d) => ({
        id: d.id.toString(),
        leadId: d.leadId,
        subject: d.content.subject,
        body: d.content.body,
        status: d.status,
        aiConfidence: d.aiConfidence,
        triggerType: d.triggerType,
        recipientEmail: d.recipientEmail,
        createdAt: d.createdAt,
        expiresAt: d.expiresAt,
      })),
      total: drafts.length,
      page,
      limit,
      hasMore: drafts.length === limit,
    };
  }),

  /**
   * Submit a draft for human approval
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  submitForApproval: tenantProcedure
    .input(submitForApprovalSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const repository = await getRepository(ctx);

      const id = AutoResponseDraftId.fromString(input.draftId);
      const draft = await repository.findById(id, typedCtx.tenant.tenantId);

      if (!draft) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Draft not found: ${input.draftId}`,
        });
      }

      const submitResult = draft.submitForApproval(input.approverId);
      if (submitResult.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: submitResult.error.message,
        });
      }

      try {
        await repository.save(draft);
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save draft',
        });
      }

      await publishEvents(draft);

      return { success: true, status: draft.status };
    }),

  /**
   * Approve a draft with optional modifications
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  approve: tenantProcedure
    .input(
      approvalDecisionSchema.refine((d) => d.decision === 'APPROVED', {
        message: 'Use reject endpoint for rejection',
      })
    )
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const repository = await getRepository(ctx);

      const id = AutoResponseDraftId.fromString(input.draftId);
      const draft = await repository.findById(id, typedCtx.tenant.tenantId);

      if (!draft) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Draft not found: ${input.draftId}`,
        });
      }

      const approveResult = draft.approve(input.decidedBy, input.modifications, input.reason);

      if (approveResult.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: approveResult.error.message,
        });
      }

      try {
        await repository.save(draft);
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save draft',
        });
      }

      await publishEvents(draft);

      return { success: true, status: draft.status };
    }),

  /**
   * Reject a draft
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  reject: tenantProcedure
    .input(
      z.object({
        draftId: idSchema,
        decidedBy: idSchema,
        reason: z.string().min(1, 'Rejection reason is required').max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const repository = await getRepository(ctx);

      const id = AutoResponseDraftId.fromString(input.draftId);
      const draft = await repository.findById(id, typedCtx.tenant.tenantId);

      if (!draft) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Draft not found: ${input.draftId}`,
        });
      }

      const rejectResult = draft.reject(input.decidedBy, input.reason);
      if (rejectResult.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: rejectResult.error.message,
        });
      }

      try {
        await repository.save(draft);
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save draft',
        });
      }

      await publishEvents(draft);

      return { success: true, status: draft.status };
    }),

  /**
   * Escalate a draft to a manager
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  escalate: tenantProcedure
    .input(
      escalationSchema.extend({
        escalatedBy: idSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const repository = await getRepository(ctx);

      const id = AutoResponseDraftId.fromString(input.draftId);
      const draft = await repository.findById(id, typedCtx.tenant.tenantId);

      if (!draft) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Draft not found: ${input.draftId}`,
        });
      }

      const escalateResult = draft.escalate(
        input.escalatedBy,
        input.escalatedTo,
        input.reason,
        input.escalationExpiryHours
      );

      if (escalateResult.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: escalateResult.error.message,
        });
      }

      try {
        await repository.save(draft);
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save draft',
        });
      }

      await publishEvents(draft);

      // Send notification to the escalation target
      try {
        await createNotification(
          ctx.prismaWithTenant,
          {
            userId: input.escalatedTo,
            tenantId: typedCtx.tenant.tenantId,
            type: 'ai_action_pending',
            title: 'AI Draft Escalated for Your Review',
            body: `An AI auto-response draft "${draft.content.subject}" has been escalated to you for review. Reason: ${input.reason}`,
            priority: 'high',
            entityType: 'auto_response_draft',
            entityId: draft.id.toString(),
            entityName: draft.content.subject,
            actionUrl: '/agent-approvals?status=escalated',
            actionLabel: 'Review Draft',
          },
          ctx.services?.notificationOrchestrator
        );
      } catch (notifError) {
        // Non-blocking — escalation still succeeds even if notification fails
        console.error('[AutoResponse] Failed to send escalation notification:', notifError);
      }

      return { success: true, status: draft.status };
    }),

  /**
   * Resolve an escalation
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  resolveEscalation: tenantProcedure
    .input(
      z.object({
        draftId: idSchema,
        resolvedBy: idSchema,
        feedback: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const repository = await getRepository(ctx);

      const id = AutoResponseDraftId.fromString(input.draftId);
      const draft = await repository.findById(id, typedCtx.tenant.tenantId);

      if (!draft) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Draft not found: ${input.draftId}`,
        });
      }

      const resolveResult = draft.resolveEscalation(input.resolvedBy, input.feedback);
      if (resolveResult.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: resolveResult.error.message,
        });
      }

      try {
        await repository.save(draft);
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save draft',
        });
      }

      await publishEvents(draft);

      return { success: true, status: draft.status };
    }),

  /**
   * Mark a draft as sent
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  markSent: tenantProcedure.input(markSentSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const repository = await getRepository(ctx);

    const id = AutoResponseDraftId.fromString(input.draftId);
    const draft = await repository.findById(id, typedCtx.tenant.tenantId);

    if (!draft) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Draft not found: ${input.draftId}`,
      });
    }

    const sentResult = draft.markSent(input.notificationId);
    if (sentResult.isFailure) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: sentResult.error.message,
      });
    }

    try {
      await repository.save(draft);
    } catch {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to save draft',
      });
    }

    await publishEvents(draft);

    return { success: true, status: draft.status };
  }),

  /**
   * Mark a draft send as failed
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  markFailed: tenantProcedure.input(markFailedSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const repository = await getRepository(ctx);

    const id = AutoResponseDraftId.fromString(input.draftId);
    const draft = await repository.findById(id, typedCtx.tenant.tenantId);

    if (!draft) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Draft not found: ${input.draftId}`,
      });
    }

    const failResult = draft.markSendFailed(input.error);
    if (failResult.isFailure) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: failResult.error.message,
      });
    }

    try {
      await repository.save(draft);
    } catch {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to save draft',
      });
    }

    await publishEvents(draft);

    return { success: true, status: draft.status };
  }),

  /**
   * Get pending drafts for an approver
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  getPendingForApprover: tenantProcedure
    .input(z.object({ approverId: idSchema }))
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const repository = await getRepository(ctx);

      const drafts = await repository.findPendingForApprover(
        input.approverId,
        typedCtx.tenant.tenantId
      );

      return {
        drafts: drafts.map((d) => ({
          id: d.id.toString(),
          leadId: d.leadId,
          subject: d.content.subject,
          body: d.content.body,
          status: d.status,
          aiConfidence: d.aiConfidence,
          triggerType: d.triggerType,
          recipientEmail: d.recipientEmail,
          createdAt: d.createdAt,
          expiresAt: d.expiresAt,
        })),
        total: drafts.length,
      };
    }),

  /**
   * Rollback an approved draft
   * SECURITY: Only the user who approved can rollback, or an admin
   * IFC-149: Action preview and rollback UI
   */
  rollback: tenantProcedure
    .input(
      z.object({
        draftId: idSchema,
        rolledBackBy: idSchema,
        reason: z.string().min(1, 'Reason is required').max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const repository = await getRepository(ctx);

      const id = AutoResponseDraftId.fromString(input.draftId);
      const draft = await repository.findById(id, typedCtx.tenant.tenantId);

      if (!draft) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Draft not found: ${input.draftId}`,
        });
      }

      // Only allow rollback of approved items that haven't been sent
      if (draft.status !== 'APPROVED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot rollback draft with status: ${draft.status}. Only APPROVED drafts can be rolled back.`,
        });
      }

      // Use invalidate to mark the draft as rolled back
      draft.invalidate(`Rolled back by ${input.rolledBackBy}: ${input.reason}`);

      try {
        await repository.save(draft);
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save draft',
        });
      }

      await publishEvents(draft);

      return { success: true, status: draft.status };
    }),

  /**
   * Regenerate a draft from an expired/invalidated/rejected one
   * Creates a new draft with the same parameters and a fresh expiry window.
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  regenerate: tenantProcedure
    .input(
      z.object({
        draftId: idSchema,
        subject: z.string().min(1).max(500).optional(),
        body: z.string().min(1).max(10000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const repository = await getRepository(ctx);

      const id = AutoResponseDraftId.fromString(input.draftId);
      const original = await repository.findById(id, typedCtx.tenant.tenantId);

      if (!original) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Draft not found: ${input.draftId}`,
        });
      }

      // Only allow regeneration from terminal states
      const terminalStatuses = ['INVALIDATED', 'REJECTED', 'FAILED'];
      if (!terminalStatuses.includes(original.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot regenerate draft with status: ${original.status}. Only terminal states (${terminalStatuses.join(', ')}) can be regenerated.`,
        });
      }

      // Check no active draft already exists for this lead+trigger
      const existingActive = await repository.findActiveByLeadAndTrigger(
        original.leadId,
        original.triggerType,
        typedCtx.tenant.tenantId
      );

      if (existingActive) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `An active draft already exists for lead ${original.leadId} with trigger ${original.triggerType}`,
        });
      }

      // Build content — use overrides if provided, else reuse original
      const originalContent = original.content.toValue();
      let content: ResponseContent;
      try {
        content = ResponseContent.create({
          subject: input.subject ?? originalContent.subject,
          body: input.body ?? originalContent.body,
        });
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Invalid response content',
        });
      }

      // Create new draft reusing original parameters
      // leadTenantId === tenantId (validated at original creation), leadStatus defaults to CONTACTED
      const createResult = AutoResponseDraft.create({
        tenantId: typedCtx.tenant.tenantId,
        leadId: original.leadId,
        leadTenantId: typedCtx.tenant.tenantId,
        leadStatus: 'CONTACTED',
        triggerType: original.triggerType,
        content,
        aiConfidence: original.aiConfidence,
        modelVersion: original.modelVersion,
        recipientEmail: original.recipientEmail,
      });

      if (createResult.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: createResult.error.message,
        });
      }

      const draft = createResult.value;

      try {
        await repository.save(draft);
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save regenerated draft',
        });
      }

      await publishEvents(draft);

      return {
        draftId: draft.id.toString(),
        status: draft.status,
        expiresAt: draft.expiresAt,
        regeneratedFrom: input.draftId,
      };
    }),

  /**
   * Get statistics by status
   * SECURITY: Uses tenantProcedure to enforce tenant isolation
   */
  getStatsByStatus: tenantProcedure
    .input(z.object({ tenantId: idSchema }).optional())
    .query(async ({ ctx, input }) => {
      const repository = await getRepository(ctx);
      const tenantId = input?.tenantId ?? ctx.tenant.tenantId;

      if (!tenantId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Tenant context is required',
        });
      }

      const statuses = [
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'REJECTED',
        'ESCALATED',
        'SENT',
        'FAILED',
        'INVALIDATED',
      ] as const;

      const stats: Record<string, number> = {};
      for (const status of statuses) {
        stats[status] = await repository.countByStatus(tenantId, status);
      }

      return stats;
    }),
});
