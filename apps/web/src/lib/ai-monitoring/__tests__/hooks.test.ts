import { describe, it, expect, vi } from 'vitest';

// Mock the tRPC api module
vi.mock('@/lib/api', () => ({
  api: {
    aiMonitoring: {
      getStatus: { useQuery: vi.fn() },
      getDriftMetrics: { useQuery: vi.fn() },
      getROIMetrics: { useQuery: vi.fn() },
      getLatencyMetrics: { useQuery: vi.fn() },
      getLatencyTrend: { useQuery: vi.fn() },
      getAgentLogs: { useQuery: vi.fn() },
    },
  },
}));

// Mock react hooks used internally — useMemo passthrough for direct hook calls
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, useMemo: (fn: () => any) => fn() };
});

import { api } from '@/lib/api';
import { useDriftDashboard, useLatencyDashboard, useAgentLogs } from '../hooks';

const mockStatusQuery = api.aiMonitoring.getStatus.useQuery as ReturnType<typeof vi.fn>;
const mockDriftQuery = api.aiMonitoring.getDriftMetrics.useQuery as ReturnType<typeof vi.fn>;
const mockRoiQuery = api.aiMonitoring.getROIMetrics.useQuery as ReturnType<typeof vi.fn>;

const now = Date.now();

const baseHistory = [
  {
    detected: true,
    severity: 'critical',
    metric: 'score',
    pValue: 0.001,
    driftScore: 0.9,
    timestamp: new Date(now - 10 * 60000).toISOString(),
    recommendations: ['Fix immediately'],
  },
  {
    detected: true,
    severity: 'high',
    metric: 'confidence',
    pValue: 0.03,
    driftScore: 0.6,
    timestamp: new Date(now - 30 * 60000).toISOString(),
    recommendations: ['Review inputs'],
  },
  {
    detected: true,
    severity: 'low',
    metric: 'latency',
    pValue: 0.4,
    driftScore: 0.08,
    timestamp: new Date(now - 60 * 60000).toISOString(),
    recommendations: [],
  },
];

function setupMocks(overrides: Record<string, any> = {}) {
  mockStatusQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides.status,
  });
  mockDriftQuery.mockReturnValue({
    data: overrides.driftData ?? {
      status: {
        trackedMetrics: 5,
        totalSamples: 1000,
        driftDetected: true,
        highSeverityCount: 2,
        lastCheck: new Date(now - 5 * 60000).toISOString(),
      },
      history: baseHistory,
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides.drift,
  });
  mockRoiQuery.mockReturnValue({
    data: overrides.roiData ?? {
      totalCost: 1000,
      totalValue: 3000,
      netValue: 2000,
      roi: 200,
      trendDirection: 'up',
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides.roi,
  });
}

describe('useDriftDashboard', () => {
  it('returns aggregated data from 3 queries', () => {
    setupMocks();
    const result = useDriftDashboard();
    expect(result.status.trackedMetrics).toBe(5);
    expect(result.history).toHaveLength(3);
    expect(result.roi).not.toBeNull();
    expect(result.isLoading).toBe(false);
    expect(result.error).toBeNull();
  });

  it('returns default status when driftQuery has no data', () => {
    setupMocks({ driftData: undefined, drift: { data: undefined } });
    const result = useDriftDashboard();
    expect(result.status.trackedMetrics).toBe(0);
    expect(result.status.driftDetected).toBe(false);
    expect(result.history).toHaveLength(0);
  });

  it('returns null roi when roiQuery has no data', () => {
    setupMocks({ roiData: undefined, roi: { data: undefined } });
    const result = useDriftDashboard();
    expect(result.roi).toBeNull();
  });

  it('aggregates isLoading from status and drift queries', () => {
    setupMocks({ status: { isLoading: true, data: undefined, error: null, refetch: vi.fn() } });
    const result = useDriftDashboard();
    expect(result.isLoading).toBe(true);
  });

  it('aggregates errors from status or drift queries', () => {
    const err = new Error('Service down');
    setupMocks({ drift: { error: err, data: undefined, isLoading: false, refetch: vi.fn() } });
    const result = useDriftDashboard();
    expect(result.error).toBe(err);
  });

  it('filters history by severity when filter is set', () => {
    setupMocks();
    const result = useDriftDashboard({ severity: 'HIGH' });
    expect(result.history).toHaveLength(1);
    expect(result.history[0].severity).toBe('high');
  });

  it('does not filter when severity is ALL', () => {
    setupMocks();
    const result = useDriftDashboard({ severity: 'ALL' });
    expect(result.history).toHaveLength(3);
  });

  it('sorts by score descending', () => {
    setupMocks();
    const result = useDriftDashboard({ sortBy: 'score' });
    expect(result.history[0].driftScore).toBe(0.9);
    expect(result.history[1].driftScore).toBe(0.6);
    expect(result.history[2].driftScore).toBe(0.08);
  });

  it('sorts by severity descending', () => {
    setupMocks();
    const result = useDriftDashboard({ sortBy: 'severity' });
    expect(result.history[0].severity).toBe('critical');
    expect(result.history[1].severity).toBe('high');
    expect(result.history[2].severity).toBe('low');
  });

  it('sorts by newest first (default)', () => {
    setupMocks();
    const result = useDriftDashboard({ sortBy: 'newest' });
    // First should be most recent (10m ago)
    expect(result.history[0].metric).toBe('score');
    expect(result.history[2].metric).toBe('latency');
  });

  it('refetch triggers all 3 queries', () => {
    const statusRefetch = vi.fn();
    const driftRefetch = vi.fn();
    const roiRefetch = vi.fn();
    setupMocks({
      status: { refetch: statusRefetch, data: undefined, isLoading: false, error: null },
      drift: {
        refetch: driftRefetch,
        isLoading: false,
        error: null,
        data: {
          status: {
            trackedMetrics: 0,
            totalSamples: 0,
            driftDetected: false,
            highSeverityCount: 0,
            lastCheck: null,
          },
          history: [],
        },
      },
      roi: { refetch: roiRefetch, isLoading: false, error: null, data: undefined },
    });
    const result = useDriftDashboard();
    result.refetch();
    expect(statusRefetch).toHaveBeenCalled();
    expect(driftRefetch).toHaveBeenCalled();
    expect(roiRefetch).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useLatencyDashboard (PG-153)
// ---------------------------------------------------------------------------

const mockLatencyMetricsQuery = api.aiMonitoring.getLatencyMetrics.useQuery as ReturnType<
  typeof vi.fn
>;
const mockLatencyTrendQuery = api.aiMonitoring.getLatencyTrend.useQuery as ReturnType<typeof vi.fn>;

const baseLatencyMetrics = {
  sampleCount: 500,
  successRate: 0.98,
  percentiles: {
    p50: 120,
    p75: 180,
    p90: 250,
    p95: 350,
    p99: 800,
    max: 2000,
    min: 10,
    mean: 150,
    stdDev: 80,
  },
  sloCompliance: {
    p95Target: 500,
    p99Target: 1000,
    p95Actual: 350,
    p99Actual: 800,
    p95Compliant: true,
    p99Compliant: true,
    overallCompliant: true,
    complianceRate: 0.99,
  },
  byModel: {
    'gpt-4': {
      p50: 150,
      p75: 200,
      p90: 300,
      p95: 400,
      p99: 900,
      max: 2000,
      min: 20,
      mean: 180,
      stdDev: 90,
    },
  },
  byOperation: {
    summarize: {
      p50: 100,
      p75: 160,
      p90: 220,
      p95: 310,
      p99: 700,
      max: 1500,
      min: 10,
      mean: 130,
      stdDev: 70,
    },
  },
  byPhase: {
    model_inference: {
      p50: 80,
      p75: 120,
      p90: 180,
      p95: 250,
      p99: 600,
      max: 1500,
      min: 5,
      mean: 100,
      stdDev: 60,
    },
  },
  alerts: [
    {
      severity: 'warning' as const,
      message: 'P95 approaching target',
      timestamp: new Date(now - 5 * 60000).toISOString(),
      model: 'gpt-4',
      operationType: 'summarize',
      currentP95: 450,
      targetP95: 500,
    },
  ],
};

const baseTrend = [
  { timestamp: new Date(now - 60 * 60000).toISOString(), p50: 100, p95: 300, p99: 700, count: 50 },
  { timestamp: new Date(now - 30 * 60000).toISOString(), p50: 110, p95: 320, p99: 750, count: 55 },
  { timestamp: new Date(now - 5 * 60000).toISOString(), p50: 120, p95: 350, p99: 800, count: 60 },
];

function setupLatencyMocks(overrides: Record<string, any> = {}) {
  mockLatencyMetricsQuery.mockReturnValue({
    data: overrides.metricsData !== undefined ? overrides.metricsData : baseLatencyMetrics,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides.metrics,
  });
  mockLatencyTrendQuery.mockReturnValue({
    data: overrides.trendData !== undefined ? overrides.trendData : baseTrend,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides.trend,
  });
}

describe('useLatencyDashboard', () => {
  it('returns safe defaults when queries are loading', () => {
    setupLatencyMocks({
      metrics: { isLoading: true, data: undefined, error: null, refetch: vi.fn() },
      trend: { isLoading: true, data: undefined, error: null, refetch: vi.fn() },
    });
    const result = useLatencyDashboard();
    expect(result.isLoading).toBe(true);
    expect(result.sampleCount).toBe(0);
    expect(result.percentiles.p95).toBe(0);
    expect(result.trend).toEqual([]);
  });

  it('aggregates isLoading from both queries', () => {
    setupLatencyMocks({
      metrics: { isLoading: true, data: undefined, error: null, refetch: vi.fn() },
    });
    const result = useLatencyDashboard();
    expect(result.isLoading).toBe(true);
  });

  it('aggregates error from latency metrics query', () => {
    const err = new Error('Metrics failed');
    setupLatencyMocks({
      metrics: { error: err, data: undefined, isLoading: false, refetch: vi.fn() },
    });
    const result = useLatencyDashboard();
    expect(result.error).toBe(err);
  });

  it('returns sampleCount from getLatencyMetrics response', () => {
    setupLatencyMocks();
    const result = useLatencyDashboard();
    expect(result.sampleCount).toBe(500);
  });

  it('returns percentiles from getLatencyMetrics response', () => {
    setupLatencyMocks();
    const result = useLatencyDashboard();
    expect(result.percentiles.p95).toBe(350);
    expect(result.percentiles.p99).toBe(800);
  });

  it('returns sloCompliance from getLatencyMetrics response', () => {
    setupLatencyMocks();
    const result = useLatencyDashboard();
    expect(result.sloCompliance.overallCompliant).toBe(true);
    expect(result.sloCompliance.p95Target).toBe(500);
  });

  it('returns byModel, byOperation, byPhase from getLatencyMetrics response', () => {
    setupLatencyMocks();
    const result = useLatencyDashboard();
    expect(result.byModel).toHaveProperty('gpt-4');
    expect(result.byOperation).toHaveProperty('summarize');
    expect(result.byPhase).toHaveProperty('model_inference');
  });

  it('returns enriched alerts from getLatencyMetrics response', () => {
    setupLatencyMocks();
    const result = useLatencyDashboard();
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].currentP95).toBe(450);
    expect(result.alerts[0].targetP95).toBe(500);
  });

  it('returns trend data from getLatencyTrend response', () => {
    setupLatencyMocks();
    const result = useLatencyDashboard();
    expect(result.trend).toHaveLength(3);
    expect(result.trend[0].p50).toBe(100);
  });

  it('refetch calls both query refetch methods', () => {
    const metricsRefetch = vi.fn();
    const trendRefetch = vi.fn();
    setupLatencyMocks({
      metrics: { refetch: metricsRefetch, data: baseLatencyMetrics, isLoading: false, error: null },
      trend: { refetch: trendRefetch, data: baseTrend, isLoading: false, error: null },
    });
    const result = useLatencyDashboard();
    result.refetch();
    expect(metricsRefetch).toHaveBeenCalled();
    expect(trendRefetch).toHaveBeenCalled();
  });

  it('passes model filter to getLatencyMetrics input', () => {
    setupLatencyMocks();
    useLatencyDashboard({ model: 'gpt-4' });
    expect(mockLatencyMetricsQuery).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4' }),
      expect.any(Object)
    );
  });

  it('converts timeRange to startTime for query input', () => {
    setupLatencyMocks();
    useLatencyDashboard({ timeRange: '6h' });
    expect(mockLatencyMetricsQuery).toHaveBeenCalledWith(
      expect.objectContaining({ startTime: expect.any(Date) }),
      expect.any(Object)
    );
  });
});

// ---------------------------------------------------------------------------
// useAgentLogs (PG-152 — coverage backfill)
// ---------------------------------------------------------------------------

const mockAgentLogsQuery = api.aiMonitoring.getAgentLogs.useQuery as ReturnType<typeof vi.fn>;

const baseLogs = [
  {
    id: 'log-1',
    agentType: 'summarizer',
    createdAt: new Date(now - 10 * 60000).toISOString(),
    messages: [{ role: 'assistant', content: 'Summary complete' }],
    toolCalls: [{ name: 'read', status: 'success' }],
  },
  {
    id: 'log-2',
    agentType: 'classifier',
    createdAt: new Date(now - 30 * 60000).toISOString(),
    messages: [{ role: 'assistant', content: 'Classified as support' }],
    toolCalls: [{ name: 'classify', status: 'error' }],
  },
  {
    id: 'log-3',
    agentType: 'summarizer',
    createdAt: new Date(now - 60 * 60000).toISOString(),
    messages: [{ role: 'assistant', content: 'Old summary task' }],
    toolCalls: [{ name: 'read', status: 'success' }],
  },
];

function setupAgentLogsMocks(overrides: Record<string, any> = {}) {
  mockAgentLogsQuery.mockReturnValue({
    data:
      overrides.data !== undefined ? overrides.data : { logs: baseLogs, total: 3, hasMore: false },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

describe('useAgentLogs', () => {
  it('returns logs from query response', () => {
    setupAgentLogsMocks();
    const result = useAgentLogs({});
    expect(result.logs).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(false);
  });

  it('returns empty defaults when query has no data', () => {
    setupAgentLogsMocks({ data: undefined });
    const result = useAgentLogs({});
    expect(result.logs).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  it('returns isLoading from query', () => {
    setupAgentLogsMocks({ isLoading: true, data: undefined });
    const result = useAgentLogs({});
    expect(result.isLoading).toBe(true);
  });

  it('returns error from query', () => {
    const err = new Error('Agent logs failed');
    setupAgentLogsMocks({ error: err, data: undefined });
    const result = useAgentLogs({});
    expect(result.error).toBe(err);
  });

  it('filters logs by search term matching agentType', () => {
    setupAgentLogsMocks();
    const result = useAgentLogs({ search: 'summarizer' });
    expect(result.logs).toHaveLength(2);
    expect(result.logs.every((l: any) => l.agentType === 'summarizer')).toBe(true);
  });

  it('filters logs by search term matching message content', () => {
    setupAgentLogsMocks();
    const result = useAgentLogs({ search: 'support' });
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].agentType).toBe('classifier');
  });

  it('filters logs by toolStatus', () => {
    setupAgentLogsMocks();
    const result = useAgentLogs({ toolStatus: 'error' });
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].agentType).toBe('classifier');
  });

  it('sorts logs newest first by default', () => {
    setupAgentLogsMocks();
    const result = useAgentLogs({});
    expect(result.logs[0].id).toBe('log-1');
    expect(result.logs[2].id).toBe('log-3');
  });

  it('sorts logs oldest first when sort=oldest', () => {
    setupAgentLogsMocks();
    const result = useAgentLogs({ sort: 'oldest' });
    expect(result.logs[0].id).toBe('log-3');
    expect(result.logs[2].id).toBe('log-1');
  });

  it('passes agentId through without UUID validation', () => {
    // UUID client-side validation was removed — agentId is passed through
    // as-is (hooks.ts:176 uses `params.agentId || undefined`). Server-side
    // validation handles invalid IDs.
    setupAgentLogsMocks();
    useAgentLogs({ agentId: 'not-a-uuid' });
    expect(mockAgentLogsQuery).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'not-a-uuid' }),
      expect.any(Object)
    );
  });

  it('passes valid UUID agentId to query', () => {
    setupAgentLogsMocks();
    useAgentLogs({ agentId: '12345678-1234-1234-1234-123456789abc' });
    expect(mockAgentLogsQuery).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: '12345678-1234-1234-1234-123456789abc' }),
      expect.any(Object)
    );
  });

  it('refetch calls query refetch', () => {
    const refetchFn = vi.fn();
    setupAgentLogsMocks({ refetch: refetchFn });
    const result = useAgentLogs({});
    result.refetch();
    expect(refetchFn).toHaveBeenCalled();
  });
});
