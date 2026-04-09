/**
 * Workflow Progress Types — PG-193
 *
 * Type definitions and utilities for the WorkflowProgressPanel component.
 * Used by useWorkflowProgress hook and WorkflowProgressPanel UI.
 */

// ---------------------------------------------------------------------------
// Core Types
// ---------------------------------------------------------------------------

export type WorkflowExecutionStatus =
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type WorkflowStepStatus =
  | 'completed'
  | 'pending'
  | 'running'
  | 'failed'
  | 'skipped';

export interface WorkflowStepDef {
  /** Numeric step identifier (1-based, from WorkflowDefinition.steps[].id) */
  id: number;
  /** Step type key — e.g., "score", "condition", "assign", "notify" */
  type: string;
  /** Step-specific configuration (opaque to the panel) */
  config: Record<string, unknown>;
}

export interface WorkflowStepResult {
  /** 1-based step index, matches stepDef.id */
  step: number;
  status: WorkflowStepStatus;
  result?: Record<string, unknown> | null;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkflowMergedStep {
  /** 1-based display index */
  stepNumber: number;
  /** From WorkflowDefinition.steps[].id */
  stepId: number;
  /** Human-readable label derived from type via STEP_TYPE_LABELS */
  name: string;
  /** Raw type string from the step definition */
  type: string;
  status: WorkflowStepStatus;
  result?: Record<string, unknown> | null;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkflowProgressData {
  executionId: string;
  workflowName: string;
  status: WorkflowExecutionStatus;
  /** 0-based current step index, as stored in the database */
  currentStep: number;
  totalSteps: number;
  completedCount: number;
  /** Integer 0-100 */
  completedPercent: number;
  steps: WorkflowMergedStep[];
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Step label mapping
// ---------------------------------------------------------------------------

export const STEP_TYPE_LABELS: Record<string, string> = {
  score: 'Lead Scoring',
  condition: 'Condition Check',
  assign: 'Assignment',
  notify: 'Send Notification',
  approval: 'Approval Gate',
  classify: 'Classification',
  route: 'Routing',
  sla: 'SLA Assignment',
};

export function getStepLabel(type: string): string {
  const known = STEP_TYPE_LABELS[type];
  if (known) return known;
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Compute the integer progress percentage (0-100) given a completed count and
 * total step count. Returns 0 when total is 0 (divide-by-zero guard).
 */
export function computeProgressPercent(completed: number, total: number): number {
  if (!total || total <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, completed / total));
  return Math.round(ratio * 100);
}

/**
 * Normalise a raw status string into a canonical WorkflowStepStatus.
 * Unknown values fall back to 'pending' to keep the UI in a safe state.
 */
export function mapStepStatus(raw: string | null | undefined): WorkflowStepStatus {
  if (!raw) return 'pending';
  const lower = raw.toLowerCase();
  switch (lower) {
    case 'completed':
    case 'success':
    case 'done':
      return 'completed';
    case 'running':
    case 'in_progress':
    case 'active':
      return 'running';
    case 'failed':
    case 'error':
      return 'failed';
    case 'skipped':
      return 'skipped';
    case 'pending':
    case 'queued':
    case 'waiting':
      return 'pending';
    default:
      return 'pending';
  }
}
