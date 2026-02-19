/**
 * AI Monitoring Router Tests - IFC-197
 *
 * Tests all 7 endpoints across 5 categories:
 * A. Happy Path (7 tests)
 * B. Error Handling (4 tests)
 * C. Input Validation (5 tests)
 * D. Tenant Isolation (3 tests)
 * E. Edge Cases (3 tests)
 *
 * @task IFC-197
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestContext, createPublicContext, prismaMock } from '../../../test/setup';

// Mock ONLY the monitoring exports from ai-worker root barrel
// NOTE: ai-worker has NO `exports` field — subpath imports will NOT resolve
// All imports MUST use '@intelliflow/ai-worker' (root barrel, re-exports monitoring via src/index.ts:190)
vi.mock('@intelliflow/ai-worker', () => ({
  getMonitoringStatus: vi.fn(),
  driftDetector: {
    getStatus: vi.fn(),
    getHistory: vi.fn(),
    detectAllDrift: vi.fn(),
  },
  latencyMonitor: {
    getStats: vi.fn(),
    getAlerts: vi.fn(),
  },
  hallucinationChecker: {
    getStats: vi.fn(),
    getRecentResults: vi.fn(),
  },
  roiTracker: {
    calculateROI: vi.fn(),
    getStats: vi.fn(),
  },
}));

// Import mocked modules
import {
  getMonitoringStatus,
  driftDetector,
  latencyMonitor,
  hallucinationChecker,
  roiTracker,
} from '@intelliflow/ai-worker';

// Import router after mocks are set up
import { aiMonitoringRouter } from '../ai-monitoring.router';

// ============================================================
// Mock Data Factories
// ============================================================

function createMockMonitoringStatus(
  overrides: Partial<ReturnType<typeof getMonitoringStatus>> = {}
) {
  return {
    healthy: true,
    issues: [],
    drift: {
      trackedMetrics: 3,
      totalSamples: 150,
      driftDetected: false,
      highSeverityCount: 0,
      lastCheck: new Date('2026-02-10T10:00:00Z'),
    },
    hallucination: {
      totalChecks: 100,
      hallucinationsDetected: 3,
      hallucinationRate: 0.03,
      kpiCompliant: true,
      byType: {},
      byModel: {},
      averageConfidence: 0.85,
      periodStart: new Date('2026-02-09T00:00:00Z'),
      periodEnd: new Date('2026-02-10T00:00:00Z'),
    },
    roi: {
      totalCostsTracked: 50,
      totalValuesTracked: 45,
      currentROI: 250,
      averageCostPerOperation: 0.05,
      averageValuePerOperation: 2.5,
      roiTrend: [200, 210, 220, 230, 240, 245, 250],
      topPerformingOperations: [],
      underperformingOperations: [],
    },
    latency: {
      periodStart: new Date('2026-02-09T00:00:00Z'),
      periodEnd: new Date('2026-02-10T00:00:00Z'),
      sampleCount: 500,
      successRate: 0.99,
      percentiles: {
        p50: 150,
        p75: 250,
        p90: 400,
        p95: 500,
        p99: 800,
        max: 1200,
        min: 50,
        mean: 200,
        stdDev: 100,
      },
      byModel: {},
      byOperation: {},
      byPhase: {},
      sloCompliance: {
        p95Target: 2000,
        p99Target: 5000,
        p95Actual: 500,
        p99Actual: 800,
        p95Compliant: true,
        p99Compliant: true,
        overallCompliant: true,
        complianceRate: 1,
      },
    },
    ...overrides,
  };
}

function createMockDriftHistory(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    detected: i === 0,
    severity: (i === 0 ? 'medium' : 'none') as 'none' | 'low' | 'medium' | 'high' | 'critical',
    metric: `score_distribution`,
    baselineWindow: {
      startTime: new Date(),
      endTime: new Date(),
      sampleCount: 50,
      mean: 0.5,
      variance: 0.01,
      min: 0,
      max: 1,
      distribution: [],
    },
    currentWindow: {
      startTime: new Date(),
      endTime: new Date(),
      sampleCount: 50,
      mean: 0.55,
      variance: 0.02,
      min: 0,
      max: 1,
      distribution: [],
    },
    pValue: i === 0 ? 0.03 : 0.5,
    driftScore: i === 0 ? 0.35 : 0.05,
    timestamp: new Date(`2026-02-10T0${i}:00:00Z`),
    recommendations: i === 0 ? ['Monitor closely over next 24 hours'] : [],
  }));
}

function createMockConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-1',
    sessionId: 'session-1',
    agentId: 'agent-1',
    agentName: 'ScoringAgent',
    agentModel: 'gpt-4',
    status: 'ACTIVE',
    contextName: 'Lead scoring task',
    startedAt: new Date('2026-02-10T08:00:00Z'),
    lastMessageAt: new Date('2026-02-10T10:00:00Z'),
    tenantId: 'test-tenant-id',
    userId: 'user-1',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Score this lead',
        createdAt: new Date('2026-02-10T08:00:00Z'),
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Score: 85/100',
        createdAt: new Date('2026-02-10T08:01:00Z'),
      },
    ],
    toolCalls: [
      {
        id: 'tc-1',
        toolName: 'scoreLead',
        toolInput: { leadId: 'l1' },
        toolOutput: { score: 85 },
        status: 'SUCCESS',
        createdAt: new Date('2026-02-10T08:00:30Z'),
      },
    ],
    ...overrides,
  };
}

// ============================================================
// Test Helpers
// ============================================================

function createCaller(ctx = createTestContext()) {
  return aiMonitoringRouter.createCaller(ctx);
}

function resetMonitoringMocks() {
  vi.mocked(getMonitoringStatus).mockReset();
  vi.mocked(driftDetector.getStatus).mockReset();
  vi.mocked(driftDetector.getHistory).mockReset();
  vi.mocked(driftDetector.detectAllDrift).mockReset();
  vi.mocked(latencyMonitor.getStats).mockReset();
  vi.mocked(latencyMonitor.getAlerts).mockReset();
  vi.mocked(hallucinationChecker.getStats).mockReset();
  vi.mocked(hallucinationChecker.getRecentResults).mockReset();
  vi.mocked(roiTracker.calculateROI).mockReset();
  vi.mocked(roiTracker.getStats).mockReset();
}

// ============================================================
// Tests
// ============================================================

describe('AI Monitoring Router (IFC-197)', () => {
  beforeEach(() => {
    resetMonitoringMocks();
  });

  // ========================================
  // A. Happy Path Tests
  // ========================================
  describe('A. Happy Path', () => {
    it('getStatus — returns combined health status with correct shape', async () => {
      const mockStatus = createMockMonitoringStatus();
      vi.mocked(getMonitoringStatus).mockReturnValue(mockStatus as any);

      const caller = createCaller();
      const result = await caller.getStatus();

      expect(result.healthy).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.drift).toEqual({
        trackedMetrics: 3,
        driftDetected: false,
        highSeverityCount: 0,
      });
      expect(result.hallucination).toEqual({
        rate: 0.03,
        kpiCompliant: true,
        totalChecks: 100,
      });
      expect(result.latency).toEqual({
        sloCompliant: true,
        p95: 500,
        p99: 800,
      });
      expect(result.roi).toEqual({
        currentROI: 250,
        trend: [200, 210, 220, 230, 240, 245, 250],
        totalCost: 50,
        totalValue: 45,
      });
    });

    it('getDriftMetrics — returns drift status and history array', async () => {
      const mockHistory = createMockDriftHistory();
      vi.mocked(driftDetector.getStatus).mockReturnValue({
        trackedMetrics: 3,
        totalSamples: 150,
        driftDetected: true,
        highSeverityCount: 0,
        lastCheck: new Date('2026-02-10T10:00:00Z'),
      });
      vi.mocked(driftDetector.getHistory).mockReturnValue(mockHistory);

      const caller = createCaller();
      const result = await caller.getDriftMetrics({ limit: 20 });

      expect(result.status.trackedMetrics).toBe(3);
      expect(result.status.driftDetected).toBe(true);
      expect(result.history).toHaveLength(3);
      expect(result.history[0].detected).toBe(true);
      expect(result.history[0].severity).toBe('medium');
      expect(result.history[0].recommendations).toContain('Monitor closely over next 24 hours');
    });

    it('getLatencyMetrics — returns percentiles and SLO compliance', async () => {
      const mockStats = createMockMonitoringStatus().latency;
      vi.mocked(latencyMonitor.getStats).mockReturnValue(mockStats as any);
      vi.mocked(latencyMonitor.getAlerts).mockReturnValue([]);

      const caller = createCaller();
      const result = await caller.getLatencyMetrics({});

      expect(result.sampleCount).toBe(500);
      expect(result.percentiles.p95).toBe(500);
      expect(result.sloCompliance.overallCompliant).toBe(true);
      expect(result.alerts).toEqual([]);
    });

    it('getHallucinationReport — returns rate, type breakdown, KPI compliance', async () => {
      const mockStats = createMockMonitoringStatus().hallucination;
      vi.mocked(hallucinationChecker.getStats).mockReturnValue(mockStats as any);
      vi.mocked(hallucinationChecker.getRecentResults).mockReturnValue([
        {
          id: 'check-1',
          timestamp: new Date('2026-02-10T09:00:00Z'),
          model: 'gpt-4',
          inputContext: 'test',
          output: 'test output',
          hallucinated: false,
          confidence: 0.1,
          hallucinationTypes: [],
          evidence: [],
          groundTruthSources: [],
          score: 0.1,
        },
      ]);

      const caller = createCaller();
      const result = await caller.getHallucinationReport({});

      expect(result.totalChecks).toBe(100);
      expect(result.hallucinationRate).toBe(0.03);
      expect(result.kpiCompliant).toBe(true);
      expect(result.recentResults).toHaveLength(1);
      expect(result.recentResults[0].id).toBe('check-1');
    });

    it('getROIMetrics — returns cost/value/ROI with trend', async () => {
      vi.mocked(roiTracker.calculateROI).mockReturnValue({
        periodStart: new Date(),
        periodEnd: new Date(),
        totalCost: 10,
        totalValue: 35,
        netValue: 25,
        roi: 250,
        costBreakdown: { byModel: { 'gpt-4': 8, 'gpt-3.5': 2 }, byOperation: { scoring: 10 } },
        valueBreakdown: { lead_scored: 20, insight_generated: 15 } as any,
        efficiency: 3.5,
        trendDirection: 'improving',
        recommendations: ['Continue current strategy'],
      });
      vi.mocked(roiTracker.getStats).mockReturnValue({
        totalCostsTracked: 50,
        totalValuesTracked: 45,
        currentROI: 250,
        averageCostPerOperation: 0.2,
        averageValuePerOperation: 0.7,
        roiTrend: [200, 250],
        topPerformingOperations: [{ operation: 'scoring', roi: 350 }],
        underperformingOperations: [],
      });

      const caller = createCaller();
      const result = await caller.getROIMetrics({});

      expect(result.totalCost).toBe(10);
      expect(result.totalValue).toBe(35);
      expect(result.roi).toBe(250);
      expect(result.trendDirection).toBe('improving');
      expect(result.recommendations).toContain('Continue current strategy');
      expect(result.topPerformingOperations).toHaveLength(1);
    });

    it('getActiveAgents — returns agent list from DB', async () => {
      const mockConv = createMockConversation();
      (prismaMock.conversationRecord.findMany as any).mockResolvedValue([mockConv]);

      const caller = createCaller();
      const result = await caller.getActiveAgents();

      expect(result.totalActive).toBe(1);
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].type).toBe('ScoringAgent');
      expect(result.agents[0].model).toBe('gpt-4');
      expect(result.agents[0].currentTask).toBe('Lead scoring task');
    });

    it('getAgentLogs — returns paginated conversation logs from DB', async () => {
      const mockConv = createMockConversation();
      (prismaMock.conversationRecord.findMany as any).mockResolvedValue([mockConv]);
      (prismaMock.conversationRecord.count as any).mockResolvedValue(1);

      const caller = createCaller();
      const result = await caller.getAgentLogs({ limit: 20, offset: 0 });

      expect(result.logs).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
      expect(result.logs[0].agentId).toBe('agent-1');
      expect(result.logs[0].messages).toHaveLength(2);
      expect(result.logs[0].toolCalls).toHaveLength(1);
    });
  });

  // ========================================
  // B. Error Handling Tests
  // ========================================
  describe('B. Error Handling', () => {
    it('unauthenticated user — UNAUTHORIZED on getStatus', async () => {
      const caller = createCaller(createPublicContext());

      await expect(caller.getStatus()).rejects.toThrow(/Authentication required/);
    });

    it('invalid UUID for agentId in getAgentLogs — BAD_REQUEST', async () => {
      const caller = createCaller();

      await expect(
        caller.getAgentLogs({ agentId: 'not-a-uuid', limit: 20, offset: 0 })
      ).rejects.toThrow();
    });

    it('conversation not found — returns empty array (not error)', async () => {
      (prismaMock.conversationRecord.findMany as any).mockResolvedValue([]);
      (prismaMock.conversationRecord.count as any).mockResolvedValue(0);

      const caller = createCaller();
      const result = await caller.getAgentLogs({ limit: 20, offset: 0 });

      expect(result.logs).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('monitoring service throws — INTERNAL_SERVER_ERROR', async () => {
      vi.mocked(getMonitoringStatus).mockImplementation(() => {
        throw new Error('Monitoring service unavailable');
      });

      const caller = createCaller();

      await expect(caller.getStatus()).rejects.toThrow('Failed to retrieve monitoring status');
    });
  });

  // ========================================
  // C. Input Validation Tests
  // ========================================
  describe('C. Input Validation', () => {
    it('getDriftMetrics with limit: 0 — BAD_REQUEST', async () => {
      const caller = createCaller();

      await expect(caller.getDriftMetrics({ limit: 0 })).rejects.toThrow();
    });

    it('getDriftMetrics with limit: 101 — BAD_REQUEST', async () => {
      const caller = createCaller();

      await expect(caller.getDriftMetrics({ limit: 101 })).rejects.toThrow();
    });

    it('getAgentLogs with invalid UUID — rejected', async () => {
      const caller = createCaller();

      await expect(
        caller.getAgentLogs({ agentId: 'invalid', limit: 20, offset: 0 })
      ).rejects.toThrow();
    });

    it('getLatencyMetrics defaults applied when no input', async () => {
      const mockStats = createMockMonitoringStatus().latency;
      vi.mocked(latencyMonitor.getStats).mockReturnValue(mockStats as any);
      vi.mocked(latencyMonitor.getAlerts).mockReturnValue([]);

      const caller = createCaller();
      const result = await caller.getLatencyMetrics({});

      expect(result.sampleCount).toBe(500);
      expect(latencyMonitor.getStats).toHaveBeenCalledWith(undefined, undefined);
    });

    it('optional params work when all omitted', async () => {
      vi.mocked(getMonitoringStatus).mockReturnValue(createMockMonitoringStatus() as any);

      const caller = createCaller();
      const result = await caller.getStatus();

      expect(result).toBeDefined();
      expect(result.healthy).toBe(true);
    });
  });

  // ========================================
  // D. Tenant Isolation Tests
  // ========================================
  describe('D. Tenant Isolation', () => {
    it('getAgentLogs filters by tenantId', async () => {
      (prismaMock.conversationRecord.findMany as any).mockResolvedValue([]);
      (prismaMock.conversationRecord.count as any).mockResolvedValue(0);

      const caller = createCaller();
      await caller.getAgentLogs({ limit: 20, offset: 0 });

      expect(prismaMock.conversationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'test-tenant-id' }),
        })
      );
    });

    it('getActiveAgents filters conversations by tenantId', async () => {
      (prismaMock.conversationRecord.findMany as any).mockResolvedValue([]);

      const caller = createCaller();
      await caller.getActiveAgents();

      expect(prismaMock.conversationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'test-tenant-id',
            status: { in: ['ACTIVE', 'IDLE', 'ERROR'] },
          }),
        })
      );
    });

    it('global monitoring data (getStatus) accessible to all authenticated users', async () => {
      vi.mocked(getMonitoringStatus).mockReturnValue(createMockMonitoringStatus() as any);

      // Create two callers with different tenants
      const caller1 = createCaller(
        createTestContext({
          tenant: {
            tenantId: 'tenant-A',
            tenantType: 'user' as const,
            userId: 'u1',
            role: 'USER',
            canAccessAllTenantData: false,
          },
        })
      );
      const caller2 = createCaller(
        createTestContext({
          tenant: {
            tenantId: 'tenant-B',
            tenantType: 'user' as const,
            userId: 'u2',
            role: 'USER',
            canAccessAllTenantData: false,
          },
        })
      );

      const result1 = await caller1.getStatus();
      const result2 = await caller2.getStatus();

      // Both get the same global data
      expect(result1.healthy).toBe(result2.healthy);
      expect(result1.drift).toEqual(result2.drift);
    });
  });

  // ========================================
  // E. Edge Cases Tests
  // ========================================
  describe('E. Edge Cases', () => {
    it('empty monitoring data — all zeroed, healthy=true', async () => {
      vi.mocked(getMonitoringStatus).mockReturnValue({
        healthy: true,
        issues: [],
        drift: {
          trackedMetrics: 0,
          totalSamples: 0,
          driftDetected: false,
          highSeverityCount: 0,
          lastCheck: null,
        },
        hallucination: {
          totalChecks: 0,
          hallucinationsDetected: 0,
          hallucinationRate: 0,
          kpiCompliant: true,
          byType: {},
          byModel: {},
          averageConfidence: 0,
          periodStart: new Date(),
          periodEnd: new Date(),
        },
        roi: {
          totalCostsTracked: 0,
          totalValuesTracked: 0,
          currentROI: 0,
          averageCostPerOperation: 0,
          averageValuePerOperation: 0,
          roiTrend: [],
          topPerformingOperations: [],
          underperformingOperations: [],
        },
        latency: {
          periodStart: new Date(),
          periodEnd: new Date(),
          sampleCount: 0,
          successRate: 1,
          percentiles: {
            p50: 0,
            p75: 0,
            p90: 0,
            p95: 0,
            p99: 0,
            max: 0,
            min: 0,
            mean: 0,
            stdDev: 0,
          },
          byModel: {},
          byOperation: {},
          byPhase: {} as any,
          sloCompliance: {
            p95Target: 2000,
            p99Target: 5000,
            p95Actual: 0,
            p99Actual: 0,
            p95Compliant: true,
            p99Compliant: true,
            overallCompliant: true,
            complianceRate: 1,
          },
        },
      } as any);

      const caller = createCaller();
      const result = await caller.getStatus();

      expect(result.healthy).toBe(true);
      expect(result.drift.trackedMetrics).toBe(0);
      expect(result.hallucination.totalChecks).toBe(0);
      expect(result.latency.p95).toBe(0);
      expect(result.roi.currentROI).toBe(0);
    });

    it('all modules unhealthy — issues array populated', async () => {
      vi.mocked(getMonitoringStatus).mockReturnValue(
        createMockMonitoringStatus({
          healthy: false,
          issues: [
            '2 high-severity drift detection(s)',
            'Hallucination rate 8.5% exceeds 5% target',
            'Negative ROI: -15.0%',
            'Latency SLO violation',
          ],
        }) as any
      );

      const caller = createCaller();
      const result = await caller.getStatus();

      expect(result.healthy).toBe(false);
      expect(result.issues).toHaveLength(4);
    });

    it('empty agent logs — returns { logs: [], total: 0, hasMore: false }', async () => {
      (prismaMock.conversationRecord.findMany as any).mockResolvedValue([]);
      (prismaMock.conversationRecord.count as any).mockResolvedValue(0);

      const caller = createCaller();
      const result = await caller.getAgentLogs({ limit: 20, offset: 0 });

      expect(result).toEqual({
        logs: [],
        total: 0,
        hasMore: false,
      });
    });
  });
});
