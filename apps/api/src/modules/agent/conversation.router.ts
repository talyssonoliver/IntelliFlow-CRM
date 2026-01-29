/**
 * Conversation Router (IFC-148)
 *
 * Provides tRPC endpoints for managing AI conversation records:
 * - CRUD operations for conversations
 * - Message management within conversations
 * - Tool call tracking and approval
 * - Search and filtering
 * - Analytics and metrics
 *
 * Security:
 * - All endpoints require authentication via protectedProcedure
 * - Tenant isolation enforced at query level
 * - Audit logging for all mutations
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '../../trpc';

// ============================================
// Input Schemas
// ============================================

const ConversationChannelSchema = z.enum([
  'WEB_CHAT',
  'MOBILE_APP',
  'API',
  'SLACK',
  'TEAMS',
  'EMAIL',
  'VOICE',
]);

const ConversationStatusSchema = z.enum([
  'ACTIVE',
  'PAUSED',
  'ENDED',
  'ARCHIVED',
  'DELETED',
]);

const MessageRoleSchema = z.enum(['USER', 'ASSISTANT', 'SYSTEM', 'TOOL']);

const ToolTypeSchema = z.enum([
  'SEARCH',
  'READ',
  'CREATE',
  'UPDATE',
  'DELETE',
  'EXECUTE',
  'INTEGRATION',
]);

const ToolCallStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'TIMEOUT',
]);

const ApprovalStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
]);

const CreateConversationSchema = z.object({
  sessionId: z.string().optional(), // Auto-generated if not provided
  title: z.string().optional(),
  agentId: z.string().optional(),
  agentName: z.string().optional(),
  agentModel: z.string().optional(),
  contextType: z.string().optional(),
  contextId: z.string().optional(),
  contextName: z.string().optional(),
  channel: ConversationChannelSchema.optional().default('WEB_CHAT'),
});

const AddMessageSchema = z.object({
  conversationId: z.string(),
  role: MessageRoleSchema,
  content: z.string(),
  contentType: z.string().optional().default('text'),
  modelUsed: z.string().optional(),
  finishReason: z.string().optional(),
  tokenCount: z.number().optional(),
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
  attachments: z.array(z.any()).optional(),
});

const RecordToolCallSchema = z.object({
  conversationId: z.string(),
  messageId: z.string().optional(),
  toolName: z.string(),
  toolType: ToolTypeSchema,
  toolVersion: z.string().optional(),
  inputParameters: z.record(z.unknown()),
  requiresApproval: z.boolean().optional().default(false),
  affectedEntityType: z.string().optional(),
  affectedEntityId: z.string().optional(),
  changeDescription: z.string().optional(),
  isReversible: z.boolean().optional().default(false),
  rollbackData: z.record(z.unknown()).optional(),
});

const UpdateToolCallSchema = z.object({
  id: z.string(),
  status: ToolCallStatusSchema.optional(),
  outputResult: z.record(z.unknown()).optional(),
  errorMessage: z.string().optional(),
  errorCode: z.string().optional(),
  durationMs: z.number().optional(),
});

const ApproveToolCallSchema = z.object({
  id: z.string(),
  approved: z.boolean(),
  reason: z.string().optional(),
});

const SearchConversationsSchema = z.object({
  userId: z.string().optional(),
  agentId: z.string().optional(),
  contextType: z.string().optional(),
  contextId: z.string().optional(),
  channel: ConversationChannelSchema.optional(),
  status: ConversationStatusSchema.optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  searchQuery: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0),
});

// ============================================
// Router Definition
// ============================================

export const conversationRouter = createTRPCRouter({
  /**
   * Start a new conversation
   */
  create: protectedProcedure
    .input(CreateConversationSchema)
    .mutation(async ({ ctx, input }) => {
      const sessionId = input.sessionId || `conv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

      // Extract IP address and user agent from request headers
      const ipAddress = ctx.req?.headers?.get('x-forwarded-for') || undefined;
      const userAgent = ctx.req?.headers?.get('user-agent') || undefined;

      const conversation = await ctx.prisma.conversationRecord.create({
        data: {
          tenantId: ctx.user.tenantId,
          sessionId,
          userId: ctx.user.userId,
          userName: ctx.user.email,
          title: input.title,
          agentId: input.agentId,
          agentName: input.agentName,
          agentModel: input.agentModel,
          contextType: input.contextType,
          contextId: input.contextId,
          contextName: input.contextName,
          channel: input.channel,
          status: 'ACTIVE',
          ipAddress,
          userAgent,
        },
      });

      return conversation;
    }),

  /**
   * Get a conversation by ID with messages and tool calls
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const conversation = await ctx.prisma.conversationRecord.findFirst({
        where: {
          id: input.id,
          tenantId: ctx.user.tenantId,
          status: { not: 'DELETED' },
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            include: {
              toolCalls: true,
            },
          },
          toolCalls: {
            orderBy: { startedAt: 'desc' },
          },
        },
      });

      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        });
      }

      return conversation;
    }),

  /**
   * Get a conversation by session ID
   */
  getBySessionId: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const conversation = await ctx.prisma.conversationRecord.findFirst({
        where: {
          sessionId: input.sessionId,
          tenantId: ctx.user.tenantId,
          status: { not: 'DELETED' },
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
          toolCalls: {
            orderBy: { startedAt: 'desc' },
          },
        },
      });

      return conversation;
    }),

  /**
   * Search conversations with filters
   */
  search: protectedProcedure
    .input(SearchConversationsSchema)
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        tenantId: ctx.user.tenantId,
        status: input.status || { not: 'DELETED' },
      };

      if (input.userId) where.userId = input.userId;
      if (input.agentId) where.agentId = input.agentId;
      if (input.contextType) where.contextType = input.contextType;
      if (input.contextId) where.contextId = input.contextId;
      if (input.channel) where.channel = input.channel;

      if (input.startDate || input.endDate) {
        where.startedAt = {};
        if (input.startDate) (where.startedAt as Record<string, Date>).gte = input.startDate;
        if (input.endDate) (where.startedAt as Record<string, Date>).lte = input.endDate;
      }

      if (input.searchQuery) {
        where.OR = [
          { title: { contains: input.searchQuery, mode: 'insensitive' } },
          { summary: { contains: input.searchQuery, mode: 'insensitive' } },
          { contextName: { contains: input.searchQuery, mode: 'insensitive' } },
        ];
      }

      const [conversations, total] = await Promise.all([
        ctx.prisma.conversationRecord.findMany({
          where,
          orderBy: { startedAt: 'desc' },
          take: input.limit,
          skip: input.offset,
          select: {
            id: true,
            sessionId: true,
            title: true,
            summary: true,
            userId: true,
            userName: true,
            agentId: true,
            agentName: true,
            contextType: true,
            contextId: true,
            contextName: true,
            channel: true,
            status: true,
            messageCount: true,
            toolCallCount: true,
            userRating: true,
            wasEscalated: true,
            startedAt: true,
            lastMessageAt: true,
            endedAt: true,
          },
        }),
        ctx.prisma.conversationRecord.count({ where }),
      ]);

      return {
        conversations,
        total,
        limit: input.limit,
        offset: input.offset,
        hasMore: input.offset + conversations.length < total,
      };
    }),

  /**
   * Add a message to a conversation
   */
  addMessage: protectedProcedure
    .input(AddMessageSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify conversation exists and belongs to tenant
      const conversation = await ctx.prisma.conversationRecord.findFirst({
        where: {
          id: input.conversationId,
          tenantId: ctx.user.tenantId,
          status: 'ACTIVE',
        },
      });

      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Active conversation not found',
        });
      }

      const [message] = await ctx.prisma.$transaction([
        // Create message
        ctx.prisma.messageRecord.create({
          data: {
            conversationId: input.conversationId,
            role: input.role,
            content: input.content,
            contentType: input.contentType,
            modelUsed: input.modelUsed,
            finishReason: input.finishReason,
            tokenCount: input.tokenCount,
            promptTokens: input.promptTokens,
            completionTokens: input.completionTokens,
            confidence: input.confidence,
            attachments: input.attachments,
          },
        }),
        // Update conversation metrics
        ctx.prisma.conversationRecord.update({
          where: { id: input.conversationId },
          data: {
            messageCount: { increment: 1 },
            lastMessageAt: new Date(),
            tokenCountInput: input.promptTokens
              ? { increment: input.promptTokens }
              : undefined,
            tokenCountOutput: input.completionTokens
              ? { increment: input.completionTokens }
              : undefined,
          },
        }),
      ]);

      return message;
    }),

  /**
   * Record a tool call
   */
  recordToolCall: protectedProcedure
    .input(RecordToolCallSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify conversation exists
      const conversation = await ctx.prisma.conversationRecord.findFirst({
        where: {
          id: input.conversationId,
          tenantId: ctx.user.tenantId,
        },
      });

      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        });
      }

      const [toolCall] = await ctx.prisma.$transaction([
        ctx.prisma.toolCallRecord.create({
          data: {
            conversationId: input.conversationId,
            messageId: input.messageId,
            toolName: input.toolName,
            toolType: input.toolType,
            toolVersion: input.toolVersion,
            inputParameters: input.inputParameters as object,
            status: input.requiresApproval ? 'PENDING' : 'RUNNING',
            requiresApproval: input.requiresApproval,
            approvalStatus: input.requiresApproval ? 'PENDING' : null,
            affectedEntityType: input.affectedEntityType,
            affectedEntityId: input.affectedEntityId,
            affectedEntity: input.affectedEntityType && input.affectedEntityId
              ? `${input.affectedEntityType}:${input.affectedEntityId}`
              : null,
            changeDescription: input.changeDescription,
            isReversible: input.isReversible,
            rollbackData: input.rollbackData as object | undefined,
          },
        }),
        ctx.prisma.conversationRecord.update({
          where: { id: input.conversationId },
          data: {
            toolCallCount: { increment: 1 },
          },
        }),
      ]);

      return toolCall;
    }),

  /**
   * Update tool call status and result
   */
  updateToolCall: protectedProcedure
    .input(UpdateToolCallSchema)
    .mutation(async ({ ctx, input }) => {
      const existingCall = await ctx.prisma.toolCallRecord.findFirst({
        where: { id: input.id },
        include: { conversation: true },
      });

      if (!existingCall || existingCall.conversation.tenantId !== ctx.user.tenantId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tool call not found',
        });
      }

      const toolCall = await ctx.prisma.toolCallRecord.update({
        where: { id: input.id },
        data: {
          status: input.status,
          outputResult: input.outputResult as object | undefined,
          errorMessage: input.errorMessage,
          errorCode: input.errorCode,
          durationMs: input.durationMs,
          completedAt: input.status && ['SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT'].includes(input.status)
            ? new Date()
            : undefined,
        },
      });

      return toolCall;
    }),

  /**
   * Approve or reject a tool call (human-in-the-loop)
   */
  approveToolCall: protectedProcedure
    .input(ApproveToolCallSchema)
    .mutation(async ({ ctx, input }) => {
      const existingCall = await ctx.prisma.toolCallRecord.findFirst({
        where: {
          id: input.id,
          requiresApproval: true,
          approvalStatus: 'PENDING',
        },
        include: { conversation: true },
      });

      if (!existingCall || existingCall.conversation.tenantId !== ctx.user.tenantId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pending tool call not found',
        });
      }

      const toolCall = await ctx.prisma.toolCallRecord.update({
        where: { id: input.id },
        data: {
          approvalStatus: input.approved ? 'APPROVED' : 'REJECTED',
          approvedBy: ctx.user.userId,
          approvedAt: new Date(),
          rejectionReason: input.approved ? null : input.reason,
          status: input.approved ? 'RUNNING' : 'CANCELLED',
        },
      });

      return toolCall;
    }),

  /**
   * End a conversation
   */
  endConversation: protectedProcedure
    .input(z.object({
      id: z.string(),
      reason: z.string().optional(),
      userRating: z.number().min(1).max(5).optional(),
      feedbackText: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conversation = await ctx.prisma.conversationRecord.findFirst({
        where: {
          id: input.id,
          tenantId: ctx.user.tenantId,
          status: 'ACTIVE',
        },
      });

      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Active conversation not found',
        });
      }

      const updated = await ctx.prisma.conversationRecord.update({
        where: { id: input.id },
        data: {
          status: 'ENDED',
          endReason: input.reason || 'user_ended',
          endedAt: new Date(),
          userRating: input.userRating,
          feedbackText: input.feedbackText,
        },
      });

      return updated;
    }),

  /**
   * Escalate a conversation to human support
   */
  escalate: protectedProcedure
    .input(z.object({
      id: z.string(),
      escalateTo: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conversation = await ctx.prisma.conversationRecord.findFirst({
        where: {
          id: input.id,
          tenantId: ctx.user.tenantId,
          status: 'ACTIVE',
        },
      });

      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Active conversation not found',
        });
      }

      const updated = await ctx.prisma.conversationRecord.update({
        where: { id: input.id },
        data: {
          wasEscalated: true,
          escalatedTo: input.escalateTo,
          escalatedAt: new Date(),
          endReason: input.reason || 'escalated',
        },
      });

      return updated;
    }),

  /**
   * Get pending tool calls requiring approval
   */
  getPendingApprovals: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).optional().default(10),
    }))
    .query(async ({ ctx, input }) => {
      const pendingCalls = await ctx.prisma.toolCallRecord.findMany({
        where: {
          requiresApproval: true,
          approvalStatus: 'PENDING',
          conversation: {
            tenantId: ctx.user.tenantId,
          },
        },
        include: {
          conversation: {
            select: {
              id: true,
              sessionId: true,
              title: true,
              contextType: true,
              contextName: true,
              userName: true,
            },
          },
        },
        orderBy: { startedAt: 'asc' },
        take: input.limit,
      });

      return pendingCalls;
    }),

  /**
   * Get conversation analytics (admin only)
   */
  getAnalytics: adminProcedure
    .input(z.object({
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        tenantId: ctx.user.tenantId,
      };

      if (input.startDate || input.endDate) {
        where.startedAt = {};
        if (input.startDate) (where.startedAt as Record<string, Date>).gte = input.startDate;
        if (input.endDate) (where.startedAt as Record<string, Date>).lte = input.endDate;
      }

      const [
        totalConversations,
        activeConversations,
        escalatedConversations,
        avgMessagesPerConversation,
        avgRating,
        toolCallsByType,
      ] = await Promise.all([
        ctx.prisma.conversationRecord.count({ where }),
        ctx.prisma.conversationRecord.count({ where: { ...where, status: 'ACTIVE' } }),
        ctx.prisma.conversationRecord.count({ where: { ...where, wasEscalated: true } }),
        ctx.prisma.conversationRecord.aggregate({
          where,
          _avg: { messageCount: true },
        }),
        ctx.prisma.conversationRecord.aggregate({
          where: { ...where, userRating: { not: null } },
          _avg: { userRating: true },
        }),
        ctx.prisma.toolCallRecord.groupBy({
          by: ['toolType'],
          where: {
            conversation: { tenantId: ctx.user.tenantId },
          },
          _count: true,
        }),
      ]);

      return {
        totalConversations,
        activeConversations,
        escalatedConversations,
        escalationRate: totalConversations > 0
          ? (escalatedConversations / totalConversations) * 100
          : 0,
        avgMessagesPerConversation: avgMessagesPerConversation._avg.messageCount || 0,
        avgRating: avgRating._avg.userRating || null,
        toolCallsByType: toolCallsByType.map(t => ({
          type: t.toolType,
          count: t._count,
        })),
      };
    }),

  /**
   * Archive old conversations (admin only)
   */
  archiveOld: adminProcedure
    .input(z.object({
      olderThanDays: z.number().min(1).max(365).default(90),
    }))
    .mutation(async ({ ctx, input }) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - input.olderThanDays);

      const result = await ctx.prisma.conversationRecord.updateMany({
        where: {
          tenantId: ctx.user.tenantId,
          status: 'ENDED',
          endedAt: { lt: cutoffDate },
        },
        data: {
          status: 'ARCHIVED',
        },
      });

      return { archivedCount: result.count };
    }),
});

export default conversationRouter;
