/**
 * Drift Detection Dashboard Types (PG-146)
 *
 * Type definitions for drift monitoring data, consumed by
 * useDriftDashboard hook and dashboard components.
 */

export type DriftSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface DriftHistoryItem {
  detected: boolean;
  severity: DriftSeverity;
  metric: string;
  pValue: number;
  driftScore: number;
  timestamp: string;
  recommendations: string[];
}

export interface ROIData {
  totalCost: number;
  totalValue: number;
  netValue: number;
  roi: number;
  trendDirection: string;
}

export interface DriftFilters {
  severity?: string;
  sortBy?: 'newest' | 'score' | 'severity';
}

export interface DriftStatus {
  trackedMetrics: number;
  totalSamples: number;
  driftDetected: boolean;
  highSeverityCount: number;
  lastCheck: string | null;
}

export interface DriftDashboardData {
  status: DriftStatus;
  history: DriftHistoryItem[];
  roi: ROIData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Agent Logs Types (PG-152)
// ---------------------------------------------------------------------------

export interface AgentLogMessage {
  role: string; // USER | ASSISTANT | SYSTEM | TOOL
  content: string;
  timestamp: string; // ISO
}

export interface AgentLogToolCall {
  name: string;
  input: unknown; // JSON
  output: unknown; // JSON
  status: string; // PENDING | RUNNING | SUCCESS | FAILED | CANCELLED
  timestamp: string; // ISO
}

export interface AgentLog {
  id: string;
  agentId: string;
  agentType: string;
  messages: AgentLogMessage[];
  toolCalls: AgentLogToolCall[];
  createdAt: string; // ISO
}

export interface AgentLogsParams {
  agentId?: string;
  search?: string;
  toolStatus?: string;
  sort?: 'newest' | 'oldest';
  limit?: number;
  offset?: number;
}

export interface AgentLogsData {
  logs: AgentLog[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Latency Monitor Types (PG-153)
// ---------------------------------------------------------------------------

export interface LatencyPercentiles {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  min: number;
  mean: number;
  stdDev: number;
}

export interface SLOCompliance {
  p95Target: number;
  p99Target: number;
  p95Actual: number;
  p99Actual: number;
  p95Compliant: boolean;
  p99Compliant: boolean;
  overallCompliant: boolean;
  complianceRate: number;
}

export interface LatencyAlert {
  severity: 'warning' | 'critical';
  message: string;
  timestamp: string;
  model: string;
  operationType: string;
  currentP95: number;
  targetP95: number;
}

export type LatencyPhase =
  | 'queue_wait'
  | 'preprocessing'
  | 'model_inference'
  | 'postprocessing'
  | 'total';

export interface LatencyTrendPoint {
  timestamp: string;
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

export interface LatencyFilters {
  model?: string;
  timeRange?: '1h' | '6h' | '24h';
}

export interface LatencyDashboardData {
  sampleCount: number;
  successRate: number;
  percentiles: LatencyPercentiles;
  sloCompliance: SLOCompliance;
  byModel: Record<string, LatencyPercentiles>;
  byOperation: Record<string, LatencyPercentiles>;
  byPhase: Partial<Record<LatencyPhase, LatencyPercentiles>>;
  alerts: LatencyAlert[];
  trend: LatencyTrendPoint[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}
