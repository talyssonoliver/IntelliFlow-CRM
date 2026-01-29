/**
 * Workflow Types
 *
 * Shared type definitions for the STOA workflow.
 */

/**
 * Workflow session identifiers
 */
export type WorkflowSession = 'spec' | 'plan' | 'exec';

/**
 * Workflow status values - aligned with Sprint_plan.csv
 */
export type WorkflowStatus =
  | 'Backlog'
  | 'Planned'
  | 'Specifying'      // SESSION 1 in progress
  | 'Spec Complete'   // SESSION 1 done, ready for SESSION 2
  | 'Planning'        // SESSION 2 in progress
  | 'Plan Complete'   // SESSION 2 done, ready for SESSION 3
  | 'In Progress'     // SESSION 3 in progress
  | 'Validating'      // MATOP validation running
  | 'Completed'       // Task done
  | 'Failed'          // Execution failed
  | 'Blocked'         // External blocker
  | 'Needs Human'     // Requires human intervention
  | 'In Review';      // Code review pending

/**
 * MATOP verdict values
 */
export type MatopVerdict = 'PASS' | 'WARN' | 'FAIL' | 'NEEDS_HUMAN';

/**
 * STOA (Specialized Task Orchestration Agent) types
 */
export type StoaType =
  | 'Foundation'
  | 'Security'
  | 'Quality'
  | 'Domain'
  | 'Intelligence'
  | 'Automation';

/**
 * Session execution result
 */
export interface SessionResult {
  success: boolean;
  taskId: string;
  session: WorkflowSession;
  runId: string;
  previousStatus: WorkflowStatus;
  newStatus: WorkflowStatus;
  artifacts: SessionArtifacts;
  verdict?: MatopVerdict;
  errors?: string[];
  warnings?: string[];
  duration: number; // milliseconds
}

/**
 * Artifacts produced by a session
 */
export interface SessionArtifacts {
  spec?: string;        // Path to spec file
  plan?: string;        // Path to plan file
  delivery?: string;    // Path to delivery report
  context?: string;     // Path to hydrated context
  evidence?: string[];  // Paths to evidence files
}

/**
 * Task record from Sprint_plan.csv
 */
export interface TaskRecord {
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

/**
 * Session prerequisites check result
 */
export interface PrerequisiteCheck {
  canProceed: boolean;
  reason?: string;
  missingArtifacts?: string[];
  invalidStatus?: boolean;
}

/**
 * Workflow execution options
 */
export interface WorkflowOptions {
  /** Skip TDD phases (for validation-only runs) */
  skipTdd?: boolean;
  /** Run MATOP validation only (no implementation) */
  matopOnly?: boolean;
  /** Force re-run even if already completed */
  force?: boolean;
  /** Dry run - don't actually modify files */
  dryRun?: boolean;
  /** Strict mode - fail on warnings */
  strict?: boolean;
}
