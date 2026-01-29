/**
 * Status Transitions
 *
 * Logic for validating and executing status transitions.
 * Used by both UI and CLI for consistent status handling.
 */

import type { WorkflowSession, WorkflowStatus, PrerequisiteCheck, TaskRecord } from './types';
import {
  STATUS_TRANSITIONS,
  SESSION_START_STATUSES,
  SESSION_BLOCKED_STATUSES,
  SESSION_CONFIG,
} from './config';

/**
 * Check if a status transition is valid
 */
export function isValidTransition(
  currentStatus: WorkflowStatus,
  newStatus: WorkflowStatus
): boolean {
  const allowedTransitions = STATUS_TRANSITIONS[currentStatus];
  return allowedTransitions?.includes(newStatus) ?? false;
}

/**
 * Get the status to set when starting a session
 */
export function getSessionStartStatus(session: WorkflowSession): WorkflowStatus {
  return SESSION_CONFIG[session].startStatus;
}

/**
 * Get the status to set when a session succeeds
 */
export function getSessionSuccessStatus(session: WorkflowSession): WorkflowStatus {
  return SESSION_CONFIG[session].successStatus;
}

/**
 * Get the status to set when a session fails
 */
export function getSessionFailureStatus(session: WorkflowSession): WorkflowStatus {
  return SESSION_CONFIG[session].failureStatus;
}

/**
 * Check if a task can proceed to a given session
 */
export function canProceedToSession(
  task: TaskRecord,
  session: WorkflowSession
): PrerequisiteCheck {
  const currentStatus = task.Status as WorkflowStatus;
  const artifacts = task['Artifacts To Track'] || '';

  // Check if current status blocks this session
  const blockedStatuses = SESSION_BLOCKED_STATUSES[session];
  if (blockedStatuses.includes(currentStatus)) {
    return {
      canProceed: false,
      reason: `Task is currently "${currentStatus}" - cannot start ${SESSION_CONFIG[session].name}`,
      invalidStatus: true,
    };
  }

  // Check if current status allows this session
  const allowedStatuses = SESSION_START_STATUSES[session];
  if (!allowedStatuses.includes(currentStatus)) {
    return {
      canProceed: false,
      reason: `Task status "${currentStatus}" is not valid for starting ${SESSION_CONFIG[session].name}. Valid statuses: ${allowedStatuses.join(', ')}`,
      invalidStatus: true,
    };
  }

  // Check prerequisite artifacts
  const missingArtifacts: string[] = [];

  if (session === 'plan') {
    // Plan requires spec
    if (!artifacts.includes('SPEC:')) {
      missingArtifacts.push('Specification (run /spec-session first)');
    }
  }

  if (session === 'exec') {
    // Exec requires both spec and plan
    if (!artifacts.includes('SPEC:')) {
      missingArtifacts.push('Specification (run /spec-session first)');
    }
    if (!artifacts.includes('PLAN:')) {
      missingArtifacts.push('Plan (run /plan-session first)');
    }
  }

  if (missingArtifacts.length > 0) {
    return {
      canProceed: false,
      reason: `Missing prerequisites for ${SESSION_CONFIG[session].name}`,
      missingArtifacts,
    };
  }

  return { canProceed: true };
}

/**
 * Validate a status transition before applying it
 */
export function validateTransition(
  currentStatus: WorkflowStatus,
  newStatus: WorkflowStatus
): { valid: boolean; reason?: string } {
  if (currentStatus === newStatus) {
    return { valid: false, reason: 'Status is already set to this value' };
  }

  if (!isValidTransition(currentStatus, newStatus)) {
    const allowed = STATUS_TRANSITIONS[currentStatus];
    return {
      valid: false,
      reason: `Cannot transition from "${currentStatus}" to "${newStatus}". Valid transitions: ${allowed?.join(', ') || 'none'}`,
    };
  }

  return { valid: true };
}

/**
 * Get the next recommended session for a task based on current status
 */
export function getNextSession(status: WorkflowStatus): WorkflowSession | null {
  switch (status) {
    case 'Backlog':
    case 'Planned':
      return 'spec';
    case 'Spec Complete':
      return 'plan';
    case 'Plan Complete':
    case 'Failed': // Can retry exec after failure
      return 'exec';
    case 'Specifying':
    case 'Planning':
    case 'In Progress':
    case 'Validating':
      return null; // Session in progress
    case 'Completed':
    case 'In Review':
      return null; // Task is done
    case 'Blocked':
    case 'Needs Human':
      return null; // Requires external intervention
    default:
      return null;
  }
}

/**
 * Get a human-readable description of what's needed to proceed
 */
export function getStatusGuidance(status: WorkflowStatus): string {
  switch (status) {
    case 'Backlog':
      return 'Task is in backlog. Run /spec-session to begin specification.';
    case 'Planned':
      return 'Task is planned. Run /spec-session to generate specification.';
    case 'Specifying':
      return 'Specification is in progress. Wait for completion.';
    case 'Spec Complete':
      return 'Specification complete. Run /plan-session to generate implementation plan.';
    case 'Planning':
      return 'Planning is in progress. Wait for completion.';
    case 'Plan Complete':
      return 'Plan complete. Run /exec to implement and validate.';
    case 'In Progress':
      return 'Implementation in progress. Wait for completion.';
    case 'Validating':
      return 'MATOP validation running. Wait for verdict.';
    case 'Completed':
      return 'Task completed successfully.';
    case 'Failed':
      return 'Task failed. Review errors and run /exec to retry.';
    case 'Blocked':
      return 'Task is blocked. Resolve blockers before proceeding.';
    case 'Needs Human':
      return 'Task requires human intervention. Review and decide next steps.';
    case 'In Review':
      return 'Task is in code review. Wait for approval.';
    default:
      return 'Unknown status.';
  }
}

/**
 * Check if a status indicates the task is actively being worked on
 */
export function isActiveStatus(status: WorkflowStatus): boolean {
  return ['Specifying', 'Planning', 'In Progress', 'Validating'].includes(status);
}

/**
 * Check if a status indicates the task is waiting for something
 */
export function isWaitingStatus(status: WorkflowStatus): boolean {
  return ['Blocked', 'Needs Human', 'In Review'].includes(status);
}

/**
 * Check if a status indicates the task is complete (success or failure)
 */
export function isTerminalStatus(status: WorkflowStatus): boolean {
  return ['Completed', 'Failed'].includes(status);
}

/**
 * Check if a status indicates readiness for the next session
 */
export function isReadyForNextSession(status: WorkflowStatus): boolean {
  return ['Backlog', 'Planned', 'Spec Complete', 'Plan Complete', 'Failed'].includes(status);
}
