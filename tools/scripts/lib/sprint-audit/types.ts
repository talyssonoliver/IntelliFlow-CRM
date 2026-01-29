/**
 * Sprint Completion Audit Types
 *
 * Type definitions for the Sprint Completion Audit system that verifies
 * tasks are genuinely complete with real implementations (no fake results
 * or placeholders).
 *
 * @module tools/scripts/lib/sprint-audit/types
 */

// =============================================================================
// Configuration Types
// =============================================================================

export interface SprintAuditConfig {
  /** Sprint number to audit */
  sprintNumber: number;
  /** Repository root path */
  repoRoot: string;
  /** Strict mode - fails on any placeholder or missed KPI */
  strictMode: boolean;
  /** Skip running validation commands (faster, less thorough) */
  skipValidations: boolean;
  /** Maximum parallel operations */
  parallelLimit: number;
  /** Timeout for validation commands in milliseconds */
  validationTimeout: number;
  /** Custom run ID (auto-generated if not provided) */
  runId?: string;
}

export const DEFAULT_AUDIT_CONFIG: Partial<SprintAuditConfig> = {
  strictMode: false,
  skipValidations: false,
  parallelLimit: 4,
  validationTimeout: 60_000, // 1 minute
};

// =============================================================================
// Artifact Verification Types
// =============================================================================

export type ArtifactStatus = 'found' | 'missing' | 'empty' | 'stub';

export interface ArtifactVerification {
  /** Relative path to the artifact */
  path: string;
  /** Task ID that expects this artifact */
  expectedBy: string;
  /** Verification status */
  status: ArtifactStatus;
  /** File size in bytes (null if missing) */
  size: number | null;
  /** SHA256 hash (null if missing or empty) */
  sha256: string | null;
  /** List of issues found */
  issues: string[];
}

// =============================================================================
// Placeholder Detection Types
// =============================================================================

export type PlaceholderPattern =
  | 'TODO'
  | 'FIXME'
  | 'PLACEHOLDER'
  | 'STUB'
  | 'HACK'
  | 'XXX'
  | 'EMPTY_FUNCTION'
  | 'THROW_NOT_IMPLEMENTED'
  | 'SKIP_TEST'
  | 'EMPTY_TEST'
  | 'PENDING_TEST'
  | 'MOCK_RETURN'
  // New patterns for detecting incomplete implementations (IFC-085, IFC-099, etc.)
  | 'SIMULATED_DATA'
  | 'PLACEHOLDER_RETURN'
  | 'NOT_WIRED_COMMENT'
  | 'PLACEHOLDER_CHANNEL'
  // Additional patterns for AI/ML incomplete implementations
  | 'NULL_FALLBACK'
  | 'HARDCODED_PREDICTION'
  | 'DEFERRED_AUDIT'
  | 'DEMONSTRATION_PLACEHOLDER'
  | 'SIMULATED_BENCHMARK'
  | 'STUBBED_TOKEN_COUNT';

export interface PlaceholderFinding {
  /** File path where placeholder was found */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Type of placeholder pattern */
  pattern: PlaceholderPattern;
  /** Matched content (truncated) */
  content: string;
  /** Linked task ID if determinable */
  linkedTaskId: string | null;
}

export interface PlaceholderScanConfig {
  /** File extensions to scan */
  extensions: string[];
  /** Directories to exclude */
  excludeDirs: string[];
  /** Minimum file size to scan (skip smaller) */
  minFileSize: number;
  /** Maximum file size to scan (skip larger) */
  maxFileSize: number;
}

export const DEFAULT_SCAN_CONFIG: PlaceholderScanConfig = {
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  excludeDirs: ['node_modules', '.next', 'dist', 'build', '.turbo', '.git', '__mocks__'],
  minFileSize: 10,
  maxFileSize: 1_000_000, // 1MB
};

// =============================================================================
// Validation Execution Types
// =============================================================================

export interface ValidationResult {
  /** Task ID this validation belongs to */
  taskId: string;
  /** Original command from Sprint_plan.csv */
  command: string;
  /** Exit code from command execution */
  exitCode: number;
  /** Whether the validation passed (exitCode === 0) */
  passed: boolean;
  /** Duration in milliseconds */
  durationMs: number;
  /** SHA256 hash of stdout for proof */
  stdoutHash: string;
  /** Path to log file */
  logPath: string;
  /** ISO timestamp of execution */
  timestamp: string;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// KPI Verification Types
// =============================================================================

export type KpiOperator = '>' | '<' | '>=' | '<=' | '=' | '!=';

export interface ParsedKpi {
  /** Original KPI string */
  description: string;
  /** Metric name extracted */
  metric: string;
  /** Comparison operator */
  operator: KpiOperator;
  /** Target value */
  target: number;
  /** Unit (%, ms, s, etc.) */
  unit: string | null;
  /** Command to measure this KPI (if determinable) */
  measureCommand: string | null;
}

export interface KpiResult {
  /** Original KPI description */
  kpi: string;
  /** Target value string */
  target: string;
  /** Actual measured value (null if unmeasurable) */
  actual: string | null;
  /** Whether KPI was met */
  met: boolean;
  /** Command used to measure (null if manual) */
  measurementCommand: string | null;
  /** Evidence or notes */
  evidence: string;
}

// =============================================================================
// Dependency Verification Types
// =============================================================================

export interface DependencyVerification {
  /** Task ID being verified */
  taskId: string;
  /** List of dependency task IDs */
  dependencies: string[];
  /** Whether all dependencies are completed */
  allCompleted: boolean;
  /** Attestation files found for dependencies */
  attestationsFound: string[];
  /** Missing attestations */
  missing: string[];
}

// =============================================================================
// Task Audit Result Types
// =============================================================================

export type TaskVerdict = 'PASS' | 'FAIL' | 'NEEDS_HUMAN';

export interface DefinitionOfDoneResult {
  /** Original DoD criteria (split) */
  criteria: string[];
  /** Number of verified criteria */
  verified: number;
  /** Number of unverified criteria */
  unverified: number;
  /** Details per criterion */
  details: Array<{
    criterion: string;
    verified: boolean;
    evidence: string;
  }>;
}

export interface TaskAuditResult {
  /** Task ID */
  taskId: string;
  /** Task description */
  description: string;
  /** Current status from CSV */
  status: string;
  /** Audit verdict */
  verdict: TaskVerdict;
  /** Artifact verification results */
  artifacts: ArtifactVerification[];
  /** Placeholder findings in task artifacts */
  placeholders: PlaceholderFinding[];
  /** Validation command results */
  validations: ValidationResult[];
  /** KPI verification results */
  kpis: KpiResult[];
  /** Dependency verification */
  dependencies: DependencyVerification;
  /** Definition of Done verification */
  definitionOfDone: DefinitionOfDoneResult;
  /** List of issues found */
  issues: string[];
  /** Recommendations for fixing */
  recommendations: string[];
}

// =============================================================================
// Sprint Audit Report Types
// =============================================================================

export interface AuditSummary {
  /** Total tasks in sprint */
  totalTasks: number;
  /** Tasks marked as completed */
  completedTasks: number;
  /** Tasks that were audited */
  auditedTasks: number;
  /** Tasks that passed audit */
  passedTasks: number;
  /** Tasks that failed audit */
  failedTasks: number;
  /** Tasks needing human review */
  needsHumanTasks: number;
}

export interface EvidenceSummary {
  /** Number of artifacts verified */
  artifactsVerified: number;
  /** Number of artifacts missing */
  artifactsMissing: number;
  /** Number of empty artifacts */
  artifactsEmpty: number;
  /** Number of validations that passed */
  validationsPassed: number;
  /** Number of validations that failed */
  validationsFailed: number;
  /** Number of KPIs met */
  kpisMet: number;
  /** Number of KPIs missed */
  kpisMissed: number;
  /** Number of placeholders found in task artifacts */
  placeholdersFound: number;
  /** Total placeholders in entire codebase (for context) */
  totalCodebasePlaceholders: number;
}

export interface BlockingIssue {
  /** Task ID with the issue */
  taskId: string;
  /** Severity level */
  severity: 'critical' | 'high' | 'medium';
  /** Issue description */
  issue: string;
  /** Recommended action */
  recommendation: string;
}

export type SprintVerdict = 'PASS' | 'FAIL';

export interface AttestationSummary {
  /** Count by attestation verdict */
  by_verdict: {
    complete: number;
    incomplete: number;
    partial: number;
    blocked: number;
    needs_human: number;
    missing: number;
  };
  /** Tasks written to debt ledger */
  debt_items_created: number;
  /** Tasks added to review queue */
  review_queue_items: number;
}

export interface SprintAuditReport {
  /** JSON Schema reference */
  $schema: string;
  /** Schema version */
  schema_version: string;
  /** Unique run ID */
  run_id: string;
  /** Sprint number audited */
  sprint: number;
  /** ISO timestamp of report generation */
  generated_at: string;
  /** Who/what performed the audit */
  attestor: string;
  /** Overall sprint verdict */
  verdict: SprintVerdict;
  /** Audit configuration used */
  config: {
    strictMode: boolean;
    skipValidations: boolean;
  };
  /** High-level summary */
  summary: AuditSummary;
  /** Attestation summary - integration with governance system */
  attestation_summary: AttestationSummary;
  /** Evidence summary counts */
  evidence_summary: EvidenceSummary;
  /** Map of artifact paths to SHA256 hashes */
  artifact_hashes: Record<string, string>;
  /** Individual task results */
  task_results: TaskAuditResult[];
  /** Blocking issues that must be resolved */
  blocking_issues: BlockingIssue[];
  /** Duration of audit in seconds */
  duration_seconds: number;
}

// =============================================================================
// CSV Task Type (matches Sprint_plan.csv structure)
// =============================================================================

export interface CsvTask {
  'Task ID': string;
  Section: string;
  Description: string;
  Owner: string;
  Dependencies: string;
  'Pre-requisites': string;
  'Definition of Done': string;
  Status: string;
  KPIs: string;
  'Target Sprint': string;
  'Artifacts To Track': string;
  'Validation Method': string;
}

// =============================================================================
// Report File Paths
// =============================================================================

export interface AuditOutputPaths {
  /** Directory containing all audit output */
  outputDir: string;
  /** Full JSON report */
  jsonPath: string;
  /** Human-readable Markdown report */
  mdPath: string;
  /** Simple verdict JSON for CI */
  verdictPath: string;
  /** Evidence subdirectory */
  evidenceDir: string;
  /** Artifact hashes file */
  hashesPath: string;
  /** Validation logs directory */
  validationLogsDir: string;
  /** Placeholder scan results */
  placeholderScanPath: string;
}
