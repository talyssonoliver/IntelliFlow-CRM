'use client';

/**
 * tRPC hooks for the Active Agents Dashboard (PG-151)
 *
 * Combines aiMonitoring.getActiveAgents + aiMonitoring.getStatus queries
 * with 30s polling interval for near-real-time monitoring.
 */

import { api } from '@/lib/api';
import type { ActiveAgent, MonitoringHealthStatus } from './types';

export function useActiveAgentsDashboard() {
  const agentsQuery = api.aiMonitoring.getActiveAgents.useQuery(undefined, {
    refetchInterval: 30_000,
    retry: 1,
  });

  const statusQuery = api.aiMonitoring.getStatus.useQuery(undefined, {
    refetchInterval: 30_000,
    retry: 1,
  });

  const agents: ActiveAgent[] = agentsQuery.data?.agents ?? [];
  const totalActive: number = agentsQuery.data?.totalActive ?? 0;

  const healthStatus: MonitoringHealthStatus | undefined = statusQuery.data
    ? {
        healthy: statusQuery.data.healthy,
        issues: statusQuery.data.issues,
        drift: statusQuery.data.drift,
        hallucination: statusQuery.data.hallucination,
        latency: statusQuery.data.latency,
        roi: statusQuery.data.roi,
      }
    : undefined;

  const isLoading = agentsQuery.isLoading || statusQuery.isLoading;
  const error = agentsQuery.error ?? statusQuery.error ?? null;

  const refetch = () => {
    void agentsQuery.refetch();
    void statusQuery.refetch();
  };

  return {
    agents,
    totalActive,
    healthStatus,
    isLoading,
    error,
    refetch,
  };
}
