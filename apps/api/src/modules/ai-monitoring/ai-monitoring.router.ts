/**
 * AI Monitoring Router - IFC-197 / IFC-297
 *
 * Exposes AI monitoring data (drift detection, latency metrics, hallucination
 * checks, ROI tracking, agent status) via type-safe tRPC endpoints.
 *
 * Architecture (IFC-297): DB-backed AIMonitoringService replaces in-memory
 * singleton imports from @intelliflow/ai-worker. All monitoring data is now
 * persisted to PostgreSQL via the container service, making it available
 * regardless of process topology.
 *
 * Tenant strategy:
 * - Monitoring data (5 endpoints): global, returned to all authenticated users
 * - Agent data (2 endpoints): tenant-scoped via Prisma queries
 *
 * @module ai-monitoring
 * @task IFC-197, IFC-297
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { loadBullMQ } from '../../lib/load-bullmq';

// ============================================================
// Input Schemas
// ============================================================

const driftQuerySchema = z.object({
  model: z.string().optional(),
  metric: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

const timeRangeSchema = z.object({
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
});

const latencyQuerySchema = timeRangeSchema.extend({
  model: z.string().optional(),
});

const hallucinationQuerySchema = timeRangeSchema.extend({
  limit: z.number().int().min(1).max(100).default(50),
});

const agentLogsQuerySchema = z.object({
  agentId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// ============================================================
// Router
// ============================================================

export const aiMonitoringRouter = createTRPCRouter({
  /**
   * Combined health status across all monitoring modules.
   * Returns drift, hallucination, latency, and ROI summaries.
   * IFC-297: Now DB-backed via AIMonitoringService — available regardless of process topology.
   */
  getStatus: tenantProcedure.query(async ({ ctx }) => {
    try {
      return await ctx.services!.aiMonitoringService!.getStatus();
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve monitoring status',
        cause: error,
      });
    }
  }),

  /**
   * Drift detection metrics: current status and history.
   * IFC-297: Now DB-backed via AIMonitoringService.
   */
  getDriftMetrics: tenantProcedure.input(driftQuerySchema).query(async ({ ctx, input }) => {
    try {
      return await ctx.services!.aiMonitoringService!.getDriftMetrics(input);
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve drift metrics',
        cause: error,
      });
    }
  }),

  /**
   * Latency percentiles, SLO compliance, and alerts.
   * IFC-297: Now DB-backed via AIMonitoringService.
   */
  getLatencyMetrics: tenantProcedure.input(latencyQuerySchema).query(async ({ ctx, input }) => {
    try {
      return await ctx.services!.aiMonitoringService!.getLatencyMetrics(input);
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve latency metrics',
        cause: error,
      });
    }
  }),

  /**
   * Latency trend over time: p50, p95, p99, count per bucket.
   * IFC-297: Now DB-backed via AIMonitoringService.
   */
  getLatencyTrend: tenantProcedure
    .input(
      timeRangeSchema.extend({
        periodMinutes: z.number().int().min(5).max(1440).default(60),
        bucketMinutes: z.number().int().min(1).max(60).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await ctx.services!.aiMonitoringService!.getLatencyTrend(input);
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve latency trend',
          cause: error,
        });
      }
    }),

  /**
   * Hallucination detection stats: rate, type breakdown, KPI compliance.
   * IFC-297: Now DB-backed via AIMonitoringService.
   */
  getHallucinationReport: tenantProcedure
    .input(hallucinationQuerySchema)
    .query(async ({ ctx, input }) => {
      try {
        return await ctx.services!.aiMonitoringService!.getHallucinationReport(input);
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve hallucination report',
          cause: error,
        });
      }
    }),

  /**
   * ROI metrics: costs, values, ROI %, trend direction, recommendations.
   * IFC-297: Now DB-backed via AIMonitoringService.
   */
  getROIMetrics: tenantProcedure.input(timeRangeSchema).query(async ({ ctx, input }) => {
    try {
      return await ctx.services!.aiMonitoringService!.getROIMetrics(input);
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve ROI metrics',
        cause: error,
      });
    }
  }),

  /**
   * Active AI agents (from ConversationRecord DB, tenant-scoped).
   */
  getActiveAgents: tenantProcedure.query(async ({ ctx }) => {
    try {
      const tenantId = ctx.tenant.tenantId;

      const conversations = await ctx.prismaWithTenant.conversationRecord.findMany({
        where: {
          tenantId,
          status: { in: ['ACTIVE', 'IDLE', 'ERROR'] },
        },
        select: {
          id: true,
          agentId: true,
          agentName: true,
          agentModel: true,
          status: true,
          contextName: true,
          contextType: true,
          contextId: true,
          startedAt: true,
          lastMessageAt: true,
        },
        orderBy: { lastMessageAt: 'desc' },
      });

      return {
        agents: conversations.map((c) => ({
          id: c.id,
          agentId: c.agentId,
          type: c.agentName ?? 'unknown',
          model: c.agentModel ?? 'unknown',
          status: c.status.toLowerCase() as 'active' | 'idle' | 'error',
          currentTask: c.contextName ?? undefined,
          contextType: c.contextType ?? null,
          contextId: c.contextId ?? null,
          lastActive: (c.lastMessageAt ?? c.startedAt).toISOString(),
        })),
        totalActive: conversations.length,
      };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve active agents',
        cause: error,
      });
    }
  }),

  /**
   * Agent conversation logs (from ConversationRecord DB, tenant-scoped).
   * Supports optional agentId filter and pagination.
   */
  getAgentLogs: tenantProcedure.input(agentLogsQuerySchema).query(async ({ ctx, input }) => {
    try {
      const tenantId = ctx.tenant.tenantId;

      const where: Record<string, unknown> = { tenantId };
      if (input.agentId) {
        where.agentId = input.agentId;
      }

      const [conversations, total] = await Promise.all([
        ctx.prismaWithTenant.conversationRecord.findMany({
          where,
          select: {
            id: true,
            agentId: true,
            agentName: true,
            contextType: true,
            contextId: true,
            startedAt: true,
            messages: {
              select: {
                id: true,
                role: true,
                content: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'asc' },
            },
            toolCalls: {
              select: {
                id: true,
                toolName: true,
                toolInput: true,
                toolOutput: true,
                status: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { startedAt: 'desc' },
          take: input.limit,
          skip: input.offset,
        }),
        ctx.prismaWithTenant.conversationRecord.count({ where }),
      ]);

      return {
        logs: conversations.map((c) => ({
          id: c.id,
          agentId: c.agentId ?? '',
          agentType: c.agentName ?? 'unknown',
          contextType: c.contextType ?? null,
          contextId: c.contextId ?? null,
          messages: c.messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.createdAt.toISOString(),
          })),
          toolCalls: c.toolCalls.map((t) => ({
            name: t.toolName,
            input: t.toolInput,
            output: t.toolOutput,
            status: t.status,
            timestamp: t.createdAt.toISOString(),
          })),
          createdAt: c.startedAt.toISOString(),
        })),
        total,
        hasMore: input.offset + input.limit < total,
      };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve agent logs',
        cause: error,
      });
    }
  }),

  /**
   * Reset an agent's status from ERROR → IDLE.
   * Clears error fields so it shows as healthy on the dashboard.
   */
  resetAgentStatus: tenantProcedure
    .input(z.object({ agentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenant.tenantId;
        const conversation = await ctx.prismaWithTenant.conversationRecord.findFirst({
          where: { tenantId, agentId: input.agentId },
          select: { id: true, status: true },
        });

        if (!conversation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
        }

        await ctx.prismaWithTenant.conversationRecord.update({
          where: { id: conversation.id },
          data: {
            status: 'IDLE',
            endReason: null,
            summary: null,
            endedAt: null,
            contextName: 'Awaiting new jobs',
            lastMessageAt: new Date(),
          },
        });

        return { success: true, agentId: input.agentId };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reset agent status',
          cause: error,
        });
      }
    }),

  /**
   * Delete an agent record (removes from Active Agents dashboard).
   * Also deletes associated messages and tool calls.
   */
  deleteAgent: tenantProcedure
    .input(z.object({ agentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenant.tenantId;
        const conversation = await ctx.prismaWithTenant.conversationRecord.findFirst({
          where: { tenantId, agentId: input.agentId },
          select: { id: true },
        });

        if (!conversation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
        }

        // Delete child records first (messages, tool calls), then the conversation
        await ctx.prismaWithTenant.messageRecord.deleteMany({
          where: { conversationId: conversation.id },
        });
        await ctx.prismaWithTenant.toolCallRecord.deleteMany({
          where: { conversationId: conversation.id },
        });
        await ctx.prismaWithTenant.conversationRecord.delete({
          where: { id: conversation.id },
        });

        return { success: true, agentId: input.agentId };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete agent',
          cause: error,
        });
      }
    }),

  /**
   * Failed BullMQ jobs across AI queues.
   * Provides DLQ-like visibility into the /agent-approvals/logs page.
   */
  getFailedJobs: tenantProcedure
    .input(
      z.object({
        queue: z.enum(['ai-scoring', 'ai-prediction', 'ai-insights']).optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      try {
        const { Queue } = await loadBullMQ();
        const queueNames = input.queue
          ? [input.queue]
          : ['ai-scoring', 'ai-prediction', 'ai-insights'];

        const connection = {
          host: process.env.REDIS_HOST || 'localhost',
          port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
        };

        const allFailed: Array<{
          id: string;
          queue: string;
          name: string;
          failedReason: string;
          attemptsMade: number;
          timestamp: string;
          data: Record<string, unknown>;
        }> = [];

        for (const qName of queueNames) {
          const q = new Queue(qName, { connection });
          const counts = await q.getJobCounts();
          if (counts.failed > 0) {
            const failed = await q.getFailed(0, counts.failed);
            for (const job of failed) {
              allFailed.push({
                id: job.id ?? 'unknown',
                queue: qName,
                name: job.name,
                failedReason: job.failedReason || 'Unknown',
                attemptsMade: job.attemptsMade,
                timestamp: job.finishedOn
                  ? new Date(job.finishedOn).toISOString()
                  : new Date().toISOString(),
                data: job.data as Record<string, unknown>,
              });
            }
          }
          await q.close();
        }

        // Sort by most recent first
        allFailed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        const paged = allFailed.slice(input.offset, input.offset + input.limit);

        return {
          jobs: paged,
          total: allFailed.length,
          hasMore: input.offset + input.limit < allFailed.length,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve failed jobs from BullMQ',
          cause: error,
        });
      }
    }),
});
