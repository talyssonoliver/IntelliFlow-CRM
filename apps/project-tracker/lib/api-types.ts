/**
 * Shared API Response Types
 * Ensures consistent snake_case response shapes across all API routes
 */

// =============================================================================
// CORE RESPONSE WRAPPER
// =============================================================================

/**
 * Standard API response wrapper
 * All API routes should return data in this format
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
  generated_at: string;
}

/**
 * Create a successful API response
 */
export function createSuccessResponse<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Create an error API response
 */
export function createErrorResponse<T>(error: string, data?: T): ApiResponse<T> {
  return {
    success: false,
    data: data as T,
    error,
    generated_at: new Date().toISOString(),
  };
}

// =============================================================================
// TASK SUMMARY (used by multiple endpoints)
// =============================================================================

/**
 * Task status counts - snake_case for API consistency
 */
export interface TaskSummary {
  total: number;
  done: number;
  in_progress: number;
  blocked: number;
  not_started: number;
  failed: number;
}

/**
 * Create a TaskSummary with all fields initialized to 0
 */
export function createEmptyTaskSummary(): TaskSummary {
  return {
    total: 0,
    done: 0,
    in_progress: 0,
    blocked: 0,
    not_started: 0,
    failed: 0,
  };
}

// =============================================================================
// SPRINT METRICS
// =============================================================================

/**
 * KPI metric data
 */
export interface KpiMetric {
  target: number;
  actual: number;
  status: 'MET' | 'MEASURING' | 'BELOW_TARGET';
  unit: 'percent' | 'count' | 'ms' | 'seconds';
}

/**
 * Completed task info
 */
export interface CompletedTask {
  task_id: string;
  completed_at: string;
  duration_minutes: number;
}

/**
 * Section breakdown
 */
export interface SectionMetrics {
  name: string;
  total: number;
  done: number;
  progress: number;
}

/**
 * Sprint metrics response
 */
export interface SprintMetricsResponse {
  sprint: string;
  name: string;
  target_date: string;
  started_at: string | null;
  completed_at: string | null;
  task_summary: TaskSummary;
  kpi_summary: Record<string, KpiMetric>;
  blockers: BlockerInfo[];
  completed_tasks: CompletedTask[];
  sections: SectionMetrics[];
  message?: string;
}

// =============================================================================
// PHASE METRICS
// =============================================================================

/**
 * Phase metrics response
 */
export interface PhaseMetrics {
  phase: string;
  description: string;
  status: 'completed' | 'in_progress' | 'not_started';
  aggregated_metrics: {
    total_tasks: number;
    done: number;
    in_progress: number;
    blocked: number;
    not_started: number;
  };
  started_at: string | null;
  completed_at: string | null;
}

// =============================================================================
// EXECUTIVE METRICS (snake_case standardized)
// =============================================================================

/**
 * Plan vs code mismatch detail
 */
export interface PlanMismatchDetail {
  task_id: string;
  description: string;
  missing_artifacts: string[];
}

/**
 * Task requiring revert detail
 */
export interface RevertTaskDetail {
  task_id: string;
  description: string;
  current_status: string;
  missing_artifacts: string[];
  missing_evidence: string[];
}

/**
 * Untracked artifact detail
 */
export interface UntrackedArtifactDetail {
  path: string;
  type: 'package' | 'app' | 'infra' | 'other';
}

/**
 * Forward dependency detail
 */
export interface ForwardDependencyDetail {
  task_id: string;
  task_description: string;
  task_sprint: number;
  depends_on: string;
  dep_sprint: number;
}

/**
 * Sprint bottleneck detail
 */
export interface SprintBottleneckDetail {
  sprint: number;
  dependency_count: number;
  blocked_tasks: string[];
}

/**
 * Executive metrics response - all snake_case
 */
export interface ExecutiveMetricsResponse {
  total_tasks: number;
  completed: {
    count: number;
    percentage: number;
  };
  in_progress: {
    count: number;
    percentage: number;
  };
  backlog: {
    count: number;
    percentage: number;
  };
  plan_vs_code_mismatches: number;
  plan_vs_code_mismatches_details: PlanMismatchDetail[];
  tasks_requiring_revert: number;
  tasks_requiring_revert_details: RevertTaskDetail[];
  untracked_code_artifacts: number;
  untracked_code_artifacts_details: UntrackedArtifactDetail[];
  forward_dependencies: number;
  forward_dependencies_details: ForwardDependencyDetail[];
  sprint_bottlenecks: string;
  sprint_bottlenecks_details: SprintBottleneckDetail[];
  generated_at: string;
}

// =============================================================================
// GOVERNANCE METRICS (snake_case standardized)
// =============================================================================

/**
 * Tier breakdown counts
 */
export interface TierBreakdown {
  a: number;
  b: number;
  c: number;
}

/**
 * Tier completion status
 */
export interface TierCompletion {
  a: { done: number; total: number };
  b: { done: number; total: number };
  c: { done: number; total: number };
}

/**
 * Governance summary response - all snake_case
 */
export interface GovernanceSummaryResponse {
  sprint: number;
  tier_breakdown: TierBreakdown;
  tier_completion: TierCompletion;
  task_summary: TaskSummary;
  validation_coverage: number;
  review_queue_size: number;
  error_count: number;
  warning_count: number;
  debt_items: number;
  expiring_waivers: number;
  last_lint_run?: string;
}

// =============================================================================
// BLOCKER INFO
// =============================================================================

/**
 * Blocker information
 */
export interface BlockerInfo {
  task_id: string;
  description: string;
  blocked_since: string;
  blocker_type: 'dependency' | 'resource' | 'external' | 'unknown';
  resolution?: string;
}

// =============================================================================
// UNIFIED DATA (for /api/unified-data endpoint)
// =============================================================================

/**
 * Unified data response - single source of truth for all views
 */
export interface UnifiedDataResponse {
  tasks: UnifiedTask[];
  sections: string[];
  sprints: (number | 'Continuous')[];
  status_counts: TaskSummary;
  last_modified: string;
  generated_at: string;
}

/**
 * Task data in unified format
 */
export interface UnifiedTask {
  id: string;
  section: string;
  description: string;
  owner: string;
  status: string;
  sprint: number | 'Continuous';
  dependencies: string[];
  clean_dependencies: string[];
  dod: string;
  kpis: string;
  artifacts: string[];
  validation: string;
}

// =============================================================================
// HTTP CACHE HEADERS
// =============================================================================

/**
 * Standard no-cache headers for API responses
 */
export const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
} as const;
