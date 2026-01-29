/**
 * Task Metrics Recording Utility
 *
 * Records task execution metrics to JSON files for tracking and analytics.
 * Used by /spec-session (start) and /exec (complete) to track full task lifecycle.
 *
 * Metrics are stored in:
 * - apps/project-tracker/docs/metrics/sprint-{N}/phase-*/TASK-ID.json
 *
 * This ensures the project-tracker dashboard can display accurate metrics.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import Papa from 'papaparse';

import { getSprintForTask } from './utils';
import type { WorkflowStatus, MatopVerdict } from './types';

/**
 * Task metrics JSON structure (matches task-status.schema.json)
 */
export interface TaskMetrics {
  $schema?: string;
  task_id: string;
  section?: string;
  description?: string;
  owner?: string;
  sprint?: string;
  phase?: string;
  stream?: string | null;
  dependencies?: {
    required: string[];
    verified_at: string | null;
    all_satisfied: boolean;
    notes?: string;
  };
  status: WorkflowStatus;
  started_at: string | null;
  completed_at: string | null;
  target_duration_minutes?: number | null;
  actual_duration_minutes?: number | null;
  status_history: Array<{
    status: WorkflowStatus;
    at: string;
    note?: string;
  }>;
  execution?: {
    started_at?: string | null;
    completed_at?: string | null;
    duration_minutes?: number | null;
    executor?: string;
    agents?: string[];
    execution_log?: string;
    log_path?: string;
    retry_count: number;
    last_error?: string | null;
  };
  artifacts?: {
    expected?: string[];
    created?: Array<{
      path: string;
      sha256: string;
      created_at: string;
    }>;
    missing?: string[];
  };
  validations?: Array<{
    name: string;
    command: string;
    executed_at: string;
    exit_code: number;
    duration_ms?: number;
    stdout_hash?: string;
    passed: boolean;
  }>;
  kpis?: Record<
    string,
    {
      target: string | number | boolean;
      actual: string | number | boolean;
      met: boolean;
      unit?: string;
    }
  >;
  blockers?: Array<{
    description: string;
    raised_at: string;
    resolved_at?: string | null;
    resolution?: string;
  }>;
  notes?: string;
}

/**
 * Options for recording task start metrics
 */
export interface TaskStartOptions {
  taskId: string;
  session: 'spec' | 'plan' | 'exec';
  status: WorkflowStatus;
  executor?: string;
  agents?: string[];
  note?: string;
  repoRoot?: string;
}

/**
 * Options for recording task completion metrics
 */
export interface TaskCompleteOptions {
  taskId: string;
  session: 'spec' | 'plan' | 'exec';
  status: WorkflowStatus;
  success: boolean;
  verdict?: MatopVerdict;
  executor?: string;
  agents?: string[];
  artifacts?: Array<{ path: string }>;
  validations?: Array<{
    name: string;
    command: string;
    exit_code: number;
    duration_ms?: number;
    passed: boolean;
  }>;
  kpis?: Record<
    string,
    {
      target: string | number | boolean;
      actual: string | number | boolean;
      met: boolean;
      unit?: string;
    }
  >;
  error?: string;
  note?: string;
  repoRoot?: string;
}

/**
 * Get the metrics file path for a task
 */
export function getMetricsFilePath(taskId: string, repoRoot?: string): string {
  const base = repoRoot || process.cwd();

  // Read Sprint_plan.csv to find the task's phase
  const csvPath = join(base, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');

  if (!existsSync(csvPath)) {
    throw new Error(`Sprint_plan.csv not found at: ${csvPath}`);
  }

  const content = readFileSync(csvPath, 'utf-8');
  const { data: records } = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });

  const task = records.find((r) => r['Task ID'] === taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found in Sprint_plan.csv`);
  }

  const sprintNumber = task['Target Sprint'] === 'Continuous' ? 0 : parseInt(task['Target Sprint'], 10) || 0;

  // Determine phase directory from task metadata
  // This is simplified - in practice, phase detection may need more logic
  const metricsBase = join(base, 'apps', 'project-tracker', 'docs', 'metrics', `sprint-${sprintNumber}`);

  // Look for existing task file in any phase directory
  const { readdirSync } = require('node:fs');
  if (existsSync(metricsBase)) {
    try {
      const phases = readdirSync(metricsBase, { withFileTypes: true })
        .filter((d: { isDirectory: () => boolean }) => d.isDirectory())
        .map((d: { name: string }) => d.name);

      for (const phase of phases) {
        const taskPath = join(metricsBase, phase, `${taskId}.json`);
        if (existsSync(taskPath)) {
          return taskPath;
        }

        // Check in parallel streams (parallel-a, parallel-b, etc.)
        const phasePath = join(metricsBase, phase);
        if (existsSync(phasePath)) {
          const subDirs = readdirSync(phasePath, { withFileTypes: true })
            .filter((d: { isDirectory: () => boolean }) => d.isDirectory())
            .map((d: { name: string }) => d.name);

          for (const subDir of subDirs) {
            const subTaskPath = join(phasePath, subDir, `${taskId}.json`);
            if (existsSync(subTaskPath)) {
              return subTaskPath;
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }

  // Default to a generic location if not found
  return join(metricsBase, 'tasks', `${taskId}.json`);
}

/**
 * Load existing task metrics or create new
 */
export async function loadTaskMetrics(taskId: string, repoRoot?: string): Promise<TaskMetrics> {
  const filePath = getMetricsFilePath(taskId, repoRoot);

  if (existsSync(filePath)) {
    try {
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content) as TaskMetrics;
    } catch {
      // Fall through to create new
    }
  }

  // Create new metrics structure
  return {
    task_id: taskId,
    status: 'Backlog',
    started_at: null,
    completed_at: null,
    status_history: [],
    execution: {
      retry_count: 0,
    },
  };
}

/**
 * Save task metrics to JSON file
 */
export async function saveTaskMetrics(metrics: TaskMetrics, repoRoot?: string): Promise<string> {
  const filePath = getMetricsFilePath(metrics.task_id, repoRoot);

  // Ensure directory exists
  await mkdir(dirname(filePath), { recursive: true });

  // Add schema reference
  metrics.$schema = '../../../schemas/task-status.schema.json';

  await writeFile(filePath, JSON.stringify(metrics, null, 2), 'utf-8');
  return filePath;
}

/**
 * Generate ISO 8601 timestamp in UTC
 */
export function getTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

/**
 * Calculate SHA256 hash of a file
 */
export async function getFileHash(filePath: string): Promise<string> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Record task start metrics
 *
 * Called by /spec-session when starting a task.
 * Creates/updates the task JSON file with:
 * - started_at timestamp
 * - status update
 * - status_history entry
 * - execution.started_at
 */
export async function recordTaskStart(options: TaskStartOptions): Promise<TaskMetrics> {
  const { taskId, session, status, executor, agents, note, repoRoot } = options;
  const timestamp = getTimestamp();

  // Load existing metrics or create new
  const metrics = await loadTaskMetrics(taskId, repoRoot);

  // Update start timestamp (only on first start)
  if (!metrics.started_at) {
    metrics.started_at = timestamp;
  }

  // Update status
  const previousStatus = metrics.status;
  metrics.status = status;

  // Add to status history
  metrics.status_history.push({
    status,
    at: timestamp,
    note: note || `${session} session started`,
  });

  // Initialize or update execution block
  if (!metrics.execution) {
    metrics.execution = { retry_count: 0 };
  }

  // Only set execution.started_at for exec session (actual implementation)
  if (session === 'exec') {
    metrics.execution.started_at = timestamp;
  }

  if (executor) {
    metrics.execution.executor = executor;
  }

  if (agents && agents.length > 0) {
    metrics.execution.agents = agents;
  }

  // Save metrics
  await saveTaskMetrics(metrics, repoRoot);

  console.log(`[Metrics] Task ${taskId} started: ${previousStatus} → ${status}`);
  console.log(`[Metrics] Timestamp: ${timestamp}`);

  return metrics;
}

/**
 * Record task completion metrics
 *
 * Called by /exec when completing a task.
 * Updates the task JSON file with:
 * - completed_at timestamp
 * - actual_duration_minutes
 * - final status
 * - status_history entry
 * - execution details
 * - artifacts with hashes
 * - validations
 * - kpis
 */
export async function recordTaskComplete(options: TaskCompleteOptions): Promise<TaskMetrics> {
  const {
    taskId,
    session,
    status,
    success,
    verdict,
    executor,
    agents,
    artifacts,
    validations,
    kpis,
    error,
    note,
    repoRoot,
  } = options;

  const timestamp = getTimestamp();

  // Load existing metrics
  const metrics = await loadTaskMetrics(taskId, repoRoot);

  // Update completion timestamp
  metrics.completed_at = timestamp;

  // Calculate duration if started_at exists
  if (metrics.started_at) {
    const startTime = new Date(metrics.started_at).getTime();
    const endTime = new Date(timestamp).getTime();
    metrics.actual_duration_minutes = Math.round((endTime - startTime) / 60000);
  }

  // Update status
  const previousStatus = metrics.status;
  metrics.status = status;

  // Add to status history
  metrics.status_history.push({
    status,
    at: timestamp,
    note: note || `${session} session ${success ? 'completed' : 'failed'}${verdict ? ` (${verdict})` : ''}`,
  });

  // Update execution block
  if (!metrics.execution) {
    metrics.execution = { retry_count: 0 };
  }

  metrics.execution.completed_at = timestamp;

  if (metrics.execution.started_at) {
    const execStart = new Date(metrics.execution.started_at).getTime();
    const execEnd = new Date(timestamp).getTime();
    metrics.execution.duration_minutes = Math.round((execEnd - execStart) / 60000);
  }

  if (executor) {
    metrics.execution.executor = executor;
  }

  if (agents && agents.length > 0) {
    metrics.execution.agents = agents;
  }

  if (error) {
    metrics.execution.last_error = error;
  }

  // Record artifacts with hashes
  if (artifacts && artifacts.length > 0) {
    if (!metrics.artifacts) {
      metrics.artifacts = {};
    }

    metrics.artifacts.created = [];
    metrics.artifacts.missing = [];

    for (const artifact of artifacts) {
      const fullPath = repoRoot ? join(repoRoot, artifact.path) : artifact.path;
      if (existsSync(fullPath)) {
        try {
          const hash = await getFileHash(fullPath);
          metrics.artifacts.created.push({
            path: artifact.path,
            sha256: hash,
            created_at: timestamp,
          });
        } catch {
          metrics.artifacts.missing.push(artifact.path);
        }
      } else {
        metrics.artifacts.missing.push(artifact.path);
      }
    }
  }

  // Record validations
  if (validations && validations.length > 0) {
    metrics.validations = validations.map((v) => ({
      name: v.name,
      command: v.command,
      executed_at: timestamp,
      exit_code: v.exit_code,
      duration_ms: v.duration_ms,
      passed: v.passed,
    }));
  }

  // Record KPIs
  if (kpis) {
    metrics.kpis = kpis;
  }

  // Save metrics
  const filePath = await saveTaskMetrics(metrics, repoRoot);

  console.log(`[Metrics] Task ${taskId} completed: ${previousStatus} → ${status}`);
  console.log(`[Metrics] Duration: ${metrics.actual_duration_minutes || 0} minutes`);
  console.log(`[Metrics] Saved to: ${filePath}`);

  return metrics;
}

/**
 * Add a blocker to task metrics
 */
export async function addBlocker(
  taskId: string,
  description: string,
  repoRoot?: string
): Promise<TaskMetrics> {
  const timestamp = getTimestamp();
  const metrics = await loadTaskMetrics(taskId, repoRoot);

  if (!metrics.blockers) {
    metrics.blockers = [];
  }

  metrics.blockers.push({
    description,
    raised_at: timestamp,
  });

  await saveTaskMetrics(metrics, repoRoot);
  return metrics;
}

/**
 * Resolve a blocker in task metrics
 */
export async function resolveBlocker(
  taskId: string,
  blockerIndex: number,
  resolution: string,
  repoRoot?: string
): Promise<TaskMetrics> {
  const timestamp = getTimestamp();
  const metrics = await loadTaskMetrics(taskId, repoRoot);

  if (metrics.blockers && metrics.blockers[blockerIndex]) {
    metrics.blockers[blockerIndex].resolved_at = timestamp;
    metrics.blockers[blockerIndex].resolution = resolution;
  }

  await saveTaskMetrics(metrics, repoRoot);
  return metrics;
}

/**
 * Get task metrics summary for display
 */
export async function getTaskMetricsSummary(
  taskId: string,
  repoRoot?: string
): Promise<{
  taskId: string;
  status: WorkflowStatus;
  started: boolean;
  completed: boolean;
  duration: number | null;
  passedValidations: number;
  totalValidations: number;
  kpisMet: number;
  totalKpis: number;
  hasBlockers: boolean;
}> {
  const metrics = await loadTaskMetrics(taskId, repoRoot);

  const passedValidations = metrics.validations?.filter((v) => v.passed).length || 0;
  const totalValidations = metrics.validations?.length || 0;

  const kpisMet = metrics.kpis ? Object.values(metrics.kpis).filter((k) => k.met).length : 0;
  const totalKpis = metrics.kpis ? Object.keys(metrics.kpis).length : 0;

  const unresolvedBlockers = metrics.blockers?.filter((b) => !b.resolved_at) || [];

  return {
    taskId,
    status: metrics.status,
    started: !!metrics.started_at,
    completed: !!metrics.completed_at,
    duration: metrics.actual_duration_minutes || null,
    passedValidations,
    totalValidations,
    kpisMet,
    totalKpis,
    hasBlockers: unresolvedBlockers.length > 0,
  };
}
