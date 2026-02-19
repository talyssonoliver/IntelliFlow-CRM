/**
 * Types for the Active Agents Dashboard (PG-151)
 *
 * Mirrors the API response shape from aiMonitoring.getActiveAgents
 * and aiMonitoring.getStatus endpoints.
 */

export interface ActiveAgent {
  id: string;
  agentId: string | null;
  type: string;
  model: string;
  status: 'active' | 'idle' | 'error';
  currentTask?: string;
  lastActive: string;
}

export interface MonitoringHealthStatus {
  healthy: boolean;
  issues: string[];
  drift: {
    trackedMetrics: number;
    driftDetected: boolean;
    highSeverityCount: number;
  };
  hallucination: {
    rate: number;
    kpiCompliant: boolean;
    totalChecks: number;
  };
  latency: {
    sloCompliant: boolean;
    p95: number;
    p99: number;
  };
  roi: {
    currentROI: number;
    totalCost: number;
    totalValue: number;
  };
}

export interface ActiveAgentFilters {
  status: string;
  type: string;
  search: string;
  sort: 'lastActive' | 'type' | 'status';
}

export interface AgentStats {
  total: number;
  active: number;
  idle: number;
  error: number;
}
