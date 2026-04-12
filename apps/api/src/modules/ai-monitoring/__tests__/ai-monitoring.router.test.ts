/**
 * AI Monitoring Router Tests - IFC-197, IFC-297
 *
 * Tests all endpoints across 5 categories:
 * A. Happy Path
 * B. Error Handling
 * C. Input Validation
 * D. Tenant Isolation
 * E. Edge Cases
 *
 * IFC-297: Router now queries DB via AIMonitoringService (not in-memory singletons)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTestContext,
  createPublicContext,
  prismaMock,
  mockServices,
  TEST_UUIDS,
} from '../../../test/setup';

// Import router after mocks are set up
import { aiMonitoringRouter } from '../ai-monitoring.router';

// ============================================================
// Mock Data Factories
// ============================================================

function createMockStatusResponse() {
  return {
    available: true,
    healthy: true,
    issues: [],
    drift: { trackedMetrics: 3, driftDetected: false, highSeverityCount: 0 },
    latency: { sloCompliant: true, p95: 500, p99: 800 },
    hallucination: { rate: 0.03, kpiCompliant: true, totalChecks: 100 },
    roi: { currentROI: 250, totalCost: 50, totalValue: 175 },
  };
}

function createMockDriftResponse() {
  return {
    available: true,
    status: {
      trackedMetrics: 3,
      totalSamples: 150,
      driftDetected: true,
      highSeverityCount: 1,
      lastCheck: new Date('2026-02-10T10:00:00Z'),
    },
    history: [
      {
        detected: true,
        severity: 'medium',
        metric: 'score_distribution',
        driftScore: 0.35,
        pValue: 0.03,
        timestamp: new Date('2026-02-10T00:00:00Z'),
        baselineWindow: null,
        currentWindow: null,
        recommendations: ['Monitor closely over next 24 hours'],
      },
    ],
  };
}

function createMockLatencyResponse() {
  return {
    available: true,
    stats: {
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
    alerts: [],
  };
}

function createMockHallucinationResponse() {
  return {
    available: true,
    stats: {
      totalChecks: 100,
      hallucinationsDetected: 3,
      hallucinationRate: 0.03,
      byType: {},
      byModel: {},
      averageConfidence: 0.85,
      periodStart: new Date('2026-02-09T00:00:00Z'),
      periodEnd: new Date('2026-02-10T00:00:00Z'),
      kpiCompliant: true,
    },
    recentResults: [
      {
        id: 'check-1',
        timestamp: new Date(),
        model: 'gpt-4',
        hallucinated: false,
        confidence: 0.1,
        hallucinationTypes: [],
        evidence: [],
        groundTruthSources: [],
        score: 0.1,
      },
    ],
  };
}

function createMockROIResponse() {
  return {
    available: true,
    roi: {
      periodStart: new Date(),
      periodEnd: new Date(),
      totalCost: 10,
      totalValue: 35,
      netValue: 25,
      roi: 250,
      costBreakdown: {},
      valueBreakdown: {},
      efficiency: 3.5,
      trendDirection: 'improving' as const,
      recommendations: ['Continue current strategy'],
    },
    stats: {
      totalCostsTracked: 50,
      totalValuesTracked: 45,
      currentROI: 250,
      averageCostPerOperation: 0.2,
      averageValuePerOperation: 0.7,
      roiTrend: 'stable' as const,
      topPerformingOperations: [{ operation: 'scoring', roi: 350 }],
      underperformingOperations: [],
    },
  };
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
    tenantId: TEST_UUIDS.tenant,
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

// ============================================================
// Tests
// ============================================================

describe('AI Monitoring Router (IFC-197, IFC-297)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========================================
  // A. Happy Path Tests
  // ========================================
  describe('A. Happy Path', () => {
    it('getStatus — returns combined health status', async () => {
      const mockResponse = createMockStatusResponse();
      mockServices.aiMonitoringService.getStatus.mockResolvedValue(mockResponse);

      const caller = createCaller();
      const result = await caller.getStatus();

      expect(result.available).toBe(true);
      expect(result.healthy).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.drift.driftDetected).toBe(false);
    });

    it('getDriftMetrics — returns drift status and history', async () => {
      const mockResponse = createMockDriftResponse();
      mockServices.aiMonitoringService.getDriftMetrics.mockResolvedValue(mockResponse);

      const caller = createCaller();
      const result = await caller.getDriftMetrics({ limit: 20 });

      expect(result.available).toBe(true);
      expect(result.status.trackedMetrics).toBe(3);
      expect(result.status.driftDetected).toBe(true);
      expect(result.history).toHaveLength(1);
      expect(result.history[0].severity).toBe('medium');
    });

    it('getLatencyMetrics — returns percentiles and SLO compliance', async () => {
      const mockResponse = createMockLatencyResponse();
      mockServices.aiMonitoringService.getLatencyMetrics.mockResolvedValue(mockResponse);

      const caller = createCaller();
      const result = await caller.getLatencyMetrics({});

      expect(result.available).toBe(true);
      expect(result.stats.sampleCount).toBe(500);
      expect(result.stats.percentiles.p95).toBe(500);
      expect(result.stats.sloCompliance.overallCompliant).toBe(true);
    });

    it('getLatencyTrend — returns bucketed trend data', async () => {
      const mockResponse = {
        available: true,
        trend: [{ timestamp: new Date(), p50: 100, p95: 200, p99: 400, count: 10 }],
      };
      mockServices.aiMonitoringService.getLatencyTrend.mockResolvedValue(mockResponse);

      const caller = createCaller();
      const result = await caller.getLatencyTrend({});

      expect(result.available).toBe(true);
      expect(result.trend).toHaveLength(1);
      expect(result.trend[0].p95).toBe(200);
    });

    it('getHallucinationReport — returns rate and KPI compliance', async () => {
      const mockResponse = createMockHallucinationResponse();
      mockServices.aiMonitoringService.getHallucinationReport.mockResolvedValue(mockResponse);

      const caller = createCaller();
      const result = await caller.getHallucinationReport({});

      expect(result.available).toBe(true);
      expect(result.stats.totalChecks).toBe(100);
      expect(result.stats.hallucinationRate).toBe(0.03);
      expect(result.stats.kpiCompliant).toBe(true);
      expect(result.recentResults).toHaveLength(1);
    });

    it('getROIMetrics — returns cost/value/ROI with trend', async () => {
      const mockResponse = createMockROIResponse();
      mockServices.aiMonitoringService.getROIMetrics.mockResolvedValue(mockResponse);

      const caller = createCaller();
      const result = await caller.getROIMetrics({});

      expect(result.available).toBe(true);
      expect(result.roi.totalCost).toBe(10);
      expect(result.roi.totalValue).toBe(35);
      expect(result.roi.trendDirection).toBe('improving');
      expect(result.roi.recommendations).toContain('Continue current strategy');
      expect(result.stats.topPerformingOperations).toHaveLength(1);
    });

    it('getActiveAgents — returns agent list from DB', async () => {
      const mockConv = createMockConversation();
      (prismaMock.conversationRecord.findMany as any).mockResolvedValue([mockConv]);

      const caller = createCaller();
      const result = await caller.getActiveAgents();

      expect(result.totalActive).toBe(1);
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].type).toBe('ScoringAgent');
    });

    it('all 6 monitoring endpoints return available: true (AC-009)', async () => {
      mockServices.aiMonitoringService.getStatus.mockResolvedValue(createMockStatusResponse());
      mockServices.aiMonitoringService.getDriftMetrics.mockResolvedValue(createMockDriftResponse());
      mockServices.aiMonitoringService.getLatencyMetrics.mockResolvedValue(
        createMockLatencyResponse()
      );
      mockServices.aiMonitoringService.getLatencyTrend.mockResolvedValue({
        available: true,
        trend: [],
      });
      mockServices.aiMonitoringService.getHallucinationReport.mockResolvedValue(
        createMockHallucinationResponse()
      );
      mockServices.aiMonitoringService.getROIMetrics.mockResolvedValue(createMockROIResponse());

      const caller = createCaller();
      expect((await caller.getStatus()).available).toBe(true);
      expect((await caller.getDriftMetrics({})).available).toBe(true);
      expect((await caller.getLatencyMetrics({})).available).toBe(true);
      expect((await caller.getLatencyTrend({})).available).toBe(true);
      expect((await caller.getHallucinationReport({})).available).toBe(true);
      expect((await caller.getROIMetrics({})).available).toBe(true);
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

    it('conversation not found — returns empty array', async () => {
      (prismaMock.conversationRecord.findMany as any).mockResolvedValue([]);
      (prismaMock.conversationRecord.count as any).mockResolvedValue(0);

      const caller = createCaller();
      const result = await caller.getAgentLogs({ limit: 20, offset: 0 });

      expect(result.logs).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('monitoring service throws — INTERNAL_SERVER_ERROR', async () => {
      mockServices.aiMonitoringService.getStatus.mockRejectedValue(new Error('DB unavailable'));

      const caller = createCaller();
      await expect(caller.getStatus()).rejects.toThrow();
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
      mockServices.aiMonitoringService.getLatencyMetrics.mockResolvedValue(
        createMockLatencyResponse()
      );

      const caller = createCaller();
      const result = await caller.getLatencyMetrics({});

      expect(result.stats.sampleCount).toBe(500);
    });

    it('optional params work when all omitted', async () => {
      mockServices.aiMonitoringService.getStatus.mockResolvedValue(createMockStatusResponse());

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
          where: expect.objectContaining({ tenantId: TEST_UUIDS.tenant }),
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
            tenantId: TEST_UUIDS.tenant,
            status: { in: ['ACTIVE', 'IDLE', 'ERROR'] },
          }),
        })
      );
    });

    it('global monitoring data (getStatus) accessible to all authenticated users', async () => {
      mockServices.aiMonitoringService.getStatus.mockResolvedValue(createMockStatusResponse());

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

      expect(result1.healthy).toBe(result2.healthy);
    });
  });

  // ========================================
  // E. Edge Cases Tests
  // ========================================
  describe('E. Edge Cases', () => {
    it('empty monitoring data — all zeroed, healthy=true', async () => {
      mockServices.aiMonitoringService.getStatus.mockResolvedValue({
        available: true,
        healthy: true,
        issues: [],
        drift: { trackedMetrics: 0, driftDetected: false, highSeverityCount: 0 },
        latency: { totalMeasurements: 0, sloCompliance: { overallCompliant: true } },
        hallucination: {
          totalChecks: 0,
          hallucinationsDetected: 0,
          hallucinationRate: 0,
          kpiCompliant: true,
        },
        roi: { totalCosts: 0, currentROI: 0, roiTrend: 'stable' },
      });

      const caller = createCaller();
      const result = await caller.getStatus();

      expect(result.healthy).toBe(true);
      expect(result.drift.trackedMetrics).toBe(0);
    });

    it('all modules unhealthy — issues array populated', async () => {
      mockServices.aiMonitoringService.getStatus.mockResolvedValue({
        available: true,
        healthy: false,
        issues: ['2 drift detections', 'Hallucination rate 8.5%', 'Negative ROI', 'SLO violation'],
        drift: { trackedMetrics: 3, driftDetected: true, highSeverityCount: 2 },
        latency: { totalMeasurements: 500, sloCompliance: { overallCompliant: false } },
        hallucination: {
          totalChecks: 100,
          hallucinationsDetected: 9,
          hallucinationRate: 0.085,
          kpiCompliant: false,
        },
        roi: { totalCosts: 50, currentROI: -15, roiTrend: 'declining' },
      });

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

      expect(result).toEqual({ logs: [], total: 0, hasMore: false });
    });
  });
});
