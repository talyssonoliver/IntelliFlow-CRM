/**
 * Core TypeScript types for IntelliFlow Project Tracker
 * Maps directly to Sprint_plan.csv columns
 */

export type TaskStatus =
  | 'Backlog'
  | 'Planned'
  | 'In Progress'
  | 'Validating'
  | 'Completed'
  | 'Done' // Alias for Completed
  | 'Blocked'
  | 'Failed'
  | 'Needs Human'
  | 'In Review';

export type SprintNumber = number | 'Continuous' | 'all';

export interface Task {
  id: string; // Task ID
  section: string; // Section
  description: string; // Description
  owner: string; // Owner
  dependencies: string[]; // Parsed from Dependencies column
  cleanDependencies: string[]; // CleanDependencies column
  crossQuarterDeps: boolean; // CrossQuarterDeps
  prerequisites: string; // Pre-requisites
  dod: string; // Definition of Done
  status: TaskStatus; // Status
  kpis: string; // KPIs
  sprint: SprintNumber; // Target Sprint
  artifacts: string[]; // Parsed from Artifacts To Track
  validation: string; // Validation Method
}

export interface SprintMetrics {
  sprint: SprintNumber;
  totalTasks: number;
  completed: number;
  inProgress: number;
  validating: number;
  planned: number;
  backlog: number;
  blocked: number;
  failed: number;
  needsHuman: number;
  inReview: number;
  completionRate: number; // Percentage
  velocity: number; // Tasks completed
}

export interface VelocityData {
  sprint: number;
  tasksCompleted: number;
  average: number; // Rolling 3-sprint average
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface KPIMetric {
  metric: string; // e.g., "Coverage", "Response time"
  operator: '>' | '<' | '=' | '>=' | '<=';
  value: number;
  unit: string; // e.g., "%", "ms", "s"
}

export interface KPICompliance {
  taskId: string;
  taskDescription: string;
  kpiString: string; // Raw KPI text
  parsed: KPIMetric[]; // Parsed metrics
  status: 'met' | 'missed' | 'pending' | 'not-validated';
  actualValues?: Record<string, number>;
  complianceRate?: number; // If multiple KPIs, % met
}

export interface DependencyNode {
  id: string;
  task: Task;
  dependencies: string[]; // Task IDs this depends on
  dependents: string[]; // Task IDs that depend on this
  level: number; // Depth in dependency tree
  isCriticalPath: boolean; // On critical path
  isBlocker: boolean; // Blocking 3+ tasks
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  criticalPath: string[]; // Task IDs in critical path
  blockers: string[]; // Task IDs that are blockers
}

export interface DependencyEdge {
  from: string; // Task ID
  to: string; // Task ID
  type: 'hard' | 'soft'; // Hard = must complete, Soft = should complete
}

export interface TeamMember {
  name: string;
  totalTasks: number;
  completed: number;
  inProgress: number;
  planned: number;
  blocked: number;
  failed: number;
  sections: string[]; // Sections they work in
  workloadScore: number; // Relative workload (1-10)
  isBottleneck: boolean; // Many tasks depend on their work
}

export interface WorkloadData {
  members: TeamMember[];
  averageTasksPerMember: number;
  maxWorkload: number;
  minWorkload: number;
  imbalanceScore: number; // Higher = more imbalanced
}

export interface TimelineTask {
  task: Task;
  startSprint: number;
  endSprint: number;
  duration: number; // Number of sprints
  swimlane: string; // Section or Owner
  dependencies: TimelineDependency[];
}

export interface TimelineDependency {
  from: string; // Task ID
  to: string; // Task ID
  type: 'finish-to-start' | 'start-to-start';
}

export interface Milestone {
  taskId: string;
  name: string;
  sprint: number;
  type: 'decision-gate' | 'investment-review' | 'phase-completion';
  importance: 'critical' | 'high' | 'medium';
}

export interface AIMetrics {
  totalTasks: number;
  aiAssistedTasks: number;
  aiAutomationRate: number; // Percentage
  aiToolsUsed: {
    tool: string; // e.g., "Claude Code", "Copilot"
    taskCount: number;
  }[];
  sectionBreakdown: {
    section: string;
    aiRate: number; // Percentage
  }[];
  estimatedTimeSaved: number; // Hours
}

export interface ValidationResult {
  taskId: string;
  taskDescription: string;
  artifacts: ArtifactValidation[];
  kpis: KPIValidation[];
  dod: DODValidation;
  overallStatus: 'complete' | 'partial' | 'incomplete';
  completionPercentage: number;
  suggestedStatus?: TaskStatus;
}

export interface ArtifactValidation {
  path: string;
  exists: boolean;
  type: 'file' | 'directory' | 'pattern';
  lastModified?: Date;
  size?: number;
}

export interface KPIValidation {
  kpi: string;
  expected: string;
  actual?: string;
  met: boolean;
  validationMethod: string;
}

export interface DODValidation {
  criteria: string[]; // Parsed from Definition of Done
  checkedOff: boolean[];
  completionRate: number;
}

// Chart data types
export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
  meta?: Record<string, any>;
}

export interface TimeSeriesPoint {
  date: string | number;
  value: number;
  label?: string;
}

// Filter types
export interface TaskFilters {
  sections?: string[];
  owners?: string[];
  statuses?: TaskStatus[];
  sprints?: SprintNumber[];
  searchQuery?: string;
  hasKPIs?: boolean;
  hasArtifacts?: boolean;
}

// Pagination
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =============================================================================
// GOVERNANCE TYPES (Plan Linter Integration)
// =============================================================================

export type TaskTier = 'A' | 'B' | 'C';

export type GateStatus = 'passed' | 'failed' | 'pending' | 'skipped';

export interface TaskOverride {
  taskId: string;
  tier: TaskTier;
  gateProfile: string[];
  acceptanceOwner?: string;
  debtAllowed: boolean;
  waiverExpiry?: string;
  evidenceRequired: string[];
  overrideDepsAdd?: string[];
  overrideDepsRemove?: string[];
  sprintOverride?: number;
  exceptionPolicy?: 'stub_contract' | 'waiver' | 'deferred';
  notes?: string;
}

export interface ReviewQueueItem {
  task_id: string;
  tier: TaskTier;
  section: string;
  status: string;
  owner: string;
  reasons: string[];
  evidence_missing?: string[];
  dependent_count?: number;
  waiver_expiry?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface ReviewQueue {
  meta: {
    generated_at: string;
    sprint_scope: number | 'all';
    total_items: number;
  };
  items: ReviewQueueItem[];
}

export interface LintError {
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  tasks: string[];
  fix?: string;
}

export interface LintReport {
  meta: {
    generated_at: string;
    schema_version: string;
    sprint_scope: number | 'all';
  };
  summary: {
    total_tasks: number;
    tier_breakdown: { A: number; B: number; C: number };
    error_count: number;
    warning_count: number;
    review_queue_size: number;
    validation_coverage: {
      tasks_with_validation: number;
      tasks_without_validation: number;
      coverage_percentage: number;
    };
  };
  errors: LintError[];
  warnings: LintError[];
  review_queue: ReviewQueueItem[];
  tasks_by_tier: {
    A: string[];
    B: string[];
    C: string[];
  };
}

export interface DebtItem {
  id: string;
  origin_task: string;
  owner: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  created_at: string;
  expiry_date: string;
  remediation_plan: string;
  remediation_sprint?: number;
  status: 'open' | 'in_progress' | 'resolved';
  notes?: string;
}

export interface DebtLedger {
  schema_version: string;
  last_updated: string;
  items: Record<string, DebtItem>;
  summary: {
    total_items: number;
    by_severity: Record<string, number>;
    by_status: Record<string, number>;
    expiring_soon: string[];
  };
}

export interface GovernanceSummary {
  sprint: number;
  tierBreakdown: { A: number; B: number; C: number };
  tierCompletion: {
    A: { done: number; total: number };
    B: { done: number; total: number };
    C: { done: number; total: number };
  };
  taskSummary: {
    total: number;
    done: number;
    in_progress: number;
    blocked: number;
    not_started: number;
    failed: number;
  };
  validationCoverage: number;
  reviewQueueSize: number;
  errorCount: number;
  warningCount: number;
  debtItems: number;
  expiringWaivers: number;
  lastLintRun?: string;
}

// Extended Task with governance data
export interface TaskWithGovernance extends Task {
  governance?: {
    tier: TaskTier;
    gateProfile: string[];
    gateStatus: Record<string, GateStatus>;
    acceptanceOwner?: string;
    evidenceRequired: string[];
    evidenceStatus: Record<string, boolean>;
    debtAllowed: boolean;
    waiverExpiry?: string;
    inReviewQueue: boolean;
    reviewReasons?: string[];
  };
}
