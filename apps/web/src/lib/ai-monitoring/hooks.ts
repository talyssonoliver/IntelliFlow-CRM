'use client';

/**
 * Drift Detection Dashboard Hook (PG-146)
 *
 * Wraps aiMonitoring tRPC procedures for drift, ROI, and status data.
 * Pattern: apps/web/src/lib/churn-risk/hooks.ts
 */

import { api } from '@/lib/api';
import { useMemo } from 'react';
import type {
  DriftDashboardData,
  DriftFilters,
  DriftHistoryItem,
  AgentLog,
  AgentLogsParams,
  AgentLogsData,
  LatencyFilters,
  LatencyDashboardData,
  LatencyPercentiles,
  SLOCompliance,
  LatencyAlert,
  LatencyTrendPoint,
  LatencyPhase,
} from './types';

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

function filterAndSort(history: DriftHistoryItem[], filters?: DriftFilters): DriftHistoryItem[] {
  let result = [...history];

  // Filter by severity
  if (filters?.severity && filters.severity !== 'ALL') {
    result = result.filter((h) => h.severity === filters.severity!.toLowerCase());
  }

  // Sort
  if (filters?.sortBy === 'score') {
    result.sort((a, b) => b.driftScore - a.driftScore);
  } else if (filters?.sortBy === 'severity') {
    result.sort((a, b) => (SEVERITY_WEIGHT[b.severity] ?? 0) - (SEVERITY_WEIGHT[a.severity] ?? 0));
  } else {
    // Default: newest first
    result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  return result;
}

export function useDriftDashboard(filters?: DriftFilters): DriftDashboardData {
  const statusQuery = api.aiMonitoring.getStatus.useQuery(undefined, {
    staleTime: 20000,
    refetchInterval: 30000,
  });

  const driftQuery = api.aiMonitoring.getDriftMetrics.useQuery(
    { limit: 20 },
    {
      staleTime: 20000,
      refetchInterval: 30000,
    }
  );

  const roiQuery = api.aiMonitoring.getROIMetrics.useQuery(
    {},
    {
      staleTime: 60000,
      refetchInterval: 300000,
    }
  );

  const isLoading = statusQuery.isLoading || driftQuery.isLoading;
  const error = statusQuery.error || driftQuery.error;

  const driftData = driftQuery.data as
    | {
        status: {
          trackedMetrics: number;
          totalSamples: number;
          driftDetected: boolean;
          highSeverityCount: number;
          lastCheck: string | null;
        };
        history: DriftHistoryItem[];
      }
    | undefined;

  const roiData = roiQuery.data as
    | {
        totalCost: number;
        totalValue: number;
        netValue: number;
        roi: number;
        trendDirection: string;
      }
    | undefined;

  const status = driftData?.status ?? {
    trackedMetrics: 0,
    totalSamples: 0,
    driftDetected: false,
    highSeverityCount: 0,
    lastCheck: null,
  };

  const history = filterAndSort(driftData?.history ?? [], filters);

  return {
    status,
    history,
    roi: roiData ?? null,
    isLoading,
    error: error as Error | null,
    refetch: () => {
      statusQuery.refetch();
      driftQuery.refetch();
      roiQuery.refetch();
    },
  };
}

// ---------------------------------------------------------------------------
// Agent Logs Hook (PG-152)
// ---------------------------------------------------------------------------

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function filterAndSortLogs(
  logs: AgentLog[],
  search?: string,
  toolStatus?: string,
  sort?: 'newest' | 'oldest',
): AgentLog[] {
  let result = [...logs];

  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (log) =>
        log.agentType.toLowerCase().includes(q) ||
        log.messages.some((m) => m.content.toLowerCase().includes(q)),
    );
  }

  if (toolStatus) {
    result = result.filter((log) =>
      log.toolCalls.some((tc) => tc.status === toolStatus),
    );
  }

  if (sort === 'oldest') {
    result.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  } else {
    result.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  return result;
}

export function useAgentLogs(params: AgentLogsParams): AgentLogsData {
  const validAgentId =
    params.agentId && UUID_REGEX.test(params.agentId) ? params.agentId : undefined;

  const query = api.aiMonitoring.getAgentLogs.useQuery(
    {
      agentId: validAgentId,
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
    },
    {
      staleTime: 60_000,
    },
  );

  const data = query.data as
    | { logs: AgentLog[]; total: number; hasMore: boolean }
    | undefined;

  const logs = useMemo(
    () => filterAndSortLogs(data?.logs ?? [], params.search, params.toolStatus, params.sort),
    [data?.logs, params.search, params.toolStatus, params.sort],
  );

  return {
    logs,
    total: data?.total ?? 0,
    hasMore: data?.hasMore ?? false,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: () => {
      query.refetch();
    },
  };
}

// ---------------------------------------------------------------------------
// Latency Monitor Hook (PG-153)
// ---------------------------------------------------------------------------

const TIME_RANGE_MS: Record<string, number> = {
  '1h': 3600000,
  '6h': 21600000,
  '24h': 86400000,
};

const DEFAULT_PERCENTILES: LatencyPercentiles = {
  p50: 0,
  p75: 0,
  p90: 0,
  p95: 0,
  p99: 0,
  max: 0,
  min: 0,
  mean: 0,
  stdDev: 0,
};

const DEFAULT_SLO: SLOCompliance = {
  p95Target: 0,
  p99Target: 0,
  p95Actual: 0,
  p99Actual: 0,
  p95Compliant: true,
  p99Compliant: true,
  overallCompliant: true,
  complianceRate: 1,
};

export function useLatencyDashboard(filters?: LatencyFilters): LatencyDashboardData {
  const startTime = filters?.timeRange
    ? new Date(Date.now() - TIME_RANGE_MS[filters.timeRange])
    : undefined;

  const metricsQuery = api.aiMonitoring.getLatencyMetrics.useQuery(
    {
      model: filters?.model,
      startTime,
    },
    {
      staleTime: 20000,
      refetchInterval: 30000,
    },
  );

  const periodMinutes = filters?.timeRange
    ? Math.round(TIME_RANGE_MS[filters.timeRange] / 60000)
    : 60;

  const trendQuery = api.aiMonitoring.getLatencyTrend.useQuery(
    {
      periodMinutes,
      bucketMinutes: 5,
    },
    {
      staleTime: 20000,
      refetchInterval: 60000,
    },
  );

  const metricsData = metricsQuery.data as
    | {
        sampleCount: number;
        successRate: number;
        percentiles: LatencyPercentiles;
        sloCompliance: SLOCompliance;
        byModel: Record<string, LatencyPercentiles>;
        byOperation: Record<string, LatencyPercentiles>;
        byPhase: Partial<Record<LatencyPhase, LatencyPercentiles>>;
        alerts: LatencyAlert[];
      }
    | undefined;

  const trendData = trendQuery.data as LatencyTrendPoint[] | undefined;

  return {
    sampleCount: metricsData?.sampleCount ?? 0,
    successRate: metricsData?.successRate ?? 0,
    percentiles: metricsData?.percentiles ?? DEFAULT_PERCENTILES,
    sloCompliance: metricsData?.sloCompliance ?? DEFAULT_SLO,
    byModel: metricsData?.byModel ?? {},
    byOperation: metricsData?.byOperation ?? {},
    byPhase: metricsData?.byPhase ?? {},
    alerts: metricsData?.alerts ?? [],
    trend: trendData ?? [],
    isLoading: metricsQuery.isLoading || trendQuery.isLoading,
    error: (metricsQuery.error as Error | null) ?? (trendQuery.error as Error | null),
    refetch: () => {
      metricsQuery.refetch();
      trendQuery.refetch();
    },
  };
}
