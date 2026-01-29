/**
 * CSV Status Module
 *
 * This module re-exports workflow functions from the shared library
 * to ensure consistent behavior between UI and CLI.
 *
 * The shared workflow library is the single source of truth for:
 * - Status values and transitions
 * - Session configurations
 * - Prerequisite checks
 * - Path conventions
 *
 * IMPORTANT: The shared library expects to be called from the repo root,
 * but Next.js runs from apps/project-tracker. We provide wrapper functions
 * that supply the correct repoRoot context.
 */

import { join } from 'node:path';
import {
  // Types
  type WorkflowStatus,
  type TaskRecord,
  type WorkflowSession,
  type SessionResult,
  type WorkflowOptions,
  type MatopVerdict,
  type SessionArtifacts,

  // Functions we'll wrap
  loadTasks as _loadTasks,
  saveTasks as _saveTasks,
  getTask as _getTask,
  updateTaskStatus as _updateTaskStatus,
  updateTaskArtifacts as _updateTaskArtifacts,
  startSession as _startSession,
  completeSession as _completeSession,
  checkArtifactsExist as _checkArtifactsExist,

  // Functions that don't need wrapping
  canProceedToSession,
  getSessionStartStatus,
  getSessionSuccessStatus,
  getSessionFailureStatus,
  validateTransition,
  getNextSession,
  getStatusGuidance,
  getTaskPaths,
  generateRunId,
  assignStoas,
  calculateConsensus,
  getTaskGates,
  getStatusFromVerdict,
  getSessionInfo,
  getAllSessions,
} from '@tools/scripts/lib/workflow/adapter';

// Re-export types
export type {
  WorkflowStatus,
  TaskRecord,
  WorkflowSession,
  SessionResult,
  WorkflowOptions,
  MatopVerdict,
};

// Re-export functions that don't need path context
export {
  canProceedToSession,
  getSessionStartStatus,
  getSessionSuccessStatus,
  getSessionFailureStatus,
  validateTransition,
  getNextSession,
  getStatusGuidance,
  getTaskPaths,
  generateRunId,
  assignStoas,
  calculateConsensus,
  getTaskGates,
  getStatusFromVerdict,
  getSessionInfo,
  getAllSessions,
};

/**
 * Get the monorepo root from the Next.js app directory
 * apps/project-tracker -> ../../ -> repo root
 */
function getRepoRoot(): string {
  return join(process.cwd(), '..', '..');
}

/**
 * Get the path to Sprint_plan.csv (local path for this app)
 */
export function getCsvPath(): string {
  return join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');
}

// Wrapper functions that provide correct repoRoot context

export async function loadTasks(): Promise<TaskRecord[]> {
  return _loadTasks(getRepoRoot());
}

export async function saveTasks(tasks: TaskRecord[]): Promise<void> {
  return _saveTasks(tasks, getRepoRoot());
}

export async function getTask(taskId: string): Promise<TaskRecord | null> {
  return _getTask(taskId, getRepoRoot());
}

export async function updateTaskStatus(
  taskId: string,
  status: WorkflowStatus
): Promise<TaskRecord | null> {
  return _updateTaskStatus(taskId, status, getRepoRoot());
}

export async function updateTaskArtifacts(
  taskId: string,
  artifacts: SessionArtifacts
): Promise<TaskRecord | null> {
  return _updateTaskArtifacts(taskId, artifacts, getRepoRoot());
}

export async function startSession(
  taskId: string,
  session: WorkflowSession,
  options: WorkflowOptions = {}
): Promise<{ success: boolean; runId?: string; error?: string }> {
  return _startSession(taskId, session, options, getRepoRoot());
}

export async function completeSession(
  taskId: string,
  session: WorkflowSession,
  success: boolean,
  artifacts?: SessionArtifacts,
  verdict?: MatopVerdict
): Promise<SessionResult> {
  return _completeSession(taskId, session, success, artifacts, verdict, getRepoRoot());
}

export function checkArtifactsExist(
  taskId: string,
  session: WorkflowSession
): { exists: boolean; missing: string[] } {
  return _checkArtifactsExist(taskId, session, getRepoRoot());
}
