/**
 * AI Monitoring Router - IFC-197
 *
 * Exposes AI monitoring data (drift detection, latency metrics, hallucination
 * checks, ROI tracking, agent status) via type-safe tRPC endpoints.
 *
 * Architecture: Direct import of monitoring singletons from @intelliflow/ai-worker.
 * The monitoring modules are in-memory state holders — no DI/container wiring needed.
 *
 * Tenant strategy:
 * - Monitoring data (5 endpoints): global, returned to all authenticated users
 * - Agent data (2 endpoints): tenant-scoped via Prisma queries
 *
 * Limitation: In a multi-process setup, API process gets separate singleton
 * instances from ai-worker. Data will be empty unless both run in same process
 * or Redis backing is added (future sprint).
 *
 * @module ai-monitoring
 * @task IFC-197
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';

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

type AIMonitoringModule = Pick<
  typeof import('@intelliflow/ai-worker'),
  'driftDetector' | 'latencyMonitor' | 'hallucinationChecker' | 'roiTracker' | 'getMonitoringStatus'
>;

let aiMonitoringModulePromise: Promise<AIMonitoringModule> | null = null;

async function loadAIMonitoringModule(): Promise<AIMonitoringModule> {
  aiMonitoringModulePromise ??= import('@intelliflow/ai-worker').then((module) => ({
    driftDetector: module.driftDetector,
    latencyMonitor: module.latencyMonitor,
    hallucinationChecker: module.hallucinationChecker,
    roiTracker: module.roiTracker,
    getMonitoringStatus: module.getMonitoringStatus,
  }));

  try {
    return await aiMonitoringModulePromise;
  } catch (error) {
    aiMonitoringModulePromise = null;
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'AI monitoring module is unavailable',
      cause: error,
    });
  }
}

// ============================================================
// Router
// ============================================================

export const aiMonitoringRouter = createTRPCRouter({
  /**
   * Combined health status across all monitoring modules.
   * Returns drift, hallucination, latency, and ROI summaries.
   *
   * When running in a multi-process setup (AI worker separate from API),
   * the in-memory singletons will be empty. Returns an `available: false`
   * flag so the frontend can show an appropriate banner.
   */
  getStatus: tenantProcedure.query(async () => {
    const isColocated = process.env.AI_WORKER_COLOCATED === 'true';

    try {
      const { getMonitoringStatus } = await loadAIMonitoringModule();
      const status = getMonitoringStatus();

      // Detect genuinely empty data from a separate-process singleton
      const isEmpty =
        status.drift.trackedMetrics === 0 &&
        status.hallucination.totalChecks === 0 &&
        (status.latency.percentiles?.p95 ?? 0) === 0;

      if (isEmpty && !isColocated) {
        return {
          available: false as const,
          reason: 'monitoring_process_isolated' as const,
          healthy: true,
          issues: [],
          drift: { trackedMetrics: 0, driftDetected: false, highSeverityCount: 0 },
          hallucination: { rate: 0, kpiCompliant: true, totalChecks: 0 },
          latency: { sloCompliant: true, p95: 0, p99: 0 },
          roi: { currentROI: 0, trend: [], totalCost: 0, totalValue: 0 },
        };
      }

      return {
        available: true as const,
        healthy: status.healthy,
        issues: status.issues,
        drift: {
          trackedMetrics: status.drift.trackedMetrics,
          driftDetected: status.drift.driftDetected,
          highSeverityCount: status.drift.highSeverityCount,
        },
        hallucination: {
          rate: status.hallucination.hallucinationRate,
          kpiCompliant: status.hallucination.kpiCompliant,
          totalChecks: status.hallucination.totalChecks,
        },
        latency: {
          sloCompliant: status.latency.sloCompliance?.overallCompliant ?? true,
          p95: status.latency.percentiles?.p95 ?? 0,
          p99: status.latency.percentiles?.p99 ?? 0,
        },
        roi: {
          currentROI: status.roi.currentROI ?? 0,
          trend: status.roi.roiTrend ?? [],
          totalCost: status.roi.totalCostsTracked ?? 0,
          totalValue: status.roi.totalValuesTracked ?? 0,
        },
      };
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
   */
  getDriftMetrics: tenantProcedure.input(driftQuerySchema).query(async ({ input }) => {
    const isColocated = process.env.AI_WORKER_COLOCATED === 'true';

    try {
      const { driftDetector } = await loadAIMonitoringModule();
      const status = driftDetector.getStatus();
      const history = driftDetector.getHistory(input.limit);

      // Detect empty singleton from separate-process
      if (status.totalSamples === 0 && history.length === 0 && !isColocated) {
        return {
          available: false as const,
          reason: 'monitoring_process_isolated' as const,
          status: {
            trackedMetrics: 0,
            totalSamples: 0,
            driftDetected: false,
            highSeverityCount: 0,
            lastCheck: null,
          },
          history: [],
        };
      }

      return {
        available: true as const,
        status: {
          trackedMetrics: status.trackedMetrics,
          totalSamples: status.totalSamples,
          driftDetected: status.driftDetected,
          highSeverityCount: status.highSeverityCount,
          lastCheck: status.lastCheck?.toISOString() ?? null,
        },
        history: history.map((h) => ({
          detected: h.detected,
          severity: h.severity,
          metric: h.metric,
          pValue: h.pValue,
          driftScore: h.driftScore,
          timestamp: h.timestamp.toISOString(),
          recommendations: h.recommendations,
        })),
      };
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
   */
  getLatencyMetrics: tenantProcedure.input(latencyQuerySchema).query(async ({ input }) => {
    const isColocated = process.env.AI_WORKER_COLOCATED === 'true';

    try {
      const { latencyMonitor } = await loadAIMonitoringModule();
      const stats = latencyMonitor.getStats(input.startTime, input.endTime);
      const alerts = latencyMonitor.getAlerts();

      // Detect empty singleton from separate-process
      if (stats.sampleCount === 0 && !isColocated) {
        return {
          available: false as const,
          reason: 'monitoring_process_isolated' as const,
          sampleCount: 0,
          successRate: 0,
          percentiles: stats.percentiles,
          sloCompliance: stats.sloCompliance,
          byModel: {},
          byOperation: {},
          byPhase: {},
          alerts: [],
        };
      }

      return {
        available: true as const,
        sampleCount: stats.sampleCount,
        successRate: stats.successRate,
        percentiles: stats.percentiles,
        sloCompliance: stats.sloCompliance,
        byModel: stats.byModel,
        byOperation: stats.byOperation,
        byPhase: stats.byPhase,
        alerts: alerts.map((a) => ({
          severity: a.severity,
          message: a.message,
          timestamp: a.timestamp.toISOString(),
          model: a.model,
          operationType: a.operationType,
          currentP95: a.currentP95,
          targetP95: a.targetP95,
        })),
      };
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
   */
  getLatencyTrend: tenantProcedure
    .input(
      timeRangeSchema.extend({
        periodMinutes: z.number().int().min(5).max(1440).default(60),
        bucketMinutes: z.number().int().min(1).max(60).default(5),
      })
    )
    .query(async ({ input }) => {
      try {
        const isColocated = process.env.AI_WORKER_COLOCATED === 'true';
        const { latencyMonitor } = await loadAIMonitoringModule();
        const trend = latencyMonitor.getTrend(input.periodMinutes, input.bucketMinutes);

        if (trend.length === 0 && !isColocated) {
          return { available: false as const, reason: 'monitoring_process_isolated' as const, data: [] };
        }

        return {
          available: true as const,
          data: trend.map((t) => ({
            timestamp: t.timestamp.toISOString(),
            p50: t.p50,
            p95: t.p95,
            p99: t.p99,
            count: t.count,
          })),
        };
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
   */
  getHallucinationReport: tenantProcedure
    .input(hallucinationQuerySchema)
    .query(async ({ input }) => {
      try {
        const { hallucinationChecker } = await loadAIMonitoringModule();
        const stats = hallucinationChecker.getStats(input.startTime, input.endTime);
        const recentResults = hallucinationChecker.getRecentResults(input.limit);

        return {
          totalChecks: stats.totalChecks,
          hallucinationsDetected: stats.hallucinationsDetected,
          hallucinationRate: stats.hallucinationRate,
          kpiCompliant: stats.kpiCompliant,
          byType: stats.byType,
          byModel: stats.byModel,
          recentResults: recentResults.map((r) => ({
            id: r.id,
            hallucinated: r.hallucinated,
            confidence: r.confidence,
            types: r.hallucinationTypes,
            timestamp: r.timestamp.toISOString(),
          })),
        };
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
   */
  getROIMetrics: tenantProcedure.input(timeRangeSchema).query(async ({ input }) => {
    const isColocated = process.env.AI_WORKER_COLOCATED === 'true';

    try {
      const { roiTracker } = await loadAIMonitoringModule();
      const roi = roiTracker.calculateROI(input.startTime, input.endTime);
      const stats = roiTracker.getStats();

      // Detect empty singleton
      if (roi.totalCost === 0 && roi.totalValue === 0 && !isColocated) {
        return {
          available: false as const,
          reason: 'monitoring_process_isolated' as const,
          totalCost: 0,
          totalValue: 0,
          netValue: 0,
          roi: 0,
          efficiency: 0,
          trendDirection: 'stable',
          costBreakdown: {},
          valueBreakdown: {},
          recommendations: [],
          topPerformingOperations: [],
        };
      }

      return {
        available: true as const,
        totalCost: roi.totalCost,
        totalValue: roi.totalValue,
        netValue: roi.netValue,
        roi: roi.roi,
        efficiency: roi.efficiency,
        trendDirection: roi.trendDirection,
        costBreakdown: roi.costBreakdown,
        valueBreakdown: roi.valueBreakdown,
        recommendations: roi.recommendations,
        topPerformingOperations: stats.topPerformingOperations,
      };
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
          include: {
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
        const { Queue } = await import('bullmq');
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
        allFailed.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

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
