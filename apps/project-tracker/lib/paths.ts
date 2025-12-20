/**
 * Centralized Path Configuration for IntelliFlow CRM
 *
 * This module provides canonical paths following IFC-160 artifact conventions.
 * The project-tracker app runs from apps/project-tracker/, so we need to
 * resolve paths relative to the monorepo root (2 levels up).
 *
 * Key distinction:
 * - Sprint tracking metrics (docs/metrics/) -> COMMITTED to git
 * - Ephemeral artifacts (artifacts/) -> GITIGNORED, never committed
 */

import { join } from 'path';
import { mkdir } from 'fs/promises';

// Monorepo root (2 levels up from apps/project-tracker/)
export const MONOREPO_ROOT = join(process.cwd(), '..', '..');

/**
 * Canonical paths per IFC-160 artifact conventions
 */
export const PATHS = {
  // Ephemeral artifacts (gitignored) - CONSOLIDATE WITH EXISTING /artifacts/
  artifacts: {
    root: join(MONOREPO_ROOT, 'artifacts'),
    logs: join(MONOREPO_ROOT, 'artifacts', 'logs'),
    swarmLogs: join(MONOREPO_ROOT, 'artifacts', 'logs', 'swarm'),
    reports: join(MONOREPO_ROOT, 'artifacts', 'reports'),
    metrics: join(MONOREPO_ROOT, 'artifacts', 'metrics'),
    misc: join(MONOREPO_ROOT, 'artifacts', 'misc'),
    locks: join(MONOREPO_ROOT, 'artifacts', 'misc', '.locks'),
    tasks: join(MONOREPO_ROOT, 'artifacts', 'misc', 'tasks'), // Question logs + answers
    forensics: join(MONOREPO_ROOT, 'artifacts', 'forensics'), // Already exists from swarm-manager.sh
  },

  // Persistent metrics (committed) - STAYS IN project-tracker
  sprintTracking: {
    root: join(process.cwd(), 'docs', 'metrics'),
    global: join(process.cwd(), 'docs', 'metrics', '_global'),
    sprint0: join(process.cwd(), 'docs', 'metrics', 'sprint-0'),
    schemas: join(process.cwd(), 'docs', 'metrics', 'schemas'),
  },

  // Documentation
  docs: {
    root: join(MONOREPO_ROOT, 'docs'),
    operations: join(MONOREPO_ROOT, 'docs', 'ops'),
    playbooks: join(MONOREPO_ROOT, 'docs', 'ops', 'playbooks'),
  },

  // Scripts - Canonical location in /scripts/swarm/
  scripts: {
    root: join(MONOREPO_ROOT, 'scripts', 'swarm'),
    orchestrator: join(MONOREPO_ROOT, 'scripts', 'swarm', 'orchestrator.sh'),
    swarmManager: join(MONOREPO_ROOT, 'scripts', 'swarm', 'swarm-manager.sh'),
  },
} as const;

/**
 * Ensure all artifact directories exist.
 * Call this at app startup or before writing artifacts.
 */
export async function ensureArtifactDirs(): Promise<void> {
  const dirs = [
    PATHS.artifacts.swarmLogs,
    PATHS.artifacts.locks,
    PATHS.artifacts.tasks,
    PATHS.artifacts.reports,
    PATHS.artifacts.metrics,
    PATHS.artifacts.forensics,
  ];

  await Promise.all(dirs.map((dir) => mkdir(dir, { recursive: true })));
}

/**
 * Get the swarm log file path for a specific task
 */
export function getSwarmLogPath(taskId: string): string {
  return join(PATHS.artifacts.swarmLogs, `${taskId}.log`);
}

/**
 * Get the aggregate swarm log path
 */
export function getAggregateSwarmLogPath(): string {
  return join(PATHS.artifacts.swarmLogs, 'swarm.log');
}

/**
 * Get the swarm health file path
 */
export function getSwarmHealthPath(): string {
  return join(PATHS.artifacts.swarmLogs, 'swarm-health.json');
}

/**
 * Get lock file path for a specific task
 */
export function getLockFilePath(taskId: string): string {
  return join(PATHS.artifacts.locks, `${taskId}.lock`);
}

/**
 * Get heartbeat file path for a specific task
 */
export function getHeartbeatPath(taskId: string): string {
  return join(PATHS.artifacts.locks, `${taskId}.heartbeat`);
}

/**
 * Get input file path for a specific task (terminal input)
 */
export function getInputFilePath(taskId: string): string {
  return join(PATHS.artifacts.locks, `${taskId}.input`);
}

/**
 * Get task answers file path
 */
export function getTaskAnswersPath(taskId: string): string {
  return join(PATHS.artifacts.tasks, `${taskId}_answers.md`);
}

/**
 * Get task questions log path
 */
export function getTaskQuestionsPath(taskId: string, type: 'spec' | 'plan'): string {
  return join(PATHS.artifacts.tasks, `${taskId}_claude_${type}_questions.log`);
}
