/**
 * Core TypeScript types for IntelliFlow Project Tracker
 * Maps directly to Sprint_plan.csv columns
 */

// =============================================================================
// RAW CSV TYPES
// =============================================================================

/**
 * Raw CSV row with string-indexed properties from Papa Parse.
 * Used when parsing Sprint_plan.csv before transformation to Task type.
 */
export type RawCSVRow = Record<string, string | undefined>;

// =============================================================================
// CANONICAL STATUS VALUES - Single Source of Truth
// =============================================================================

/**
 * Canonical task status values used throughout the application.
 * All status comparisons should use these constants.
 */
export const TASK_STATUSES = {
  // Base statuses
  BACKLOG: 'Backlog',
  PLANNED: 'Planned',
  IN_PROGRESS: 'In Progress',
  VALIDATING: 'Validating',
  COMPLETED: 'Completed',
  BLOCKED: 'Blocked',
  FAILED: 'Failed',
  NEEDS_HUMAN: 'Needs Human',
  IN_REVIEW: 'In Review',
  // Workflow statuses (SESSION 1-3)
  SPECIFYING: 'Specifying',       // SESSION 1 in progress
  SPEC_COMPLETE: 'Spec Complete', // SESSION 1 done, ready for SESSION 2
  PLANNING: 'Planning',           // SESSION 2 in progress
  PLAN_COMPLETE: 'Plan Complete', // SESSION 2 done, ready for SESSION 3
} as const;

/**
 * Status aliases that get normalized to canonical values.
 * Keys are lowercase for case-insensitive matching.
 */
export const STATUS_ALIASES: Record<string, TaskStatus> = {
  // Completed aliases
  done: 'Completed',
  complete: 'Completed',
  finished: 'Completed',
  // In Progress aliases
  'in progress': 'In Progress',
  in_progress: 'In Progress',
  inprogress: 'In Progress',
  started: 'In Progress',
  active: 'In Progress',
  // Backlog aliases
  backlog: 'Backlog',
  todo: 'Backlog',
  'to do': 'Backlog',
  'not started': 'Backlog',
  not_started: 'Backlog',
  // Planned aliases
  planned: 'Planned',
  scheduled: 'Planned',
  // Blocked aliases
  blocked: 'Blocked',
  waiting: 'Blocked',
  on_hold: 'Blocked',
  'on hold': 'Blocked',
  // Failed aliases
  failed: 'Failed',
  error: 'Failed',
  // Validating aliases
  validating: 'Validating',
  testing: 'Validating',
  reviewing: 'Validating',
  // Needs Human aliases
  'needs human': 'Needs Human',
  needs_human: 'Needs Human',
  manual: 'Needs Human',
  // In Review aliases
  'in review': 'In Review',
  in_review: 'In Review',
  review: 'In Review',
  // Workflow status aliases (SESSION 1-3)
  specifying: 'Specifying',
  'spec in progress': 'Specifying',
  'spec complete': 'Spec Complete',
  spec_complete: 'Spec Complete',
  specified: 'Spec Complete',
  planning: 'Planning',
  'plan in progress': 'Planning',
  'plan complete': 'Plan Complete',
  plan_complete: 'Plan Complete',
  planned_complete: 'Plan Complete',
};

/**
 * Status groupings for dashboard/kanban display
 */
/**
 * Status groupings for dashboard/kanban display.
 * Maps detailed statuses to 5 UI columns.
 */
export const STATUS_GROUPS = {
  backlog: [TASK_STATUSES.BACKLOG, TASK_STATUSES.IN_REVIEW] as TaskStatus[],
  planned: [
    TASK_STATUSES.PLANNED,
    TASK_STATUSES.SPEC_COMPLETE,  // Ready for SESSION 2
    TASK_STATUSES.PLAN_COMPLETE,  // Ready for SESSION 3
  ] as TaskStatus[],
  active: [
    TASK_STATUSES.IN_PROGRESS,
    TASK_STATUSES.VALIDATING,
    TASK_STATUSES.SPECIFYING,     // SESSION 1 in progress
    TASK_STATUSES.PLANNING,       // SESSION 2 in progress
  ] as TaskStatus[],
  blocked: [TASK_STATUSES.BLOCKED, TASK_STATUSES.NEEDS_HUMAN, TASK_STATUSES.FAILED] as TaskStatus[],
  completed: [TASK_STATUSES.COMPLETED] as TaskStatus[],
} as const;

export type TaskStatus =
  | 'Backlog'
  | 'Planned'
  | 'In Progress'
  | 'Validating'
  | 'Completed'
  | 'Blocked'
  | 'Failed'
  | 'Needs Human'
  | 'In Review'
  // Workflow statuses (SESSION 1-3)
  | 'Specifying'
  | 'Spec Complete'
  | 'Planning'
  | 'Plan Complete';

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
  linkedTaskId?: string;
  isOrphan?: boolean;
  category?: ArtifactCategory;
}

// =============================================================================
// ARTIFACT REGISTRY TYPES
// =============================================================================

export type ArtifactCategory =
  | 'attestation'
  | 'benchmark'
  | 'coverage'
  | 'report'
  | 'metric'
  | 'log'
  | 'misc'
  | 'backup'
  | 'forensics'
  | 'lighthouse'
  | 'performance'
  | 'validation'
  | 'status'
  | 'test-results';

export interface ArtifactEntry {
  path: string;
  absolutePath: string;
  exists: boolean;
  type: 'file' | 'directory';
  size: number;
  lastModified: string;
  linkedTasks: string[];
  isOrphan: boolean;
  category: ArtifactCategory;
  extension: string;
}

export interface ArtifactSummary {
  totalArtifacts: number;
  linkedArtifacts: number;
  orphanArtifacts: number;
  missingArtifacts: number;
  totalSize: number;
  byCategory: Record<ArtifactCategory, number>;
  byExtension: Record<string, number>;
  lastScanAt: string;
}

export interface MissingArtifact {
  path: string;
  expectedBy: string[];
  prefix: 'ARTIFACT' | 'EVIDENCE';
}

export interface TaskArtifactStatus {
  taskId: string;
  linkedArtifacts: ArtifactEntry[];
  missingArtifacts: MissingArtifact[];
  totalExpected: number;
  totalPresent: number;
  completionPercentage: number;
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

// =============================================================================
// VALIDATION SUMMARY TYPES (TaskModal Validation Tab)
// =============================================================================

/**
 * Build/Test validation status for a specific check
 */
export interface BuildValidationItem {
  name: 'typecheck' | 'tests' | 'lint' | 'build';
  status: 'pass' | 'fail' | 'skip' | 'pending';
  exitCode?: number;
  count?: number; // For tests: number of tests
  passed?: number; // For tests: passed count
  failed?: number; // For tests: failed count
  timestamp?: string;
  duration?: number; // ms
  command?: string;
}

/**
 * Coverage metrics from attestation or coverage reports
 */
export interface CoverageMetrics {
  lines: { pct: number; covered: number; total: number; met: boolean };
  branches: { pct: number; covered: number; total: number; met: boolean };
  functions: { pct: number; covered: number; total: number; met: boolean };
  statements?: { pct: number; covered: number; total: number; met: boolean };
  overall: { pct: number; met: boolean };
}

/**
 * STOA verdict from MATOP execution
 */
export interface STOAVerdict {
  role: 'Lead' | 'Supporting';
  verdict: 'PASS' | 'WARN' | 'FAIL';
  summary?: string;
}

/**
 * MATOP execution summary
 */
export interface MATOPExecutionSummary {
  runId: string;
  timestamp: string;
  consensusVerdict: 'PASS' | 'WARN' | 'FAIL';
  verdictReason?: string;
  stoaResults: Record<string, STOAVerdict>;
  gatesExecuted: {
    total: number;
    passed: number;
    warned: number;
    failed: number;
  };
  issuesIdentified?: {
    high: number;
    medium: number;
    low: number;
  };
  keyIssues?: Array<{
    id: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
  }>;
  recommendations?: string[];
  metrics?: {
    testsRun?: number;
    testsPassed?: number;
    testsFailed?: number;
    coverage?: {
      statements: number;
      branches: number;
      functions: number;
      lines: number;
    };
  };
}

/**
 * KPI result from attestation
 */
export interface AttestationKPIResult {
  kpi: string;
  target: string;
  actual: string;
  met: boolean;
}

/**
 * Definition of Done item validation from attestation
 */
export interface DODItemResult {
  criterion: string;
  met: boolean;
  evidence?: string;
}

/**
 * Enhanced context data with detailed file tracking
 */
export interface EnhancedContextData {
  taskId: string;
  runId?: string;
  filesRead: Array<{
    path: string;
    hash: string;
    status: 'matched' | 'mismatched' | 'missing' | 'pending';
    size?: number;
  }>;
  invariantsAcknowledged: string[];
  generatedAt?: string;
  acknowledgedAt?: string;
  totalFilesCount: number;
  validatedFilesCount: number;
}

/**
 * Spec/Plan preview excerpt
 */
export interface DocumentPreview {
  exists: boolean;
  path: string | null;
  title?: string;
  excerpt?: string; // First 500 chars or key sections
  sections?: string[]; // List of H2 headings found
  lastModified?: string;
}

// =============================================================================
// PLAN DELIVERABLES VERIFICATION TYPES
// =============================================================================

/**
 * Status of a single plan deliverable (file to create/modify)
 */
export interface PlanDeliverable {
  path: string;
  type: 'file' | 'directory';
  status: 'exists' | 'missing' | 'unknown';
  size?: number;
  lastModified?: string;
  fromSection: 'Files to Create/Modify' | 'Artifacts' | 'Implementation Steps';
}

/**
 * Status of a plan checkbox item
 */
export interface PlanCheckboxItem {
  text: string;
  checked: boolean;
  phase: string; // e.g., "Phase 1: Setup", "Phase 2: Implementation"
  lineNumber?: number;
}

/**
 * Complete plan deliverables verification result
 */
export interface PlanDeliverablesVerification {
  taskId: string;
  planExists: boolean;
  planPath: string | null;

  // Files to create/modify
  deliverables: {
    total: number;
    verified: number;
    missing: number;
    items: PlanDeliverable[];
  };

  // Checkbox items from the plan
  checkboxes: {
    total: number;
    checked: number;
    unchecked: number;
    items: PlanCheckboxItem[];
  };

  // Overall verification status
  overallStatus: 'complete' | 'partial' | 'incomplete' | 'no-plan';
  completionPercentage: number;

  // Timestamp of verification
  verifiedAt: string;
}

/**
 * Complete validation summary for a task
 */
export interface TaskValidationSummary {
  taskId: string;
  sprintNumber: number;
  timestamp: string;

  // Build/Test validation
  buildValidation: {
    overall: 'pass' | 'fail' | 'partial' | 'pending';
    items: BuildValidationItem[];
  };

  // Coverage metrics
  coverage: CoverageMetrics | null;

  // MATOP execution (if available)
  matop: MATOPExecutionSummary | null;

  // KPI results from attestation
  kpis: {
    total: number;
    met: number;
    results: AttestationKPIResult[];
  };

  // Definition of Done results
  dod: {
    total: number;
    met: number;
    items: DODItemResult[];
  };

  // Enhanced context
  context: EnhancedContextData | null;

  // Plan deliverables verification
  planDeliverables: PlanDeliverablesVerification | null;

  // Document previews
  spec: DocumentPreview;
  plan: DocumentPreview;

  // Attestation summary
  attestation: {
    exists: boolean;
    verdict?: 'COMPLETE' | 'INCOMPLETE' | 'BLOCKED';
    attestor?: string;
    timestamp?: string;
    artifactsVerified?: number;
    validationsPassed?: number;
    gatesPassed?: number;
  };
}
