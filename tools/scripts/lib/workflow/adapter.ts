/**
 * Workflow Adapter
 *
 * Bridge between the shared workflow library and consuming code.
 * Provides convenience functions that combine multiple workflow utilities.
 */

import { readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import Papa from 'papaparse';

// =============================================================================
// FILE LOCKING UTILITIES (for concurrent CSV access safety)
// =============================================================================

const LOCK_TIMEOUT_MS = 30000; // 30 seconds
const STALE_LOCK_MS = 60000; // 60 seconds

interface LockInfo {
  pid: number;
  timestamp: string;
}

/**
 * Get lock file path for a given file
 */
function getLockFilePath(filePath: string): string {
  const dir = dirname(filePath);
  const lockDir = join(dir, '..', '..', '..', '..', 'artifacts', 'misc', '.locks');
  return join(lockDir, 'sprint-plan.lock');
}

/**
 * Check if a lock file is stale
 */
async function isLockStale(lockPath: string): Promise<boolean> {
  try {
    const stats = await stat(lockPath);
    const age = Date.now() - stats.mtime.getTime();
    return age > STALE_LOCK_MS;
  } catch {
    return true; // If we can't stat, treat as stale
  }
}

/**
 * Acquire a file lock with timeout
 */
async function acquireLock(filePath: string, timeoutMs: number = LOCK_TIMEOUT_MS): Promise<boolean> {
  const lockPath = getLockFilePath(filePath);
  const lockDir = dirname(lockPath);

  // Ensure lock directory exists
  await mkdir(lockDir, { recursive: true });

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    // Check if lock exists
    if (existsSync(lockPath)) {
      // Check if stale
      if (await isLockStale(lockPath)) {
        console.warn(`[CSV Lock] Removing stale lock file`);
        try {
          await unlink(lockPath);
        } catch {
          // Race condition - another process may have removed it
        }
      } else {
        // Wait and retry
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
    }

    // Try to create lock
    const lockInfo: LockInfo = {
      pid: process.pid,
      timestamp: new Date().toISOString(),
    };

    try {
      await writeFile(lockPath, JSON.stringify(lockInfo), { flag: 'wx' }); // wx = exclusive create
      return true;
    } catch (err: unknown) {
      // EEXIST means another process created the lock first
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      throw err;
    }
  }

  console.error(`[CSV Lock] Timeout acquiring lock after ${timeoutMs}ms`);
  return false;
}

/**
 * Release a file lock
 */
async function releaseLock(filePath: string): Promise<void> {
  const lockPath = getLockFilePath(filePath);
  try {
    await unlink(lockPath);
  } catch {
    // Ignore errors - lock may not exist
  }
}

/**
 * Execute a function with file locking
 */
async function withLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const acquired = await acquireLock(filePath);
  if (!acquired) {
    throw new Error('Could not acquire CSV lock - another process may be updating the file');
  }

  try {
    return await fn();
  } finally {
    await releaseLock(filePath);
  }
}

import type {
  WorkflowSession,
  WorkflowStatus,
  TaskRecord,
  SessionResult,
  SessionArtifacts,
  WorkflowOptions,
  MatopVerdict,
} from './types';
import { SESSION_CONFIG, OUTPUT_PATHS, FILE_NAMES } from './config';
import {
  canProceedToSession,
  getSessionStartStatus,
  getSessionSuccessStatus,
  getSessionFailureStatus,
  validateTransition,
  getNextSession,
  getStatusGuidance,
} from './status-transitions';
import { getTaskPaths, generateRunId, getSprintPlanCsvPath } from './paths';
import { getSprintForTask } from './utils';
import { assignStoas, calculateConsensus, getTaskGates, getStatusFromVerdict } from './validation';

export {
  // Re-export types
  type WorkflowSession,
  type WorkflowStatus,
  type TaskRecord,
  type SessionResult,
  type SessionArtifacts,
  type WorkflowOptions,
  type MatopVerdict,
};

export {
  // Re-export key functions
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
};

/**
 * Load all tasks from Sprint_plan.csv
 */
export async function loadTasks(repoRoot?: string): Promise<TaskRecord[]> {
  const csvPath = getSprintPlanCsvPath(repoRoot);
  const csvContent = await readFile(csvPath, 'utf-8');
  const { data } = Papa.parse<TaskRecord>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });
  return data;
}

/**
 * Save tasks back to Sprint_plan.csv (with file locking for concurrent access safety)
 */
export async function saveTasks(tasks: TaskRecord[], repoRoot?: string): Promise<void> {
  const csvPath = getSprintPlanCsvPath(repoRoot);

  await withLock(csvPath, async () => {
    const updatedCsv = Papa.unparse(tasks, { header: true, quotes: true });
    // Write to temp file first, then rename for atomic update
    const tempPath = `${csvPath}.tmp`;
    await writeFile(tempPath, updatedCsv, 'utf-8');

    // Atomic rename (works on same filesystem)
    const { rename } = await import('node:fs/promises');
    await rename(tempPath, csvPath);
  });
}

/**
 * Get a task by ID
 */
export async function getTask(taskId: string, repoRoot?: string): Promise<TaskRecord | null> {
  const tasks = await loadTasks(repoRoot);
  return tasks.find((t) => t['Task ID'] === taskId) || null;
}

/**
 * Update a single task's status in Sprint_plan.csv
 */
export async function updateTaskStatus(
  taskId: string,
  status: WorkflowStatus,
  repoRoot?: string
): Promise<TaskRecord | null> {
  const tasks = await loadTasks(repoRoot);
  const taskIndex = tasks.findIndex((t) => t['Task ID'] === taskId);

  if (taskIndex === -1) {
    return null;
  }

  // Validate transition
  const currentStatus = tasks[taskIndex].Status as WorkflowStatus;
  const validation = validateTransition(currentStatus, status);
  if (!validation.valid) {
    console.warn(`Invalid status transition for ${taskId}: ${validation.reason}`);
    // Still allow the transition but log warning
  }

  tasks[taskIndex] = {
    ...tasks[taskIndex],
    Status: status,
  };

  await saveTasks(tasks, repoRoot);
  return tasks[taskIndex];
}

/**
 * Update a task's artifacts in Sprint_plan.csv
 */
export async function updateTaskArtifacts(
  taskId: string,
  artifacts: SessionArtifacts,
  repoRoot?: string
): Promise<TaskRecord | null> {
  const tasks = await loadTasks(repoRoot);
  const taskIndex = tasks.findIndex((t) => t['Task ID'] === taskId);

  if (taskIndex === -1) {
    return null;
  }

  const task = tasks[taskIndex];
  const currentArtifacts = task['Artifacts To Track'] || '';
  const parts = currentArtifacts
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);

  // Add new artifacts if not present
  if (artifacts.spec && !parts.some((p) => p.startsWith('SPEC:'))) {
    parts.unshift(`SPEC:${artifacts.spec}`);
  }
  if (artifacts.plan && !parts.some((p) => p.startsWith('PLAN:'))) {
    parts.unshift(`PLAN:${artifacts.plan}`);
  }
  if (artifacts.delivery && !parts.some((p) => p.startsWith('DELIVERY:'))) {
    parts.unshift(`DELIVERY:${artifacts.delivery}`);
  }
  if (artifacts.context && !parts.some((p) => p.startsWith('CONTEXT:'))) {
    parts.unshift(`CONTEXT:${artifacts.context}`);
  }

  tasks[taskIndex] = {
    ...task,
    'Artifacts To Track': parts.join(';'),
  };

  await saveTasks(tasks, repoRoot);
  return tasks[taskIndex];
}

/**
 * Start a workflow session for a task
 */
export async function startSession(
  taskId: string,
  session: WorkflowSession,
  options: WorkflowOptions = {},
  repoRoot?: string
): Promise<{ success: boolean; runId?: string; error?: string }> {
  const task = await getTask(taskId, repoRoot);
  if (!task) {
    return { success: false, error: `Task ${taskId} not found` };
  }

  // Check prerequisites
  const check = canProceedToSession(task, session);
  if (!check.canProceed && !options.force) {
    return { success: false, error: check.reason };
  }

  // Generate run ID for exec session
  const runId = session === 'exec' ? generateRunId() : undefined;

  // Update status to session start status
  if (!options.dryRun) {
    await updateTaskStatus(taskId, getSessionStartStatus(session), repoRoot);
  }

  return { success: true, runId };
}

/**
 * Complete a workflow session for a task
 */
export async function completeSession(
  taskId: string,
  session: WorkflowSession,
  success: boolean,
  artifacts?: SessionArtifacts,
  verdict?: MatopVerdict,
  repoRoot?: string
): Promise<SessionResult> {
  const task = await getTask(taskId, repoRoot);
  const previousStatus = (task?.Status || 'Backlog') as WorkflowStatus;
  const runId = generateRunId();

  let newStatus: WorkflowStatus;
  if (success) {
    newStatus = getSessionSuccessStatus(session);
  } else if (session === 'exec' && verdict) {
    newStatus = getStatusFromVerdict(verdict);
  } else {
    newStatus = getSessionFailureStatus(session);
  }

  // Update task status
  await updateTaskStatus(taskId, newStatus, repoRoot);

  // Update artifacts if provided
  if (artifacts) {
    await updateTaskArtifacts(taskId, artifacts, repoRoot);
  }

  return {
    success,
    taskId,
    session,
    runId,
    previousStatus,
    newStatus,
    artifacts: artifacts || {},
    verdict,
    duration: 0, // To be set by caller
  };
}

/**
 * Check if all prerequisite artifacts exist for a task
 */
export function checkArtifactsExist(
  taskId: string,
  session: WorkflowSession,
  repoRoot?: string
): { exists: boolean; missing: string[] } {
  const base = repoRoot || process.cwd();
  const missing: string[] = [];

  // Get sprint number for this task
  let sprintNumber: number;
  try {
    sprintNumber = getSprintForTask(taskId, base);
  } catch {
    missing.push(`Task ${taskId} not found in Sprint_plan.csv`);
    return { exists: false, missing };
  }

  const paths = getTaskPaths(sprintNumber, taskId);

  if (session === 'plan' || session === 'exec') {
    // Check spec exists
    const specPath = `${base}/${paths.spec}`;
    if (!existsSync(specPath)) {
      missing.push('Specification file');
    }
  }

  if (session === 'exec') {
    // Check plan exists
    const planPath = `${base}/${paths.plan}`;
    if (!existsSync(planPath)) {
      missing.push('Plan file');
    }
  }

  return { exists: missing.length === 0, missing };
}

/**
 * Get session info for display
 */
export function getSessionInfo(session: WorkflowSession) {
  return {
    name: SESSION_CONFIG[session].name,
    description: SESSION_CONFIG[session].description,
    cliCommand: SESSION_CONFIG[session].cliCommand,
    apiEndpoint: SESSION_CONFIG[session].apiEndpoint,
  };
}

/**
 * Get all session configurations
 */
export function getAllSessions() {
  return Object.entries(SESSION_CONFIG).map(([key, config]) => ({
    id: key as WorkflowSession,
    ...config,
  }));
}
