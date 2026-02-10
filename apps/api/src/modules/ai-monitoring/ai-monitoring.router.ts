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
  agentId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

type AIMonitoringModule = Pick<
  typeof import('@intelliflow/ai-worker'),
  'driftDetector' | 'latencyMonitor' | 'hallucinationChecker' | 'roiTracker' | 'getMonitoringStatus'
>;

let aiMonitoringModulePromise: Promise<AIMonitoringModule> | null = null;

async function loadAIMonitoringModule(): Promise<AIMonitoringModule> {
  if (!aiMonitoringModulePromise) {
    aiMonitoringModulePromise = import('@intelliflow/ai-worker').then((module) => ({
      driftDetector: module.driftDetector,
      latencyMonitor: module.latencyMonitor,
      hallucinationChecker: module.hallucinationChecker,
      roiTracker: module.roiTracker,
      getMonitoringStatus: module.getMonitoringStatus,
    }));
  }

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
   */
  getStatus: tenantProcedure.query(async () => {
    try {
      const { getMonitoringStatus } = await loadAIMonitoringModule();
      const status = getMonitoringStatus();

      return {
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
  getDriftMetrics: tenantProcedure
    .input(driftQuerySchema)
    .query(async ({ input }) => {
      try {
        const { driftDetector } = await loadAIMonitoringModule();
        const status = driftDetector.getStatus();
        const history = driftDetector.getHistory(input.limit);

        return {
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
  getLatencyMetrics: tenantProcedure
    .input(latencyQuerySchema)
    .query(async ({ input }) => {
      try {
        const { latencyMonitor } = await loadAIMonitoringModule();
        const stats = latencyMonitor.getStats(input.startTime, input.endTime);
        const alerts = latencyMonitor.getAlerts();

        return {
          sampleCount: stats.sampleCount,
          percentiles: stats.percentiles,
          sloCompliance: stats.sloCompliance,
          byModel: stats.byModel,
          byOperation: stats.byOperation,
          alerts: alerts.map((a) => ({
            severity: a.severity,
            message: a.message,
            timestamp: a.timestamp.toISOString(),
            model: a.model,
            operationType: a.operationType,
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
   * Hallucination detection stats: rate, type breakdown, KPI compliance.
   */
  getHallucinationReport: tenantProcedure
    .input(hallucinationQuerySchema)
    .query(async ({ input }) => {
      try {
        const { hallucinationChecker } = await loadAIMonitoringModule();
        const stats = hallucinationChecker.getStats(
          input.startTime,
          input.endTime
        );
        const recentResults = hallucinationChecker.getRecentResults(
          input.limit
        );

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
  getROIMetrics: tenantProcedure
    .input(timeRangeSchema)
    .query(async ({ input }) => {
      try {
        const { roiTracker } = await loadAIMonitoringModule();
        const roi = roiTracker.calculateROI(input.startTime, input.endTime);
        const stats = roiTracker.getStats();

        return {
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
          status: 'ACTIVE',
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
          status: c.status as 'active' | 'idle' | 'error',
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
  getAgentLogs: tenantProcedure
    .input(agentLogsQuerySchema)
    .query(async ({ ctx, input }) => {
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
});
